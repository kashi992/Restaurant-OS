import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "./jwt";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-in-production";

export interface StaffSocketData {
  type: "staff";
  userId: string;
  restaurantId: string;
  isSuperAdmin: boolean;
  permissions: string[];
}

export interface CustomerSocketData {
  type: "customer";
  orderId: string;
  restaurantId: string;
  tableId?: string;
}

export type SocketData = StaffSocketData | CustomerSocketData;

export interface CustomerTrackingToken {
  type: "customer_tracking";
  orderId: string;
  restaurantId: string;
  tableId?: string;
  iat: number;
  exp: number;
}

export function generateCustomerTrackingToken(
  orderId: string, 
  restaurantId: string,
  tableId?: string
): string {
  const payload: Omit<CustomerTrackingToken, "iat" | "exp"> = {
    type: "customer_tracking",
    orderId,
    restaurantId,
    tableId,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyCustomerTrackingToken(token: string): CustomerTrackingToken | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as CustomerTrackingToken;
    if (payload.type !== "customer_tracking") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function authenticateSocket(socket: Socket): Promise<SocketData | null> {
  const { token, customerToken } = socket.handshake.auth;
  
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      return {
        type: "staff",
        userId: payload.userId,
        restaurantId: payload.restaurantId || "",
        isSuperAdmin: payload.isSuperAdmin,
        permissions: payload.permissions || [],
      };
    }
  }
  
  if (customerToken) {
    const payload = verifyCustomerTrackingToken(customerToken);
    if (payload) {
      return {
        type: "customer",
        orderId: payload.orderId,
        restaurantId: payload.restaurantId,
        tableId: payload.tableId,
      };
    }
  }
  
  return null;
}

export function canJoinTenantRoom(socketData: SocketData, tenantId: string): boolean {
  if (socketData.type === "staff") {
    return socketData.isSuperAdmin || socketData.restaurantId === tenantId;
  }
  return false;
}

export function canJoinKitchenRoom(socketData: SocketData, tenantId: string): boolean {
  if (socketData.type === "staff") {
    if (socketData.isSuperAdmin) return true;
    if (socketData.restaurantId !== tenantId) return false;
    const kitchenPerms = ["view_orders", "update_order_status", "manage_kitchen"];
    return kitchenPerms.some(p => socketData.permissions.includes(p));
  }
  return false;
}

export function canJoinOrderRoom(socketData: SocketData, orderId: string, restaurantId: string): boolean {
  if (socketData.type === "staff") {
    return socketData.isSuperAdmin || socketData.restaurantId === restaurantId;
  }
  if (socketData.type === "customer") {
    return socketData.orderId === orderId && socketData.restaurantId === restaurantId;
  }
  return false;
}

export function getOrderRoom(orderId: string): string {
  return `order:${orderId}`;
}

export function getTenantRoom(restaurantId: string): string {
  return `tenant:${restaurantId}`;
}

export function getKitchenRoom(restaurantId: string): string {
  return `kitchen:${restaurantId}`;
}

export function getCustomerRoom(restaurantId: string): string {
  return `customers:${restaurantId}`;
}
