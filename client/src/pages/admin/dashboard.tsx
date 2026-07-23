import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  CheckCircle2,
  Ban,
  AlertTriangle,
  Clock,
  ChevronRight,
} from "lucide-react";

interface AdminStats {
  totalRestaurants: number;
  active: number;
  suspended: number;
  expired: number;
  expiringSoon: number;
  totalStaff: number;
  recentActivity: {
    id: string;
    action: string;
    targetName: string | null;
    targetType: string | null;
    createdAt: string;
  }[];
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  highlight,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  highlight?: "warning" | "danger" | "success";
}) {
  const colorMap = {
    warning: "text-orange-500",
    danger: "text-destructive",
    success: "text-green-600 dark:text-green-400",
  };
  const color = highlight ? colorMap[highlight] : "text-primary";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${color}`}>{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatAction(action: string, targetName: string | null, targetType: string | null) {
  const name = targetName ?? targetType ?? "unknown";
  return `${action.replace(/_/g, " ")} — ${name}`;
}

export default function AdminDashboardHome() {
  const { accessToken, user } = useAuth();

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !!accessToken,
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.firstName}. Here's what's happening on the platform.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-28" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Total Restaurants"
              value={stats?.totalRestaurants ?? 0}
              icon={Building2}
            />
            <StatCard
              title="Active"
              value={stats?.active ?? 0}
              icon={CheckCircle2}
              highlight="success"
              description="Currently operating"
            />
            <StatCard
              title="Total Staff"
              value={stats?.totalStaff ?? 0}
              icon={Users}
              description="Across all restaurants"
            />
            <StatCard
              title="Expiring Soon"
              value={stats?.expiringSoon ?? 0}
              icon={Clock}
              highlight={stats?.expiringSoon ? "warning" : undefined}
              description="Subscriptions within 30 days"
            />
            <StatCard
              title="Suspended"
              value={stats?.suspended ?? 0}
              icon={Ban}
              highlight={stats?.suspended ? "danger" : undefined}
            />
            <StatCard
              title="Expired"
              value={stats?.expired ?? 0}
              icon={AlertTriangle}
              highlight={stats?.expired ? "danger" : undefined}
            />
          </>
        )}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 5 admin actions on the platform</CardDescription>
          </div>
          <Link href="/admin/restaurants">
            <Button variant="ghost" size="sm">
              View Restaurants
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : stats?.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {stats?.recentActivity.map((log) => (
                <li key={log.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="capitalize text-foreground">
                    {formatAction(log.action, log.targetName, log.targetType)}
                  </span>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {formatTimeAgo(log.createdAt)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
