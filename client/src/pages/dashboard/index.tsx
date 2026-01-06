import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  DollarSign,
  Users,
  TrendingUp,
} from "lucide-react";

interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  activeOrders: number;
  tablesOccupied: number;
}

export default function DashboardHome() {
  const { accessToken, user } = useAuth();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/restaurants", user?.restaurantId, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${user?.restaurantId}/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        return { ordersToday: 0, revenueToday: 0, activeOrders: 0, tablesOccupied: 0 };
      }
      return res.json();
    },
    enabled: !!accessToken && !!user?.restaurantId,
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
                <p className="text-2xl font-bold">{stat.value}</p>
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
            <p className="text-muted-foreground text-sm">No recent orders to display.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to do</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">Open POS to start taking orders</p>
            <p className="text-sm">Manage your menu items</p>
            <p className="text-sm">Configure table settings</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
