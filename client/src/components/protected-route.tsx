import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
  requireRestaurantAccess?: boolean;
  requiredPermissions?: string[];
}

export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes("*")) return true;
  return userPermissions.includes(required);
}

export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  if (userPermissions.includes("*")) return true;
  return required.some((perm) => userPermissions.includes(perm));
}

export function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requireRestaurantAccess = false,
  requiredPermissions = [],
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect to="/login" />;
  }

  if (requireSuperAdmin && !user.isSuperAdmin) {
    return <Redirect to="/unauthorized" />;
  }

  if (requireRestaurantAccess && !user.restaurantId && !user.isSuperAdmin) {
    return <Redirect to="/unauthorized" />;
  }

  if (requiredPermissions.length > 0) {
    const hasAll = requiredPermissions.every(
      (perm) => hasPermission(user.permissions, perm) || user.isSuperAdmin
    );
    if (!hasAll) {
      return <Redirect to="/unauthorized" />;
    }
  }

  return <>{children}</>;
}
