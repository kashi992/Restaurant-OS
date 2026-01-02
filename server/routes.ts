import type { Express } from "express";
import { type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { db, pool, testConnection } from "./db";
import { log } from "./index";

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
    
    // Join tenant room for multi-tenant real-time updates
    socket.on("join-tenant", (tenantId: string) => {
      socket.join(`tenant:${tenantId}`);
      log(`Socket ${socket.id} joined tenant: ${tenantId}`, "socket.io");
    });

    // Join kitchen room for order updates
    socket.on("join-kitchen", (tenantId: string) => {
      socket.join(`kitchen:${tenantId}`);
      log(`Socket ${socket.id} joined kitchen: ${tenantId}`, "socket.io");
    });

    socket.on("disconnect", () => {
      log(`Socket disconnected: ${socket.id}`, "socket.io");
    });
  });

  // Make io available in request handlers
  app.set("io", io);

  // ============================================================================
  // Health & Status Endpoints
  // ============================================================================

  // Health check endpoint
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

  // Database connection test endpoint
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

  // API info endpoint
  app.get("/api", (_req, res) => {
    res.json({
      name: "Restaurant POS + QR Ordering API",
      version: "1.0.0",
      description: "Multi-tenant restaurant management SaaS",
      endpoints: {
        health: "/api/health",
        healthDb: "/api/health/db",
        // Future endpoints will be listed here
        auth: "/api/auth/*",
        tenants: "/api/tenants/*",
        menu: "/api/menu/*",
        orders: "/api/orders/*",
        tables: "/api/tables/*",
      },
      documentation: "See README.md for API documentation",
    });
  });

  // ============================================================================
  // Authentication Endpoints (to be implemented)
  // ============================================================================
  
  // Placeholder for auth routes
  app.post("/api/auth/register", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.post("/api/auth/login", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.post("/api/auth/logout", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.get("/api/auth/me", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  // ============================================================================
  // Tenant Endpoints (to be implemented)
  // ============================================================================

  app.get("/api/tenants", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.get("/api/tenants/:slug", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  // ============================================================================
  // Menu Endpoints (to be implemented)
  // ============================================================================

  app.get("/api/:tenantSlug/menu", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.get("/api/:tenantSlug/categories", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  // ============================================================================
  // Order Endpoints (to be implemented)
  // ============================================================================

  app.get("/api/:tenantSlug/orders", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  app.post("/api/:tenantSlug/orders", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  // ============================================================================
  // Table Endpoints (to be implemented)
  // ============================================================================

  app.get("/api/:tenantSlug/tables", async (req, res) => {
    res.status(501).json({ message: "Not implemented yet" });
  });

  log("API routes registered", "express");
  return httpServer;
}
