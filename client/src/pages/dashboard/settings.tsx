import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  QrCode,
  Layers,
  Loader2,
  Settings2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { SiStripe, SiPaypal } from "react-icons/si";

interface CredentialInfo {
  configured?: boolean;
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
  mode?: string;
}

interface RestaurantSettings {
  stripeEnabled: boolean;
  paypalEnabled: boolean;
  counterPaymentsEnabled: boolean;
  splitBillingEnabled: boolean;
  qrOrderingMode: "AUTO" | "MANUAL";
  defaultMenuId: string | null;
  stripeCredentials: CredentialInfo;
  paypalCredentials: CredentialInfo;
}

export default function SettingsPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const [stripeDialogOpen, setStripeDialogOpen] = useState(false);
  const [paypalDialogOpen, setPaypalDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<"stripe" | "paypal" | null>(null);

  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [showStripeSecret, setShowStripeSecret] = useState(false);

  const [paypalClientId, setPaypalClientId] = useState("");
  const [paypalClientSecret, setPaypalClientSecret] = useState("");
  const [paypalMode, setPaypalMode] = useState<"sandbox" | "live">("sandbox");
  const [showPaypalSecret, setShowPaypalSecret] = useState(false);

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
    stripeCredentials: (settingsData?.settings?.stripe_credentials as CredentialInfo) || { configured: false },
    paypalCredentials: (settingsData?.settings?.paypal_credentials as CredentialInfo) || { configured: false },
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
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async ({ provider, data }: { provider: string; data: Record<string, string> }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/payment-credentials/${provider}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to save credentials");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "settings"] });
      toast({ title: `${variables.provider === "stripe" ? "Stripe" : "PayPal"} credentials saved successfully` });
      if (variables.provider === "stripe") {
        setStripeDialogOpen(false);
        resetStripeForm();
      } else {
        setPaypalDialogOpen(false);
        resetPaypalForm();
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCredentialsMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/payment-credentials/${provider}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to remove credentials");
      }
      return res.json();
    },
    onSuccess: (_data, provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "settings"] });
      toast({ title: `${provider === "stripe" ? "Stripe" : "PayPal"} credentials removed` });
      setDeleteDialogOpen(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetStripeForm = () => {
    setStripeSecretKey("");
    setStripePublishableKey("");
    setStripeWebhookSecret("");
    setShowStripeSecret(false);
  };

  const resetPaypalForm = () => {
    setPaypalClientId("");
    setPaypalClientSecret("");
    setPaypalMode("sandbox");
    setShowPaypalSecret(false);
  };

  const handleToggle = (key: string, value: boolean) => {
    updateSettingMutation.mutate({ key, value: value.toString() });
  };

  const handleQrModeChange = (value: "AUTO" | "MANUAL") => {
    updateSettingMutation.mutate({ key: "qr_ordering_mode", value });
  };

  const handleSaveStripe = () => {
    if (!stripeSecretKey.trim() || !stripePublishableKey.trim()) {
      toast({ title: "Error", description: "Secret Key and Publishable Key are required", variant: "destructive" });
      return;
    }
    saveCredentialsMutation.mutate({
      provider: "stripe",
      data: {
        secretKey: stripeSecretKey.trim(),
        publishableKey: stripePublishableKey.trim(),
        ...(stripeWebhookSecret.trim() ? { webhookSecret: stripeWebhookSecret.trim() } : {}),
      },
    });
  };

  const handleSavePaypal = () => {
    if (!paypalClientId.trim() || !paypalClientSecret.trim()) {
      toast({ title: "Error", description: "Client ID and Client Secret are required", variant: "destructive" });
      return;
    }
    saveCredentialsMutation.mutate({
      provider: "paypal",
      data: {
        clientId: paypalClientId.trim(),
        clientSecret: paypalClientSecret.trim(),
        mode: paypalMode,
      },
    });
  };

  const isStripeFeatureEnabled = settingsData?.features?.stripe_payments === true;
  const isPaypalFeatureEnabled = settingsData?.features?.paypal_payments === true;

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
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#635BFF]/10">
                    <SiStripe className="h-5 w-5 text-[#635BFF]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">Stripe Payments</p>
                    <p className="text-sm text-muted-foreground">Accept card payments via Stripe</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={settings?.stripeEnabled ?? false}
                    onCheckedChange={(v) => handleToggle("stripe_enabled", v)}
                    disabled={updateSettingMutation.isPending || !isStripeFeatureEnabled}
                    data-testid="switch-stripe"
                  />
                </div>
              </div>
              {isStripeFeatureEnabled && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    {settings.stripeCredentials.configured ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 dark:text-green-400" data-testid="text-stripe-configured">Credentials configured</span>
                        <Badge variant="outline" className="text-xs no-default-active-elevate">
                          {settings.stripeCredentials.publishableKey || ""}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm text-orange-600 dark:text-orange-400" data-testid="text-stripe-not-configured">No credentials configured</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.stripeCredentials.configured && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setDeleteDialogOpen("stripe")}
                        data-testid="button-delete-stripe"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        resetStripeForm();
                        setStripeDialogOpen(true);
                      }}
                      data-testid="button-configure-stripe"
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                      {settings.stripeCredentials.configured ? "Update" : "Configure"}
                    </Button>
                  </div>
                </div>
              )}
              {!isStripeFeatureEnabled && (
                <p className="text-xs text-muted-foreground pt-1">Stripe payments must be enabled by the platform admin.</p>
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#003087]/10">
                    <SiPaypal className="h-5 w-5 text-[#003087]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">PayPal Payments</p>
                    <p className="text-sm text-muted-foreground">Accept payments via PayPal</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={settings?.paypalEnabled ?? false}
                    onCheckedChange={(v) => handleToggle("paypal_enabled", v)}
                    disabled={updateSettingMutation.isPending || !isPaypalFeatureEnabled}
                    data-testid="switch-paypal"
                  />
                </div>
              </div>
              {isPaypalFeatureEnabled && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    {settings.paypalCredentials.configured ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 dark:text-green-400" data-testid="text-paypal-configured">Credentials configured</span>
                        <Badge variant="outline" className="text-xs no-default-active-elevate">
                          {settings.paypalCredentials.mode === "live" ? "Live" : "Sandbox"}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm text-orange-600 dark:text-orange-400" data-testid="text-paypal-not-configured">No credentials configured</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.paypalCredentials.configured && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setDeleteDialogOpen("paypal")}
                        data-testid="button-delete-paypal"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        resetPaypalForm();
                        if (settings.paypalCredentials.configured && settings.paypalCredentials.mode) {
                          setPaypalMode(settings.paypalCredentials.mode as "sandbox" | "live");
                        }
                        setPaypalDialogOpen(true);
                      }}
                      data-testid="button-configure-paypal"
                    >
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                      {settings.paypalCredentials.configured ? "Update" : "Configure"}
                    </Button>
                  </div>
                </div>
              )}
              {!isPaypalFeatureEnabled && (
                <p className="text-xs text-muted-foreground pt-1">PayPal payments must be enabled by the platform admin.</p>
              )}
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

      <Dialog open={stripeDialogOpen} onOpenChange={(open: boolean) => {
        setStripeDialogOpen(open);
        if (!open) resetStripeForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiStripe className="h-5 w-5 text-[#635BFF]" />
              {settings.stripeCredentials.configured ? "Update Stripe Credentials" : "Configure Stripe"}
            </DialogTitle>
            <DialogDescription>
              Enter your Stripe API keys to accept card payments. You can find these in your
              Stripe Dashboard under Developers &gt; API keys.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {settings.stripeCredentials.configured && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p className="font-medium">Current credentials:</p>
                <p className="text-muted-foreground">Publishable Key: {settings.stripeCredentials.publishableKey}</p>
                <p className="text-muted-foreground">Secret Key: {settings.stripeCredentials.secretKey}</p>
                {settings.stripeCredentials.webhookSecret && (
                  <p className="text-muted-foreground">Webhook Secret: {settings.stripeCredentials.webhookSecret}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="stripe-publishable-key">
                Publishable Key <span className="text-destructive">*</span>
              </label>
              <Input
                id="stripe-publishable-key"
                placeholder="pk_test_..."
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                data-testid="input-stripe-publishable-key"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="stripe-secret-key">
                Secret Key <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Input
                  id="stripe-secret-key"
                  type={showStripeSecret ? "text" : "password"}
                  placeholder="sk_test_..."
                  value={stripeSecretKey}
                  onChange={(e) => setStripeSecretKey(e.target.value)}
                  data-testid="input-stripe-secret-key"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 top-0"
                  onClick={() => setShowStripeSecret(!showStripeSecret)}
                  data-testid="button-toggle-stripe-secret"
                >
                  {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="stripe-webhook-secret">
                Webhook Secret <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <Input
                id="stripe-webhook-secret"
                placeholder="whsec_..."
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                data-testid="input-stripe-webhook-secret"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStripeDialogOpen(false)} data-testid="button-cancel-stripe">
              Cancel
            </Button>
            <Button
              onClick={handleSaveStripe}
              disabled={saveCredentialsMutation.isPending || !stripeSecretKey.trim() || !stripePublishableKey.trim()}
              data-testid="button-save-stripe"
            >
              {saveCredentialsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paypalDialogOpen} onOpenChange={(open: boolean) => {
        setPaypalDialogOpen(open);
        if (!open) resetPaypalForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SiPaypal className="h-5 w-5 text-[#003087]" />
              {settings.paypalCredentials.configured ? "Update PayPal Credentials" : "Configure PayPal"}
            </DialogTitle>
            <DialogDescription>
              Enter your PayPal API credentials. You can find these in your PayPal Developer
              Dashboard under Apps & Credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {settings.paypalCredentials.configured && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p className="font-medium">Current credentials:</p>
                <p className="text-muted-foreground">Client ID: {settings.paypalCredentials.clientId}</p>
                <p className="text-muted-foreground">Client Secret: {settings.paypalCredentials.clientSecret}</p>
                <p className="text-muted-foreground">Mode: {settings.paypalCredentials.mode === "live" ? "Live" : "Sandbox"}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="paypal-client-id">
                Client ID <span className="text-destructive">*</span>
              </label>
              <Input
                id="paypal-client-id"
                placeholder="Your PayPal Client ID"
                value={paypalClientId}
                onChange={(e) => setPaypalClientId(e.target.value)}
                data-testid="input-paypal-client-id"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="paypal-client-secret">
                Client Secret <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Input
                  id="paypal-client-secret"
                  type={showPaypalSecret ? "text" : "password"}
                  placeholder="Your PayPal Client Secret"
                  value={paypalClientSecret}
                  onChange={(e) => setPaypalClientSecret(e.target.value)}
                  data-testid="input-paypal-client-secret"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPaypalSecret(!showPaypalSecret)}
                  data-testid="button-toggle-paypal-secret"
                >
                  {showPaypalSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="paypal-mode">Mode</label>
              <Select value={paypalMode} onValueChange={(v) => setPaypalMode(v as "sandbox" | "live")}>
                <SelectTrigger data-testid="select-paypal-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                  <SelectItem value="live">Live (Production)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Use Sandbox for testing. Switch to Live when ready to accept real payments.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaypalDialogOpen(false)} data-testid="button-cancel-paypal">
              Cancel
            </Button>
            <Button
              onClick={handleSavePaypal}
              disabled={saveCredentialsMutation.isPending || !paypalClientId.trim() || !paypalClientSecret.trim()}
              data-testid="button-save-paypal"
            >
              {saveCredentialsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialogOpen} onOpenChange={(open: boolean) => {
        if (!open) setDeleteDialogOpen(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleteDialogOpen === "stripe" ? "Stripe" : "PayPal"} Credentials</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the {deleteDialogOpen === "stripe" ? "Stripe" : "PayPal"} credentials?
              You will need to re-enter them to accept payments through this provider.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(null)} data-testid="button-cancel-delete-creds">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialogOpen && deleteCredentialsMutation.mutate(deleteDialogOpen)}
              disabled={deleteCredentialsMutation.isPending}
              data-testid="button-confirm-delete-creds"
            >
              {deleteCredentialsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remove Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
