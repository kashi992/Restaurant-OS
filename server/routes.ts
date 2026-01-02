import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db, pool, testConnection } from "./db";
import { log } from "./index";
import bcrypt from "bcryptjs";
import { eq, and, isNull, gt } from "drizzle-orm";
import { 
  users, 
  restaurants, 
  restaurantUsers, 
  roles, 
  refreshTokens,
  loginSchema,
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
import { z } from "zod";

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

      res.status(201).json({ restaurant });
    } catch (error) {
      console.error("Create restaurant error:", error);
      res.status(500).json({ 
        error: "Internal Server Error", 
        message: "Failed to create restaurant" 
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
  // Placeholder Endpoints (to be implemented in future phases)
  // ============================================================================

  app.get("/api/:tenantSlug/menu", resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Menu endpoints coming in Phase 3" });
  });

  app.get("/api/:tenantSlug/categories", resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Category endpoints coming in Phase 3" });
  });

  app.get("/api/:tenantSlug/orders", authenticate, resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Order endpoints coming in Phase 4" });
  });

  app.post("/api/:tenantSlug/orders", resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Order endpoints coming in Phase 4" });
  });

  app.get("/api/:tenantSlug/tables", authenticate, resolveTenantBySlug, async (req, res) => {
    res.status(501).json({ message: "Table endpoints coming in Phase 5" });
  });

  log("API routes registered", "express");
  return httpServer;
}
