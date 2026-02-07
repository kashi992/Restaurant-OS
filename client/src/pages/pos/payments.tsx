import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  DollarSign,
  Banknote,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  paidAmount: string;
}

interface PaymentMethodConfig {
  id: string;
  label: string;
  icon: "cash" | "card";
  method: string;
}

function buildAvailableMethods(
  paymentMethods?: { cash?: boolean; counter?: boolean; card?: boolean; stripe?: boolean; paypal?: boolean } | null,
  features?: Record<string, boolean> | null,
): PaymentMethodConfig[] {
  const methods: PaymentMethodConfig[] = [];

  const cashEnabled = paymentMethods
    ? (paymentMethods.cash === true || paymentMethods.counter === true)
    : (features?.counter_payments !== false);

  const cardEnabled = paymentMethods
    ? (paymentMethods.card === true || paymentMethods.stripe === true)
    : (features?.stripe_payments === true);

  if (cashEnabled) {
    methods.push({ id: "counter", label: "Cash / Counter", icon: "cash", method: "counter" });
  }
  if (cardEnabled) {
    methods.push({ id: "card", label: "Card", icon: "card", method: "card" });
  }

  return methods;
}

export default function PaymentsPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;
  const paymentMethods = user?.paymentMethods;
  const features = user?.features as Record<string, boolean> | undefined;

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [tipAmount, setTipAmount] = useState("0");

  const availableMethods = buildAvailableMethods(paymentMethods, features);
  const hasAnyMethod = availableMethods.length > 0;
  const defaultMethod = hasAnyMethod ? availableMethods[0].method : "";

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "unpaid"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/live`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.orders.filter((o: Order) => 
        ["ready", "served"].includes(o.status)
      );
    },
    enabled: !!accessToken && !!restaurantId,
    refetchInterval: 5000,
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ orderId, amount, method, tip }: { 
      orderId: string; 
      amount: string; 
      method: string;
      tip: string;
    }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ 
          amount: parseFloat(amount),
          method,
          tipAmount: parseFloat(tip) || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      toast({ title: "Payment recorded successfully" });
      setPayDialogOpen(false);
      setSelectedOrder(null);
      setTipAmount("0");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openPayDialog = (order: Order) => {
    setSelectedOrder(order);
    setPaymentMethod(defaultMethod);
    setTipAmount("0");
    setPayDialogOpen(true);
  };

  const getRemainingBalance = (order: Order) => {
    return (parseFloat(order.total) - parseFloat(order.paidAmount || "0")).toFixed(2);
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Payments</h1>
          <p className="text-muted-foreground">Process payments for completed orders</p>
        </div>
        {hasAnyMethod && (
          <div className="flex items-center gap-2">
            {availableMethods.map((m) => (
              <Badge key={m.id} variant="outline" className="no-default-active-elevate" data-testid={`badge-method-${m.id}`}>
                {m.icon === "cash" ? <Banknote className="mr-1 h-3 w-3" /> : <CreditCard className="mr-1 h-3 w-3" />}
                {m.label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {!hasAnyMethod && (
        <Card className="mb-6" data-testid="card-no-methods">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium">No payment methods enabled</p>
              <p className="text-sm text-muted-foreground">Please contact admin to enable payment methods for this restaurant.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : orders && orders.length > 0 ? (
          <ScrollArea className="h-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pr-4">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`payment-card-${order.id}`}>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                    <CardTitle className="text-lg">#{order.orderNumber}</CardTitle>
                    <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 no-default-active-elevate">
                      {order.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-semibold">${order.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span>${order.paidAmount || "0.00"}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="font-medium">Balance Due</span>
                        <span className="font-bold text-lg">${getRemainingBalance(order)}</span>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => openPayDialog(order)}
                      disabled={parseFloat(getRemainingBalance(order)) <= 0 || !hasAnyMethod}
                      data-testid={`button-pay-${order.id}`}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Process Payment
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-lg font-medium" data-testid="text-all-caught-up">All caught up!</h3>
              <p className="text-muted-foreground">No pending payments at the moment.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Payment - #{selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>Select payment method and complete the transaction</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted">
                <div className="flex justify-between mb-2">
                  <span>Order Total</span>
                  <span className="font-bold">${selectedOrder.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Balance Due</span>
                  <span className="font-bold text-lg">${getRemainingBalance(selectedOrder)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Method</label>
                {availableMethods.length > 1 ? (
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger data-testid="select-payment-method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMethods.map((m) => (
                        <SelectItem key={m.id} value={m.method} data-testid={`option-method-${m.id}`}>
                          <div className="flex items-center gap-2">
                            {m.icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                            {m.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : availableMethods.length === 1 ? (
                  <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50" data-testid="text-single-method">
                    {availableMethods[0].icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    <span className="text-sm">{availableMethods[0].label}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/50 bg-destructive/10" data-testid="text-no-methods-warning">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">No payment methods enabled. Contact admin.</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Tip Amount (optional)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-tip"
                />
              </div>

              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total to Collect</span>
                  <span data-testid="text-total-to-collect">
                    ${(parseFloat(getRemainingBalance(selectedOrder)) + parseFloat(tipAmount || "0")).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button
              onClick={() => selectedOrder && paymentMethod && recordPaymentMutation.mutate({
                orderId: selectedOrder.id,
                amount: getRemainingBalance(selectedOrder),
                method: paymentMethod,
                tip: tipAmount,
              })}
              disabled={recordPaymentMutation.isPending || !paymentMethod || !hasAnyMethod}
              data-testid="button-confirm-payment"
            >
              {recordPaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Complete Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
