import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { hasPermission, hasAnyPermission } from "@/components/protected-route";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  ChefHat,
  CreditCard,
  ArrowLeft,
  Utensils,
} from "lucide-react";

const navItems = [
  { title: "Orders", url: "/pos/orders", icon: ClipboardList, feature: null, permission: "orders:read" },
  { title: "Kitchen", url: "/pos/kitchen", icon: ChefHat, feature: "kitchen_display", permission: "orders:read" },
  { title: "Payments", url: "/pos/payments", icon: CreditCard, feature: null, permission: "payments:read" },
];

export function POSLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const isFeatureEnabled = (featureKey: string | null) => {
    if (!featureKey) return true;
    if (!user?.features) return false;
    return user.features[featureKey] === true;
  };

  const perms = user?.permissions || [];
  const canAccessDashboard = hasAnyPermission(perms, ["staff:read", "settings:read", "menu:read", "tables:read"]);
  const backUrl = canAccessDashboard ? "/dashboard" : "/pos/orders";

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex items-center gap-4">
          <Link href={backUrl}>
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Utensils className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">POS</span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.filter((item) => isFeatureEnabled(item.feature) && hasPermission(user?.permissions || [], item.permission)).map((item) => (
            <Link key={item.url} href={item.url}>
              <Button
                variant={(location === item.url || (item.url === "/pos/orders" && location === "/pos")) ? "secondary" : "ghost"}
                size="sm"
                data-testid={`nav-${item.title.toLowerCase()}`}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.title}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {user?.firstName} {user?.lastName}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
