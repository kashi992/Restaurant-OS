import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, extractBearerToken, AccessTokenPayload } from "./jwt";
import { db } from "../db";
import { restaurants, restaurantDomains, users, restaurantUsers, roles } from "@shared/schema";
import { eq, and } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload & { 
        dbUser?: typeof users.$inferSelect;
      };
      restaurant?: typeof restaurants.$inferSelect;
      tenantId?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json({ 
      error: "Unauthorized", 
      message: "No access token provided" 
    });
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ 
      error: "Unauthorized", 
      message: "Invalid or expired access token" 
    });
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      error: "Unauthorized", 
      message: "Authentication required" 
    });
  }

  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ 
      error: "Forbidden", 
      message: "Super admin access required" 
    });
  }

  next();
}

export function requireRestaurantAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ 
      error: "Unauthorized", 
      message: "Authentication required" 
    });
  }

  if (req.user.isSuperAdmin) {
    return next();
  }

  const restaurantId = req.tenantId || req.params.restaurantId || req.user.restaurantId;
  
  if (!restaurantId) {
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "Restaurant context required" 
    });
  }

  if (req.user.restaurantId !== restaurantId) {
    return res.status(403).json({ 
      error: "Forbidden", 
      message: "Access denied to this restaurant" 
    });
  }

  next();
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Authentication required" 
      });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    
    if (userPermissions.includes("*")) {
      return next();
    }

    const hasPermission = requiredPermissions.some(required => {
      if (userPermissions.includes(required)) return true;
      const [resource, action] = required.split(":");
      if (userPermissions.includes(`${resource}:*`)) return true;
      return false;
    });

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: `Required permission: ${requiredPermissions.join(" or ")}` 
      });
    }

    next();
  };
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Unauthorized", 
        message: "Authentication required" 
      });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    const userRole = req.user.roleName;
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: "Forbidden", 
        message: `Required role: ${allowedRoles.join(" or ")}` 
      });
    }

    next();
  };
}

export async function resolveTenantBySlug(req: Request, res: Response, next: NextFunction) {
  const { tenantSlug } = req.params;
  
  if (!tenantSlug) {
    return next();
  }

  try {
    const [restaurant] = await db
      .select()
      .from(restaurants)
      .where(and(
        eq(restaurants.slug, tenantSlug),
        eq(restaurants.isActive, true)
      ))
      .limit(1);

    if (!restaurant) {
      return res.status(404).json({ 
        error: "Not Found", 
        message: "Restaurant not found" 
      });
    }

    req.restaurant = restaurant;
    req.tenantId = restaurant.id;
    next();
  } catch (error) {
    console.error("Error resolving tenant by slug:", error);
    return res.status(500).json({ 
      error: "Internal Server Error", 
      message: "Failed to resolve restaurant" 
    });
  }
}

export async function resolveTenantByDomain(req: Request, res: Response, next: NextFunction) {
  const host = req.headers.host || req.headers["x-forwarded-host"] as string;
  
  if (!host) {
    return next();
  }

  const domain = host.split(":")[0];
  
  const skipDomains = ["localhost", "127.0.0.1", "0.0.0.0"];
  if (skipDomains.includes(domain) || domain.endsWith(".replit.dev") || domain.endsWith(".replit.app")) {
    return next();
  }

  try {
    const [domainRecord] = await db
      .select({
        domain: restaurantDomains,
        restaurant: restaurants,
      })
      .from(restaurantDomains)
      .innerJoin(restaurants, eq(restaurantDomains.restaurantId, restaurants.id))
      .where(and(
        eq(restaurantDomains.domain, domain),
        eq(restaurantDomains.isVerified, true),
        eq(restaurants.isActive, true)
      ))
      .limit(1);

    if (domainRecord) {
      req.restaurant = domainRecord.restaurant;
      req.tenantId = domainRecord.restaurant.id;
    }

    next();
  } catch (error) {
    console.error("Error resolving tenant by domain:", error);
    next();
  }
}

export async function resolveTenantFromToken(req: Request, res: Response, next: NextFunction) {
  if (req.tenantId) {
    return next();
  }

  if (req.user?.restaurantId) {
    try {
      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(and(
          eq(restaurants.id, req.user.restaurantId),
          eq(restaurants.isActive, true)
        ))
        .limit(1);

      if (restaurant) {
        req.restaurant = restaurant;
        req.tenantId = restaurant.id;
      }
    } catch (error) {
      console.error("Error resolving tenant from token:", error);
    }
  }

  next();
}

export async function loadFullUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId) {
    return next();
  }

  try {
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (dbUser) {
      req.user.dbUser = dbUser;
    }

    next();
  } catch (error) {
    console.error("Error loading full user:", error);
    next();
  }
}
