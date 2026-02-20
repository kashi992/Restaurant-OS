import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { SocketProvider } from "@/lib/socket";
import { OrderNotificationBanner } from "@/components/order-notification";
import { ProtectedRoute, hasAnyPermission } from "@/components/protected-route";
import { AdminLayout } from "@/components/admin-layout";
import { DashboardLayout } from "@/components/dashboard-layout";
import { POSLayout } from "@/components/pos-layout";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import UnauthorizedPage from "@/pages/unauthorized";
import AdminDashboard from "@/pages/admin/index";
import CreateRestaurantPage from "@/pages/admin/restaurants/new";
import RestaurantDetailPage from "@/pages/admin/restaurants/[id]";
import DashboardHome from "@/pages/dashboard/index";
import MenuManager from "@/pages/dashboard/menu";
import TablesManager from "@/pages/dashboard/tables";
import StaffManager from "@/pages/dashboard/staff";
import SettingsPage from "@/pages/dashboard/settings";
import POSHome from "@/pages/pos/index";
import KitchenDisplay from "@/pages/pos/kitchen";
import OrdersPage from "@/pages/pos/orders";
import PaymentsPage from "@/pages/pos/payments";
import QROrderingPage from "@/pages/qr/[token]";
import OrderStatusPage from "@/pages/qr/status/[orderId]";

export function getDefaultRoute(user: { isSuperAdmin: boolean; permissions: string[]; role: string }): string {
  if (user.isSuperAdmin) return "/admin";

  const perms = user.permissions;
  const role = user.role?.toLowerCase();

  if (role === "kitchen") return "/pos/kitchen";
  if (role === "cashier") return "/pos/payments";
  if (role === "server") return "/pos/orders";

  if (hasAnyPermission(perms, ["staff:read", "settings:read"])) return "/dashboard";
  if (hasAnyPermission(perms, ["orders:read"])) return "/pos/orders";
  if (hasAnyPermission(perms, ["payments:read"])) return "/pos/payments";

  return "/dashboard";
}

function AppRouter() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/unauthorized" component={UnauthorizedPage} />

      {/* Public QR Ordering Routes */}
      <Route path="/order/:token">
        {(params) => <QROrderingPage token={params.token} />}
      </Route>
      <Route path="/order/status/:orderId">
        {(params) => <OrderStatusPage orderId={params.orderId} />}
      </Route>

      {/* Super Admin Routes */}
      <Route path="/admin/restaurants/new">
        <ProtectedRoute requireSuperAdmin>
          <AdminLayout>
            <CreateRestaurantPage />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/restaurants/:id">
        <ProtectedRoute requireSuperAdmin>
          <AdminLayout>
            <RestaurantDetailPage />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute requireSuperAdmin>
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>

      {/* Restaurant Dashboard Routes - permission-gated */}
      <Route path="/dashboard/menu">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["menu:read"]}>
          <DashboardLayout>
            <MenuManager />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/tables">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["tables:read"]}>
          <DashboardLayout>
            <TablesManager />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/staff">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["staff:read"]}>
          <DashboardLayout>
            <StaffManager />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard/settings">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["settings:read"]}>
          <DashboardLayout>
            <SettingsPage />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requireRestaurantAccess>
          <DashboardLayout>
            <DashboardHome />
          </DashboardLayout>
        </ProtectedRoute>
      </Route>

      {/* POS Routes - permission-gated */}
      <Route path="/pos/kitchen">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["orders:read"]}>
          <POSLayout>
            <KitchenDisplay />
          </POSLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pos/orders">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["orders:read"]}>
          <POSLayout>
            <OrdersPage />
          </POSLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pos/payments">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["payments:read"]}>
          <POSLayout>
            <PaymentsPage />
          </POSLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pos">
        <ProtectedRoute requireRestaurantAccess requiredPermissions={["orders:read"]}>
          <POSLayout>
            <OrdersPage />
          </POSLayout>
        </ProtectedRoute>
      </Route>

      {/* Default route based on user role */}
      <Route path="/">
        {isAuthenticated && user ? (
          <Redirect to={getDefaultRoute(user)} />
        ) : (
          <LoginPage />
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <TooltipProvider>
              <Toaster />
              <OrderNotificationBanner />
              <AppRouter />
            </TooltipProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
