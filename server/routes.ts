import express, { type Express } from "express";
import { type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db, pool, testConnection } from "./db";
import { log } from "./index";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { eq, and, isNull, gt, sql, or, notInArray, inArray } from "drizzle-orm";
import {
  users,
  restaurants,
  restaurantUsers,
  roles,
  refreshTokens,
  loginSchema,
  restaurantDomains,
  restaurantFeatureAllowlist,
  restaurantSettings,
  adminAuditLogs,
  menus,
  categories,
  menuItems,
  modifierGroups,
  modifiers,
  menuItemModifierGroups,
  diningTables,
  qrTokens,
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  splitSessions,
  splitShares,
  splitSharePayments,
} from "@shared/schema";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTokenPair,
  AccessTokenPayload,
} from "./auth/jwt";
import {
  authenticate,
  optionalAuth,
  requireSuperAdmin,
  requireRestaurantAccess,
  requireActiveRestaurant,
  requirePermission,
  requireRole,
  resolveTenantBySlug,
  resolveTenantByDomain,
  resolveTenantFromToken,
  loadFullUser,
} from "./auth/middleware";
import {
  requireFeature,
  requireSoftToggle,
  requirePaymentMethodEnabled,
  requireFeatureAndSoftToggle,
  getRestaurantFeatures,
  clearFeatureCache,
  checkFeature,
} from "./auth/feature-gating";
import { createAuditLog, AUDIT_ACTIONS } from "./auth/audit";
import {
  authenticateSocket,
  canJoinTenantRoom,
  canJoinKitchenRoom,
  canJoinOrderRoom,
  getOrderRoom,
  getTenantRoom,
  getKitchenRoom,
  getCustomerRoom,
  generateCustomerTrackingToken,
  SocketData,
} from "./auth/socket-auth";
import { z } from "zod";
import { desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

async function buildPaymentMethods(
  restaurantId: string,
  features: Record<string, boolean>
): Promise<Record<string, boolean>> {
  const settings = await db
    .select()
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));

  const settingsMap: Record<string, unknown> = {};
  for (const s of settings) {
    settingsMap[s.settingKey] = s.settingValue;
  }

  const stripeFeatureEnabled = features.stripe_payments ?? false;
  const paypalFeatureEnabled = features.paypal_payments ?? false;
  const counterFeatureEnabled = features.counter_payments ?? false;

  const stripeToggled = settingsMap.stripe_enabled !== undefined
    ? (settingsMap.stripe_enabled === "true" || settingsMap.stripe_enabled === true)
    : stripeFeatureEnabled;
  const paypalToggled = settingsMap.paypal_enabled !== undefined
    ? (settingsMap.paypal_enabled === "true" || settingsMap.paypal_enabled === true)
    : paypalFeatureEnabled;
  const counterToggled = settingsMap.counter_payments_enabled !== undefined
    ? (settingsMap.counter_payments_enabled === "true" || settingsMap.counter_payments_enabled === true)
    : counterFeatureEnabled;

  return {
    cash: counterFeatureEnabled && counterToggled,
    counter: counterFeatureEnabled && counterToggled,
    card: stripeFeatureEnabled && stripeToggled,
    stripe: stripeFeatureEnabled && stripeToggled,
    paypal: paypalFeatureEnabled && paypalToggled,
  };
}

