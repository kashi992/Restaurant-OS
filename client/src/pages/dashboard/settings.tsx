import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  CreditCard,
  QrCode,
  Layers,
  Loader2,
} from "lucide-react";

interface RestaurantSettings {
  stripeEnabled: boolean;
  paypalEnabled: boolean;
  counterPaymentsEnabled: boolean;
  splitBillingEnabled: boolean;
  qrOrderingMode: "AUTO" | "MANUAL";
  defaultMenuId: string | null;
}

export default function SettingsPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const { data: settingsData, isLoading } = useQuery<{ settings: Record<string, unknown>; features: Record<string, boolean> }>({
    queryKey: ["/api/restaurants", restaurantId, "settings"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const settings: RestaurantSettings = {
    stripeEnabled: settingsData?.settings?.stripe_enabled === "true" || settingsData?.settings?.stripe_enabled === true,
    paypalEnabled: settingsData?.settings?.paypal_enabled === "true" || settingsData?.settings?.paypal_enabled === true,
    counterPaymentsEnabled: settingsData?.settings?.counter_payments_enabled === "true" || settingsData?.settings?.counter_payments_enabled === true,
    splitBillingEnabled: settingsData?.settings?.split_billing_enabled === "true" || settingsData?.settings?.split_billing_enabled === true,
    qrOrderingMode: (settingsData?.settings?.qr_ordering_mode as "AUTO" | "MANUAL") || "AUTO",
    defaultMenuId: settingsData?.settings?.default_menu_id as string | null,
  };

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/settings/${key}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "settings"] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (key: string, value: boolean) => {
    updateSettingMutation.mutate({ key, value: value.toString() });
  };

  const handleQrModeChange = (value: "AUTO" | "MANUAL") => {
    updateSettingMutation.mutate({ key: "qr_ordering_mode", value });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">Configure your restaurant settings</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </CardTitle>
            <CardDescription>
              Enable or disable payment methods for your restaurant. These must be enabled by the
              platform admin first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">Stripe Payments</p>
                <p className="text-sm text-muted-foreground">Accept card payments via Stripe</p>
              </div>
              <Switch
                checked={settings?.stripeEnabled ?? false}
                onCheckedChange={(v) => handleToggle("stripe_enabled", v)}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-stripe"
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">PayPal Payments</p>
                <p className="text-sm text-muted-foreground">Accept payments via PayPal</p>
              </div>
              <Switch
                checked={settings?.paypalEnabled ?? false}
                onCheckedChange={(v) => handleToggle("paypal_enabled", v)}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-paypal"
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">Counter Payments</p>
                <p className="text-sm text-muted-foreground">Accept cash and counter payments</p>
              </div>
              <Switch
                checked={settings?.counterPaymentsEnabled ?? false}
                onCheckedChange={(v) => handleToggle("counter_payments_enabled", v)}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-counter"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Split Billing
            </CardTitle>
            <CardDescription>
              Allow customers to split bills when paying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">Enable Split Billing</p>
                <p className="text-sm text-muted-foreground">
                  Customers can split their bill by items, amount, or equally
                </p>
              </div>
              <Switch
                checked={settings?.splitBillingEnabled ?? false}
                onCheckedChange={(v) => handleToggle("split_billing_enabled", v)}
                disabled={updateSettingMutation.isPending}
                data-testid="switch-split-billing"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Ordering Mode
            </CardTitle>
            <CardDescription>
              Configure how customers select their table when ordering via QR code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex-1">
                <p className="font-medium">Table Selection Mode</p>
                <p className="text-sm text-muted-foreground">
                  AUTO: Table is determined by QR code. MANUAL: Customer selects table.
                </p>
              </div>
              <Select
                value={settings?.qrOrderingMode ?? "AUTO"}
                onValueChange={handleQrModeChange}
                disabled={updateSettingMutation.isPending}
              >
                <SelectTrigger className="w-32" data-testid="select-qr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">AUTO</SelectItem>
                  <SelectItem value="MANUAL">MANUAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {updateSettingMutation.isPending && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-card border p-4 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Saving...</span>
        </div>
      )}
    </div>
  );
}
