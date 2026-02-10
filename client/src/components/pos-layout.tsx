import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  ClipboardList,
  ChefHat,
  CreditCard,
  ArrowLeft,
  Utensils,
} from "lucide-react";

const navItems = [
  { title: "Tables", url: "/pos", icon: LayoutGrid, feature: null },
  { title: "Orders", url: "/pos/orders", icon: ClipboardList, feature: null },
  { title: "Kitchen", url: "/pos/kitchen", icon: ChefHat, feature: "kitchen_display" },
  { title: "Payments", url: "/pos/payments", icon: CreditCard, feature: null },
];

export function POSLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const isFeatureEnabled = (featureKey: string | null) => {
    if (!featureKey) return true;
    if (!user?.features) return true;
    return user.features[featureKey] !== false;
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
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
          {navItems.filter((item) => isFeatureEnabled(item.feature)).map((item) => (
            <Link key={item.url} href={item.url}>
              <Button
                variant={location === item.url ? "secondary" : "ghost"}
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
