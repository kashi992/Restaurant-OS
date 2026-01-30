import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Settings,
  Shield,
  Globe,
  Calendar,
  Clock,
} from "lucide-react";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  subscriptionStartAt: string | null;
  subscriptionEndAt: string | null;
  isSuspended: boolean;
  daysRemaining: number | null;
}

interface FeatureAllowlist {
  restaurantId: string;
  featureKey: string;
  enabled: boolean;
}

const MASTER_FEATURES = [
  { key: "pos", label: "POS System", description: "Point of Sale functionality" },
  { key: "qr_ordering", label: "QR Ordering", description: "Customer QR code ordering" },
  { key: "kitchen_display", label: "Kitchen Display", description: "Kitchen order management" },
  { key: "split_billing", label: "Split Billing", description: "Bill splitting for tables" },
  { key: "stripe_payments", label: "Stripe Payments", description: "Card payments via Stripe" },
  { key: "paypal_payments", label: "PayPal Payments", description: "PayPal payment processing" },
  { key: "counter_payments", label: "Counter Payments", description: "Cash/counter payments" },
  { key: "modifiers", label: "Item Modifiers", description: "Menu item customization" },
  { key: "inventory", label: "Inventory Management", description: "Stock tracking" },
  { key: "reporting", label: "Reports & Analytics", description: "Sales and performance reports" },
];

export default function RestaurantDetailPage() {
  const [, params] = useRoute("/admin/restaurants/:id");
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const restaurantId = params?.id;

  const { data: restaurantData, isLoading: loadingRestaurant } = useQuery<{
    restaurant: Restaurant;
    features: Record<string, { isEnabled: boolean; expiresAt: string | null }>;
    staffCount: number;
  }>({
    queryKey: ["/api/admin/restaurants", restaurantId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch restaurant");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const restaurant = restaurantData?.restaurant;
  const features = restaurantData?.features || {};

  const toggleFeatureMutation = useMutation({
    mutationFn: async ({ featureKey, enabled }: { featureKey: string; enabled: boolean }) => {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}/features`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          features: {
            [featureKey]: {
              isEnabled: enabled,
              expiresAt: null // or omit if not needed
            }
          }
        }),
      });
      if (!res.ok) throw new Error("Failed to toggle feature");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants", restaurantId] });
      toast({ title: "Feature updated", description: "Feature toggle has been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isFeatureEnabled = (key: string) => {
    return features?.[key]?.isEnabled ?? false;
  };

  const extendMutation = useMutation({
    mutationFn: async (months: number) => {
      const res = await fetch(`/api/admin/restaurants/${restaurantId}/extend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ months }),
      });
      if (!res.ok) throw new Error("Failed to extend subscription");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Subscription Extended",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants", restaurantId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to extend subscription",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Active</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended (Manual)</Badge>;
      case "expired":
        return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400">Expired</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  if (loadingRestaurant) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Restaurant not found</p>
        <Link href="/admin">
          <Button className="mt-4">Back to Restaurants</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold" data-testid="text-restaurant-name">
              {restaurant.name}
            </h1>
            {getStatusBadge(restaurant.status)}
          </div>
          <p className="text-muted-foreground">/{restaurant.slug}</p>
        </div>
      </div>

      <Tabs defaultValue="subscription">
        <TabsList className="flex-wrap">
          <TabsTrigger value="subscription" data-testid="tab-subscription">
            <Calendar className="mr-2 h-4 w-4" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">
            <Shield className="mr-2 h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="domains" data-testid="tab-domains">
            <Globe className="mr-2 h-4 w-4" />
            Domains
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Subscription Status
              </CardTitle>
              <CardDescription>
                Manage subscription period and status for this restaurant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Current Status</label>
                  <div>{getStatusBadge(restaurant.status)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Days Remaining</label>
                  <div className={`font-medium ${
                    restaurant.daysRemaining !== null && restaurant.daysRemaining < 30 
                      ? "text-orange-500" 
                      : ""
                  }`}>
                    {restaurant.daysRemaining !== null ? `${restaurant.daysRemaining} days` : "N/A"}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Subscription Start</label>
                  <div className="font-medium">{formatDate(restaurant.subscriptionStartAt)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Subscription End</label>
                  <div className={`font-medium ${restaurant.status === "expired" ? "text-destructive" : ""}`}>
                    {formatDate(restaurant.subscriptionEndAt)}
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Extend Subscription
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 6, 12].map((months) => (
                    <Button
                      key={months}
                      variant="outline"
                      onClick={() => extendMutation.mutate(months)}
                      disabled={extendMutation.isPending}
                      data-testid={`button-extend-${months}`}
                    >
                      +{months} {months === 1 ? "Month" : "Months"}
                    </Button>
                  ))}
                </div>
                {extendMutation.isPending && (
                  <p className="text-sm text-muted-foreground mt-2">Extending subscription...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Feature Allowlist
              </CardTitle>
              <CardDescription>
                Control which features this restaurant can access. These are hard permissions
                that override restaurant-level settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRestaurant ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {MASTER_FEATURES.map((feature) => (
                    <div
                      key={feature.key}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      data-testid={`feature-row-${feature.key}`}
                    >
                      <div>
                        <p className="font-medium">{feature.label}</p>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                      <Switch
                        checked={isFeatureEnabled(feature.key)}
                        onCheckedChange={(enabled) =>
                          toggleFeatureMutation.mutate({ featureKey: feature.key, enabled })
                        }
                        disabled={toggleFeatureMutation.isPending}
                        data-testid={`switch-feature-${feature.key}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Provider Allowlist
              </CardTitle>
              <CardDescription>
                Enable or disable payment providers for this restaurant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {["stripe_payments", "paypal_payments", "counter_payments"].map((key) => {
                  const feature = MASTER_FEATURES.find((f) => f.key === key);
                  if (!feature) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 rounded-lg border"
                      data-testid={`payment-row-${key}`}
                    >
                      <div>
                        <p className="font-medium">{feature.label}</p>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                      </div>
                      <Switch
                        checked={isFeatureEnabled(key)}
                        onCheckedChange={(enabled) =>
                          toggleFeatureMutation.mutate({ featureKey: key, enabled })
                        }
                        disabled={toggleFeatureMutation.isPending}
                        data-testid={`switch-payment-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Restaurant Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                  <p>{restaurant.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Slug</p>
                  <p>/{restaurant.slug}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Timezone</p>
                  <p>{restaurant.timezone}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  {getStatusBadge(restaurant.status)}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Custom Domains
              </CardTitle>
              <CardDescription>
                Configure custom domains for this restaurant's ordering pages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Domain management coming soon. Currently, the restaurant is accessible at:
              </p>
              <code className="mt-2 block rounded bg-muted p-2 text-sm">
                /order/{restaurant.slug}
              </code>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
