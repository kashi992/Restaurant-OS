import { db } from "../db";
import { adminAuditLogs } from "@shared/schema";
import type { Request } from "express";

export interface AuditLogParams {
  adminUserId: string;
  action: string;
  targetType: "restaurant" | "user" | "feature" | "setting" | "domain";
  targetId: string;
  targetName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  req?: Request;
}

export async function createAuditLog({
  adminUserId,
  action,
  targetType,
  targetId,
  targetName,
  previousValue,
  newValue,
  metadata = {},
  req,
}: AuditLogParams): Promise<void> {
  try {
    await db.insert(adminAuditLogs).values({
      adminUserId,
      action,
      targetType,
      targetId,
      targetName,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      metadata,
      ipAddress: req?.ip || req?.headers["x-forwarded-for"]?.toString() || null,
      userAgent: req?.headers["user-agent"] || null,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export const AUDIT_ACTIONS = {
  RESTAURANT_CREATE: "restaurant.create",
  RESTAURANT_UPDATE: "restaurant.update",
  RESTAURANT_SUSPEND: "restaurant.suspend",
  RESTAURANT_RESTORE: "restaurant.restore",
  RESTAURANT_DELETE: "restaurant.delete",
  FEATURE_UPDATE: "feature.update",
  FEATURE_CREATE: "feature.create",
  FEATURE_DELETE: "feature.delete",
  SETTING_UPDATE: "setting.update",
  SETTING_CREATE: "setting.create",
  SETTING_DELETE: "setting.delete",
  DOMAIN_CREATE: "domain.create",
  DOMAIN_UPDATE: "domain.update",
  DOMAIN_DELETE: "domain.delete",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",
  ADMIN_CREATE: "admin.create",
} as const;
