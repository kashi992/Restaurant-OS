import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  CheckCircle,
  ChefHat,
  Utensils,
  Package,
  Loader2,
} from "lucide-react";

interface OrderStatusResponse {
  order: {
    id: string;
    orderNumber: string;
    displayNumber: number | null;
    status: string;
    total: string;
    table: string | null;
    estimatedReadyAt: string | null;
    createdAt: string;
  };
  items: OrderItem[];
  statusHistory: StatusHistory[];
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: string;
  status: string;
  modifiers: Array<{ id: string; name: string; price: string }>;
}

interface StatusHistory {
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  createdAt: string;
}

const STATUS_STEPS = [
  { key: "pending", label: "Received", icon: Clock, description: "Order received" },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle, description: "Restaurant confirmed" },
  { key: "preparing", label: "Preparing", icon: ChefHat, description: "Being prepared" },
  { key: "ready", label: "Ready", icon: Package, description: "Ready for pickup/serving" },
  { key: "served", label: "Served", icon: Utensils, description: "Enjoy your meal!" },
];

export default function OrderStatusPage({ orderId }: { orderId: string }) {
  const [trackingToken, setTrackingToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTrackingToken(params.get("token"));
  }, []);

  const { data, isLoading, error } = useQuery<OrderStatusResponse>({
    queryKey: ["/api/order", orderId, "status"],
    queryFn: async () => {
      const res = await fetch(`/api/order/${orderId}/status`);
      if (!res.ok) throw new Error("Failed to fetch order status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const order = data?.order;
  const orderItems = data?.items || [];
  const statusHistory = data?.statusHistory || [];

  const getCurrentStepIndex = () => {
    if (!order) return 0;
    const index = STATUS_STEPS.findIndex(s => s.key === order.status);
    return index >= 0 ? index : 0;
  };

  const getProgress = () => {
    const currentIndex = getCurrentStepIndex();
    return ((currentIndex + 1) / STATUS_STEPS.length) * 100;
  };

  const formatTime = (dateString: string) => {
    let s = dateString.trim();
    if (!/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    }
    const date = new Date(s);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <Utensils className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Order Not Found</h2>
            <p className="text-muted-foreground mt-2">
              We couldn't find this order. It may have been cancelled or the link is invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStep = STATUS_STEPS[getCurrentStepIndex()];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6 py-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <currentStep.icon className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-order-number">
            Order #{order.displayNumber || order.orderNumber}
          </h1>
          <p className="text-lg text-muted-foreground mt-1">
            {currentStep.description}
          </p>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <Progress value={getProgress()} className="h-2 mb-6" />
            <div className="space-y-4">
              {STATUS_STEPS.map((step, index) => {
                const currentIndex = getCurrentStepIndex();
                const isCompleted = index <= currentIndex;
                const isCurrent = index === currentIndex;
                const historyEntry = statusHistory.find(h => h.toStatus === step.key);

                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-3 ${
                      isCompleted ? "text-foreground" : "text-muted-foreground"
                    }`}
                    data-testid={`status-step-${step.key}`}
                  >
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        isCompleted
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <span className="text-sm">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${isCurrent ? "text-primary" : ""}`}>
                        {step.label}
                      </p>
                      {historyEntry && (
                        <p className="text-sm text-muted-foreground">
                          {formatTime(historyEntry.createdAt)}
                        </p>
                      )}
                    </div>
                    {isCurrent && (
                      <Badge className="bg-primary/10 text-primary">Current</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Order Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="space-y-1" data-testid={`order-item-${item.id}`}>
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="text-muted-foreground">
                      ${parseFloat(item.totalPrice).toFixed(2)}
                    </span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="pl-4 space-y-0.5">
                      {item.modifiers.map((mod, idx) => (
                        <p key={idx} className="text-sm text-muted-foreground">
                          {mod.name}{parseFloat(mod.price) > 0 ? ` (+$${parseFloat(mod.price).toFixed(2)})` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t pt-4 font-semibold text-lg">
              <span>Total</span>
              <span>${parseFloat(order.total).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Order Time */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Order placed at {formatTime(order.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}