async function resolvePaymentMethods(restaurantId: string): Promise<Record<string, boolean>> {
  const featureRows = await db
    .select()
    .from(restaurantFeatureAllowlist)
    .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId));
  const features: Record<string, boolean> = {};
  for (const f of featureRows) {
    features[f.featureKey] = f.isEnabled;
  }
  return buildPaymentMethods(restaurantId, features);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============================================================================
  // File Upload Setup
  // ============================================================================
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
      }
    },
  });

  app.use("/uploads", (req, res, next) => {
    const ext = path.extname(req.path).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!allowedExts.includes(ext)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }, express.static(uploadsDir));

  app.post(
    "/api/upload",
    authenticate,
    upload.single("image"),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }
      const imageUrl = `/uploads/${req.file.filename}`;
      res.json({ imageUrl });
    }
  );

  // ============================================================================
  // Socket.IO Setup
  // ============================================================================
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/socket.io"
  });

  io.on("connection", async (socket) => {
    log(`Socket connected: ${socket.id}`, "socket.io");

    const socketData = await authenticateSocket(socket);
    if (socketData) {
      (socket as any).data = socketData;
      log(`Socket ${socket.id} authenticated as ${socketData.type}`, "socket.io");

      if (socketData.type === "customer") {
        socket.join(getOrderRoom(socketData.orderId));
        socket.join(getCustomerRoom(socketData.restaurantId));
        log(`Customer socket ${socket.id} joined order:${socketData.orderId}`, "socket.io");
      }
    }

    socket.on("join-tenant", (tenantId: string) => {
      const data = (socket as any).data as SocketData | undefined;
      if (!data) {
        socket.emit("error", { message: "Authentication required for tenant room" });
        return;
      }
      if (!canJoinTenantRoom(data, tenantId)) {
        socket.emit("error", { message: "Not authorized for this restaurant" });
        return;
      }
      socket.join(getTenantRoom(tenantId));
      log(`Socket ${socket.id} joined tenant: ${tenantId}`, "socket.io");
    });

    socket.on("join-kitchen", (tenantId: string) => {
      const data = (socket as any).data as SocketData | undefined;
      if (!data) {
        socket.emit("error", { message: "Authentication required for kitchen room" });
        return;
      }
      if (!canJoinKitchenRoom(data, tenantId)) {
        socket.emit("error", { message: "Not authorized for kitchen access" });
        return;
      }
      socket.join(getKitchenRoom(tenantId));
      log(`Socket ${socket.id} joined kitchen: ${tenantId}`, "socket.io");
    });

    socket.on("join-order", async (orderId: string) => {
      const data = (socket as any).data as SocketData | undefined;
      const order = await db
        .select({ restaurantId: orders.restaurantId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (order.length === 0) {
        socket.emit("error", { message: "Order not found" });
        return;
      }

      if (data && canJoinOrderRoom(data, orderId, order[0].restaurantId)) {
        socket.join(getOrderRoom(orderId));
        log(`Socket ${socket.id} joined order: ${orderId}`, "socket.io");
      } else {
        socket.emit("error", { message: "Not authorized for this order" });
      }
    });

    socket.on("disconnect", () => {
      log(`Socket disconnected: ${socket.id}`, "socket.io");
    });
  });

  app.set("io", io);

  // Apply domain-based tenant resolution globally
  app.use(resolveTenantByDomain);

  // ============================================================================
  // Health & Status Endpoints
  // ============================================================================

  app.get("/api/health", async (_req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 60)} minutes, ${Math.floor(uptime % 60)} seconds`,
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      },
      environment: process.env.NODE_ENV || "development",
    });
  });

  app.get("/api/health/db", async (_req, res) => {
    const result = await testConnection();

    if (result.success) {
      res.json({
        status: "connected",
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: "disconnected",
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/api", (_req, res) => {
    res.json({
      name: "Restaurant POS + QR Ordering API",
      version: "1.0.0",
      description: "Multi-tenant restaurant management SaaS",
      endpoints: {
        health: "/api/health",
        healthDb: "/api/health/db",
        auth: {
          login: "POST /api/auth/login",
          logout: "POST /api/auth/logout",
          refresh: "POST /api/auth/refresh",
          me: "GET /api/auth/me",
        },
        admin: {
          restaurants: "GET /api/admin/restaurants",
          users: "GET /api/admin/users",
        },
        restaurant: {
          staff: "GET /api/restaurants/:restaurantId/staff",
          menu: "GET /api/:tenantSlug/menu",
          orders: "GET /api/:tenantSlug/orders",
          tables: "GET /api/:tenantSlug/tables",
        },
      },
      documentation: "See README.md for API documentation",
    });
  });

  // ============================================================================
  // Authentication Endpoints
  // ============================================================================

  // Login - returns access + refresh tokens
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Validation Error",
          message: validation.error.errors[0].message
        });
      }

      const { email, password } = validation.data;

      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password"
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Account is deactivated"
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password"
        });
      }

      // Get user's restaurant association (if any)
      let restaurantContext: {
        restaurantId?: string;
        restaurantName?: string;
        roleId?: string;
        roleName?: string;
        permissions?: string[];
        features?: Record<string, boolean>;
      } = {};

      if (!user.isSuperAdmin) {
        const [restaurantUser] = await db
          .select({
            restaurantUser: restaurantUsers,
            role: roles,
            restaurant: restaurants,
          })
          .from(restaurantUsers)
          .innerJoin(roles, eq(restaurantUsers.roleId, roles.id))
          .innerJoin(restaurants, eq(restaurantUsers.restaurantId, restaurants.id))
          .where(and(
            eq(restaurantUsers.userId, user.id),
            eq(restaurantUsers.isActive, true),
            eq(restaurants.isActive, true)
          ))
          .limit(1);

        if (restaurantUser) {
          // Check if restaurant is suspended
          if (restaurantUser.restaurant.isSuspended) {
            return res.status(403).json({
              error: "Restaurant Suspended",
              message: "This restaurant has been suspended. Please contact support.",
              status: "suspended",
            });
          }

          // Check if restaurant subscription has expired
          if (restaurantUser.restaurant.subscriptionEndAt && 
              new Date(restaurantUser.restaurant.subscriptionEndAt) < new Date()) {
            return res.status(403).json({
              error: "Subscription Expired",
              message: "Your restaurant subscription has expired. Please contact your administrator to renew.",
              status: "expired",
            });
          }

          // Get features for this restaurant
          const featureList = await db
            .select()
            .from(restaurantFeatureAllowlist)
            .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantUser.restaurant.id));
          
          const features = featureList.reduce((acc, f) => ({
            ...acc,
            [f.featureKey]: f.isEnabled ?? false
          }), {} as Record<string, boolean>);

          restaurantContext = {
            restaurantId: restaurantUser.restaurant.id,
            restaurantName: restaurantUser.restaurant.name,
            roleId: restaurantUser.role.id,
            roleName: restaurantUser.role.name,
            permissions: (restaurantUser.role.permissions as string[]) || [],
            features,
          };
        }
      }

      // Revoke all existing refresh tokens for this user (single active session)
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(refreshTokens.userId, user.id),
          isNull(refreshTokens.revokedAt)
        ));

      // Generate tokens
      const accessPayload: AccessTokenPayload = {
        userId: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin || false,
        ...restaurantContext,
      };

      const { token: accessToken, expiresAt: accessExpiresAt } = generateAccessToken(accessPayload);
      const { token: refreshToken, tokenId, expiresAt: refreshExpiresAt } = generateRefreshToken(user.id);

      // Store refresh token
      await db.insert(refreshTokens).values({
        tokenId,
        userId: user.id,
        restaurantId: restaurantContext.restaurantId || null,
        expiresAt: refreshExpiresAt,
      });

      // Update last login
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      // Set refresh token as HTTP-only cookie for security
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      const paymentMethods = restaurantContext.restaurantId
        ? await buildPaymentMethods(restaurantContext.restaurantId, restaurantContext.features || {})
        : { cash: false, counter: false, card: false, stripe: false, paypal: false };

      res.json({
        accessToken,
        accessTokenExpiresAt: accessExpiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isSuperAdmin: user.isSuperAdmin,
          ...restaurantContext,
          paymentMethods,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process login"
      });
    }
  });

  // Refresh token - exchange refresh token for new access token
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      // Try to get refresh token from cookie first, then from body
      const token = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!token) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "No refresh token provided"
        });
      }

      const payload = verifyRefreshToken(token);
      if (!payload) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid refresh token"
        });
      }

      // Find token in database
      const [storedToken] = await db
        .select()
        .from(refreshTokens)
        .where(and(
          eq(refreshTokens.tokenId, payload.tokenId),
          eq(refreshTokens.userId, payload.userId),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date())
        ))
        .limit(1);

      if (!storedToken) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Refresh token expired or revoked"
        });
      }

      // Get user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!user || !user.isActive) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not found or deactivated"
        });
      }

      // Get restaurant context if applicable
      let restaurantContext: {
        restaurantId?: string;
        roleId?: string;
        roleName?: string;
        permissions?: string[];
      } = {};

      if (!user.isSuperAdmin && storedToken.restaurantId) {
        const [restaurantUser] = await db
          .select({
            restaurantUser: restaurantUsers,
            role: roles,
          })
          .from(restaurantUsers)
          .innerJoin(roles, eq(restaurantUsers.roleId, roles.id))
          .where(and(
            eq(restaurantUsers.userId, user.id),
            eq(restaurantUsers.restaurantId, storedToken.restaurantId),
            eq(restaurantUsers.isActive, true)
          ))
          .limit(1);

        if (restaurantUser) {
          restaurantContext = {
            restaurantId: storedToken.restaurantId,
            roleId: restaurantUser.role.id,
            roleName: restaurantUser.role.name,
            permissions: (restaurantUser.role.permissions as string[]) || [],
          };
        }
      }

      // Generate new access token
      const accessPayload: AccessTokenPayload = {
        userId: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin || false,
        ...restaurantContext,
      };

      const { token: accessToken, expiresAt } = generateAccessToken(accessPayload);

      res.json({
        accessToken,
        accessTokenExpiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to refresh token"
      });
    }
  });

  // Logout - revoke refresh token (does not require authenticate - uses refresh token from cookie)
  app.post("/api/auth/logout", async (req, res) => {
    try {
      // Try to get refresh token from cookie first, then from body
      const token = req.cookies?.refreshToken || req.body?.refreshToken;

      if (token) {
        const payload = verifyRefreshToken(token);
        if (payload) {
          await db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.tokenId, payload.tokenId));
        }
      }

      // Clear the refresh token cookie
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to process logout"
      });
    }
  });

  // Get current user
  app.get("/api/auth/me", authenticate, loadFullUser, async (req, res) => {
    try {
      const user = req.user!;

      // Get all restaurant associations for this user
      const restaurantAssociations = await db
        .select({
          restaurantUser: restaurantUsers,
          role: roles,
          restaurant: restaurants,
        })
        .from(restaurantUsers)
        .innerJoin(roles, eq(restaurantUsers.roleId, roles.id))
        .innerJoin(restaurants, eq(restaurantUsers.restaurantId, restaurants.id))
        .where(and(
          eq(restaurantUsers.userId, user.userId),
          eq(restaurantUsers.isActive, true)
        ));

      // Get features for each restaurant (for feature gating in dashboard)
      const restaurantsWithFeatures = await Promise.all(
        restaurantAssociations.map(async (ra) => {
          const features = await db
            .select()
            .from(restaurantFeatureAllowlist)
            .where(eq(restaurantFeatureAllowlist.restaurantId, ra.restaurant.id));
          
          const featureFlags = features.reduce((acc, f) => ({
            ...acc,
            [f.featureKey]: f.isEnabled ?? false
          }), {} as Record<string, boolean>);

          return {
            id: ra.restaurant.id,
            name: ra.restaurant.name,
            slug: ra.restaurant.slug,
            roleId: ra.role.id,
            roleName: ra.role.name,
            permissions: ra.role.permissions,
            features: featureFlags,
          };
        })
      );

      // Get features for current restaurant context
      let currentRestaurantFeatures: Record<string, boolean> = {};
      if (user.restaurantId) {
        const currentFeatures = await db
          .select()
          .from(restaurantFeatureAllowlist)
          .where(eq(restaurantFeatureAllowlist.restaurantId, user.restaurantId));
        currentRestaurantFeatures = currentFeatures.reduce((acc, f) => ({
          ...acc,
          [f.featureKey]: f.isEnabled ?? false
        }), {} as Record<string, boolean>);
      }

      const paymentMethods = user.restaurantId
        ? await buildPaymentMethods(user.restaurantId, currentRestaurantFeatures)
        : { cash: false, counter: false, card: false, stripe: false, paypal: false };

      const currentRestaurantAssoc = restaurantAssociations.find(
        ra => ra.restaurant.id === user.restaurantId
      );

      res.json({
        id: user.userId,
        email: user.email,
        firstName: user.dbUser?.firstName,
        lastName: user.dbUser?.lastName,
        phone: user.dbUser?.phone,
        avatarUrl: user.dbUser?.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
        currentRestaurant: user.restaurantId ? {
          restaurantId: user.restaurantId,
          restaurantName: currentRestaurantAssoc?.restaurant.name || "",
          roleId: user.roleId,
          roleName: user.roleName,
          permissions: user.permissions,
          features: currentRestaurantFeatures,
          paymentMethods,
        } : null,
        restaurants: restaurantsWithFeatures,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to get user data"
      });
    }
  });

  // Switch restaurant context - get new token for different restaurant
  app.post("/api/auth/switch-restaurant", authenticate, async (req, res) => {
    try {
      const { restaurantId } = req.body;
      const user = req.user!;

      if (!restaurantId) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Restaurant ID required"
        });
      }

      // Verify user has access to this restaurant
      const [restaurantUser] = await db
        .select({
          restaurantUser: restaurantUsers,
          role: roles,
          restaurant: restaurants,
        })
        .from(restaurantUsers)
        .innerJoin(roles, eq(restaurantUsers.roleId, roles.id))
        .innerJoin(restaurants, eq(restaurantUsers.restaurantId, restaurants.id))
        .where(and(
          eq(restaurantUsers.userId, user.userId),
          eq(restaurantUsers.restaurantId, restaurantId),
          eq(restaurantUsers.isActive, true),
          eq(restaurants.isActive, true)
        ))
        .limit(1);

      if (!restaurantUser && !user.isSuperAdmin) {
        return res.status(403).json({
          error: "Forbidden",
          message: "No access to this restaurant"
        });
      }

      // Generate new access token with new restaurant context
      const accessPayload: AccessTokenPayload = {
        userId: user.userId,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        restaurantId,
        roleId: restaurantUser?.role.id,
        roleName: restaurantUser?.role.name,
        permissions: (restaurantUser?.role.permissions as string[]) || [],
      };

      const { token: accessToken, expiresAt } = generateAccessToken(accessPayload);

      res.json({
        accessToken,
        accessTokenExpiresAt: expiresAt.toISOString(),
        restaurant: restaurantUser ? {
          id: restaurantUser.restaurant.id,
          name: restaurantUser.restaurant.name,
          slug: restaurantUser.restaurant.slug,
        } : null,
      });
    } catch (error) {
      console.error("Switch restaurant error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to switch restaurant"
      });
    }
  });

  // ============================================================================
  // Super Admin Endpoints
  // ============================================================================

  // Helper function to compute restaurant status
  const computeRestaurantStatus = (restaurant: any) => {
    const now = new Date();
    
    // Check manual suspension first
    if (restaurant.isSuspended) {
      return "suspended";
    }
    
    // Check subscription expiry
    if (restaurant.subscriptionEndAt && new Date(restaurant.subscriptionEndAt) < now) {
      return "expired";
    }
    
    // Check if active
    if (!restaurant.isActive) {
      return "inactive";
    }
    
    return "active";
  };

  // List all restaurants (super admin only)
  app.get("/api/admin/restaurants", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const allRestaurants = await db
        .select()
        .from(restaurants)
        .orderBy(restaurants.name);

      // Add computed status to each restaurant
      const restaurantsWithStatus = allRestaurants.map((r) => ({
        ...r,
        status: computeRestaurantStatus(r),
        daysRemaining: r.subscriptionEndAt 
          ? Math.max(0, Math.ceil((new Date(r.subscriptionEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null,
      }));

      res.json({ restaurants: restaurantsWithStatus });
    } catch (error) {
      console.error("List restaurants error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to list restaurants"
      });
    }
  });

  // List all users (super admin only)
  app.get("/api/admin/users", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          isSuperAdmin: users.isSuperAdmin,
          isActive: users.isActive,
          emailVerifiedAt: users.emailVerifiedAt,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(users.email);

      res.json({ users: allUsers });
    } catch (error) {
      console.error("List users error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to list users"
      });
    }
  });

  // Create restaurant (super admin only)
  app.post("/api/admin/restaurants", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      // ✅ These will now come from the frontend form
      const {
        name,
        slug,
        timezone,
        adminEmail,        // ← From frontend
        adminPassword,     // ← From frontend
        adminFirstName,    // ← From frontend
        adminLastName,     // ← From frontend
        subscriptionDuration, // ← Subscription duration in months
        subscriptionEndDate,  // ← Custom end date (optional)
        ...rest
      } = req.body;

      if (!name || !slug) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Name and slug are required"
        });
      }

      // ✅ Check if admin email is provided
      if (!adminEmail || !adminPassword) {
        return res.status(400).json({ error: "Bad Request", message: "Admin email and password are required" });
      }
      // Check slug uniqueness
      const [existing] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.slug, slug))
        .limit(1);

      if (existing) {
        return res.status(409).json({
          error: "Conflict",
          message: "Restaurant with this slug already exists"
        });
      }

      // Calculate subscription end date
      const subscriptionStartAt = new Date();
      let subscriptionEndAt: Date | null = null;
      
      if (subscriptionEndDate) {
        subscriptionEndAt = new Date(subscriptionEndDate);
      } else if (subscriptionDuration) {
        subscriptionEndAt = new Date(subscriptionStartAt);
        subscriptionEndAt.setMonth(subscriptionEndAt.getMonth() + parseInt(subscriptionDuration));
      }

      // ✅ Step 1: Create restaurant (with email and subscription)
      const [restaurant] = await db
        .insert(restaurants)
        .values({
          name,
          slug,
          timezone,
          email: adminEmail,  // ← Store admin email here
          subscriptionStartAt,
          subscriptionEndAt,
          isSuspended: false,
          ...rest
        })
        .returning();

      console.log("Restaurant created:", restaurant.id);

      // ✅ Step 2: Check if user already exists
      let [adminUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, adminEmail.toLowerCase()))
        .limit(1);

      if (!adminUser) {
        // Create new admin user
        console.log("Creating admin user:", adminEmail);
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        [adminUser] = await db
          .insert(users)
          .values({
            email: adminEmail.toLowerCase(),
            password: hashedPassword,
            firstName: adminFirstName,
            lastName: adminLastName,
            isActive: true,
            emailVerifiedAt: new Date(), // Auto-verify admin
          })
          .returning();
        console.log("Admin user created:", adminUser.id);
      }
      else {
        console.log("Admin user already exists:", adminUser.id);
      }

      // ✅ Step 3: Create admin role for this restaurant
      let [adminRole] = await db
        .select()
        .from(roles)
        .where(and(
          eq(roles.restaurantId, restaurant.id),
          eq(roles.name, "admin")
        ))
        .limit(1);

      if (!adminRole) {
        console.log("Creating admin role for restaurant");
        [adminRole] = await db
          .insert(roles)
          .values({
            restaurantId: restaurant.id,
            name: "admin",
            description: "Restaurant Administrator",
            permissions: ["*"],  // Full access
            isSystemRole: true,
          })
          .returning();
        console.log("Admin role created:", adminRole.id);
      }

      // Seed default staff roles
      const defaultStaffRoles = [
        { name: "manager", description: "Manage staff and settings", permissions: ["staff:read","staff:create","staff:update","orders:read","orders:create","orders:update","orders:delete","menu:read","menu:create","menu:update","menu:delete","tables:read","tables:create","tables:update","tables:delete","settings:read","settings:update","payments:read","payments:create"] },
        { name: "server", description: "Take orders and manage tables", permissions: ["orders:read","orders:create","orders:update","tables:read","tables:update","menu:read","payments:read"] },
        { name: "kitchen", description: "View and manage kitchen orders", permissions: ["orders:read","orders:update","menu:read"] },
        { name: "cashier", description: "Process payments", permissions: ["orders:read","payments:read","payments:create","tables:read"] },
      ];
      for (const r of defaultStaffRoles) {
        await db.insert(roles).values({
          restaurantId: restaurant.id,
          name: r.name,
          description: r.description,
          permissions: r.permissions,
          isSystemRole: true,
        }).onConflictDoNothing();
      }

      // ✅ Step 4: Link admin user to restaurant
      const [restaurantUser] = await db
        .insert(restaurantUsers)
        .values({
          restaurantId: restaurant.id,
          userId: adminUser.id,
          roleId: adminRole.id,
          isActive: true,
          hiredAt: new Date(),
        })
        .returning();

      console.log("Admin linked to restaurant:", restaurantUser.id);

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.RESTAURANT_CREATE,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        newValue: restaurant,
        req,
      });

      res.status(201).json({
        restaurant,
        adminUser: {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
        }
      });
    } catch (error) {
      console.error("Create restaurant error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create restaurant"
      });
    }
  });

  // Get restaurant details with features, settings, domains (super admin only)
  app.get("/api/admin/restaurants/:restaurantId", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!restaurant) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      const [domains, features, settings, staffCount] = await Promise.all([
        db.select().from(restaurantDomains).where(eq(restaurantDomains.restaurantId, restaurantId)),
        db.select().from(restaurantFeatureAllowlist).where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId)),
        db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId)),
        db.select({ id: restaurantUsers.id }).from(restaurantUsers).where(eq(restaurantUsers.restaurantId, restaurantId)),
      ]);

      // Compute status and days remaining
      const status = computeRestaurantStatus(restaurant);
      const daysRemaining = restaurant.subscriptionEndAt 
        ? Math.max(0, Math.ceil((new Date(restaurant.subscriptionEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;

      res.json({
        restaurant: {
          ...restaurant,
          status,
          daysRemaining,
        },
        domains,
        features: features.reduce((acc, f) => ({ ...acc, [f.featureKey]: { isEnabled: f.isEnabled, expiresAt: f.expiresAt } }), {}),
        settings: settings.reduce((acc, s) => ({ ...acc, [s.settingKey]: s.settingValue }), {}),
        staffCount: staffCount.length,
      });
    } catch (error) {
      console.error("Get restaurant details error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to get restaurant details"
      });
    }
  });

  // Update restaurant (super admin only)
  app.patch("/api/admin/restaurants/:restaurantId", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const updates = req.body;

      const [existing] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      // Don't allow updating id or certain fields
      delete updates.id;
      delete updates.createdAt;
      delete updates.suspendedAt;
      delete updates.suspendedReason;
      updates.updatedAt = new Date();

      const [restaurant] = await db
        .update(restaurants)
        .set(updates)
        .where(eq(restaurants.id, restaurantId))
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.RESTAURANT_UPDATE,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        previousValue: existing,
        newValue: restaurant,
        req,
      });

      res.json({ restaurant });
    } catch (error) {
      console.error("Update restaurant error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update restaurant"
      });
    }
  });

  // Add domain to restaurant (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/domains", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { domain, isPrimary = false } = req.body;

      if (!domain) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Domain is required"
        });
      }

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!restaurant) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      // Check domain uniqueness
      const [existingDomain] = await db
        .select()
        .from(restaurantDomains)
        .where(eq(restaurantDomains.domain, domain))
        .limit(1);

      if (existingDomain) {
        return res.status(409).json({
          error: "Conflict",
          message: "Domain is already in use"
        });
      }

      const [newDomain] = await db
        .insert(restaurantDomains)
        .values({ restaurantId, domain, isPrimary })
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.DOMAIN_CREATE,
        targetType: "domain",
        targetId: newDomain.id,
        targetName: domain,
        newValue: newDomain,
        metadata: { restaurantId, restaurantName: restaurant.name },
        req,
      });

      res.status(201).json({ domain: newDomain });
    } catch (error) {
      console.error("Add domain error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to add domain"
      });
    }
  });

  // Remove domain from restaurant (super admin only)
  app.delete("/api/admin/restaurants/:restaurantId/domains/:domainId", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId, domainId } = req.params;

      const [existingDomain] = await db
        .select()
        .from(restaurantDomains)
        .where(and(
          eq(restaurantDomains.id, domainId),
          eq(restaurantDomains.restaurantId, restaurantId)
        ))
        .limit(1);

      if (!existingDomain) {
        return res.status(404).json({
          error: "Not Found",
          message: "Domain not found"
        });
      }

      await db
        .delete(restaurantDomains)
        .where(eq(restaurantDomains.id, domainId));

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.DOMAIN_DELETE,
        targetType: "domain",
        targetId: domainId,
        targetName: existingDomain.domain,
        previousValue: existingDomain,
        metadata: { restaurantId },
        req,
      });

      res.json({ message: "Domain removed successfully" });
    } catch (error) {
      console.error("Remove domain error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to remove domain"
      });
    }
  });

  // Set/update restaurant features (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/features", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { features } = req.body; // { featureKey: { isEnabled: boolean, expiresAt?: string } }

      if (!features || typeof features !== 'object') {
        return res.status(400).json({
          error: "Bad Request",
          message: "Features object is required"
        });
      }

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!restaurant) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      const existingFeatures = await db
        .select()
        .from(restaurantFeatureAllowlist)
        .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId));

      const existingMap = new Map(existingFeatures.map(f => [f.featureKey, f]));
      const results: Record<string, unknown> = {};

      for (const [featureKey, config] of Object.entries(features)) {
        const { isEnabled, expiresAt } = config as { isEnabled: boolean; expiresAt?: string };
        const existing = existingMap.get(featureKey);

        if (existing) {
          const [updated] = await db
            .update(restaurantFeatureAllowlist)
            .set({
              isEnabled,
              expiresAt: expiresAt ? new Date(expiresAt) : null,
              updatedAt: new Date()
            })
            .where(eq(restaurantFeatureAllowlist.id, existing.id))
            .returning();
          results[featureKey] = updated;

          await createAuditLog({
            adminUserId: req.user!.userId,
            action: AUDIT_ACTIONS.FEATURE_UPDATE,
            targetType: "feature",
            targetId: existing.id,
            targetName: featureKey,
            previousValue: existing,
            newValue: updated,
            metadata: { restaurantId, restaurantName: restaurant.name },
            req,
          });
        } else {
          const [created] = await db
            .insert(restaurantFeatureAllowlist)
            .values({
              restaurantId,
              featureKey,
              isEnabled,
              expiresAt: expiresAt ? new Date(expiresAt) : null
            })
            .returning();
          results[featureKey] = created;

          await createAuditLog({
            adminUserId: req.user!.userId,
            action: AUDIT_ACTIONS.FEATURE_CREATE,
            targetType: "feature",
            targetId: created.id,
            targetName: featureKey,
            newValue: created,
            metadata: { restaurantId, restaurantName: restaurant.name },
            req,
          });
        }
      }

      clearFeatureCache(restaurantId);

      res.json({ features: results });
    } catch (error) {
      console.error("Set features error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to set features"
      });
    }
  });

  // Set/update restaurant settings including payment methods (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/settings", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { settings } = req.body; // { settingKey: settingValue }

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          error: "Bad Request",
          message: "Settings object is required"
        });
      }

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!restaurant) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      const existingSettings = await db
        .select()
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, restaurantId));

      const existingMap = new Map(existingSettings.map(s => [s.settingKey, s]));
      const results: Record<string, unknown> = {};

      for (const [settingKey, settingValue] of Object.entries(settings)) {
        const existing = existingMap.get(settingKey);

        if (existing) {
          const [updated] = await db
            .update(restaurantSettings)
            .set({
              settingValue,
              updatedAt: new Date()
            })
            .where(eq(restaurantSettings.id, existing.id))
            .returning();
          results[settingKey] = updated.settingValue;

          await createAuditLog({
            adminUserId: req.user!.userId,
            action: AUDIT_ACTIONS.SETTING_UPDATE,
            targetType: "setting",
            targetId: existing.id,
            targetName: settingKey,
            previousValue: existing.settingValue,
            newValue: settingValue,
            metadata: { restaurantId, restaurantName: restaurant.name },
            req,
          });
        } else {
          const [created] = await db
            .insert(restaurantSettings)
            .values({ restaurantId, settingKey, settingValue })
            .returning();
          results[settingKey] = created.settingValue;

          await createAuditLog({
            adminUserId: req.user!.userId,
            action: AUDIT_ACTIONS.SETTING_CREATE,
            targetType: "setting",
            targetId: created.id,
            targetName: settingKey,
            newValue: settingValue,
            metadata: { restaurantId, restaurantName: restaurant.name },
            req,
          });
        }
      }

      clearFeatureCache(restaurantId);

      res.json({ settings: results });
    } catch (error) {
      console.error("Set settings error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to set settings"
      });
    }
  });

  // Suspend restaurant (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/suspend", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { reason } = req.body;

      const [existing] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      if (existing.isSuspended) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Restaurant is already suspended"
        });
      }

      const [restaurant] = await db
        .update(restaurants)
        .set({
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedReason: reason || "Suspended by administrator",
          updatedAt: new Date()
        })
        .where(eq(restaurants.id, restaurantId))
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.RESTAURANT_SUSPEND,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        previousValue: { suspendedAt: null, suspendedReason: null },
        newValue: { suspendedAt: restaurant.suspendedAt, suspendedReason: restaurant.suspendedReason },
        metadata: { reason },
        req,
      });

      res.json({ restaurant, message: "Restaurant suspended successfully" });
    } catch (error) {
      console.error("Suspend restaurant error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to suspend restaurant"
      });
    }
  });

  // Restore restaurant (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/restore", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;

      const [existing] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      // Check if restaurant is manually suspended (not just expired)
      if (!existing.isSuspended) {
        // If not manually suspended, check if it's expired and can be restored
        const isExpired = existing.subscriptionEndAt && new Date(existing.subscriptionEndAt) < new Date();
        if (isExpired) {
          return res.status(400).json({
            error: "Bad Request",
            message: "Restaurant subscription has expired. Please extend the subscription first."
          });
        }
        return res.status(400).json({
          error: "Bad Request",
          message: "Restaurant is not suspended"
        });
      }

      const [restaurant] = await db
        .update(restaurants)
        .set({
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
          updatedAt: new Date()
        })
        .where(eq(restaurants.id, restaurantId))
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.RESTAURANT_RESTORE,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        previousValue: { suspendedAt: existing.suspendedAt, suspendedReason: existing.suspendedReason },
        newValue: { suspendedAt: null, suspendedReason: null },
        req,
      });

      res.json({ restaurant, message: "Restaurant restored successfully" });
    } catch (error) {
      console.error("Restore restaurant error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to restore restaurant"
      });
    }
  });

  // Extend subscription (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/extend", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { months, endDate } = req.body;

      const [existing] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      let newEndDate: Date;
      
      if (endDate) {
        newEndDate = new Date(endDate);
      } else if (months) {
        // Extend from current end date or from now if expired
        const baseDate = existing.subscriptionEndAt && new Date(existing.subscriptionEndAt) > new Date() 
          ? new Date(existing.subscriptionEndAt)
          : new Date();
        newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + parseInt(months));
      } else {
        return res.status(400).json({
          error: "Bad Request",
          message: "Either months or endDate is required"
        });
      }

      const [restaurant] = await db
        .update(restaurants)
        .set({
          subscriptionEndAt: newEndDate,
          updatedAt: new Date()
        })
        .where(eq(restaurants.id, restaurantId))
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: "SUBSCRIPTION_EXTEND" as any,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        previousValue: { subscriptionEndAt: existing.subscriptionEndAt },
        newValue: { subscriptionEndAt: restaurant.subscriptionEndAt },
        metadata: { months, endDate },
        req,
      });

      res.json({ 
        restaurant, 
        message: `Subscription extended to ${newEndDate.toLocaleDateString()}` 
      });
    } catch (error) {
      console.error("Extend subscription error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to extend subscription"
      });
    }
  });

  // Delete restaurant (super admin only) - PERMANENT deletion
app.delete("/api/admin/restaurants/:restaurantId", authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { restaurantId } = req.params;

    // Get restaurant details before deletion
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    if (!restaurant) {
      return res.status(404).json({
        error: "Not Found",
        message: "Restaurant not found"
      });
    }

    console.log(`⚠️ DELETING RESTAURANT: ${restaurant.name} (${restaurantId})`);
    console.log("This will permanently delete all associated data!");

    // Delete the restaurant (cascading deletes will handle related data)
    await db
      .delete(restaurants)
      .where(eq(restaurants.id, restaurantId));

    // Create audit log
    await createAuditLog({
      adminUserId: req.user!.userId,
      action: AUDIT_ACTIONS.RESTAURANT_DELETE,
      targetType: "restaurant",
      targetId: restaurantId,
      targetName: restaurant.name,
      previousValue: restaurant,
      metadata: {
        deletedAt: new Date().toISOString(),
        reason: "Permanent deletion by super admin"
      },
      req,
    });

    console.log(`✅ Restaurant deleted: ${restaurant.name}`);

    res.json({
      message: "Restaurant deleted permanently",
      restaurantName: restaurant.name
    });
  } catch (error) {
    console.error("Delete restaurant error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to delete restaurant"
    });
  }
});

  // Create restaurant admin user (super admin only)
  app.post("/api/admin/restaurants/:restaurantId/admin", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { email, password, firstName, lastName, phone } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Email and password are required"
        });
      }

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      if (!restaurant) {
        return res.status(404).json({
          error: "Not Found",
          message: "Restaurant not found"
        });
      }

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      let user;
      if (existingUser) {
        // Check if already associated with this restaurant
        const [existingAssoc] = await db
          .select()
          .from(restaurantUsers)
          .where(and(
            eq(restaurantUsers.userId, existingUser.id),
            eq(restaurantUsers.restaurantId, restaurantId)
          ))
          .limit(1);

        if (existingAssoc) {
          return res.status(409).json({
            error: "Conflict",
            message: "User is already associated with this restaurant"
          });
        }
        user = existingUser;
      } else {
        // Create new user
        const hashedPassword = await bcrypt.hash(password, 10);
        const [newUser] = await db
          .insert(users)
          .values({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstName,
            lastName,
            phone,
          })
          .returning();
        user = newUser;

        await createAuditLog({
          adminUserId: req.user!.userId,
          action: AUDIT_ACTIONS.USER_CREATE,
          targetType: "user",
          targetId: user.id,
          targetName: user.email,
          newValue: { email: user.email, firstName, lastName },
          metadata: { restaurantId, restaurantName: restaurant.name },
          req,
        });
      }

      // Find or create admin role for this restaurant
      let [adminRole] = await db
        .select()
        .from(roles)
        .where(and(
          eq(roles.restaurantId, restaurantId),
          eq(roles.name, "admin")
        ))
        .limit(1);

      if (!adminRole) {
        // Create admin role
        [adminRole] = await db
          .insert(roles)
          .values({
            restaurantId,
            name: "admin",
            description: "Restaurant Administrator",
            permissions: [
              "menu:read", "menu:create", "menu:update", "menu:delete",
              "orders:read", "orders:create", "orders:update", "orders:delete",
              "tables:read", "tables:create", "tables:update", "tables:delete",
              "staff:read", "staff:create", "staff:update", "staff:delete",
              "reports:read", "settings:read", "settings:update"
            ],
            isSystemRole: true,
          })
          .returning();
      }

      // Create restaurant user association
      const [restaurantUser] = await db
        .insert(restaurantUsers)
        .values({
          restaurantId,
          userId: user.id,
          roleId: adminRole.id,
        })
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.ADMIN_CREATE,
        targetType: "user",
        targetId: user.id,
        targetName: user.email,
        newValue: { restaurantUser, role: "admin" },
        metadata: { restaurantId, restaurantName: restaurant.name },
        req,
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        restaurantUser: {
          id: restaurantUser.id,
          roleId: adminRole.id,
          roleName: adminRole.name,
        },
        message: "Restaurant admin created successfully"
      });
    } catch (error) {
      console.error("Create restaurant admin error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to create restaurant admin"
      });
    }
  });

  // Get audit logs (super admin only)
  app.get("/api/admin/audit-logs", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const targetType = req.query.targetType as string;
      const targetId = req.query.targetId as string;

      // Build conditions array for filtering
      const conditions = [];
      if (targetType) {
        conditions.push(eq(adminAuditLogs.targetType, targetType));
      }
      if (targetId) {
        conditions.push(eq(adminAuditLogs.targetId, targetId));
      }

      const baseQuery = db
        .select({
          id: adminAuditLogs.id,
          adminUserId: adminAuditLogs.adminUserId,
          adminEmail: users.email,
          action: adminAuditLogs.action,
          targetType: adminAuditLogs.targetType,
          targetId: adminAuditLogs.targetId,
          targetName: adminAuditLogs.targetName,
          previousValue: adminAuditLogs.previousValue,
          newValue: adminAuditLogs.newValue,
          metadata: adminAuditLogs.metadata,
          ipAddress: adminAuditLogs.ipAddress,
          createdAt: adminAuditLogs.createdAt,
        })
        .from(adminAuditLogs)
        .leftJoin(users, eq(adminAuditLogs.adminUserId, users.id));

      const logs = conditions.length > 0
        ? await baseQuery.where(and(...conditions)).orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset)
        : await baseQuery.orderBy(desc(adminAuditLogs.createdAt)).limit(limit).offset(offset);

      res.json({ logs, limit, offset });
    } catch (error) {
      console.error("Get audit logs error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to get audit logs"
      });
    }
  });

  // ============================================================================
  // Restaurant Dashboard Stats
  // ============================================================================

  app.get(
    "/api/restaurants/:restaurantId/stats",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [orderStats] = await db
          .select({
            ordersToday: sql<number>`COUNT(CASE WHEN ${orders.createdAt} >= ${todayStart} THEN 1 END)::int`,
            revenueToday: sql<number>`COALESCE(SUM(CASE WHEN ${orders.createdAt} >= ${todayStart} AND ${orders.status} NOT IN ('cancelled') THEN ${orders.total}::numeric ELSE 0 END), 0)`,
            activeOrders: sql<number>`COUNT(CASE WHEN ${orders.status} IN ('pending', 'confirmed', 'preparing', 'ready') THEN 1 END)::int`,
          })
          .from(orders)
          .where(eq(orders.restaurantId, restaurantId));

        const [tableStats] = await db
          .select({
            tablesOccupied: sql<number>`COUNT(CASE WHEN ${diningTables.status} = 'occupied' THEN 1 END)::int`,
          })
          .from(diningTables)
          .where(eq(diningTables.restaurantId, restaurantId));

        const recentOrders = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            total: orders.total,
            source: orders.source,
            orderType: orders.orderType,
            customerName: orders.customerName,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(eq(orders.restaurantId, restaurantId))
          .orderBy(sql`${orders.createdAt} DESC`)
          .limit(5);

        res.json({
          ordersToday: orderStats?.ordersToday ?? 0,
          revenueToday: parseFloat(String(orderStats?.revenueToday ?? 0)),
          activeOrders: orderStats?.activeOrders ?? 0,
          tablesOccupied: tableStats?.tablesOccupied ?? 0,
          recentOrders,
        });
      } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
      }
    }
  );

  // ============================================================================
  // Restaurant Staff Management Endpoints
  // ============================================================================

  // List restaurant staff
  app.get(
    "/api/restaurants/:restaurantId/staff",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("staff:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const staffList = await db
          .select({
            id: restaurantUsers.id,
            userId: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            avatarUrl: users.avatarUrl,
            roleId: roles.id,
            roleName: roles.name,
            pin: restaurantUsers.pin,
            isActive: restaurantUsers.isActive,
            hiredAt: restaurantUsers.hiredAt,
            createdAt: restaurantUsers.createdAt,
          })
          .from(restaurantUsers)
          .innerJoin(users, eq(restaurantUsers.userId, users.id))
          .innerJoin(roles, eq(restaurantUsers.roleId, roles.id))
          .where(eq(restaurantUsers.restaurantId, restaurantId))
          .orderBy(restaurantUsers.createdAt);

        const defaultMemberId = staffList.length > 0 ? staffList[0].id : null;

        const staff = staffList.map(s => ({
          ...s,
          isDefault: s.id === defaultMemberId,
        }));

        res.json({ staff });
      } catch (error) {
        console.error("List staff error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to list staff"
        });
      }
    }
  );

  // Add staff member to restaurant
  app.post(
    "/api/restaurants/:restaurantId/staff",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("staff:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { email, password, firstName, lastName, phone, roleId, pin } = req.body;

        if (!email || !password || !roleId) {
          return res.status(400).json({
            error: "Bad Request",
            message: "Email, password, and roleId are required"
          });
        }

        // Verify role belongs to this restaurant
        const [role] = await db
          .select()
          .from(roles)
          .where(and(
            eq(roles.id, roleId),
            eq(roles.restaurantId, restaurantId)
          ))
          .limit(1);

        if (!role) {
          return res.status(400).json({
            error: "Bad Request",
            message: "Invalid role for this restaurant"
          });
        }

        // Check if user already exists
        let [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user) {
          // Create new user
          const hashedPassword = await bcrypt.hash(password, 10);
          [user] = await db
            .insert(users)
            .values({
              email: email.toLowerCase(),
              password: hashedPassword,
              firstName,
              lastName,
              phone,
              isActive: true,
            })
            .returning();
        }

        // Check if already a member of this restaurant
        const [existingMembership] = await db
          .select()
          .from(restaurantUsers)
          .where(and(
            eq(restaurantUsers.userId, user.id),
            eq(restaurantUsers.restaurantId, restaurantId)
          ))
          .limit(1);

        if (existingMembership) {
          return res.status(409).json({
            error: "Conflict",
            message: "User is already a staff member of this restaurant"
          });
        }

        // Add to restaurant
        const [restaurantUser] = await db
          .insert(restaurantUsers)
          .values({
            restaurantId,
            userId: user.id,
            roleId,
            pin,
            isActive: true,
            hiredAt: new Date(),
          })
          .returning();

        res.status(201).json({
          staff: {
            id: restaurantUser.id,
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roleId: role.id,
            roleName: role.name,
            isActive: restaurantUser.isActive,
          },
        });
      } catch (error) {
        console.error("Add staff error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to add staff member"
        });
      }
    }
  );

  // Delete staff member
  app.delete(
    "/api/restaurants/:restaurantId/staff/:staffId",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("staff:delete"),
    async (req, res) => {
      try {
        const { restaurantId, staffId } = req.params;

        // Get the staff member
        const [member] = await db
          .select({
            id: restaurantUsers.id,
            userId: restaurantUsers.userId,
            roleId: restaurantUsers.roleId,
            createdAt: restaurantUsers.createdAt,
          })
          .from(restaurantUsers)
          .where(and(
            eq(restaurantUsers.id, staffId),
            eq(restaurantUsers.restaurantId, restaurantId)
          ))
          .limit(1);

        if (!member) {
          return res.status(404).json({ error: "Staff member not found" });
        }

        // Prevent self-deletion
        const currentUserId = (req as any).user?.id;
        if (member.userId === currentUserId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You cannot delete your own account"
          });
        }

        const [earliestMember] = await db
          .select({ id: restaurantUsers.id })
          .from(restaurantUsers)
          .where(eq(restaurantUsers.restaurantId, restaurantId))
          .orderBy(restaurantUsers.createdAt)
          .limit(1);

        if (earliestMember && earliestMember.id === staffId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "Cannot delete the default restaurant admin"
          });
        }

        // Delete the restaurant_users record (not the user account itself)
        await db
          .delete(restaurantUsers)
          .where(and(
            eq(restaurantUsers.id, staffId),
            eq(restaurantUsers.restaurantId, restaurantId)
          ));

        res.json({ message: "Staff member removed successfully" });
      } catch (error) {
        console.error("Delete staff error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to delete staff member"
        });
      }
    }
  );

  // Update staff member
  app.patch(
    "/api/restaurants/:restaurantId/staff/:staffId",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("staff:update"),
    async (req, res) => {
      try {
        const { restaurantId, staffId } = req.params;
        const { roleId, pin, isActive, firstName, lastName, email, password } = req.body;

        const [existingStaff] = await db
          .select()
          .from(restaurantUsers)
          .where(and(
            eq(restaurantUsers.id, staffId),
            eq(restaurantUsers.restaurantId, restaurantId)
          ))
          .limit(1);

        if (!existingStaff) {
          return res.status(404).json({
            error: "Not Found",
            message: "Staff member not found"
          });
        }

        const hasUserLevelChanges = firstName !== undefined || lastName !== undefined || email !== undefined || password !== undefined;

        if (hasUserLevelChanges) {
          const currentUserId = req.user?.userId;
          const [earliestMember] = await db
            .select({ id: restaurantUsers.id, userId: restaurantUsers.userId })
            .from(restaurantUsers)
            .where(eq(restaurantUsers.restaurantId, restaurantId))
            .orderBy(restaurantUsers.createdAt)
            .limit(1);

          if (!earliestMember || earliestMember.userId !== currentUserId) {
            return res.status(403).json({
              error: "Forbidden",
              message: "Only the default admin can edit staff account details"
            });
          }
        }

        if (roleId) {
          const [role] = await db
            .select()
            .from(roles)
            .where(and(
              eq(roles.id, roleId),
              eq(roles.restaurantId, restaurantId)
            ))
            .limit(1);

          if (!role) {
            return res.status(400).json({
              error: "Bad Request",
              message: "Invalid role for this restaurant"
            });
          }
        }

        if (email) {
          const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(
              eq(users.email, email.toLowerCase()),
              sql`${users.id} != ${existingStaff.userId}`
            ))
            .limit(1);

          if (existingUser) {
            return res.status(409).json({
              error: "Conflict",
              message: "Email is already in use by another account"
            });
          }
        }

        const restaurantUserUpdates: Partial<typeof existingStaff> = {};
        if (roleId !== undefined) restaurantUserUpdates.roleId = roleId;
        if (pin !== undefined) restaurantUserUpdates.pin = pin;
        if (isActive !== undefined) restaurantUserUpdates.isActive = isActive;

        if (Object.keys(restaurantUserUpdates).length > 0) {
          await db
            .update(restaurantUsers)
            .set({ ...restaurantUserUpdates, updatedAt: new Date() })
            .where(eq(restaurantUsers.id, staffId));
        }

        if (hasUserLevelChanges) {
          const userUpdates: Record<string, any> = {};
          if (firstName !== undefined) userUpdates.firstName = firstName;
          if (lastName !== undefined) userUpdates.lastName = lastName;
          if (email !== undefined) userUpdates.email = email.toLowerCase();
          if (password) {
            userUpdates.password = await bcrypt.hash(password, 10);
          }

          if (Object.keys(userUpdates).length > 0) {
            await db
              .update(users)
              .set(userUpdates)
              .where(eq(users.id, existingStaff.userId));
          }
        }

        res.json({ message: "Staff member updated successfully" });
      } catch (error) {
        console.error("Update staff error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to update staff member"
        });
      }
    }
  );

  // Remove staff member
  app.delete(
    "/api/restaurants/:restaurantId/staff/:staffId",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("staff:delete"),
    async (req, res) => {
      try {
        const { restaurantId, staffId } = req.params;

        const [deleted] = await db
          .delete(restaurantUsers)
          .where(and(
            eq(restaurantUsers.id, staffId),
            eq(restaurantUsers.restaurantId, restaurantId)
          ))
          .returning();

        if (!deleted) {
          return res.status(404).json({
            error: "Not Found",
            message: "Staff member not found"
          });
        }

        res.json({ message: "Staff member removed" });
      } catch (error) {
        console.error("Remove staff error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to remove staff member"
        });
      }
    }
  );

  // ============================================================================
  // Restaurant Roles Endpoints
  // ============================================================================

  // List roles for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/roles",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const rolesList = await db
          .select()
          .from(roles)
          .where(eq(roles.restaurantId, restaurantId))
          .orderBy(roles.name);

        res.json({ roles: rolesList });
      } catch (error) {
        console.error("List roles error:", error);
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to list roles"
        });
      }
    }
  );

  // ============================================================================
  // Public Tenant Endpoints (for QR ordering)
  // ============================================================================

  // Get restaurant by slug (public)
  app.get("/api/restaurants/:tenantSlug", resolveTenantBySlug, async (req, res) => {
    if (!req.restaurant) {
      return res.status(404).json({
        error: "Not Found",
        message: "Restaurant not found"
      });
    }

    res.json({
      id: req.restaurant.id,
      name: req.restaurant.name,
      slug: req.restaurant.slug,
      logoUrl: req.restaurant.logoUrl,
      address: req.restaurant.address,
      city: req.restaurant.city,
      state: req.restaurant.state,
      country: req.restaurant.country,
      phone: req.restaurant.phone,
      email: req.restaurant.email,
      timezone: req.restaurant.timezone,
      currency: req.restaurant.currency,
    });
  });

  // ============================================================================
  // Feature Gating Test Endpoints
  // ============================================================================

  app.get(
    "/api/restaurants/:restaurantId/features",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { features, settings } = await getRestaurantFeatures(req.params.restaurantId);
        res.json({ features, settings });
      } catch (error) {
        console.error("Get features error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  );

  app.post(
    "/api/restaurants/:restaurantId/features/cache/clear",
    authenticate,
    requireSuperAdmin,
    async (req, res) => {
      clearFeatureCache(req.params.restaurantId);
      res.json({ message: "Feature cache cleared" });
    }
  );

  app.get(
    "/api/test/feature/pos",
    authenticate,
    resolveTenantFromToken,
    requireFeature("pos"),
    async (req, res) => {
      res.json({
        success: true,
        message: "POS feature is enabled for this restaurant",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/feature/qr",
    authenticate,
    resolveTenantFromToken,
    requireFeature("qr_ordering"),
    async (req, res) => {
      res.json({
        success: true,
        message: "QR feature is enabled for this restaurant",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/feature/reservations",
    authenticate,
    resolveTenantFromToken,
    requireFeature("table_reservations"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Table reservations feature is enabled",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/soft-toggle/split-billing",
    authenticate,
    resolveTenantFromToken,
    requireSoftToggle("split_billing"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Split billing is enabled for this restaurant",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/soft-toggle/tips",
    authenticate,
    resolveTenantFromToken,
    requireSoftToggle("enable_tips"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Tips are enabled for this restaurant",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/soft-toggle/kitchen-printer",
    authenticate,
    resolveTenantFromToken,
    requireSoftToggle("kitchen_printer"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Kitchen printer is enabled",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/payment-method/apple-pay",
    authenticate,
    resolveTenantFromToken,
    requirePaymentMethodEnabled("apple_pay"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Apple Pay is enabled for this restaurant",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/payment-method/crypto",
    authenticate,
    resolveTenantFromToken,
    requirePaymentMethodEnabled("crypto"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Crypto payments are enabled",
        restaurantId: req.tenantId,
      });
    }
  );

  app.get(
    "/api/test/combined/split-payments",
    authenticate,
    resolveTenantFromToken,
    requireFeatureAndSoftToggle("split_payments", "split_billing"),
    async (req, res) => {
      res.json({
        success: true,
        message: "Split payments feature AND split billing toggle are both enabled",
        restaurantId: req.tenantId,
      });
    }
  );

  // ============================================================================
  // PHASE 5: RESTAURANT DASHBOARD APIs (Admin)
  // ============================================================================

  // ----------------------------------------------------------------------------
  // MENUS CRUD
  // ----------------------------------------------------------------------------

  // List all menus for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/menus",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const menuList = await db
          .select()
          .from(menus)
          .where(eq(menus.restaurantId, restaurantId))
          .orderBy(menus.sortOrder);
        res.json(menuList);
      } catch (error) {
        console.error("List menus error:", error);
        res.status(500).json({ error: "Failed to list menus" });
      }
    }
  );

  // Create a menu
  app.post(
    "/api/restaurants/:restaurantId/menus",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { name, description, isActive, isDefault, availableFrom, availableTo, availableDays, sortOrder } = req.body;

        if (!name) {
          return res.status(400).json({ error: "Menu name is required" });
        }

        const [menu] = await db
          .insert(menus)
          .values({
            restaurantId,
            name,
            description,
            isActive: isActive ?? true,
            isDefault: isDefault ?? false,
            availableFrom,
            availableTo,
            availableDays: availableDays ?? [0, 1, 2, 3, 4, 5, 6],
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(menu);
      } catch (error) {
        console.error("Create menu error:", error);
        res.status(500).json({ error: "Failed to create menu" });
      }
    }
  );

  // Update a menu
  app.patch(
    "/api/restaurants/:restaurantId/menus/:menuId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, menuId } = req.params;
        const updates = req.body;

        const [existing] = await db
          .select()
          .from(menus)
          .where(and(eq(menus.id, menuId), eq(menus.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Menu not found" });
        }

        const [updated] = await db
          .update(menus)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(menus.id, menuId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Update menu error:", error);
        res.status(500).json({ error: "Failed to update menu" });
      }
    }
  );

  // Delete a menu
  app.delete(
    "/api/restaurants/:restaurantId/menus/:menuId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:delete"),
    async (req, res) => {
      try {
        const { restaurantId, menuId } = req.params;

        const [existing] = await db
          .select()
          .from(menus)
          .where(and(eq(menus.id, menuId), eq(menus.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Menu not found" });
        }

        await db.delete(menus).where(eq(menus.id, menuId));
        res.json({ message: "Menu deleted successfully" });
      } catch (error) {
        console.error("Delete menu error:", error);
        res.status(500).json({ error: "Failed to delete menu" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // CATEGORIES CRUD
  // ----------------------------------------------------------------------------

  // List all categories for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/categories",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { menuId } = req.query;

        const conditions = [eq(categories.restaurantId, restaurantId)];
        if (menuId) {
          conditions.push(eq(categories.menuId, menuId as string));
        }

        const categoryList = await db
          .select()
          .from(categories)
          .where(and(...conditions))
          .orderBy(categories.sortOrder);

        res.json(categoryList);
      } catch (error) {
        console.error("List categories error:", error);
        res.status(500).json({ error: "Failed to list categories" });
      }
    }
  );

  // Create a category
  app.post(
    "/api/restaurants/:restaurantId/categories",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        let { menuId, name, description, imageUrl, isActive, sortOrder } = req.body;

        if (!name) {
          return res.status(400).json({ error: "Category name is required" });
        }

        if (!menuId) {
          const [defaultMenu] = await db
            .select({ id: menus.id })
            .from(menus)
            .where(and(eq(menus.restaurantId, restaurantId), eq(menus.isActive, true)))
            .orderBy(menus.createdAt)
            .limit(1);

          if (defaultMenu) {
            menuId = defaultMenu.id;
          } else {
            const [newMenu] = await db.insert(menus).values({
              restaurantId,
              name: "Main Menu",
              isActive: true,
            }).returning();
            menuId = newMenu.id;
          }
        }

        const [category] = await db
          .insert(categories)
          .values({
            restaurantId,
            menuId,
            name,
            description,
            imageUrl,
            isActive: isActive ?? true,
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(category);
      } catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({ error: "Failed to create category" });
      }
    }
  );

  // Update a category
  app.patch(
    "/api/restaurants/:restaurantId/categories/:categoryId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, categoryId } = req.params;
        const updates = req.body;

        const [existing] = await db
          .select()
          .from(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Category not found" });
        }

        const [updated] = await db
          .update(categories)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(categories.id, categoryId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Update category error:", error);
        res.status(500).json({ error: "Failed to update category" });
      }
    }
  );

  // Delete a category
  app.delete(
    "/api/restaurants/:restaurantId/categories/:categoryId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:delete"),
    async (req, res) => {
      try {
        const { restaurantId, categoryId } = req.params;

        const [existing] = await db
          .select()
          .from(categories)
          .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Category not found" });
        }

        await db.delete(categories).where(eq(categories.id, categoryId));
        res.json({ message: "Category deleted successfully" });
      } catch (error) {
        console.error("Delete category error:", error);
        res.status(500).json({ error: "Failed to delete category" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // MENU ITEMS CRUD
  // ----------------------------------------------------------------------------

  // List all menu items for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/menu-items",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { categoryId } = req.query;

        const conditions = [eq(menuItems.restaurantId, restaurantId)];
        if (categoryId) {
          conditions.push(eq(menuItems.categoryId, categoryId as string));
        }

        const items = await db
          .select()
          .from(menuItems)
          .where(and(...conditions))
          .orderBy(menuItems.sortOrder);

        res.json(items);
      } catch (error) {
        console.error("List menu items error:", error);
        res.status(500).json({ error: "Failed to list menu items" });
      }
    }
  );

  // Create a menu item
  app.post(
    "/api/restaurants/:restaurantId/menu-items",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const {
          categoryId, name, description, price, compareAtPrice, cost,
          imageUrl, sku, barcode, isAvailable, isPopular, isNew,
          preparationTime, calories, allergens, tags, sortOrder
        } = req.body;

        if (!name || price === undefined) {
          return res.status(400).json({ error: "Name and price are required" });
        }

        const [item] = await db
          .insert(menuItems)
          .values({
            restaurantId,
            categoryId,
            name,
            description,
            price: price.toString(),
            compareAtPrice: compareAtPrice?.toString(),
            cost: cost?.toString(),
            imageUrl,
            sku,
            barcode,
            isAvailable: isAvailable ?? true,
            isPopular: isPopular ?? false,
            isNew: isNew ?? false,
            preparationTime,
            calories,
            allergens: allergens ?? [],
            tags: tags ?? [],
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(item);
      } catch (error) {
        console.error("Create menu item error:", error);
        res.status(500).json({ error: "Failed to create menu item" });
      }
    }
  );

  // Get a single menu item with its modifier groups
  app.get(
    "/api/restaurants/:restaurantId/menu-items/:itemId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId, itemId } = req.params;

        const [item] = await db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));

        if (!item) {
          return res.status(404).json({ error: "Menu item not found" });
        }

        // Get linked modifier groups
        const linkedGroups = await db
          .select({
            linkId: menuItemModifierGroups.id,
            sortOrder: menuItemModifierGroups.sortOrder,
            group: modifierGroups,
          })
          .from(menuItemModifierGroups)
          .innerJoin(modifierGroups, eq(menuItemModifierGroups.modifierGroupId, modifierGroups.id))
          .where(eq(menuItemModifierGroups.menuItemId, itemId))
          .orderBy(menuItemModifierGroups.sortOrder);

        // Get modifiers for each group
        const groupIds = linkedGroups.map(lg => lg.group.id);
        const modifierList = groupIds.length > 0
          ? await db
            .select()
            .from(modifiers)
            .where(sql`${modifiers.modifierGroupId} IN (${sql.raw(groupIds.map(id => `'${id}'`).join(","))})`)
            .orderBy(modifiers.sortOrder)
          : [];

        const modifiersByGroup = modifierList.reduce((acc, mod) => {
          if (!acc[mod.modifierGroupId]) acc[mod.modifierGroupId] = [];
          acc[mod.modifierGroupId].push(mod);
          return acc;
        }, {} as Record<string, typeof modifierList>);

        res.json({
          ...item,
          modifierGroups: linkedGroups.map(lg => ({
            ...lg.group,
            linkSortOrder: lg.sortOrder,
            modifiers: modifiersByGroup[lg.group.id] || [],
          })),
        });
      } catch (error) {
        console.error("Get menu item error:", error);
        res.status(500).json({ error: "Failed to get menu item" });
      }
    }
  );

  // Update a menu item
  app.patch(
    "/api/restaurants/:restaurantId/menu-items/:itemId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, itemId } = req.params;
        const updates = { ...req.body };

        // Convert price fields to strings if provided
        if (updates.price !== undefined) updates.price = updates.price.toString();
        if (updates.compareAtPrice !== undefined) updates.compareAtPrice = updates.compareAtPrice.toString();
        if (updates.cost !== undefined) updates.cost = updates.cost.toString();

        const [existing] = await db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Menu item not found" });
        }

        const [updated] = await db
          .update(menuItems)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(menuItems.id, itemId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Update menu item error:", error);
        res.status(500).json({ error: "Failed to update menu item" });
      }
    }
  );

  // Delete a menu item
  app.delete(
    "/api/restaurants/:restaurantId/menu-items/:itemId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:delete"),
    async (req, res) => {
      try {
        const { restaurantId, itemId } = req.params;

        const [existing] = await db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Menu item not found" });
        }

        await db.delete(menuItems).where(eq(menuItems.id, itemId));
        res.json({ message: "Menu item deleted successfully" });
      } catch (error) {
        console.error("Delete menu item error:", error);
        res.status(500).json({ error: "Failed to delete menu item" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // MODIFIER GROUPS CRUD
  // ----------------------------------------------------------------------------

  // List all modifier groups for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/modifier-groups",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const groups = await db
          .select()
          .from(modifierGroups)
          .where(eq(modifierGroups.restaurantId, restaurantId))
          .orderBy(modifierGroups.sortOrder);

        res.json(groups);
      } catch (error) {
        console.error("List modifier groups error:", error);
        res.status(500).json({ error: "Failed to list modifier groups" });
      }
    }
  );

  // Create a modifier group
  app.post(
    "/api/restaurants/:restaurantId/modifier-groups",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { name, description, isRequired, minSelections, maxSelections, sortOrder } = req.body;

        if (!name) {
          return res.status(400).json({ error: "Modifier group name is required" });
        }

        const [group] = await db
          .insert(modifierGroups)
          .values({
            restaurantId,
            name,
            description,
            isRequired: isRequired ?? false,
            minSelections: minSelections ?? 0,
            maxSelections: maxSelections ?? 1,
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(group);
      } catch (error) {
        console.error("Create modifier group error:", error);
        res.status(500).json({ error: "Failed to create modifier group" });
      }
    }
  );

  // Update a modifier group
  app.patch(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, groupId } = req.params;
        const updates = req.body;

        const [existing] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        const [updated] = await db
          .update(modifierGroups)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(modifierGroups.id, groupId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Update modifier group error:", error);
        res.status(500).json({ error: "Failed to update modifier group" });
      }
    }
  );

  // Delete a modifier group
  app.delete(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:delete"),
    async (req, res) => {
      try {
        const { restaurantId, groupId } = req.params;

        const [existing] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        await db.delete(modifierGroups).where(eq(modifierGroups.id, groupId));
        res.json({ message: "Modifier group deleted successfully" });
      } catch (error) {
        console.error("Delete modifier group error:", error);
        res.status(500).json({ error: "Failed to delete modifier group" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // MODIFIERS CRUD (within a modifier group)
  // ----------------------------------------------------------------------------

  // List modifiers in a group
  app.get(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId/modifiers",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:read"),
    async (req, res) => {
      try {
        const { restaurantId, groupId } = req.params;

        // Verify group belongs to restaurant
        const [group] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!group) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        const modifierList = await db
          .select()
          .from(modifiers)
          .where(eq(modifiers.modifierGroupId, groupId))
          .orderBy(modifiers.sortOrder);

        res.json(modifierList);
      } catch (error) {
        console.error("List modifiers error:", error);
        res.status(500).json({ error: "Failed to list modifiers" });
      }
    }
  );

  // Create a modifier
  app.post(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId/modifiers",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId, groupId } = req.params;
        const { name, price, isDefault, isAvailable, sortOrder } = req.body;

        // Verify group belongs to restaurant
        const [group] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!group) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        if (!name) {
          return res.status(400).json({ error: "Modifier name is required" });
        }

        const [modifier] = await db
          .insert(modifiers)
          .values({
            modifierGroupId: groupId,
            name,
            price: price?.toString() ?? "0.00",
            isDefault: isDefault ?? false,
            isAvailable: isAvailable ?? true,
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(modifier);
      } catch (error) {
        console.error("Create modifier error:", error);
        res.status(500).json({ error: "Failed to create modifier" });
      }
    }
  );

  // Update a modifier
  app.patch(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId/modifiers/:modifierId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, groupId, modifierId } = req.params;
        const updates = { ...req.body };

        if (updates.price !== undefined) updates.price = updates.price.toString();

        // Verify group belongs to restaurant
        const [group] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!group) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        const [existing] = await db
          .select()
          .from(modifiers)
          .where(and(eq(modifiers.id, modifierId), eq(modifiers.modifierGroupId, groupId)));

        if (!existing) {
          return res.status(404).json({ error: "Modifier not found" });
        }

        const [updated] = await db
          .update(modifiers)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(modifiers.id, modifierId))
          .returning();

        res.json(updated);
      } catch (error) {
        console.error("Update modifier error:", error);
        res.status(500).json({ error: "Failed to update modifier" });
      }
    }
  );

  // Delete a modifier
  app.delete(
    "/api/restaurants/:restaurantId/modifier-groups/:groupId/modifiers/:modifierId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:delete"),
    async (req, res) => {
      try {
        const { restaurantId, groupId, modifierId } = req.params;

        // Verify group belongs to restaurant
        const [group] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, groupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!group) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        const [existing] = await db
          .select()
          .from(modifiers)
          .where(and(eq(modifiers.id, modifierId), eq(modifiers.modifierGroupId, groupId)));

        if (!existing) {
          return res.status(404).json({ error: "Modifier not found" });
        }

        await db.delete(modifiers).where(eq(modifiers.id, modifierId));
        res.json({ message: "Modifier deleted successfully" });
      } catch (error) {
        console.error("Delete modifier error:", error);
        res.status(500).json({ error: "Failed to delete modifier" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // MENU ITEM <-> MODIFIER GROUP LINKING
  // ----------------------------------------------------------------------------

  // Link a modifier group to a menu item
  app.post(
    "/api/restaurants/:restaurantId/menu-items/:itemId/modifier-groups",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, itemId } = req.params;
        const { modifierGroupId, sortOrder } = req.body;

        // Verify item belongs to restaurant
        const [item] = await db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));

        if (!item) {
          return res.status(404).json({ error: "Menu item not found" });
        }

        // Verify group belongs to restaurant
        const [group] = await db
          .select()
          .from(modifierGroups)
          .where(and(eq(modifierGroups.id, modifierGroupId), eq(modifierGroups.restaurantId, restaurantId)));

        if (!group) {
          return res.status(404).json({ error: "Modifier group not found" });
        }

        const [link] = await db
          .insert(menuItemModifierGroups)
          .values({
            menuItemId: itemId,
            modifierGroupId,
            sortOrder: sortOrder ?? 0,
          })
          .returning();

        res.status(201).json(link);
      } catch (error: any) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Modifier group already linked to this item" });
        }
        console.error("Link modifier group error:", error);
        res.status(500).json({ error: "Failed to link modifier group" });
      }
    }
  );

  // Unlink a modifier group from a menu item
  app.delete(
    "/api/restaurants/:restaurantId/menu-items/:itemId/modifier-groups/:groupId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("menu:update"),
    async (req, res) => {
      try {
        const { restaurantId, itemId, groupId } = req.params;

        // Verify item belongs to restaurant
        const [item] = await db
          .select()
          .from(menuItems)
          .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));

        if (!item) {
          return res.status(404).json({ error: "Menu item not found" });
        }

        const [existing] = await db
          .select()
          .from(menuItemModifierGroups)
          .where(and(
            eq(menuItemModifierGroups.menuItemId, itemId),
            eq(menuItemModifierGroups.modifierGroupId, groupId)
          ));

        if (!existing) {
          return res.status(404).json({ error: "Link not found" });
        }

        await db
          .delete(menuItemModifierGroups)
          .where(and(
            eq(menuItemModifierGroups.menuItemId, itemId),
            eq(menuItemModifierGroups.modifierGroupId, groupId)
          ));

        res.json({ message: "Modifier group unlinked successfully" });
      } catch (error) {
        console.error("Unlink modifier group error:", error);
        res.status(500).json({ error: "Failed to unlink modifier group" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // DINING TABLES CRUD
  // ----------------------------------------------------------------------------

  // List all dining tables for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/tables",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("tables:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const tableList = await db
          .select()
          .from(diningTables)
          .where(eq(diningTables.restaurantId, restaurantId))
          .orderBy(diningTables.number);

        // Get active QR tokens for all tables
        const activeTokens = await db
          .select()
          .from(qrTokens)
          .where(and(eq(qrTokens.restaurantId, restaurantId), eq(qrTokens.isActive, true)));

        // Map tokens by tableId for quick lookup
        const tokensByTable = new Map(
          activeTokens.map((token) => [token.tableId, token.token])
        );

        // Add qrToken to each table
        const tablesWithQr = tableList.map((table) => ({
          ...table,
          qrToken: tokensByTable.get(table.id) || null,
        }));

        res.json(tablesWithQr);
      } catch (error) {
        console.error("List tables error:", error);
        res.status(500).json({ error: "Failed to list tables" });
      }
    }
  );

  // Create a dining table
  app.post(
    "/api/restaurants/:restaurantId/tables",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("tables:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { number, name, capacity, section, status, isActive, positionX, positionY } = req.body;

        if (!number) {
          return res.status(400).json({ error: "Table number is required" });
        }

        const [table] = await db
          .insert(diningTables)
          .values({
            restaurantId,
            number,
            name,
            capacity: capacity ?? 4,
            section,
            status: status ?? "available",
            isActive: isActive ?? true,
            positionX,
            positionY,
          })
          .returning();

        res.status(201).json(table);
      } catch (error: any) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Table number already exists" });
        }
        console.error("Create table error:", error);
        res.status(500).json({ error: "Failed to create table" });
      }
    }
  );

  // Update a dining table
  app.patch(
    "/api/restaurants/:restaurantId/tables/:tableId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("tables:update"),
    async (req, res) => {
      try {
        const { restaurantId, tableId } = req.params;
        const updates = req.body;

        const [existing] = await db
          .select()
          .from(diningTables)
          .where(and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Table not found" });
        }

        const [updated] = await db
          .update(diningTables)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(diningTables.id, tableId))
          .returning();

        res.json(updated);
      } catch (error: any) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Table number already exists" });
        }
        console.error("Update table error:", error);
        res.status(500).json({ error: "Failed to update table" });
      }
    }
  );

  // Delete a dining table
  app.delete(
    "/api/restaurants/:restaurantId/tables/:tableId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("tables:delete"),
    async (req, res) => {
      try {
        const { restaurantId, tableId } = req.params;

        const [existing] = await db
          .select()
          .from(diningTables)
          .where(and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "Table not found" });
        }

        const activeOrders = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(
            eq(orders.tableId, tableId),
            notInArray(orders.status, ['completed', 'cancelled'])
          ));

        if (activeOrders.length > 0) {
          return res.status(400).json({ error: "Cannot delete table with active orders. Complete or cancel all orders first." });
        }

        await db.delete(diningTables).where(eq(diningTables.id, tableId));
        res.json({ message: "Table deleted successfully" });
      } catch (error) {
        console.error("Delete table error:", error);
        res.status(500).json({ error: "Failed to delete table" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // QR TOKENS MANAGEMENT
  // ----------------------------------------------------------------------------

  // List all QR tokens for a restaurant
  app.get(
    "/api/restaurants/:restaurantId/qr-tokens",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("qr_ordering"),
    requirePermission("tables:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const tokens = await db
          .select({
            id: qrTokens.id,
            restaurantId: qrTokens.restaurantId,
            tableId: qrTokens.tableId,
            tableNumber: diningTables.number,
            token: qrTokens.token,
            qrCodeUrl: qrTokens.qrCodeUrl,
            tokenType: qrTokens.tokenType,
            isActive: qrTokens.isActive,
            scansCount: qrTokens.scansCount,
            lastScannedAt: qrTokens.lastScannedAt,
            expiresAt: qrTokens.expiresAt,
            createdAt: qrTokens.createdAt,
          })
          .from(qrTokens)
          .leftJoin(diningTables, eq(qrTokens.tableId, diningTables.id))
          .where(eq(qrTokens.restaurantId, restaurantId))
          .orderBy(diningTables.number);

        res.json(tokens);
      } catch (error) {
        console.error("List QR tokens error:", error);
        res.status(500).json({ error: "Failed to list QR tokens" });
      }
    }
  );

  // Generate QR token for a table
  app.post(
    "/api/restaurants/:restaurantId/tables/:tableId/qr-token",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("qr_ordering"),
    requirePermission("tables:update"),
    async (req, res) => {
      try {
        const { restaurantId, tableId } = req.params;
        const { expiresAt, tokenType } = req.body;

        // Verify table belongs to restaurant
        const [table] = await db
          .select()
          .from(diningTables)
          .where(and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, restaurantId)));

        if (!table) {
          return res.status(404).json({ error: "Table not found" });
        }

        // Generate unique 4-character token
        const token = await generateUniqueQrToken();

        // Deactivate any existing tokens for this table
        await db
          .update(qrTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(qrTokens.tableId, tableId), eq(qrTokens.isActive, true)));

        const [qrToken] = await db
          .insert(qrTokens)
          .values({
            restaurantId,
            tableId,
            token,
            tokenType: tokenType ?? "table",
            isActive: true,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          })
          .returning();

        res.status(201).json({
          ...qrToken,
          tableNumber: table.number,
          qrUrl: `/order/${token}`, // Frontend will use this to generate QR code
        });
      } catch (error) {
        console.error("Generate QR token error:", error);
        res.status(500).json({ error: "Failed to generate QR token" });
      }
    }
  );

  // Generate QR tokens for all tables (bulk)
  app.post(
    "/api/restaurants/:restaurantId/qr-tokens/bulk",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("qr_ordering"),
    requirePermission("tables:update"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        // Get all active tables without active QR tokens
        const tables = await db
          .select()
          .from(diningTables)
          .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.isActive, true)));

        const createdTokens = [];

        for (const table of tables) {
          // Deactivate existing tokens
          await db
            .update(qrTokens)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(eq(qrTokens.tableId, table.id), eq(qrTokens.isActive, true)));

          const token = await generateUniqueQrToken();

          const [qrToken] = await db
            .insert(qrTokens)
            .values({
              restaurantId,
              tableId: table.id,
              token,
              tokenType: "table",
              isActive: true,
            })
            .returning();

          createdTokens.push({
            ...qrToken,
            tableNumber: table.number,
            qrUrl: `/order/${token}`,
          });
        }

        res.status(201).json({
          message: `Generated ${createdTokens.length} QR tokens`,
          tokens: createdTokens,
        });
      } catch (error) {
        console.error("Bulk generate QR tokens error:", error);
        res.status(500).json({ error: "Failed to generate QR tokens" });
      }
    }
  );

  // Deactivate a QR token
  app.delete(
    "/api/restaurants/:restaurantId/qr-tokens/:tokenId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("qr_ordering"),
    requirePermission("tables:update"),
    async (req, res) => {
      try {
        const { restaurantId, tokenId } = req.params;

        const [existing] = await db
          .select()
          .from(qrTokens)
          .where(and(eq(qrTokens.id, tokenId), eq(qrTokens.restaurantId, restaurantId)));

        if (!existing) {
          return res.status(404).json({ error: "QR token not found" });
        }

        await db
          .update(qrTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(qrTokens.id, tokenId));

        res.json({ message: "QR token deactivated successfully" });
      } catch (error) {
        console.error("Deactivate QR token error:", error);
        res.status(500).json({ error: "Failed to deactivate QR token" });
      }
    }
  );

  // ----------------------------------------------------------------------------
  // RESTAURANT SETTINGS (Soft Toggles) - Admin controlled
  // ----------------------------------------------------------------------------

  // Get restaurant settings
  app.get(
    "/api/restaurants/:restaurantId/settings",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("settings:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        // Get all settings
        const settings = await db
          .select()
          .from(restaurantSettings)
          .where(eq(restaurantSettings.restaurantId, restaurantId));

        // Get features to show what's allowed
        const features = await db
          .select()
          .from(restaurantFeatureAllowlist)
          .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId));

        const settingsMap: Record<string, unknown> = {};
        const credentialKeys = ["stripe_credentials", "paypal_credentials"];
        for (const s of settings) {
          if (credentialKeys.includes(s.settingKey)) {
            const cred = s.settingValue as Record<string, string> | null;
            if (cred && typeof cred === "object") {
              const masked: Record<string, string | boolean> = { configured: true };
              for (const [k, v] of Object.entries(cred)) {
                if (k === "mode") {
                  masked[k] = v;
                } else if (typeof v === "string" && v.length > 4) {
                  masked[k] = "••••" + v.slice(-4);
                } else {
                  masked[k] = "••••";
                }
              }
              settingsMap[s.settingKey] = masked;
            } else {
              settingsMap[s.settingKey] = { configured: false };
            }
          } else {
            settingsMap[s.settingKey] = s.settingValue;
          }
        }

        const featuresMap: Record<string, boolean> = {};
        for (const f of features) {
          const isExpired = f.expiresAt && f.expiresAt < new Date();
          featuresMap[f.featureKey] = (f.isEnabled ?? false) && !isExpired;
        }

        res.json({ settings: settingsMap, features: featuresMap });
      } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ error: "Failed to get settings" });
      }
    }
  );

  // Update a restaurant setting (with feature gating validation)
  app.patch(
    "/api/restaurants/:restaurantId/settings/:settingKey",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("settings:update"),
    async (req, res) => {
      try {
        const { restaurantId, settingKey } = req.params;
        const { value } = req.body;

        // Feature gating: validate that the setting change doesn't enable something not allowed
        const featureRequirements: Record<string, string> = {
          split_billing: "split_billing",
          split_billing_enabled: "split_billing",
          qr_ordering: "qr_ordering",
          payment_methods: "pos",
        };

        const requiredFeature = featureRequirements[settingKey];
        if (requiredFeature) {
          const isAllowed = await checkFeature(restaurantId, requiredFeature);
          if (!isAllowed) {
            return res.status(403).json({
              error: "Feature Not Allowed",
              message: `Cannot update "${settingKey}" because the "${requiredFeature}" feature is not enabled for this restaurant`,
            });
          }
        }

        // For QR ordering settings, validate mode
        if (settingKey === "qr_ordering" && value) {
          const mode = value.mode;
          if (mode && !["auto", "manual"].includes(mode)) {
            return res.status(400).json({ error: "QR mode must be 'auto' or 'manual'" });
          }
          if (mode === "manual" && value.manualInputType) {
            if (!["dropdown", "text"].includes(value.manualInputType)) {
              return res.status(400).json({ error: "Manual input type must be 'dropdown' or 'text'" });
            }
          }
        }

        // Upsert the setting
        const [existing] = await db
          .select()
          .from(restaurantSettings)
          .where(and(
            eq(restaurantSettings.restaurantId, restaurantId),
            eq(restaurantSettings.settingKey, settingKey)
          ));

        let setting;
        if (existing) {
          [setting] = await db
            .update(restaurantSettings)
            .set({ settingValue: value, updatedAt: new Date() })
            .where(eq(restaurantSettings.id, existing.id))
            .returning();
        } else {
          [setting] = await db
            .insert(restaurantSettings)
            .values({
              restaurantId,
              settingKey,
              settingValue: value,
            })
            .returning();
        }

        // Clear feature cache
        clearFeatureCache(restaurantId);

        res.json(setting);
      } catch (error) {
        console.error("Update setting error:", error);
        res.status(500).json({ error: "Failed to update setting" });
      }
    }
  );

  // Bulk update restaurant settings
  app.put(
    "/api/restaurants/:restaurantId/settings",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("settings:update"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { settings } = req.body;

        if (!settings || typeof settings !== "object") {
          return res.status(400).json({ error: "Settings object is required" });
        }

        // Get features for validation
        const features = await db
          .select()
          .from(restaurantFeatureAllowlist)
          .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId));

        const enabledFeatures = new Set<string>();
        for (const f of features) {
          const isExpired = f.expiresAt && f.expiresAt < new Date();
          if (f.isEnabled && !isExpired) {
            enabledFeatures.add(f.featureKey);
          }
        }

        // Feature gating validation
        const featureRequirements: Record<string, string> = {
          split_billing: "split_billing",
          split_billing_enabled: "split_billing",
          qr_ordering: "qr_ordering",
          payment_methods: "pos",
        };

        for (const [key, value] of Object.entries(settings)) {
          const requiredFeature = featureRequirements[key];
          if (requiredFeature && !enabledFeatures.has(requiredFeature)) {
            return res.status(403).json({
              error: "Feature Not Allowed",
              message: `Cannot update "${key}" because the "${requiredFeature}" feature is not enabled`,
            });
          }

          // Validate QR ordering settings
          if (key === "qr_ordering" && value) {
            const qrSettings = value as { mode?: string; manualInputType?: string };
            if (qrSettings.mode && !["auto", "manual"].includes(qrSettings.mode)) {
              return res.status(400).json({ error: "QR mode must be 'auto' or 'manual'" });
            }
            if (qrSettings.mode === "manual" && qrSettings.manualInputType) {
              if (!["dropdown", "text"].includes(qrSettings.manualInputType)) {
                return res.status(400).json({ error: "Manual input type must be 'dropdown' or 'text'" });
              }
            }
          }
        }

        // Upsert all settings
        const results = [];
        for (const [key, value] of Object.entries(settings)) {
          const [existing] = await db
            .select()
            .from(restaurantSettings)
            .where(and(
              eq(restaurantSettings.restaurantId, restaurantId),
              eq(restaurantSettings.settingKey, key)
            ));

          let setting;
          if (existing) {
            [setting] = await db
              .update(restaurantSettings)
              .set({ settingValue: value, updatedAt: new Date() })
              .where(eq(restaurantSettings.id, existing.id))
              .returning();
          } else {
            [setting] = await db
              .insert(restaurantSettings)
              .values({
                restaurantId,
                settingKey: key,
                settingValue: value,
              })
              .returning();
          }
          results.push(setting);
        }

        // Clear feature cache
        clearFeatureCache(restaurantId);

        res.json({ updated: results.length, settings: results });
      } catch (error) {
        console.error("Bulk update settings error:", error);
        res.status(500).json({ error: "Failed to update settings" });
      }
    }
  );

  // Save payment credentials for a restaurant
  app.put(
    "/api/restaurants/:restaurantId/payment-credentials/:provider",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("settings:update"),
    async (req, res) => {
      try {
        const { restaurantId, provider } = req.params;

        if (!["stripe", "paypal"].includes(provider)) {
          return res.status(400).json({ error: "Provider must be 'stripe' or 'paypal'" });
        }

        const featureKey = provider === "stripe" ? "stripe_payments" : "paypal_payments";
        const isAllowed = await checkFeature(restaurantId, featureKey);
        if (!isAllowed) {
          return res.status(403).json({
            error: "Feature Not Allowed",
            message: `${provider} payments feature is not enabled for this restaurant by the platform admin`,
          });
        }

        const settingKey = `${provider}_credentials`;
        let credentials: Record<string, string>;

        if (provider === "stripe") {
          const { secretKey, publishableKey, webhookSecret } = req.body;
          if (!secretKey || !publishableKey) {
            return res.status(400).json({ error: "Secret Key and Publishable Key are required" });
          }
          credentials = { secretKey, publishableKey };
          if (webhookSecret) credentials.webhookSecret = webhookSecret;
        } else {
          const { clientId, clientSecret, mode } = req.body;
          if (!clientId || !clientSecret) {
            return res.status(400).json({ error: "Client ID and Client Secret are required" });
          }
          if (mode && !["sandbox", "live"].includes(mode)) {
            return res.status(400).json({ error: "Mode must be 'sandbox' or 'live'" });
          }
          credentials = { clientId, clientSecret, mode: mode || "sandbox" };
        }

        // Check for existing credentials - merge to preserve fields not being updated
        const [existing] = await db
          .select()
          .from(restaurantSettings)
          .where(and(
            eq(restaurantSettings.restaurantId, restaurantId),
            eq(restaurantSettings.settingKey, settingKey)
          ));

        let setting;
        if (existing) {
          [setting] = await db
            .update(restaurantSettings)
            .set({ settingValue: credentials, updatedAt: new Date() })
            .where(eq(restaurantSettings.id, existing.id))
            .returning();
        } else {
          [setting] = await db
            .insert(restaurantSettings)
            .values({
              restaurantId,
              settingKey,
              settingValue: credentials,
            })
            .returning();
        }

        clearFeatureCache(restaurantId);

        // Return masked version
        const masked: Record<string, string | boolean> = { configured: true };
        for (const [k, v] of Object.entries(credentials)) {
          if (k === "mode") {
            masked[k] = v;
          } else if (v.length > 4) {
            masked[k] = "••••" + v.slice(-4);
          } else {
            masked[k] = "••••";
          }
        }

        res.json({ message: `${provider} credentials saved successfully`, credentials: masked });
      } catch (error) {
        console.error("Save payment credentials error:", error);
        res.status(500).json({ error: "Failed to save payment credentials" });
      }
    }
  );

  // Delete payment credentials for a restaurant
  app.delete(
    "/api/restaurants/:restaurantId/payment-credentials/:provider",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requirePermission("settings:update"),
    async (req, res) => {
      try {
        const { restaurantId, provider } = req.params;

        if (!["stripe", "paypal"].includes(provider)) {
          return res.status(400).json({ error: "Provider must be 'stripe' or 'paypal'" });
        }

        const settingKey = `${provider}_credentials`;
        await db
          .delete(restaurantSettings)
          .where(and(
            eq(restaurantSettings.restaurantId, restaurantId),
            eq(restaurantSettings.settingKey, settingKey)
          ));

        clearFeatureCache(restaurantId);
        res.json({ message: `${provider} credentials removed successfully` });
      } catch (error) {
        console.error("Delete payment credentials error:", error);
        res.status(500).json({ error: "Failed to remove payment credentials" });
      }
    }
  );

  // ============================================================================
  // PUBLIC QR ORDERING ENDPOINTS (Phase 6)
  // No authentication required - rate limited
  // ============================================================================

  // Rate limiter for public endpoints (more restrictive)
  const publicRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
    message: { error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limiter for order creation (more restrictive)
  const orderCreationRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 order attempts per minute per IP
    message: { error: "Too many order attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Helper function to get QR ordering settings for a restaurant
  async function getQrOrderingSettings(restaurantId: string): Promise<{
    enabled: boolean;
    mode: "auto" | "manual";
    manualInputType: "dropdown" | "text";
  }> {
    const [setting] = await db
      .select()
      .from(restaurantSettings)
      .where(and(
        eq(restaurantSettings.restaurantId, restaurantId),
        eq(restaurantSettings.settingKey, "qr_ordering")
      ));

    if (setting?.settingValue) {
      const value = setting.settingValue as any;
      return {
        enabled: value.enabled ?? true,
        mode: value.mode ?? "auto",
        manualInputType: value.manualInputType ?? "dropdown",
      };
    }

    // Default settings
    return {
      enabled: true,
      mode: "auto",
      manualInputType: "dropdown",
    };
  }

  // Helper to generate a unique 4-character QR token
  async function generateUniqueQrToken(): Promise<string> {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    for (let attempt = 0; attempt < 30; attempt++) {
      let token = "";
      for (let i = 0; i < 4; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const [existing] = await db
        .select({ token: qrTokens.token })
        .from(qrTokens)
        .where(and(eq(qrTokens.token, token), eq(qrTokens.isActive, true)));
      if (!existing) return token;
    }
    throw new Error("Could not generate a unique QR token");
  }

  // Helper to generate unique order number
  function generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QR-${timestamp}-${random}`;
  }

  // Helper to generate short display number for kitchen
  async function generateDisplayNumber(restaurantId: string): Promise<number> {
    // Get the max display number for today and increment
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ maxDisplay: sql<number>`COALESCE(MAX(${orders.displayNumber}), 0)` })
      .from(orders)
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gt(orders.createdAt, today)
      ));

    return (result?.maxDisplay ?? 0) + 1;
  }

  // ============================================================================
  // QR Token Resolution - Scan QR code to get restaurant + table context
  // ============================================================================
  app.get(
    "/api/order/:token",
    publicRateLimiter,
    async (req, res) => {
      try {
        const { token } = req.params;

        // Find the QR token
        const [qrToken] = await db
          .select({
            id: qrTokens.id,
            restaurantId: qrTokens.restaurantId,
            tableId: qrTokens.tableId,
            token: qrTokens.token,
            tokenType: qrTokens.tokenType,
            isActive: qrTokens.isActive,
            expiresAt: qrTokens.expiresAt,
          })
          .from(qrTokens)
          .where(eq(qrTokens.token, token));

        if (!qrToken) {
          return res.status(404).json({
            error: "Invalid QR Code",
            message: "This QR code is not valid or has been removed"
          });
        }

        if (!qrToken.isActive) {
          return res.status(410).json({
            error: "QR Code Expired",
            message: "This QR code is no longer active. Please ask staff for assistance."
          });
        }

        if (qrToken.expiresAt && new Date(qrToken.expiresAt) < new Date()) {
          return res.status(410).json({
            error: "QR Code Expired",
            message: "This QR code has expired. Please ask staff for assistance."
          });
        }

        // Update scan count
        await db
          .update(qrTokens)
          .set({
            scansCount: sql`${qrTokens.scansCount} + 1`,
            lastScannedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(qrTokens.id, qrToken.id));

        // Get restaurant info
        const [restaurant] = await db
          .select({
            id: restaurants.id,
            name: restaurants.name,
            slug: restaurants.slug,
            logoUrl: restaurants.logoUrl,
            currency: restaurants.currency,
            taxRate: restaurants.taxRate,
            suspendedAt: restaurants.suspendedAt,
          })
          .from(restaurants)
          .where(eq(restaurants.id, qrToken.restaurantId));

        if (!restaurant) {
          return res.status(404).json({
            error: "Restaurant Not Found",
            message: "The restaurant associated with this QR code was not found"
          });
        }

        if (restaurant.suspendedAt) {
          return res.status(403).json({
            error: "Restaurant Unavailable",
            message: "This restaurant is currently not accepting orders"
          });
        }

        // Check if QR ordering feature is enabled
        const hasQrFeature = await checkFeature(qrToken.restaurantId, "qr_ordering");
        if (!hasQrFeature) {
          return res.status(403).json({
            error: "QR Ordering Unavailable",
            message: "QR ordering is not available for this restaurant"
          });
        }

        // Get QR ordering settings
        const qrSettings = await getQrOrderingSettings(qrToken.restaurantId);

        if (!qrSettings.enabled) {
          return res.status(403).json({
            error: "QR Ordering Disabled",
            message: "QR ordering is currently disabled for this restaurant"
          });
        }

        // Get table info if this is a table-specific QR (AUTO mode)
        let tableInfo = null;
        if (qrToken.tableId) {
          const [table] = await db
            .select({
              id: diningTables.id,
              number: diningTables.number,
              name: diningTables.name,
              capacity: diningTables.capacity,
              isActive: diningTables.isActive,
            })
            .from(diningTables)
            .where(eq(diningTables.id, qrToken.tableId));

          if (table && table.isActive) {
            tableInfo = {
              ...table,
              label: table.name || `Table ${table.number}`,
            };
          }
        }

        const payMethods = await resolvePaymentMethods(qrToken.restaurantId);

        // Fetch QR template setting
        const [templateSetting] = await db
          .select()
          .from(restaurantSettings)
          .where(and(
            eq(restaurantSettings.restaurantId, qrToken.restaurantId),
            eq(restaurantSettings.settingKey, "qr_template")
          ));
        const qrTemplate = (templateSetting?.settingValue as string) || "classic";

        const response: any = {
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            slug: restaurant.slug,
            logoUrl: restaurant.logoUrl,
            currency: restaurant.currency,
            taxRate: restaurant.taxRate,
          },
          qrToken: {
            id: qrToken.id,
            type: qrToken.tokenType,
          },
          orderingMode: qrSettings.mode,
          qrTemplate,
          paymentMethods: {
            card: payMethods.card,
            stripe: payMethods.stripe,
            paypal: payMethods.paypal,
          },
        };

        if (qrSettings.mode === "auto" && tableInfo) {
          // AUTO mode with table-specific QR
          response.table = tableInfo;
          response.requiresTableSelection = false;
        } else {
          // MANUAL mode or no table linked
          response.requiresTableSelection = true;
          response.tableInputType = qrSettings.manualInputType;
        }

        res.json(response);
      } catch (error) {
        console.error("QR token resolution error:", error);
        res.status(500).json({ error: "Failed to resolve QR code" });
      }
    }
  );

  // ============================================================================
  // Get tables list for MANUAL mode (dropdown selection)
  // ============================================================================
  app.get(
    "/api/order/:token/tables",
    publicRateLimiter,
    async (req, res) => {
      try {
        const { token } = req.params;

        // Validate token first
        const [qrToken] = await db
          .select({ restaurantId: qrTokens.restaurantId, isActive: qrTokens.isActive })
          .from(qrTokens)
          .where(eq(qrTokens.token, token));

        if (!qrToken || !qrToken.isActive) {
          return res.status(404).json({ error: "Invalid or inactive QR code" });
        }

        // Get QR ordering settings
        const qrSettings = await getQrOrderingSettings(qrToken.restaurantId);

        // Only return tables if manual mode with dropdown
        if (qrSettings.mode !== "manual") {
          return res.status(400).json({
            error: "Table selection not required in auto mode"
          });
        }

        // Get active tables
        const rawTables = await db
          .select({
            id: diningTables.id,
            number: diningTables.number,
            name: diningTables.name,
            capacity: diningTables.capacity,
          })
          .from(diningTables)
          .where(and(
            eq(diningTables.restaurantId, qrToken.restaurantId),
            eq(diningTables.isActive, true)
          ))
          .orderBy(diningTables.number);

        // Transform to include label
        const tables = rawTables.map(t => ({
          ...t,
          label: t.name || `Table ${t.number}`,
        }));

        res.json({
          tables,
          inputType: qrSettings.manualInputType,
        });
      } catch (error) {
        console.error("Get tables error:", error);
        res.status(500).json({ error: "Failed to get tables" });
      }
    }
  );

  // ============================================================================
  // Public menu endpoint - Get restaurant menu for ordering
  // ============================================================================
  app.get(
    "/api/order/:token/menu",
    publicRateLimiter,
    async (req, res) => {
      try {
        const { token } = req.params;

        // Validate token
        const [qrToken] = await db
          .select({ restaurantId: qrTokens.restaurantId, isActive: qrTokens.isActive })
          .from(qrTokens)
          .where(eq(qrTokens.token, token));

        if (!qrToken || !qrToken.isActive) {
          return res.status(404).json({ error: "Invalid or inactive QR code" });
        }

        const restaurantId = qrToken.restaurantId;

        // Get restaurant timezone for proper time comparisons
        const [restaurant] = await db
          .select({ timezone: restaurants.timezone })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId));

        const restaurantTimezone = restaurant?.timezone || 'America/New_York';

        // Get active menus with their categories and items
        const activeMenus = await db
          .select()
          .from(menus)
          .where(and(
            eq(menus.restaurantId, restaurantId),
            eq(menus.isActive, true)
          ))
          .orderBy(menus.sortOrder);

        // Build full menu structure
        const menuData = [];

        for (const menu of activeMenus) {
          // Check time availability if specified (using restaurant's timezone)
          if (menu.availableFrom && menu.availableTo) {
            const now = new Date();
            // Convert to restaurant's local time using Intl.DateTimeFormat
            const localTime = new Intl.DateTimeFormat('en-US', {
              timeZone: restaurantTimezone,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }).format(now);
            // localTime format is "HH:MM"
            if (localTime < menu.availableFrom || localTime > menu.availableTo) {
              continue; // Skip this menu if outside availability window
            }
          }

          // Get categories for this menu
          const menuCategories = await db
            .select()
            .from(categories)
            .where(and(
              eq(categories.menuId, menu.id),
              eq(categories.isActive, true)
            ))
            .orderBy(categories.sortOrder);

          const categoriesWithItems = [];

          for (const category of menuCategories) {
            // Get items for this category
            const items = await db
              .select({
                id: menuItems.id,
                name: menuItems.name,
                description: menuItems.description,
                price: menuItems.price,
                imageUrl: menuItems.imageUrl,
                allergens: menuItems.allergens,
                tags: menuItems.tags,
                preparationTime: menuItems.preparationTime,
                isPopular: menuItems.isPopular,
                isNew: menuItems.isNew,
              })
              .from(menuItems)
              .where(and(
                eq(menuItems.categoryId, category.id),
                eq(menuItems.isAvailable, true)
              ))
              .orderBy(menuItems.sortOrder);

            // Get modifier groups for each item
            const itemsWithModifiers = [];
            for (const item of items) {
              const itemModifierGroups = await db
                .select({
                  groupId: modifierGroups.id,
                  groupName: modifierGroups.name,
                  minSelections: modifierGroups.minSelections,
                  maxSelections: modifierGroups.maxSelections,
                  isRequired: modifierGroups.isRequired,
                })
                .from(menuItemModifierGroups)
                .innerJoin(modifierGroups, eq(menuItemModifierGroups.modifierGroupId, modifierGroups.id))
                .where(eq(menuItemModifierGroups.menuItemId, item.id));

              const modifierGroupsWithOptions = [];
              for (const group of itemModifierGroups) {
                const options = await db
                  .select({
                    id: modifiers.id,
                    name: modifiers.name,
                    price: modifiers.price,
                    isDefault: modifiers.isDefault,
                    isAvailable: modifiers.isAvailable,
                  })
                  .from(modifiers)
                  .where(and(
                    eq(modifiers.modifierGroupId, group.groupId),
                    eq(modifiers.isAvailable, true)
                  ))
                  .orderBy(modifiers.sortOrder);

                modifierGroupsWithOptions.push({
                  id: group.groupId,
                  name: group.groupName,
                  minSelections: group.minSelections,
                  maxSelections: group.maxSelections,
                  isRequired: group.isRequired,
                  modifiers: options,
                });
              }

              itemsWithModifiers.push({
                ...item,
                modifierGroups: modifierGroupsWithOptions,
              });
            }

            if (itemsWithModifiers.length > 0) {
              categoriesWithItems.push({
                id: category.id,
                name: category.name,
                description: category.description,
                imageUrl: category.imageUrl,
                items: itemsWithModifiers,
              });
            }
          }

          if (categoriesWithItems.length > 0) {
            menuData.push({
              id: menu.id,
              name: menu.name,
              description: menu.description,
              categories: categoriesWithItems,
            });
          }
        }

        res.json({ menus: menuData });
      } catch (error) {
        console.error("Get public menu error:", error);
        res.status(500).json({ error: "Failed to get menu" });
      }
    }
  );

  // ============================================================================
  // Create Order - Cart submission
  // ============================================================================
  const createOrderSchema = z.object({
    qrTokenId: z.string().min(1),
    tableId: z.string().optional(),
    tableLabel: z.string().optional(),
 customerName: z.string().min(1, "Customer name is required"),
    customerPhone: z.string().optional(),
    customerEmail: z.string().email().optional().or(z.literal("")),
    guestCount: z.number().int().min(1).default(1),
    notes: z.string().optional(),
    paymentMethod: z.string().optional(),
    items: z.array(z.object({
      menuItemId: z.string(),
      name: z.string(),
      quantity: z.number().int().min(1),
      unitPrice: z.string(),
      modifiers: z.array(z.object({
        id: z.string(),
        name: z.string(),
        price: z.string(),
      })).optional().default([]),
      notes: z.string().optional(),
    })).min(1),
  });

  app.post(
    "/api/order",
    orderCreationRateLimiter,
    async (req, res) => {
      try {
        const validation = createOrderSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Invalid order data",
            details: validation.error.flatten().fieldErrors
          });
        }

        const orderData = validation.data;

        // Validate QR token
        const [qrToken] = await db
          .select()
          .from(qrTokens)
          .where(eq(qrTokens.id, orderData.qrTokenId));

        if (!qrToken || !qrToken.isActive) {
          return res.status(400).json({ error: "Invalid or inactive QR code" });
        }

        if (qrToken.expiresAt && new Date(qrToken.expiresAt) < new Date()) {
          return res.status(400).json({ error: "QR code has expired" });
        }

        const restaurantId = qrToken.restaurantId;

        // Check if restaurant is active
        const [restaurant] = await db
          .select({ id: restaurants.id, taxRate: restaurants.taxRate, suspendedAt: restaurants.suspendedAt })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId));

        if (!restaurant || restaurant.suspendedAt) {
          return res.status(400).json({ error: "Restaurant is not accepting orders" });
        }

        // Check QR feature and settings
        const hasQrFeature = await checkFeature(restaurantId, "qr_ordering");
        if (!hasQrFeature) {
          return res.status(400).json({ error: "QR ordering is not available" });
        }

        const qrSettings = await getQrOrderingSettings(restaurantId);
        if (!qrSettings.enabled) {
          return res.status(400).json({ error: "QR ordering is currently disabled" });
        }

        // Determine table context
        let finalTableId: string | null = null;
        let finalTableLabel: string | null = null;

        if (qrSettings.mode === "auto") {
          // AUTO mode - table comes from QR token
          if (qrToken.tableId) {
            finalTableId = qrToken.tableId;
            // Get table name for display
            const [table] = await db
              .select({ name: diningTables.name, number: diningTables.number })
              .from(diningTables)
              .where(eq(diningTables.id, qrToken.tableId));
            finalTableLabel = table?.name || `Table ${table?.number}`;
          }
        } else {
          // MANUAL mode
          if (qrSettings.manualInputType === "dropdown") {
            // Validate tableId from dropdown
            if (!orderData.tableId) {
              return res.status(400).json({ error: "Please select a table" });
            }
            // Verify table exists and belongs to restaurant
            const [table] = await db
              .select()
              .from(diningTables)
              .where(and(
                eq(diningTables.id, orderData.tableId),
                eq(diningTables.restaurantId, restaurantId),
                eq(diningTables.isActive, true)
              ));
            if (!table) {
              return res.status(400).json({ error: "Invalid table selection" });
            }
            finalTableId = table.id;
            finalTableLabel = table.name || `Table ${table.number}`;
          } else {
            // TEXT input - just use the label
            if (!orderData.tableLabel) {
              return res.status(400).json({ error: "Please enter your table number" });
            }
            finalTableLabel = orderData.tableLabel;
            // Try to match to existing table by name or number (as text)
            const [matchedTable] = await db
              .select()
              .from(diningTables)
              .where(and(
                eq(diningTables.restaurantId, restaurantId),
                eq(diningTables.isActive, true),
                or(
                  eq(diningTables.name, orderData.tableLabel),
                  eq(diningTables.number, orderData.tableLabel)
                )
              ));
            if (matchedTable) {
              finalTableId = matchedTable.id;
            }
          }
        }

        // Calculate totals
        let subtotal = 0;
        const processedItems = [];

        for (const item of orderData.items) {
          const unitPrice = parseFloat(item.unitPrice);
          const modifiersTotal = item.modifiers.reduce(
            (sum, mod) => sum + parseFloat(mod.price),
            0
          );
          const itemTotal = (unitPrice + modifiersTotal) * item.quantity;
          subtotal += itemTotal;

          processedItems.push({
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            modifiersPrice: modifiersTotal.toFixed(2),
            totalPrice: itemTotal.toFixed(2),
            modifiers: item.modifiers,
            notes: item.notes,
            status: "pending",
          });
        }

        const taxRate = parseFloat(restaurant.taxRate || "0") / 100;
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;

        // Generate order identifiers
        const orderNumber = generateOrderNumber();
        const displayNumber = await generateDisplayNumber(restaurantId);

        // Validate QR payment requirement: if online payment methods are enabled, payment is required
        const qrPayMethods = await resolvePaymentMethods(restaurantId);
        const hasOnlinePayment = qrPayMethods.card || qrPayMethods.stripe || qrPayMethods.paypal;
        
        if (hasOnlinePayment && !orderData.paymentMethod) {
          return res.status(400).json({ error: "Online payment is required to place this order" });
        }

        // Validate the payment method is actually enabled for this restaurant
        if (orderData.paymentMethod) {
          const methodMap: Record<string, boolean> = {
            card: qrPayMethods.card || qrPayMethods.stripe,
            stripe: qrPayMethods.stripe,
            paypal: qrPayMethods.paypal,
          };
          if (!methodMap[orderData.paymentMethod]) {
            return res.status(400).json({ error: `Payment method '${orderData.paymentMethod}' is not available for this restaurant` });
          }
        }

        const hasPayment = !!orderData.paymentMethod;
        const initialStatus = hasPayment ? "confirmed" : "pending";

        const [order] = await db
          .insert(orders)
          .values({
            restaurantId,
            tableId: finalTableId,
            qrTokenId: qrToken.id,
            orderNumber,
            displayNumber,
            status: initialStatus,
            orderType: "dine_in",
            source: "qr",
            subtotal: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
            paidAmount: hasPayment ? total.toFixed(2) : "0",
            customerName: orderData.customerName,
            customerPhone: orderData.customerPhone,
            customerEmail: orderData.customerEmail || null,
            guestCount: orderData.guestCount,
            notes: orderData.notes ? `${orderData.notes}${finalTableLabel && !finalTableId ? ` | Table: ${finalTableLabel}` : ''}` : (finalTableLabel && !finalTableId ? `Table: ${finalTableLabel}` : null),
          })
          .returning();

        // Create order items
        for (const item of processedItems) {
          await db
            .insert(orderItems)
            .values({
              orderId: order.id,
              ...item,
            });
        }

        // Create status history
        await db
          .insert(orderStatusHistory)
          .values({
            orderId: order.id,
            fromStatus: null,
            toStatus: "pending",
            notes: "Order placed via QR code",
          });

        if (hasPayment) {
          await db
            .insert(orderStatusHistory)
            .values({
              orderId: order.id,
              fromStatus: "pending",
              toStatus: "confirmed",
              notes: `Auto-confirmed after ${orderData.paymentMethod} payment`,
            });

          await db
            .insert(payments)
            .values({
              orderId: order.id,
              restaurantId,
              amount: total.toFixed(2),
              method: orderData.paymentMethod!,
              status: "completed",
              processedAt: new Date(),
            });
        }

        // Update table status to occupied if a table was assigned
        if (finalTableId) {
          await db
            .update(diningTables)
            .set({ status: "occupied", updatedAt: new Date() })
            .where(eq(diningTables.id, finalTableId));
        }

        // Emit socket event for real-time updates
        const io = req.app.get("io") as SocketIOServer;
        io.to(getTenantRoom(restaurantId)).emit("order:created", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          displayNumber: order.displayNumber,
          tableLabel: finalTableLabel,
          source: "qr",
        });
        io.to(getKitchenRoom(restaurantId)).emit("order:new", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          displayNumber: order.displayNumber,
          tableLabel: finalTableLabel,
          itemCount: processedItems.length,
        });

        // Generate customer tracking token for real-time updates
        const trackingToken = generateCustomerTrackingToken(
          order.id,
          restaurantId,
          finalTableId || undefined
        );

        res.status(201).json({
          orderId: order.id,
          orderNumber: order.orderNumber,
          displayNumber: order.displayNumber,
          status: order.status,
          table: finalTableLabel,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          total: order.total,
          itemCount: processedItems.length,
          trackingToken,
          message: "Order placed successfully!",
        });
      } catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ error: "Failed to create order" });
      }
    }
  );

  // ============================================================================
  // Get Order Status - For customer tracking
  // ============================================================================
  app.get(
    "/api/order/:orderId/status",
    publicRateLimiter,
    async (req, res) => {
      try {
        const { orderId } = req.params;

        // Get order
        const [order] = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            total: orders.total,
            tableId: orders.tableId,
            estimatedReadyAt: orders.estimatedReadyAt,
            createdAt: orders.createdAt,
            source: orders.source,
          })
          .from(orders)
          .where(eq(orders.id, orderId));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        // Only allow checking QR-sourced orders via this public endpoint
        if (order.source !== "qr") {
          return res.status(403).json({ error: "Access denied" });
        }

        // Get table info
        let tableLabel = null;
        if (order.tableId) {
          const [table] = await db
            .select({ number: diningTables.number, name: diningTables.name })
            .from(diningTables)
            .where(eq(diningTables.id, order.tableId));
          tableLabel = table?.name || `Table ${table?.number}`;
        }

        // Get order items
        const items = await db
          .select({
            id: orderItems.id,
            name: orderItems.name,
            quantity: orderItems.quantity,
            totalPrice: orderItems.totalPrice,
            status: orderItems.status,
            modifiers: orderItems.modifiers,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));

        // Get status history
        const history = await db
          .select({
            fromStatus: orderStatusHistory.fromStatus,
            toStatus: orderStatusHistory.toStatus,
            notes: orderStatusHistory.notes,
            createdAt: orderStatusHistory.createdAt,
          })
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, orderId))
          .orderBy(desc(orderStatusHistory.createdAt));

        res.json({
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            displayNumber: order.displayNumber,
            status: order.status,
            table: tableLabel,
            total: order.total,
            estimatedReadyAt: order.estimatedReadyAt,
            createdAt: order.createdAt,
          },
          items,
          statusHistory: history,
        });
      } catch (error) {
        console.error("Get order status error:", error);
        res.status(500).json({ error: "Failed to get order status" });
      }
    }
  );

  // ============================================================================
  // POS ORDER MANAGEMENT (Staff) - Phase 7
  // ============================================================================

  // Helper function to record status change in history (POS)
  async function recordOrderStatusChange(
    orderId: string,
    userId: string | null,
    fromStatus: string | null,
    toStatus: string,
    notes?: string
  ) {
    await db.insert(orderStatusHistory).values({
      orderId,
      userId,
      fromStatus,
      toStatus,
      notes,
    });
  }

  // Helper function to generate POS order number
  async function generatePosOrderNumber(restaurantId: string): Promise<{ orderNumber: string; displayNumber: number }> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get today's order count for display number
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gt(orders.createdAt, startOfDay)
      ));

    const displayNumber = (countResult?.count || 0) + 1;
    const orderNumber = `POS-${dateStr}-${displayNumber.toString().padStart(4, '0')}`;

    return { orderNumber, displayNumber };
  }

  // Get all orders for a restaurant (with filters)
  app.get(
    "/api/restaurants/:restaurantId/orders",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { status, tableId, date, source } = req.query;

        let query = db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            orderType: orders.orderType,
            source: orders.source,
            tableId: orders.tableId,
            tableName: diningTables.name,
            tableNumber: diningTables.number,
            serverId: orders.serverId,
            subtotal: orders.subtotal,
            taxAmount: orders.taxAmount,
            total: orders.total,
            paidAmount: orders.paidAmount,
            customerName: orders.customerName,
            guestCount: orders.guestCount,
            notes: orders.notes,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
          })
          .from(orders)
          .leftJoin(diningTables, eq(orders.tableId, diningTables.id))
          .where(eq(orders.restaurantId, restaurantId))
          .orderBy(desc(orders.createdAt))
          .$dynamic();

        // Apply filters
        const conditions = [eq(orders.restaurantId, restaurantId)];

        if (status && typeof status === 'string') {
          conditions.push(eq(orders.status, status));
        }
        if (tableId && typeof tableId === 'string') {
          conditions.push(eq(orders.tableId, tableId));
        }
        if (source && typeof source === 'string') {
          conditions.push(eq(orders.source, source));
        }
        if (date && typeof date === 'string') {
          const startOfDay = new Date(date);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(gt(orders.createdAt, startOfDay));
        }

        const result = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            orderType: orders.orderType,
            source: orders.source,
            tableId: orders.tableId,
            tableName: diningTables.name,
            tableNumber: diningTables.number,
            serverId: orders.serverId,
            subtotal: orders.subtotal,
            taxAmount: orders.taxAmount,
            total: orders.total,
            paidAmount: orders.paidAmount,
            customerName: orders.customerName,
            guestCount: orders.guestCount,
            notes: orders.notes,
            completedAt: orders.completedAt,
            cancelledAt: orders.cancelledAt,
            cancelReason: orders.cancelReason,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
          })
          .from(orders)
          .leftJoin(diningTables, eq(orders.tableId, diningTables.id))
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt));

        res.json({ orders: result });
      } catch (error) {
        console.error("Get orders error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    }
  );

  // Get live orders (active orders not completed/cancelled)
  app.get(
    "/api/restaurants/:restaurantId/orders/live",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const liveOrders = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            orderType: orders.orderType,
            source: orders.source,
            tableId: orders.tableId,
            tableName: diningTables.name,
            tableNumber: diningTables.number,
            serverId: orders.serverId,
            subtotal: orders.subtotal,
            taxAmount: orders.taxAmount,
            total: orders.total,
            paidAmount: orders.paidAmount,
            customerName: orders.customerName,
            guestCount: orders.guestCount,
            notes: orders.notes,
            estimatedReadyAt: orders.estimatedReadyAt,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .leftJoin(diningTables, eq(orders.tableId, diningTables.id))
          .where(and(
            eq(orders.restaurantId, restaurantId),
            sql`${orders.status} NOT IN ('completed', 'cancelled')`
          ))
          .orderBy(orders.createdAt);

        const ordersWithItems = await Promise.all(
          liveOrders.map(async (order) => {
            const items = await db
              .select({
                id: orderItems.id,
                name: orderItems.name,
                quantity: orderItems.quantity,
                unitPrice: orderItems.unitPrice,
                modifiersPrice: orderItems.modifiersPrice,
                totalPrice: orderItems.totalPrice,
                modifiers: orderItems.modifiers,
                notes: orderItems.notes,
                status: orderItems.status,
              })
              .from(orderItems)
              .where(eq(orderItems.orderId, order.id));
            return { ...order, items };
          })
        );

        res.json({ orders: ordersWithItems });
      } catch (error) {
        console.error("Get live orders error:", error);
        res.status(500).json({ error: "Failed to fetch live orders" });
      }
    }
  );

  // Get orders by table
  app.get(
    "/api/restaurants/:restaurantId/tables/:tableId/orders",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId, tableId } = req.params;
        const { activeOnly } = req.query;

        const conditions = [
          eq(orders.restaurantId, restaurantId),
          eq(orders.tableId, tableId),
        ];

        if (activeOnly === 'true') {
          conditions.push(sql`${orders.status} NOT IN ('completed', 'cancelled')`);
        }

        const tableOrders = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            orderType: orders.orderType,
            source: orders.source,
            subtotal: orders.subtotal,
            taxAmount: orders.taxAmount,
            total: orders.total,
            paidAmount: orders.paidAmount,
            customerName: orders.customerName,
            guestCount: orders.guestCount,
            notes: orders.notes,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt));

        res.json({ orders: tableOrders });
      } catch (error) {
        console.error("Get table orders error:", error);
        res.status(500).json({ error: "Failed to fetch table orders" });
      }
    }
  );

  // Get single order with items
  app.get(
    "/api/restaurants/:restaurantId/orders/:orderId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;

        const [order] = await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            displayNumber: orders.displayNumber,
            status: orders.status,
            orderType: orders.orderType,
            source: orders.source,
            tableId: orders.tableId,
            tableName: diningTables.name,
            tableNumber: diningTables.number,
            serverId: orders.serverId,
            subtotal: orders.subtotal,
            taxAmount: orders.taxAmount,
            tipAmount: orders.tipAmount,
            discountAmount: orders.discountAmount,
            total: orders.total,
            paidAmount: orders.paidAmount,
            customerName: orders.customerName,
            customerPhone: orders.customerPhone,
            customerEmail: orders.customerEmail,
            guestCount: orders.guestCount,
            notes: orders.notes,
            estimatedReadyAt: orders.estimatedReadyAt,
            completedAt: orders.completedAt,
            cancelledAt: orders.cancelledAt,
            cancelReason: orders.cancelReason,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
          })
          .from(orders)
          .leftJoin(diningTables, eq(orders.tableId, diningTables.id))
          .where(and(
            eq(orders.id, orderId),
            eq(orders.restaurantId, restaurantId)
          ));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        // Get order items
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId))
          .orderBy(orderItems.createdAt);

        // Get status history
        const history = await db
          .select({
            id: orderStatusHistory.id,
            fromStatus: orderStatusHistory.fromStatus,
            toStatus: orderStatusHistory.toStatus,
            notes: orderStatusHistory.notes,
            userId: orderStatusHistory.userId,
            createdAt: orderStatusHistory.createdAt,
          })
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, orderId))
          .orderBy(desc(orderStatusHistory.createdAt));

        res.json({ order, items, statusHistory: history });
      } catch (error) {
        console.error("Get order error:", error);
        res.status(500).json({ error: "Failed to fetch order" });
      }
    }
  );

  // Bulk delete orders (completed/cancelled only)
  app.delete(
    "/api/restaurants/:restaurantId/orders/bulk",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { orderIds } = req.body;

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
          return res.status(400).json({ error: "orderIds array is required" });
        }

        const targetOrders = await db
          .select({ id: orders.id, status: orders.status })
          .from(orders)
          .where(and(
            eq(orders.restaurantId, restaurantId),
            inArray(orders.id, orderIds)
          ));

        const nonDeletable = targetOrders.filter(o => !['completed', 'cancelled'].includes(o.status || ''));
        if (nonDeletable.length > 0) {
          return res.status(400).json({ error: "Can only delete completed or cancelled orders" });
        }

        const validIds = targetOrders.map(o => o.id);
        if (validIds.length === 0) {
          return res.status(404).json({ error: "No matching orders found" });
        }

        const deletedOrders = await db
          .select({ tableId: orders.tableId })
          .from(orders)
          .where(inArray(orders.id, validIds));

        const tableIds = Array.from(new Set(deletedOrders.map(o => o.tableId).filter(Boolean))) as string[];

        await db.delete(orders).where(inArray(orders.id, validIds));

        for (const tableId of tableIds) {
          const remainingActive = await db
            .select({ id: orders.id })
            .from(orders)
            .where(and(
              eq(orders.tableId, tableId),
              notInArray(orders.status, ['completed', 'cancelled'])
            ));
          if (remainingActive.length === 0) {
            await db.update(diningTables).set({ status: "available" }).where(eq(diningTables.id, tableId));
          }
        }

        res.json({ message: `${validIds.length} order(s) deleted`, deletedCount: validIds.length });
      } catch (error) {
        console.error("Bulk delete orders error:", error);
        res.status(500).json({ error: "Failed to delete orders" });
      }
    }
  );

  // Create POS order
  app.post(
    "/api/restaurants/:restaurantId/orders",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const userId = req.user!.userId;
        const {
          tableId,
          orderType = "dine_in",
          customerName,
          customerPhone,
          customerEmail,
          guestCount = 1,
          notes,
          items = [],
        } = req.body;

        // Validate table if provided
        if (tableId) {
          const [table] = await db
            .select({ id: diningTables.id })
            .from(diningTables)
            .where(and(
              eq(diningTables.id, tableId),
              eq(diningTables.restaurantId, restaurantId)
            ));
          if (!table) {
            return res.status(400).json({ error: "Invalid table" });
          }
        }

        // Generate order number
        const { orderNumber, displayNumber } = await generatePosOrderNumber(restaurantId);

        // Get restaurant tax rate
        const [restaurant] = await db
          .select({ taxRate: restaurants.taxRate })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId));
        const taxRate = parseFloat(restaurant?.taxRate || "0");

        // Calculate totals from items
        let subtotal = 0;
        const orderItemsData: any[] = [];

        for (const item of items) {
          // Get menu item details
          const [menuItem] = await db
            .select({
              id: menuItems.id,
              name: menuItems.name,
              price: menuItems.price,
            })
            .from(menuItems)
            .where(eq(menuItems.id, item.menuItemId));

          if (!menuItem) {
            return res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
          }

          const unitPrice = parseFloat(menuItem.price);
          const quantity = item.quantity || 1;
          let modifiersPrice = 0;

          // Calculate modifiers price if provided
          if (item.modifiers && Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              modifiersPrice += parseFloat(mod.price || "0");
            }
          }

          const totalPrice = (unitPrice + modifiersPrice) * quantity;
          subtotal += totalPrice;

          orderItemsData.push({
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity,
            unitPrice: unitPrice.toFixed(2),
            modifiersPrice: modifiersPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            modifiers: item.modifiers || [],
            notes: item.notes,
            status: "pending",
          });
        }

        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        // Create order
        const [newOrder] = await db
          .insert(orders)
          .values({
            restaurantId,
            tableId: tableId || null,
            serverId: userId,
            orderNumber,
            displayNumber,
            status: "pending",
            orderType,
            source: "pos",
            subtotal: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: total.toFixed(2),
            customerName,
            customerPhone,
            customerEmail,
            guestCount,
            notes,
          })
          .returning();

        // Create order items
        if (orderItemsData.length > 0) {
          await db.insert(orderItems).values(
            orderItemsData.map(item => ({
              ...item,
              orderId: newOrder.id,
              customerName,
            }))
          );
        }

        // Record status history
        await recordOrderStatusChange(newOrder.id, userId, null, "pending", "Order created via POS");

        // Emit socket event
        const io = app.get("io") as SocketIOServer;
        io.to(getTenantRoom(restaurantId)).emit("order:created", {
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          displayNumber: newOrder.displayNumber,
          source: "pos",
          tableId,
        });
        io.to(getKitchenRoom(restaurantId)).emit("order:new", {
          orderId: newOrder.id,
          displayNumber: newOrder.displayNumber,
        });

        // Update table status if assigned
        if (tableId) {
          await db
            .update(diningTables)
            .set({ status: "occupied", updatedAt: new Date() })
            .where(eq(diningTables.id, tableId));
        }

        res.status(201).json({
          message: "Order created",
          order: newOrder,
        });
      } catch (error) {
        console.error("Create POS order error:", error);
        res.status(500).json({ error: "Failed to create order" });
      }
    }
  );

  // Get order items
  app.get(
    "/api/restaurants/:restaurantId/orders/:orderId/items",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const [order] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }
        const items = await db
          .select({
            id: orderItems.id,
            name: orderItems.name,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            totalPrice: orderItems.totalPrice,
            status: orderItems.status,
            modifiers: orderItems.modifiers,
            modifiersPrice: orderItems.modifiersPrice,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderId));
        res.json(items);
      } catch (error) {
        console.error("Get order items error:", error);
        res.status(500).json({ error: "Failed to get order items" });
      }
    }
  );

  // Add items to order
  app.post(
    "/api/restaurants/:restaurantId/orders/:orderId/items",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Items array is required" });
        }

        // Verify order exists and belongs to restaurant
        const [order] = await db
          .select({ id: orders.id, status: orders.status, subtotal: orders.subtotal, taxAmount: orders.taxAmount, total: orders.total })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (['completed', 'cancelled'].includes(order.status || '')) {
          return res.status(400).json({ error: "Cannot modify completed or cancelled order" });
        }

        // Get restaurant tax rate
        const [restaurant] = await db
          .select({ taxRate: restaurants.taxRate })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId));
        const taxRate = parseFloat(restaurant?.taxRate || "0");

        let addedSubtotal = 0;
        const newItems: any[] = [];

        for (const item of items) {
          const [menuItem] = await db
            .select({ id: menuItems.id, name: menuItems.name, price: menuItems.price })
            .from(menuItems)
            .where(eq(menuItems.id, item.menuItemId));

          if (!menuItem) {
            return res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
          }

          const unitPrice = parseFloat(menuItem.price);
          const quantity = item.quantity || 1;
          let modifiersPrice = 0;

          if (item.modifiers && Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              modifiersPrice += parseFloat(mod.price || "0");
            }
          }

          const totalPrice = (unitPrice + modifiersPrice) * quantity;
          addedSubtotal += totalPrice;

          newItems.push({
            orderId,
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity,
            unitPrice: unitPrice.toFixed(2),
            modifiersPrice: modifiersPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            modifiers: item.modifiers || [],
            notes: item.notes,
            status: "pending",
          });
        }

        // Insert new items
        const insertedItems = await db.insert(orderItems).values(newItems).returning();

        // Update order totals
        const newSubtotal = parseFloat(order.subtotal || "0") + addedSubtotal;
        const newTaxAmount = newSubtotal * (taxRate / 100);
        const newTotal = newSubtotal + newTaxAmount;

        await db.update(orders).set({
          subtotal: newSubtotal.toFixed(2),
          taxAmount: newTaxAmount.toFixed(2),
          total: newTotal.toFixed(2),
          updatedAt: new Date(),
        }).where(eq(orders.id, orderId));

        // Emit socket event
        const io = app.get("io") as SocketIOServer;
        io.to(getKitchenRoom(restaurantId)).emit("order:items-added", {
          orderId,
          items: insertedItems,
        });
        io.to(getOrderRoom(orderId)).emit("order:items-added", {
          orderId,
          items: insertedItems,
        });

        res.status(201).json({ message: "Items added", items: insertedItems });
      } catch (error) {
        console.error("Add order items error:", error);
        res.status(500).json({ error: "Failed to add items" });
      }
    }
  );

  // Update order item
  app.patch(
    "/api/restaurants/:restaurantId/orders/:orderId/items/:itemId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, orderId, itemId } = req.params;
        const { quantity, notes, status } = req.body;

        // Verify order exists
        const [order] = await db
          .select({ id: orders.id, status: orders.status })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (['completed', 'cancelled'].includes(order.status || '')) {
          return res.status(400).json({ error: "Cannot modify completed or cancelled order" });
        }

        // Get the item
        const [item] = await db
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));

        if (!item) {
          return res.status(404).json({ error: "Item not found" });
        }

        const updates: any = { updatedAt: new Date() };

        if (quantity !== undefined) {
          updates.quantity = quantity;
          const unitPrice = parseFloat(item.unitPrice);
          const modifiersPrice = parseFloat(item.modifiersPrice || "0");
          updates.totalPrice = ((unitPrice + modifiersPrice) * quantity).toFixed(2);
        }
        if (notes !== undefined) updates.notes = notes;
        if (status !== undefined) {
          updates.status = status;
          if (status === 'preparing') updates.sentToKitchenAt = new Date();
          if (status === 'ready') updates.preparedAt = new Date();
          if (status === 'served') updates.servedAt = new Date();
        }

        const [updatedItem] = await db
          .update(orderItems)
          .set(updates)
          .where(eq(orderItems.id, itemId))
          .returning();

        // Recalculate order totals if quantity changed
        if (quantity !== undefined) {
          const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
          const newSubtotal = allItems.reduce((sum, i) => sum + parseFloat(i.totalPrice), 0);

          const [restaurant] = await db.select({ taxRate: restaurants.taxRate }).from(restaurants).where(eq(restaurants.id, restaurantId));
          const taxRate = parseFloat(restaurant?.taxRate || "0");
          const newTaxAmount = newSubtotal * (taxRate / 100);
          const newTotal = newSubtotal + newTaxAmount;

          await db.update(orders).set({
            subtotal: newSubtotal.toFixed(2),
            taxAmount: newTaxAmount.toFixed(2),
            total: newTotal.toFixed(2),
            updatedAt: new Date(),
          }).where(eq(orders.id, orderId));
        }

        res.json({ message: "Item updated", item: updatedItem });
      } catch (error) {
        console.error("Update order item error:", error);
        res.status(500).json({ error: "Failed to update item" });
      }
    }
  );

  // Remove item from order
  app.delete(
    "/api/restaurants/:restaurantId/orders/:orderId/items/:itemId",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, orderId, itemId } = req.params;

        // Verify order exists
        const [order] = await db
          .select({ id: orders.id, status: orders.status })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (['completed', 'cancelled'].includes(order.status || '')) {
          return res.status(400).json({ error: "Cannot modify completed or cancelled order" });
        }

        // Delete the item
        const [deletedItem] = await db
          .delete(orderItems)
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
          .returning();

        if (!deletedItem) {
          return res.status(404).json({ error: "Item not found" });
        }

        // Recalculate order totals
        const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const newSubtotal = allItems.reduce((sum, i) => sum + parseFloat(i.totalPrice), 0);

        const [restaurant] = await db.select({ taxRate: restaurants.taxRate }).from(restaurants).where(eq(restaurants.id, restaurantId));
        const taxRate = parseFloat(restaurant?.taxRate || "0");
        const newTaxAmount = newSubtotal * (taxRate / 100);
        const newTotal = newSubtotal + newTaxAmount;

        await db.update(orders).set({
          subtotal: newSubtotal.toFixed(2),
          taxAmount: newTaxAmount.toFixed(2),
          total: newTotal.toFixed(2),
          updatedAt: new Date(),
        }).where(eq(orders.id, orderId));

        // Emit socket event
        const io = app.get("io") as SocketIOServer;
        io.to(getKitchenRoom(restaurantId)).emit("order:item-removed", {
          orderId,
          itemId,
        });
        io.to(getOrderRoom(orderId)).emit("order:item-removed", {
          orderId,
          itemId,
        });

        res.json({ message: "Item removed" });
      } catch (error) {
        console.error("Remove order item error:", error);
        res.status(500).json({ error: "Failed to remove item" });
      }
    }
  );

  // Update order status
  app.patch(
    "/api/restaurants/:restaurantId/orders/:orderId/status",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const userId = req.user!.userId;
        const { status, notes } = req.body;

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }

        const [order] = await db
          .select({ id: orders.id, status: orders.status, tableId: orders.tableId })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        const fromStatus = order.status;

        // Prevent status changes on completed/cancelled orders
        if (['completed', 'cancelled'].includes(fromStatus || '') && status !== fromStatus) {
          return res.status(400).json({ error: "Cannot change status of completed or cancelled order" });
        }

        // Prevent confirming an order without payment
        if (status === 'confirmed' && fromStatus === 'pending') {
          const [orderRow] = await db
            .select({ paidAmount: orders.paidAmount, total: orders.total })
            .from(orders)
            .where(eq(orders.id, orderId));
          const paid = parseFloat(orderRow?.paidAmount || "0");
          if (paid <= 0) {
            return res.status(400).json({ error: "Payment is required before confirming an order" });
          }
        }

        const updates: any = { status, updatedAt: new Date() };

        if (status === 'completed') {
          updates.completedAt = new Date();
          // Free up the table
          if (order.tableId) {
            await db.update(diningTables).set({ status: 'available', updatedAt: new Date() }).where(eq(diningTables.id, order.tableId));
          }
        }
        if (status === 'cancelled') {
          updates.cancelledAt = new Date();
          updates.cancelReason = notes || null;
          // Free up the table
          if (order.tableId) {
            await db.update(diningTables).set({ status: 'available', updatedAt: new Date() }).where(eq(diningTables.id, order.tableId));
          }
        }

        const [updatedOrder] = await db.update(orders).set(updates).where(eq(orders.id, orderId)).returning();

        // Record status history
        await recordOrderStatusChange(orderId, userId, fromStatus, status, notes);

        // Emit socket event to staff and customer rooms
        const io = app.get("io") as SocketIOServer;
        const statusPayload = {
          orderId,
          fromStatus,
          toStatus: status,
          displayNumber: updatedOrder.displayNumber,
        };
        io.to(getTenantRoom(restaurantId)).emit("order:status-changed", statusPayload);
        io.to(getKitchenRoom(restaurantId)).emit("order:status-changed", statusPayload);
        io.to(getOrderRoom(orderId)).emit("order:status-changed", statusPayload);

        res.json({ message: "Status updated", order: updatedOrder });
      } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ error: "Failed to update status" });
      }
    }
  );

  // Move order to different table
  app.patch(
    "/api/restaurants/:restaurantId/orders/:orderId/table",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const { tableId } = req.body;

        if (!tableId) {
          return res.status(400).json({ error: "tableId is required" });
        }

        // Verify new table exists
        const [newTable] = await db
          .select({ id: diningTables.id, number: diningTables.number })
          .from(diningTables)
          .where(and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, restaurantId)));

        if (!newTable) {
          return res.status(404).json({ error: "Table not found" });
        }

        // Get current order
        const [order] = await db
          .select({ id: orders.id, tableId: orders.tableId, status: orders.status })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (['completed', 'cancelled'].includes(order.status || '')) {
          return res.status(400).json({ error: "Cannot move completed or cancelled order" });
        }

        const oldTableId = order.tableId;

        // Update order table
        await db.update(orders).set({ tableId, updatedAt: new Date() }).where(eq(orders.id, orderId));

        // Update table statuses
        if (oldTableId) {
          // Check if old table has other active orders
          const [otherOrders] = await db
            .select({ count: sql<number>`count(*)` })
            .from(orders)
            .where(and(
              eq(orders.tableId, oldTableId),
              sql`${orders.status} NOT IN ('completed', 'cancelled')`,
              sql`${orders.id} != ${orderId}`
            ));

          if (!otherOrders || otherOrders.count === 0) {
            await db.update(diningTables).set({ status: 'available', updatedAt: new Date() }).where(eq(diningTables.id, oldTableId));
          }
        }

        await db.update(diningTables).set({ status: 'occupied', updatedAt: new Date() }).where(eq(diningTables.id, tableId));

        res.json({ message: "Order moved to table", tableNumber: newTable.number });
      } catch (error) {
        console.error("Move order table error:", error);
        res.status(500).json({ error: "Failed to move order" });
      }
    }
  );

  // Merge orders (combine multiple orders into one)
  app.post(
    "/api/restaurants/:restaurantId/orders/merge",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { sourceOrderIds, targetOrderId } = req.body;

        if (!sourceOrderIds || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
          return res.status(400).json({ error: "sourceOrderIds array is required" });
        }
        if (!targetOrderId) {
          return res.status(400).json({ error: "targetOrderId is required" });
        }

        // Verify target order exists
        const [targetOrder] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.id, targetOrderId), eq(orders.restaurantId, restaurantId)));

        if (!targetOrder) {
          return res.status(404).json({ error: "Target order not found" });
        }

        if (['completed', 'cancelled'].includes(targetOrder.status || '')) {
          return res.status(400).json({ error: "Cannot merge into completed or cancelled order" });
        }

        // Get restaurant tax rate
        const [restaurant] = await db.select({ taxRate: restaurants.taxRate }).from(restaurants).where(eq(restaurants.id, restaurantId));
        const taxRate = parseFloat(restaurant?.taxRate || "0");

        let addedSubtotal = 0;

        for (const sourceOrderId of sourceOrderIds) {
          if (sourceOrderId === targetOrderId) continue;

          // Get source order
          const [sourceOrder] = await db
            .select()
            .from(orders)
            .where(and(eq(orders.id, sourceOrderId), eq(orders.restaurantId, restaurantId)));

          if (!sourceOrder || ['completed', 'cancelled'].includes(sourceOrder.status || '')) {
            continue;
          }

          // Move items to target order
          await db.update(orderItems).set({ orderId: targetOrderId, updatedAt: new Date() }).where(eq(orderItems.orderId, sourceOrderId));

          addedSubtotal += parseFloat(sourceOrder.subtotal || "0");

          // Cancel source order
          await db.update(orders).set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: `Merged into order ${targetOrder.orderNumber}`,
            updatedAt: new Date(),
          }).where(eq(orders.id, sourceOrderId));

          // Free up table if any
          if (sourceOrder.tableId && sourceOrder.tableId !== targetOrder.tableId) {
            const [otherOrders] = await db
              .select({ count: sql<number>`count(*)` })
              .from(orders)
              .where(and(
                eq(orders.tableId, sourceOrder.tableId),
                sql`${orders.status} NOT IN ('completed', 'cancelled')`
              ));

            if (!otherOrders || otherOrders.count === 0) {
              await db.update(diningTables).set({ status: 'available', updatedAt: new Date() }).where(eq(diningTables.id, sourceOrder.tableId));
            }
          }
        }

        // Update target order totals
        const newSubtotal = parseFloat(targetOrder.subtotal || "0") + addedSubtotal;
        const newTaxAmount = newSubtotal * (taxRate / 100);
        const newTotal = newSubtotal + newTaxAmount;

        await db.update(orders).set({
          subtotal: newSubtotal.toFixed(2),
          taxAmount: newTaxAmount.toFixed(2),
          total: newTotal.toFixed(2),
          updatedAt: new Date(),
        }).where(eq(orders.id, targetOrderId));

        res.json({ message: "Orders merged successfully" });
      } catch (error) {
        console.error("Merge orders error:", error);
        res.status(500).json({ error: "Failed to merge orders" });
      }
    }
  );

  // Record payment
  app.post(
    "/api/restaurants/:restaurantId/orders/:orderId/payments",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("payments:create"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const { amount, tipAmount = 0, method, transactionId, cardLastFour, cardBrand, autoConfirm } = req.body;

        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "Valid amount is required" });
        }
        if (!method) {
          return res.status(400).json({ error: "Payment method is required" });
        }

        const validMethods = ['cash', 'counter', 'card', 'mobile', 'gift_card', 'other'];
        if (!validMethods.includes(method)) {
          return res.status(400).json({ error: `Invalid method. Must be one of: ${validMethods.join(', ')}` });
        }

        const featureList = await db
          .select()
          .from(restaurantFeatureAllowlist)
          .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId));
        const featureFlags = featureList.reduce((acc, f) => ({
          ...acc,
          [f.featureKey]: f.isEnabled ?? false
        }), {} as Record<string, boolean>);

        const methodFeatureMap: Record<string, string> = {
          cash: 'counter_payments',
          counter: 'counter_payments',
          card: 'stripe_payments',
        };
        const requiredFeature = methodFeatureMap[method];
        if (requiredFeature && featureFlags[requiredFeature] === false) {
          return res.status(403).json({ error: `Payment method '${method}' is not enabled for this restaurant` });
        }

        // Verify order exists
        const [order] = await db
          .select({ id: orders.id, total: orders.total, paidAmount: orders.paidAmount, status: orders.status, tableId: orders.tableId })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        // Create payment record
        const [payment] = await db.insert(payments).values({
          orderId,
          restaurantId,
          amount: amount.toFixed(2),
          tipAmount: tipAmount.toFixed(2),
          method,
          status: 'completed',
          transactionId,
          cardLastFour,
          cardBrand,
          processedAt: new Date(),
        }).returning();

        // Update order paid amount
        const newPaidAmount = parseFloat(order.paidAmount || "0") + amount + tipAmount;
        const orderTotal = parseFloat(order.total || "0");

        const orderUpdates: any = {
          paidAmount: newPaidAmount.toFixed(2),
          tipAmount: sql`COALESCE(${orders.tipAmount}, 0) + ${tipAmount.toFixed(2)}::decimal`,
          updatedAt: new Date(),
        };

        // Auto-confirm if pending and autoConfirm requested, otherwise auto-complete if fully paid
        if (autoConfirm && order.status === 'pending' && newPaidAmount >= orderTotal) {
          orderUpdates.status = 'confirmed';
          // Record status history for auto-confirm
          await recordOrderStatusChange(orderId, req.user!.userId, 'pending', 'confirmed', 'Auto-confirmed after payment');
        } else if (newPaidAmount >= orderTotal) {
          orderUpdates.status = 'completed';
          orderUpdates.completedAt = new Date();
        }

        await db.update(orders).set(orderUpdates).where(eq(orders.id, orderId));

        // Free table if order completed
        if (newPaidAmount >= orderTotal && !autoConfirm && order.status !== 'completed' && order.tableId) {
          const otherActiveOrders = await db
            .select({ id: orders.id })
            .from(orders)
            .where(and(
              eq(orders.tableId, order.tableId),
              notInArray(orders.status, ['completed', 'cancelled']),
              sql`${orders.id} != ${orderId}`
            ))
            .limit(1);

          if (otherActiveOrders.length === 0) {
            await db.update(diningTables).set({ status: 'available', updatedAt: new Date() }).where(eq(diningTables.id, order.tableId));
          }
        }

        res.status(201).json({
          message: "Payment recorded",
          payment,
          isFullyPaid: newPaidAmount >= orderTotal,
        });
      } catch (error) {
        console.error("Record payment error:", error);
        res.status(500).json({ error: "Failed to record payment" });
      }
    }
  );

  // Get payments for order
  app.get(
    "/api/restaurants/:restaurantId/orders/:orderId/payments",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:read"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;

        // Verify order exists
        const [order] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        const orderPayments = await db
          .select()
          .from(payments)
          .where(eq(payments.orderId, orderId))
          .orderBy(desc(payments.createdAt));

        res.json({ payments: orderPayments });
      } catch (error) {
        console.error("Get payments error:", error);
        res.status(500).json({ error: "Failed to get payments" });
      }
    }
  );

  // ============================================================================
  // PHASE 8: PAYMENT METHODS (Stripe + PayPal + Pay at Counter)
  // ============================================================================

  const paymentProviders = await import("./payments/providers");

  // Get available payment providers (system-level)
  app.get("/api/payments/providers", async (req, res) => {
    const status = paymentProviders.getPaymentProviderStatus();
    res.json({
      providers: [
        { ...status.stripe, methods: ["card", "apple_pay", "google_pay"] },
        { ...status.paypal, methods: ["paypal"] },
        { ...status.counter, methods: ["cash", "counter"] },
      ],
    });
  });

  // Get available payment methods for a restaurant (master + restaurant + credentials)
  app.get(
    "/api/restaurants/:restaurantId/payment-methods",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const providerStatus = paymentProviders.getPaymentProviderStatus();

        // Get restaurant feature allowlist for payment methods
        const [stripeAllowed] = await db
          .select({ isEnabled: restaurantFeatureAllowlist.isEnabled })
          .from(restaurantFeatureAllowlist)
          .where(and(
            eq(restaurantFeatureAllowlist.restaurantId, restaurantId),
            eq(restaurantFeatureAllowlist.featureKey, "stripe_payments")
          ));

        const [paypalAllowed] = await db
          .select({ isEnabled: restaurantFeatureAllowlist.isEnabled })
          .from(restaurantFeatureAllowlist)
          .where(and(
            eq(restaurantFeatureAllowlist.restaurantId, restaurantId),
            eq(restaurantFeatureAllowlist.featureKey, "paypal_payments")
          ));

        const [counterAllowed] = await db
          .select({ isEnabled: restaurantFeatureAllowlist.isEnabled })
          .from(restaurantFeatureAllowlist)
          .where(and(
            eq(restaurantFeatureAllowlist.restaurantId, restaurantId),
            eq(restaurantFeatureAllowlist.featureKey, "counter_payments")
          ));

        // Get restaurant settings for enabled methods
        const [paymentSettings] = await db
          .select({ settingValue: restaurantSettings.settingValue })
          .from(restaurantSettings)
          .where(and(
            eq(restaurantSettings.restaurantId, restaurantId),
            eq(restaurantSettings.settingKey, "payment_methods")
          ));

        const enabledMethods = (paymentSettings?.settingValue as any)?.enabled_methods || [];

        const methods = [];

        // Stripe methods (card, apple_pay, google_pay)
        if (stripeAllowed?.isEnabled !== false && providerStatus.stripe.configured) {
          if (enabledMethods.includes("card")) {
            methods.push({ method: "card", displayName: "Credit/Debit Card", provider: "stripe" });
          }
          if (enabledMethods.includes("apple_pay")) {
            methods.push({ method: "apple_pay", displayName: "Apple Pay", provider: "stripe" });
          }
          if (enabledMethods.includes("google_pay")) {
            methods.push({ method: "google_pay", displayName: "Google Pay", provider: "stripe" });
          }
        }

        // PayPal
        if (paypalAllowed?.isEnabled !== false && providerStatus.paypal.configured) {
          if (enabledMethods.includes("paypal")) {
            methods.push({ method: "paypal", displayName: "PayPal", provider: "paypal" });
          }
        }

        // Counter/Cash (always available if allowed)
        if (counterAllowed?.isEnabled !== false && providerStatus.counter.configured) {
          if (enabledMethods.includes("cash") || enabledMethods.includes("counter")) {
            methods.push({ method: "cash", displayName: "Cash", provider: "counter" });
            methods.push({ method: "counter", displayName: "Pay at Counter", provider: "counter" });
          }
        }

        res.json({
          methods,
          providerStatus: {
            stripe: providerStatus.stripe.configured,
            paypal: providerStatus.paypal.configured,
            counter: providerStatus.counter.configured,
          }
        });
      } catch (error) {
        console.error("Get payment methods error:", error);
        res.status(500).json({ error: "Failed to get payment methods" });
      }
    }
  );

  // Create pending counter payment (public - for QR ordering)
  app.post(
    "/api/order/:orderId/payment/counter",
    orderCreationRateLimiter,
    async (req, res) => {
      try {
        const { orderId } = req.params;

        // Verify order exists and is not completed
        const [order] = await db
          .select({
            id: orders.id,
            restaurantId: orders.restaurantId,
            total: orders.total,
            paidAmount: orders.paidAmount,
            status: orders.status,
          })
          .from(orders)
          .where(eq(orders.id, orderId));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (order.status === "completed" || order.status === "cancelled") {
          return res.status(400).json({ error: "Order is already completed or cancelled" });
        }

        // Check if counter payments are enabled for this restaurant
        const [counterAllowed] = await db
          .select({ isEnabled: restaurantFeatureAllowlist.isEnabled })
          .from(restaurantFeatureAllowlist)
          .where(and(
            eq(restaurantFeatureAllowlist.restaurantId, order.restaurantId),
            eq(restaurantFeatureAllowlist.featureKey, "counter_payments")
          ));

        if (counterAllowed?.isEnabled === false) {
          return res.status(403).json({ error: "Counter payments not enabled" });
        }

        const remainingAmount = parseFloat(order.total || "0") - parseFloat(order.paidAmount || "0");

        // Create pending payment record
        const [payment] = await db.insert(payments).values({
          orderId: order.id,
          restaurantId: order.restaurantId,
          amount: remainingAmount.toFixed(2),
          method: "counter",
          status: "pending",
          metadata: { type: "counter_payment", requestedAt: new Date().toISOString() },
        }).returning();

        res.status(201).json({
          message: "Counter payment requested",
          payment,
          remainingAmount: remainingAmount.toFixed(2),
        });
      } catch (error) {
        console.error("Create counter payment error:", error);
        res.status(500).json({ error: "Failed to create counter payment" });
      }
    }
  );

  // Staff mark counter payment as paid
  app.patch(
    "/api/restaurants/:restaurantId/payments/:paymentId/mark-paid",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("pos"),
    requirePermission("orders:update"),
    async (req, res) => {
      try {
        const { restaurantId, paymentId } = req.params;
        const { tipAmount = 0 } = req.body;

        // Get payment record
        const [payment] = await db
          .select()
          .from(payments)
          .where(and(
            eq(payments.id, paymentId),
            eq(payments.restaurantId, restaurantId)
          ));

        if (!payment) {
          return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.status !== "pending") {
          return res.status(400).json({ error: "Payment is not pending" });
        }

        // Update payment to completed
        const [updatedPayment] = await db
          .update(payments)
          .set({
            status: "completed",
            tipAmount: tipAmount.toString(),
            processedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...(payment.metadata as object || {}),
              markedPaidBy: req.user?.userId,
              markedPaidAt: new Date().toISOString(),
            },
          })
          .where(eq(payments.id, paymentId))
          .returning();

        // Get order to update paid amount
        const [order] = await db
          .select({
            id: orders.id,
            total: orders.total,
            paidAmount: orders.paidAmount,
            tableId: orders.tableId,
          })
          .from(orders)
          .where(eq(orders.id, payment.orderId));

        if (order) {
          const paymentAmount = parseFloat(payment.amount || "0");
          const tip = parseFloat(tipAmount.toString() || "0");
          const newPaidAmount = parseFloat(order.paidAmount || "0") + paymentAmount + tip;
          const orderTotal = parseFloat(order.total || "0");

          const orderUpdates: any = {
            paidAmount: newPaidAmount.toFixed(2),
            tipAmount: sql`COALESCE(${orders.tipAmount}, 0) + ${tip.toFixed(2)}::decimal`,
            updatedAt: new Date(),
          };

          // Auto-complete order if fully paid
          // if (newPaidAmount >= orderTotal) {
          //   orderUpdates.status = "completed";
          //   orderUpdates.completedAt = new Date();

          //   // Record status change
          //   await db.insert(orderStatusHistory).values({
          //     orderId: order.id,
          //     userId: req.user?.userId,
          //     fromStatus: "served",
          //     toStatus: "completed",
          //     notes: "Auto-completed: payment received at counter",
          //   });
          // }

          await db.update(orders).set(orderUpdates).where(eq(orders.id, order.id));

          // Free table if order completed
          if (newPaidAmount >= orderTotal && order.tableId) {
            const [otherOrders] = await db
              .select({ count: sql<number>`count(*)` })
              .from(orders)
              .where(and(
                eq(orders.tableId, order.tableId),
                sql`${orders.status} NOT IN ('completed', 'cancelled')`,
                sql`${orders.id} != ${order.id}`
              ));

            if (!otherOrders || otherOrders.count === 0) {
              await db.update(diningTables).set({ status: "available", updatedAt: new Date() }).where(eq(diningTables.id, order.tableId));
            }
          }

          // Emit socket event to staff and customer rooms
          const paymentPayload = {
            paymentId,
            orderId: order.id,
            isFullyPaid: newPaidAmount >= orderTotal,
          };
          io.to(getTenantRoom(restaurantId)).emit("payment:completed", paymentPayload);
          io.to(getOrderRoom(order.id)).emit("payment:completed", paymentPayload);
        }

        res.json({
          message: "Payment marked as paid",
          payment: updatedPayment,
        });
      } catch (error) {
        console.error("Mark payment paid error:", error);
        res.status(500).json({ error: "Failed to mark payment as paid" });
      }
    }
  );

  // Stub endpoint for Stripe PaymentIntent (will be implemented when credentials are added)
  app.post(
    "/api/restaurants/:restaurantId/payments/stripe/create-intent",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      const providerStatus = paymentProviders.getPaymentProviderStatus();
      if (!providerStatus.stripe.configured) {
        return res.status(503).json({
          error: "Stripe not configured",
          message: "Stripe credentials are not set up. Contact administrator.",
        });
      }
      res.status(501).json({
        error: "Not implemented",
        message: "Stripe integration will be enabled when credentials are configured",
      });
    }
  );

  // Stub endpoint for PayPal order creation (will be implemented when credentials are added)
  app.post(
    "/api/restaurants/:restaurantId/payments/paypal/create-order",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      const providerStatus = paymentProviders.getPaymentProviderStatus();
      if (!providerStatus.paypal.configured) {
        return res.status(503).json({
          error: "PayPal not configured",
          message: "PayPal credentials are not set up. Contact administrator.",
        });
      }
      res.status(501).json({
        error: "Not implemented",
        message: "PayPal integration will be enabled when credentials are configured",
      });
    }
  );

  // ============================================================================
  // PHASE 9: Split Billing Module
  // Modes: A (item-based), B (amount-based), C (equal split)
  // ============================================================================

  // Create split session for an order
  app.post(
    "/api/restaurants/:restaurantId/orders/:orderId/split",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    requireFeature("split_billing"),
    requireSoftToggle("split_billing_enabled"),
    async (req, res) => {
      try {
        const { restaurantId, orderId } = req.params;
        const { splitType, shares } = req.body;
        const userId = req.user!.userId;

        // Validate split type: equal (C), by_item (A), by_amount (B)
        if (!["equal", "by_item", "by_amount"].includes(splitType)) {
          return res.status(400).json({
            error: "Invalid split type",
            message: "Split type must be one of: equal (C), by_item (A), by_amount (B)",
          });
        }

        // Check if order exists and belongs to restaurant
        const [order] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        // Check if order is in a valid state for splitting
        if (order.status === "completed" || order.status === "cancelled") {
          return res.status(400).json({
            error: "Invalid order state",
            message: "Cannot split a completed or cancelled order",
          });
        }

        // Check if an active split session already exists
        const [existingSession] = await db
          .select()
          .from(splitSessions)
          .where(
            and(
              eq(splitSessions.orderId, orderId),
              or(eq(splitSessions.status, "active"), eq(splitSessions.status, "locked"))
            )
          );

        if (existingSession) {
          return res.status(400).json({
            error: "Split session exists",
            message: "An active split session already exists for this order. Cancel it first.",
          });
        }

        const orderTotal = parseFloat(order.total || "0");
        let sharesToCreate: { shareNumber: number; label?: string; amount: string; itemIds?: string[] }[] = [];

        // Handle different split modes
        if (splitType === "equal") {
          // Mode C: Equal split
          const numShares = shares?.count || 2;
          if (numShares < 2 || numShares > 20) {
            return res.status(400).json({
              error: "Invalid share count",
              message: "Equal split requires 2-20 shares",
            });
          }
          const amountPerShare = (orderTotal / numShares).toFixed(2);
          for (let i = 1; i <= numShares; i++) {
            sharesToCreate.push({
              shareNumber: i,
              label: shares?.labels?.[i - 1] || `Guest ${i}`,
              amount: amountPerShare,
            });
          }
          // Adjust last share for rounding
          const totalAssigned = parseFloat(amountPerShare) * numShares;
          if (totalAssigned !== orderTotal) {
            const diff = orderTotal - totalAssigned;
            sharesToCreate[numShares - 1].amount = (parseFloat(amountPerShare) + diff).toFixed(2);
          }
        } else if (splitType === "by_amount") {
          // Mode B: Amount-based split
          if (!shares?.amounts || !Array.isArray(shares.amounts) || shares.amounts.length < 2) {
            return res.status(400).json({
              error: "Invalid amounts",
              message: "Amount-based split requires at least 2 share amounts",
            });
          }
          const totalAmounts = shares.amounts.reduce((sum: number, amt: number) => sum + amt, 0);
          if (Math.abs(totalAmounts - orderTotal) > 0.01) {
            return res.status(400).json({
              error: "Amounts don't match order total",
              message: `Share amounts (${totalAmounts.toFixed(2)}) must equal order total (${orderTotal.toFixed(2)})`,
            });
          }
          shares.amounts.forEach((amt: number, idx: number) => {
            sharesToCreate.push({
              shareNumber: idx + 1,
              label: shares?.labels?.[idx] || `Guest ${idx + 1}`,
              amount: amt.toFixed(2),
            });
          });
        } else if (splitType === "by_item") {
          // Mode A: Item-based split
          if (!shares?.itemAssignments || !Array.isArray(shares.itemAssignments) || shares.itemAssignments.length < 2) {
            return res.status(400).json({
              error: "Invalid item assignments",
              message: "Item-based split requires at least 2 shares with item assignments",
            });
          }
          // Get order items
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
          const itemMap = new Map(items.map((item) => [item.id, parseFloat(item.totalPrice)]));
          const allItemIds = new Set(items.map((item) => item.id));

          // Validate and calculate amounts per share
          const assignedItems = new Set<string>();
          for (let i = 0; i < shares.itemAssignments.length; i++) {
            const assignment = shares.itemAssignments[i];
            const itemIds: string[] = assignment.itemIds || [];
            let shareAmount = 0;

            for (const itemId of itemIds) {
              if (!allItemIds.has(itemId)) {
                return res.status(400).json({
                  error: "Invalid item ID",
                  message: `Item ${itemId} not found in order`,
                });
              }
              if (assignedItems.has(itemId)) {
                return res.status(400).json({
                  error: "Duplicate item assignment",
                  message: `Item ${itemId} is assigned to multiple shares`,
                });
              }
              assignedItems.add(itemId);
              shareAmount += itemMap.get(itemId) || 0;
            }

            sharesToCreate.push({
              shareNumber: i + 1,
              label: assignment.label || `Guest ${i + 1}`,
              amount: shareAmount.toFixed(2),
              itemIds,
            });
          }

          // Check if all items are assigned
          if (assignedItems.size !== allItemIds.size) {
            return res.status(400).json({
              error: "Incomplete item assignment",
              message: "All order items must be assigned to a share",
            });
          }
        }

        // Create split session
        const [session] = await db
          .insert(splitSessions)
          .values({
            orderId,
            splitType,
            totalShares: sharesToCreate.length,
            status: "active",
            createdById: userId,
            metadata: { originalTotal: orderTotal },
          })
          .returning();

        // Create shares
        const createdShares = [];
        for (const share of sharesToCreate) {
          const [created] = await db
            .insert(splitShares)
            .values({
              splitSessionId: session.id,
              shareNumber: share.shareNumber,
              label: share.label,
              amount: share.amount,
              itemIds: share.itemIds || [],
              status: "pending",
            })
            .returning();
          createdShares.push(created);
        }

        res.status(201).json({
          message: "Split session created",
          session: {
            ...session,
            shares: createdShares,
          },
        });
      } catch (error) {
        console.error("Create split session error:", error);
        res.status(500).json({ error: "Failed to create split session" });
      }
    }
  );

  // Get split session for an order
  app.get(
    "/api/restaurants/:restaurantId/orders/:orderId/split",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { orderId } = req.params;

        const [session] = await db
          .select()
          .from(splitSessions)
          .where(
            and(
              eq(splitSessions.orderId, orderId),
              or(eq(splitSessions.status, "active"), eq(splitSessions.status, "locked"))
            )
          );

        if (!session) {
          return res.status(404).json({ error: "No active split session found" });
        }

        const shares = await db
          .select()
          .from(splitShares)
          .where(eq(splitShares.splitSessionId, session.id));

        // Get payments for each share
        let sharePayments: (typeof splitSharePayments.$inferSelect)[] = [];
        if (shares.length > 0) {
          sharePayments = await db
            .select()
            .from(splitSharePayments)
            .where(
              inArray(splitSharePayments.splitShareId, shares.map(s => s.id))
            );
        }

        const sharePaymentMap = new Map<string, typeof sharePayments>();
        for (const sp of sharePayments) {
          const existing = sharePaymentMap.get(sp.splitShareId) || [];
          existing.push(sp);
          sharePaymentMap.set(sp.splitShareId, existing);
        }

        res.json({
          session,
          shares: shares.map((share) => ({
            ...share,
            payments: sharePaymentMap.get(share.id) || [],
            remainingAmount: Math.max(
              0,
              parseFloat(share.amount) - parseFloat(share.paidAmount || "0")
            ).toFixed(2),
          })),
        });
      } catch (error) {
        console.error("Get split session error:", error);
        res.status(500).json({ error: "Failed to get split session" });
      }
    }
  );

  // Lock split session (no more changes to shares)
  app.post(
    "/api/restaurants/:restaurantId/orders/:orderId/split/lock",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { orderId } = req.params;

        const [session] = await db
          .select()
          .from(splitSessions)
          .where(and(eq(splitSessions.orderId, orderId), eq(splitSessions.status, "active")));

        if (!session) {
          return res.status(404).json({ error: "No active split session found" });
        }

        const [updated] = await db
          .update(splitSessions)
          .set({
            status: "locked",
            lockedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(splitSessions.id, session.id))
          .returning();

        res.json({ message: "Split session locked", session: updated });
      } catch (error) {
        console.error("Lock split session error:", error);
        res.status(500).json({ error: "Failed to lock split session" });
      }
    }
  );

  // Cancel split session
  app.delete(
    "/api/restaurants/:restaurantId/orders/:orderId/split",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { orderId } = req.params;

        const [session] = await db
          .select()
          .from(splitSessions)
          .where(
            and(
              eq(splitSessions.orderId, orderId),
              or(eq(splitSessions.status, "active"), eq(splitSessions.status, "locked"))
            )
          );

        if (!session) {
          return res.status(404).json({ error: "No active split session found" });
        }

        // Check if any payments have been made
        const shares = await db
          .select()
          .from(splitShares)
          .where(eq(splitShares.splitSessionId, session.id));

        const paidShares = shares.filter(
          (s) => parseFloat(s.paidAmount || "0") > 0
        );

        if (paidShares.length > 0) {
          return res.status(400).json({
            error: "Cannot cancel split with payments",
            message: "Some shares have already received payments. Process refunds first.",
          });
        }

        // Cancel shares and session
        await db
          .update(splitShares)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(splitShares.splitSessionId, session.id));

        const [cancelled] = await db
          .update(splitSessions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(splitSessions.id, session.id))
          .returning();

        res.json({ message: "Split session cancelled", session: cancelled });
      } catch (error) {
        console.error("Cancel split session error:", error);
        res.status(500).json({ error: "Failed to cancel split session" });
      }
    }
  );

  // Pay a share (partial or full payment)
  app.post(
    "/api/restaurants/:restaurantId/orders/:orderId/split/shares/:shareId/pay",
    authenticate,
    requireRestaurantAccess, requireActiveRestaurant,
    async (req, res) => {
      try {
        const { restaurantId, orderId, shareId } = req.params;
        const { amount, tipAmount = 0, method = "counter" } = req.body;
        const userId = req.user!.userId;

        // Validate payment method is enabled
        const hasFeature = await checkFeature(restaurantId, "counter_payments");
        if (method !== "counter" && method !== "cash") {
          // For other methods, check if they're configured
          if (method === "card") {
            const stripeEnabled = await checkFeature(restaurantId, "stripe_payments");
            if (!stripeEnabled) {
              return res.status(400).json({
                error: "Card payments not enabled",
                message: "Stripe is not configured for this restaurant",
              });
            }
          }
        }

        // Get share with session
        const [share] = await db
          .select()
          .from(splitShares)
          .where(eq(splitShares.id, shareId));

        if (!share) {
          return res.status(404).json({ error: "Share not found" });
        }

        const [session] = await db
          .select()
          .from(splitSessions)
          .where(eq(splitSessions.id, share.splitSessionId));

        if (!session || session.orderId !== orderId) {
          return res.status(404).json({ error: "Split session not found" });
        }

        if (session.status !== "active" && session.status !== "locked") {
          return res.status(400).json({
            error: "Invalid session state",
            message: "Split session is not active",
          });
        }

        if (share.status === "paid" || share.status === "cancelled") {
          return res.status(400).json({
            error: "Share not payable",
            message: `Share is already ${share.status}`,
          });
        }

        // Calculate remaining amount for this share
        const shareAmount = parseFloat(share.amount);
        const paidSoFar = parseFloat(share.paidAmount || "0");
        const remaining = shareAmount - paidSoFar;

        const paymentAmount = parseFloat(amount);
        if (paymentAmount <= 0) {
          return res.status(400).json({
            error: "Invalid amount",
            message: "Payment amount must be positive",
          });
        }

        // Prevent overpayment
        if (paymentAmount > remaining + 0.01) {
          return res.status(400).json({
            error: "Overpayment",
            message: `Payment amount (${paymentAmount.toFixed(2)}) exceeds remaining balance (${remaining.toFixed(2)})`,
          });
        }

        // Get order to update paid amount
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, orderId));

        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        // Create payment record
        const [payment] = await db
          .insert(payments)
          .values({
            orderId,
            restaurantId,
            splitSessionId: session.id,
            amount: paymentAmount.toFixed(2),
            tipAmount: parseFloat(tipAmount || 0).toFixed(2),
            method,
            status: "completed",
            processedAt: new Date(),
            metadata: {
              splitShareId: shareId,
              shareNumber: share.shareNumber,
              paidBy: userId,
            },
          })
          .returning();

        // Create split share payment record
        await db.insert(splitSharePayments).values({
          splitShareId: shareId,
          paymentId: payment.id,
          amount: paymentAmount.toFixed(2),
          tipAmount: parseFloat(tipAmount || 0).toFixed(2),
        });

        // Update share paid amount
        const newPaidAmount = paidSoFar + paymentAmount;
        const newPaidTip = parseFloat(share.paidTip || "0") + parseFloat(tipAmount || 0);
        const newShareStatus = newPaidAmount >= shareAmount - 0.01 ? "paid" : "partial";

        await db
          .update(splitShares)
          .set({
            paidAmount: newPaidAmount.toFixed(2),
            paidTip: newPaidTip.toFixed(2),
            status: newShareStatus,
            updatedAt: new Date(),
          })
          .where(eq(splitShares.id, shareId));

        // Update order paid amount
        const orderPaidAmount = parseFloat(order.paidAmount || "0") + paymentAmount;
        const orderTipAmount = parseFloat(order.tipAmount || "0") + parseFloat(tipAmount || 0);
        const orderTotal = parseFloat(order.total || "0");

        await db
          .update(orders)
          .set({
            paidAmount: orderPaidAmount.toFixed(2),
            tipAmount: orderTipAmount.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));

        // Check if all shares are paid to complete session and order
        const allShares = await db
          .select()
          .from(splitShares)
          .where(eq(splitShares.splitSessionId, session.id));

        const allPaid = allShares.every(
          (s) => s.id === shareId
            ? newShareStatus === "paid"
            : s.status === "paid"
        );

        if (allPaid) {
          // Complete split session
          await db
            .update(splitSessions)
            .set({ status: "completed", updatedAt: new Date() })
            .where(eq(splitSessions.id, session.id));

          // Check if order should be completed
          // if (orderPaidAmount >= orderTotal - 0.01) {
          //   await db
          //     .update(orders)
          //     .set({
          //       status: "completed",
          //       completedAt: new Date(),
          //       updatedAt: new Date(),
          //     })
          //     .where(eq(orders.id, orderId));

          //   // Add status history
          //   await db.insert(orderStatusHistory).values({
          //     orderId,
          //     userId,
          //     fromStatus: order.status,
          //     toStatus: "completed",
          //     notes: "Auto-completed: all split payments received",
          //   });

          //   // Release table if applicable
          //   if (order.tableId) {
          //     await db
          //       .update(diningTables)
          //       .set({ status: "available", updatedAt: new Date() })
          //       .where(eq(diningTables.id, order.tableId));
          //   }

          //   // Emit socket event to staff and customer rooms
          //   const statusPayload = {
          //     orderId,
          //     fromStatus: order.status,
          //     toStatus: "completed",
          //     orderNumber: order.orderNumber,
          //   };
          //   io.to(getTenantRoom(restaurantId)).emit("order:status-changed", statusPayload);
          //   io.to(getKitchenRoom(restaurantId)).emit("order:status-changed", statusPayload);
          //   io.to(getOrderRoom(orderId)).emit("order:status-changed", statusPayload);
          // }
        }

        // Emit payment completed event to staff and customer rooms
        const splitPayload = {
          orderId,
          shareId,
          paymentId: payment.id,
          amount: paymentAmount,
          shareStatus: newShareStatus,
          isFullyPaid: allPaid,
        };
        io.to(getTenantRoom(restaurantId)).emit("split:payment-completed", splitPayload);
        io.to(getOrderRoom(orderId)).emit("split:payment-completed", splitPayload);

        res.json({
          message: "Payment recorded",
          payment,
          share: {
            id: shareId,
            paidAmount: newPaidAmount.toFixed(2),
            remainingAmount: Math.max(0, shareAmount - newPaidAmount).toFixed(2),
            status: newShareStatus,
          },
          sessionFullyPaid: allPaid,
        });
      } catch (error) {
        console.error("Pay share error:", error);
        res.status(500).json({ error: "Failed to process payment" });
      }
    }
  );

  // ============================================================================
  // Legacy slug-based endpoints (kept for backwards compatibility)
  // ============================================================================

  // Public menu endpoint by slug (redirects to use token-based approach)
  app.get("/api/:tenantSlug/menu", resolveTenantBySlug, async (req, res) => {
    if (!req.restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    res.status(400).json({
      error: "Please use token-based menu access",
      message: "Scan the QR code to access the menu"
    });
  });

  app.get("/api/:tenantSlug/orders", authenticate, resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Staff order management coming in future phase" });
  });

  app.post("/api/:tenantSlug/orders", resolveTenantBySlug, async (req, res) => {
    res.status(400).json({
      error: "Please use token-based order creation",
      message: "Use POST /api/order with a valid QR token"
    });
  });

  log("API routes registered", "express");
  return httpServer;
}
