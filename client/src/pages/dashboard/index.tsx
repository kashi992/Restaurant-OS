import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  DollarSign,
  Users,
  TrendingUp,
  Monitor,
  UtensilsCrossed,
  Grid3X3,
  ChefHat,
  ArrowRight,
} from "lucide-react";

interface RecentOrder {
  id: string;
  orderNumber: string;
  displayNumber: number | null;
  status: string;
  total: string;
  source: string;
  orderType: string;
  customerName: string | null;
  createdAt: string;
}

interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  activeOrders: number;
  tablesOccupied: number;
  recentOrders: RecentOrder[];
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    confirmed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    preparing: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    ready: "bg-green-500/10 text-green-600 dark:text-green-400",
    served: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    completed: "bg-green-500/10 text-green-600 dark:text-green-400",
    cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Badge className={styles[status] || ""} data-testid={`badge-status-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatTimeAgo(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function DashboardHome() {
  const { accessToken, user } = useAuth();

  const isFeatureEnabled = (key: string) => {
    if (!user?.features) return true;
    return user.features[key] !== false;
  };

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/restaurants", user?.restaurantId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${user?.restaurantId}/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        return { ordersToday: 0, revenueToday: 0, activeOrders: 0, tablesOccupied: 0, recentOrders: [] };
      }
      return res.json();
    },
    enabled: !!accessToken && !!user?.restaurantId,
    refetchInterval: 30000,
  });

  const statCards = [
    {
      title: "Orders Today",
      value: stats?.ordersToday ?? 0,
      icon: ClipboardList,
      description: "Total orders placed today",
    },
    {
      title: "Revenue Today",
      value: `$${(stats?.revenueToday ?? 0).toFixed(2)}`,
      icon: DollarSign,
      description: "Total revenue generated",
    },
    {
      title: "Active Orders",
      value: stats?.activeOrders ?? 0,
      icon: TrendingUp,
      description: "Orders in progress",
    },
    {
      title: "Tables Occupied",
      value: stats?.tablesOccupied ?? 0,
      icon: Users,
      description: "Currently seated",
    },
  ];

  const quickActions = [
    ...(isFeatureEnabled("pos") ? [{
      title: "Open POS",
      description: "Start taking orders",
      icon: Monitor,
      href: "/pos",
    }] : []),
    {
      title: "Manage Menu",
      description: "Add or edit menu items",
      icon: UtensilsCrossed,
      href: "/dashboard/menu",
    },
    {
      title: "Manage Tables",
      description: "Configure table settings",
      icon: Grid3X3,
      href: "/dashboard/tables",
    },
    ...(isFeatureEnabled("kitchen_display") ? [{
      title: "Kitchen Display",
      description: "View kitchen orders",
      icon: ChefHat,
      href: "/pos/kitchen",
    }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          statCards.map((stat) => (
            <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid={`text-stat-value-${stat.title.toLowerCase().replace(/\s+/g, "-")}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest orders from your restaurant</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
              <div className="space-y-3">
                {stats.recentOrders.slice(0, 5).map((order) => (
                  <Link key={order.id} href={`/pos/orders`}>
                    <div
                      className="flex items-center justify-between gap-2 rounded-md border p-3 hover-elevate cursor-pointer"
                      data-testid={`row-order-${order.id}`}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">#{order.displayNumber || order.orderNumber}</span>
                          {getStatusBadge(order.status)}
                          <Badge variant="outline" className="text-xs">
                            {order.source.toUpperCase()}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {order.customerName || "Walk-in"} · {formatTimeAgo(order.createdAt)}
                        </span>
                      </div>
                      <span className="font-semibold text-sm whitespace-nowrap" data-testid={`text-order-total-${order.id}`}>
                        ${parseFloat(order.total).toFixed(2)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm" data-testid="text-no-orders">No recent orders to display.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to do</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div
                  className="flex items-center gap-3 rounded-md border p-3 hover-elevate cursor-pointer"
                  data-testid={`link-action-${action.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                    <action.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
