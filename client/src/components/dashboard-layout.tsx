import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  Users,
  Settings,
  LogOut,
  Utensils,
  Monitor,
  ChefHat,
  QrCode,
  CreditCard,
  SplitSquareHorizontal,
} from "lucide-react";

const navItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard, feature: null },
  { title: "Menu", url: "/dashboard/menu", icon: UtensilsCrossed, feature: null },
  { title: "Tables", url: "/dashboard/tables", icon: Grid3X3, feature: null },
  { title: "Staff", url: "/dashboard/staff", icon: Users, feature: null },
  { title: "Settings", url: "/dashboard/settings", icon: Settings, feature: null },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  // Check if a feature is enabled (defaults to true if no feature requirement or no features loaded)
  const isFeatureEnabled = (featureKey: string | null) => {
    if (!featureKey) return true;
    if (!user?.features) return true;
    return user.features[featureKey] !== false;
  };

  const handleLogout = async () => {
    await logout();
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="p-4">
            <Link href="/dashboard">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                  <Utensils className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-semibold">Restaurant</span>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.filter((item) => isFeatureEnabled(item.feature)).map((item) => {
                    const isTablesWithQr = item.url === "/dashboard/tables" && isFeatureEnabled("qr_ordering");
                    const label = isTablesWithQr ? "Tables & QR" : item.title;
                    const Icon = isTablesWithQr ? QrCode : item.icon;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url}
                        >
                          <Link href={item.url}>
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {(isFeatureEnabled("pos") || isFeatureEnabled("kitchen_display")) && (
              <SidebarGroup>
                <SidebarGroupLabel>Operations</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {isFeatureEnabled("pos") && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location === "/pos"}>
                          <Link href="/pos">
                            <Monitor className="h-4 w-4" />
                            <span>Open POS</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                    {isFeatureEnabled("kitchen_display") && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location === "/pos/kitchen"}>
                          <Link href="/pos/kitchen">
                            <ChefHat className="h-4 w-4" />
                            <span>Kitchen Display</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter className="p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {user?.firstName?.charAt(0)}
                      {user?.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{user?.firstName} {user?.lastName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>
                  <p className="font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
