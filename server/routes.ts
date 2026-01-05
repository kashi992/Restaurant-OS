import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db, pool, testConnection } from "./db";
import { log } from "./index";
import bcrypt from "bcryptjs";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
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
import { z } from "zod";
import { desc } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  io.on("connection", (socket) => {
    log(`Socket connected: ${socket.id}`, "socket.io");
    
    socket.on("join-tenant", (tenantId: string) => {
      socket.join(`tenant:${tenantId}`);
      log(`Socket ${socket.id} joined tenant: ${tenantId}`, "socket.io");
    });

    socket.on("join-kitchen", (tenantId: string) => {
      socket.join(`kitchen:${tenantId}`);
      log(`Socket ${socket.id} joined kitchen: ${tenantId}`, "socket.io");
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
        roleId?: string;
        roleName?: string;
        permissions?: string[];
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
          restaurantContext = {
            restaurantId: restaurantUser.restaurant.id,
            roleId: restaurantUser.role.id,
            roleName: restaurantUser.role.name,
            permissions: (restaurantUser.role.permissions as string[]) || [],
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

      res.json({
        accessToken,
        refreshToken,
        accessTokenExpiresAt: accessExpiresAt.toISOString(),
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isSuperAdmin: user.isSuperAdmin,
          ...restaurantContext,
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
      const { refreshToken: token } = req.body;
      
      if (!token) {
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Refresh token required" 
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

  // Logout - revoke refresh token
  app.post("/api/auth/logout", authenticate, async (req, res) => {
    try {
      const { refreshToken: token } = req.body;
      
      if (token) {
        const payload = verifyRefreshToken(token);
        if (payload) {
          await db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.tokenId, payload.tokenId));
        }
      }

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
          roleId: user.roleId,
          roleName: user.roleName,
          permissions: user.permissions,
        } : null,
        restaurants: restaurantAssociations.map(ra => ({
          id: ra.restaurant.id,
          name: ra.restaurant.name,
          slug: ra.restaurant.slug,
          roleId: ra.role.id,
          roleName: ra.role.name,
          permissions: ra.role.permissions,
        })),
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

  // List all restaurants (super admin only)
  app.get("/api/admin/restaurants", authenticate, requireSuperAdmin, async (req, res) => {
    try {
      const allRestaurants = await db
        .select()
        .from(restaurants)
        .orderBy(restaurants.name);

      res.json({ restaurants: allRestaurants });
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
      const { name, slug, ...rest } = req.body;

      if (!name || !slug) {
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Name and slug are required" 
        });
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

      const [restaurant] = await db
        .insert(restaurants)
        .values({ name, slug, ...rest })
        .returning();

      await createAuditLog({
        adminUserId: req.user!.userId,
        action: AUDIT_ACTIONS.RESTAURANT_CREATE,
        targetType: "restaurant",
        targetId: restaurant.id,
        targetName: restaurant.name,
        newValue: restaurant,
        req,
      });

      res.status(201).json({ restaurant });
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

      res.json({
        restaurant,
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

      if (existing.suspendedAt) {
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Restaurant is already suspended" 
        });
      }

      const [restaurant] = await db
        .update(restaurants)
        .set({ 
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

      if (!existing.suspendedAt) {
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Restaurant is not suspended" 
        });
      }

      const [restaurant] = await db
        .update(restaurants)
        .set({ 
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
  // Restaurant Staff Management Endpoints
  // ============================================================================

  // List restaurant staff
  app.get(
    "/api/restaurants/:restaurantId/staff",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess,
    requirePermission("staff:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const staff = await db
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
          .orderBy(users.firstName);

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
    requireRestaurantAccess,
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

  // Update staff member
  app.patch(
    "/api/restaurants/:restaurantId/staff/:staffId",
    authenticate,
    resolveTenantFromToken,
    requireRestaurantAccess,
    requirePermission("staff:update"),
    async (req, res) => {
      try {
        const { restaurantId, staffId } = req.params;
        const { roleId, pin, isActive } = req.body;

        // Verify staff member belongs to this restaurant
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

        // If changing role, verify it belongs to this restaurant
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

        const updates: Partial<typeof existingStaff> = {};
        if (roleId !== undefined) updates.roleId = roleId;
        if (pin !== undefined) updates.pin = pin;
        if (isActive !== undefined) updates.isActive = isActive;

        const [updated] = await db
          .update(restaurantUsers)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(restaurantUsers.id, staffId))
          .returning();

        res.json({ staff: updated });
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireFeature("qr"),
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
    requirePermission("menu:create"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;
        const { menuId, name, description, imageUrl, isActive, sortOrder } = req.body;

        if (!name) {
          return res.status(400).json({ error: "Category name is required" });
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
    requirePermission("tables:read"),
    async (req, res) => {
      try {
        const { restaurantId } = req.params;

        const tableList = await db
          .select()
          .from(diningTables)
          .where(eq(diningTables.restaurantId, restaurantId))
          .orderBy(diningTables.number);

        res.json(tableList);
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
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
    requireRestaurantAccess,
    requireFeature("qr"),
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
    requireRestaurantAccess,
    requireFeature("qr"),
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

        // Generate unique token
        const token = `${restaurantId.slice(0, 8)}-${tableId.slice(0, 8)}-${Date.now().toString(36)}`;

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
    requireRestaurantAccess,
    requireFeature("qr"),
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

          const token = `${restaurantId.slice(0, 8)}-${table.id.slice(0, 8)}-${Date.now().toString(36)}`;

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
    requireRestaurantAccess,
    requireFeature("qr"),
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
    requireRestaurantAccess,
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
        for (const s of settings) {
          settingsMap[s.settingKey] = s.settingValue;
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
    requireRestaurantAccess,
    requirePermission("settings:update"),
    async (req, res) => {
      try {
        const { restaurantId, settingKey } = req.params;
        const { value } = req.body;

        // Feature gating: validate that the setting change doesn't enable something not allowed
        const featureRequirements: Record<string, string> = {
          split_billing: "split_payments",
          qr_ordering: "qr",
          payment_methods: "pos", // Need POS feature for payment methods
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
    requireRestaurantAccess,
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
          split_billing: "split_payments",
          qr_ordering: "qr",
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

  // ============================================================================
  // Placeholder Endpoints (to be implemented in future phases)
  // ============================================================================

  // Public menu endpoint (no auth required)
  app.get("/api/:tenantSlug/menu", resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Public menu endpoint coming in Phase 6" });
  });

  app.get("/api/:tenantSlug/orders", authenticate, resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Order endpoints coming in Phase 6" });
  });

  app.post("/api/:tenantSlug/orders", resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Order endpoints coming in Phase 6" });
  });

  log("API routes registered", "express");
  return httpServer;
}
