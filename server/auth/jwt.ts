import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-for-testing-only";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + "-refresh";
const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export interface AccessTokenPayload {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  restaurantId?: string;
  roleId?: string;
  roleName?: string;
  permissions?: string[];
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export function generateAccessToken(payload: AccessTokenPayload): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
  return { token, expiresAt };
}

export function generateRefreshToken(userId: string): { token: string; tokenId: string; expiresAt: Date } {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const payload: RefreshTokenPayload = { userId, tokenId };
  const token = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  return { token, tokenId, expiresAt };
}

export function generateTokenPair(accessPayload: AccessTokenPayload): TokenPair {
  const access = generateAccessToken(accessPayload);
  const refresh = generateRefreshToken(accessPayload.userId);
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
