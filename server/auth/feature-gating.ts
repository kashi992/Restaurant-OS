import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { restaurantFeatureAllowlist, restaurantSettings } from "@shared/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";

interface FeatureCache {
  features: Map<string, { isEnabled: boolean; expiresAt: Date | null }>;
  settings: Map<string, unknown>;
  loadedAt: number;
}

const restaurantCache = new Map<string, FeatureCache>();
const CACHE_TTL_MS = 60 * 1000;

async function loadRestaurantFeatures(restaurantId: string): Promise<FeatureCache> {
  const cached = restaurantCache.get(restaurantId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  const [features, settings] = await Promise.all([
    db
      .select()
      .from(restaurantFeatureAllowlist)
      .where(eq(restaurantFeatureAllowlist.restaurantId, restaurantId)),
    db
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, restaurantId)),
  ]);

  const featureCache: FeatureCache = {
    features: new Map(),
    settings: new Map(),
    loadedAt: Date.now(),
  };

  for (const feature of features) {
    featureCache.features.set(feature.featureKey, {
      isEnabled: feature.isEnabled ?? false,
      expiresAt: feature.expiresAt,
    });
  }

  for (const setting of settings) {
    featureCache.settings.set(setting.settingKey, setting.settingValue);
  }

  restaurantCache.set(restaurantId, featureCache);
  return featureCache;
}

export function clearFeatureCache(restaurantId?: string) {
  if (restaurantId) {
    restaurantCache.delete(restaurantId);
  } else {
    restaurantCache.clear();
  }
}

function isFeatureEnabled(cache: FeatureCache, featureKey: string): boolean {
  const feature = cache.features.get(featureKey);
  if (!feature) {
    return false;
  }
  if (!feature.isEnabled) {
    return false;
  }
  if (feature.expiresAt && feature.expiresAt < new Date()) {
    return false;
  }
  return true;
}

function getSettingValue<T = unknown>(cache: FeatureCache, settingKey: string): T | undefined {
  return cache.settings.get(settingKey) as T | undefined;
}

export function requireFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.tenantId || req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Restaurant context required for feature check",
      });
    }

    try {
      const cache = await loadRestaurantFeatures(restaurantId);
      
      if (!isFeatureEnabled(cache, featureKey)) {
        return res.status(403).json({
          error: "Feature Not Available",
          message: `The "${featureKey}" feature is not enabled for this restaurant`,
          featureKey,
        });
      }

      next();
    } catch (error) {
      console.error("Feature check error:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check feature availability",
      });
    }
  };
}

export function requireSoftToggle(settingKey: string, checkPath: string = "enabled") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.tenantId || req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Restaurant context required for setting check",
      });
    }

    try {
      const cache = await loadRestaurantFeatures(restaurantId);
      const settingValue = getSettingValue<Record<string, unknown>>(cache, settingKey);

      if (!settingValue) {
        return res.status(403).json({
          error: "Setting Not Configured",
          message: `The "${settingKey}" setting is not configured for this restaurant`,
          settingKey,
        });
      }

      const pathParts = checkPath.split(".");
      let value: unknown = settingValue;
      for (const part of pathParts) {
        if (value && typeof value === "object" && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== true) {
        return res.status(403).json({
          error: "Setting Disabled",
          message: `The "${settingKey}" setting is not enabled for this restaurant`,
          settingKey,
        });
      }

      next();
    } catch (error) {
      console.error("Setting check error:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check setting availability",
      });
    }
  };
}

export function requirePaymentMethodEnabled(paymentMethod: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.tenantId || req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Restaurant context required for payment method check",
      });
    }

    try {
      const cache = await loadRestaurantFeatures(restaurantId);
      const paymentSettings = getSettingValue<{
        enabled_methods?: string[];
      }>(cache, "payment_methods");

      if (!paymentSettings?.enabled_methods) {
        return res.status(403).json({
          error: "Payment Methods Not Configured",
          message: "Payment methods are not configured for this restaurant",
        });
      }

      if (!paymentSettings.enabled_methods.includes(paymentMethod)) {
        return res.status(403).json({
          error: "Payment Method Not Available",
          message: `The "${paymentMethod}" payment method is not enabled for this restaurant`,
          paymentMethod,
          availableMethods: paymentSettings.enabled_methods,
        });
      }

      next();
    } catch (error) {
      console.error("Payment method check error:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check payment method availability",
      });
    }
  };
}

export function requireFeatureAndSoftToggle(featureKey: string, settingKey: string, checkPath: string = "enabled") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.tenantId || req.user?.restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Restaurant context required",
      });
    }

    try {
      const cache = await loadRestaurantFeatures(restaurantId);

      if (!isFeatureEnabled(cache, featureKey)) {
        return res.status(403).json({
          error: "Feature Not Available",
          message: `The "${featureKey}" feature is not enabled for this restaurant`,
          featureKey,
        });
      }

      const settingValue = getSettingValue<Record<string, unknown>>(cache, settingKey);
      if (!settingValue) {
        return res.status(403).json({
          error: "Setting Not Configured",
          message: `The "${settingKey}" setting is not configured`,
          settingKey,
        });
      }

      const pathParts = checkPath.split(".");
      let value: unknown = settingValue;
      for (const part of pathParts) {
        if (value && typeof value === "object" && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== true) {
        return res.status(403).json({
          error: "Setting Disabled",
          message: `The "${settingKey}" setting is not enabled`,
          settingKey,
        });
      }

      next();
    } catch (error) {
      console.error("Feature/setting check error:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to check feature/setting availability",
      });
    }
  };
}

export async function getRestaurantFeatures(restaurantId: string) {
  const cache = await loadRestaurantFeatures(restaurantId);
  
  const features: Record<string, boolean> = {};
  const settings: Record<string, unknown> = {};

  cache.features.forEach((value, key) => {
    features[key] = isFeatureEnabled(cache, key);
  });

  cache.settings.forEach((value, key) => {
    settings[key] = value;
  });

  return { features, settings };
}

export async function checkFeature(restaurantId: string, featureKey: string): Promise<boolean> {
  const cache = await loadRestaurantFeatures(restaurantId);
  return isFeatureEnabled(cache, featureKey);
}

export async function checkSoftToggle(restaurantId: string, settingKey: string, checkPath: string = "enabled"): Promise<boolean> {
  const cache = await loadRestaurantFeatures(restaurantId);
  const settingValue = getSettingValue<Record<string, unknown>>(cache, settingKey);
  
  if (!settingValue) return false;

  const pathParts = checkPath.split(".");
  let value: unknown = settingValue;
  for (const part of pathParts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }

  return value === true;
}

export async function checkPaymentMethod(restaurantId: string, paymentMethod: string): Promise<boolean> {
  const cache = await loadRestaurantFeatures(restaurantId);
  const paymentSettings = getSettingValue<{
    enabled_methods?: string[];
  }>(cache, "payment_methods");

  return paymentSettings?.enabled_methods?.includes(paymentMethod) ?? false;
}
