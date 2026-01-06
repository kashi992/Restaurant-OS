import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  ChefHat,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
}

export default function KitchenDisplay() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "kitchen"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/live`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.orders.filter((o: Order) => 
        ["confirmed", "preparing"].includes(o.status)
      );
    },
    enabled: !!accessToken && !!restaurantId,
    refetchInterval: 3000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      toast({ title: "Order updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getOrderAge = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
  };

  const getAgeColor = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - created.getTime()) / 60000);
    if (diffMins < 10) return "text-green-600 dark:text-green-400";
    if (diffMins < 20) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const confirmedOrders = orders?.filter(o => o.status === "confirmed") ?? [];
  const preparingOrders = orders?.filter(o => o.status === "preparing") ?? [];

  return (
    <div className="h-full flex flex-col p-6 bg-muted/30">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ChefHat className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Kitchen Display</h1>
            <p className="text-muted-foreground">Real-time order management</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-lg px-4 py-2">
            {confirmedOrders.length} New
          </Badge>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {preparingOrders.length} In Progress
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 grid gap-6 md:grid-cols-2">
          <Skeleton className="h-full w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      ) : (
        <div className="flex-1 grid gap-6 md:grid-cols-2 overflow-hidden">
          {/* New Orders Column */}
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              New Orders ({confirmedOrders.length})
            </h2>
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-4">
                {confirmedOrders.length > 0 ? (
                  confirmedOrders.map((order) => (
                    <Card key={order.id} className="border-l-4 border-l-yellow-500" data-testid={`kitchen-order-${order.id}`}>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-xl">#{order.orderNumber}</CardTitle>
                          <span className={`font-mono font-bold ${getAgeColor(order.createdAt)}`}>
                            <Clock className="h-4 w-4 inline mr-1" />
                            {getOrderAge(order.createdAt)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          {order.items?.map((item) => (
                            <div key={item.id} className="flex items-start gap-2 text-lg">
                              <Badge variant="secondary" className="font-bold">
                                {item.quantity}x
                              </Badge>
                              <div>
                                <span className="font-medium">{item.name}</span>
                                {item.notes && (
                                  <p className="text-sm text-orange-600 dark:text-orange-400">
                                    Note: {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={() => updateStatusMutation.mutate({
                            orderId: order.id,
                            status: "preparing",
                          })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-start-${order.id}`}
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              <ChefHat className="mr-2 h-5 w-5" />
                              Start Preparing
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No new orders
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Preparing Column */}
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-orange-500" />
              Preparing ({preparingOrders.length})
            </h2>
            <ScrollArea className="flex-1">
              <div className="space-y-4 pr-4">
                {preparingOrders.length > 0 ? (
                  preparingOrders.map((order) => (
                    <Card key={order.id} className="border-l-4 border-l-orange-500" data-testid={`kitchen-order-${order.id}`}>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-xl">#{order.orderNumber}</CardTitle>
                          <span className={`font-mono font-bold ${getAgeColor(order.createdAt)}`}>
                            <Clock className="h-4 w-4 inline mr-1" />
                            {getOrderAge(order.createdAt)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          {order.items?.map((item) => (
                            <div key={item.id} className="flex items-start gap-2 text-lg">
                              <Badge variant="secondary" className="font-bold">
                                {item.quantity}x
                              </Badge>
                              <div>
                                <span className="font-medium">{item.name}</span>
                                {item.notes && (
                                  <p className="text-sm text-orange-600 dark:text-orange-400">
                                    Note: {item.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <Button
                          className="w-full bg-green-600 hover:bg-green-700"
                          size="lg"
                          onClick={() => updateStatusMutation.mutate({
                            orderId: order.id,
                            status: "ready",
                          })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-ready-${order.id}`}
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="mr-2 h-5 w-5" />
                              Mark Ready
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No orders being prepared
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
