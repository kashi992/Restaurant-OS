import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Clock,
  CheckCircle,
  ChefHat,
  Loader2,
} from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  tableId: string | null;
  createdAt: string;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

const ORDER_STATUSES = [
  { value: "pending", label: "Pending", icon: Clock, color: "bg-yellow-500/10 text-yellow-600" },
  { value: "confirmed", label: "Confirmed", icon: CheckCircle, color: "bg-blue-500/10 text-blue-600" },
  { value: "preparing", label: "Preparing", icon: ChefHat, color: "bg-orange-500/10 text-orange-600" },
  { value: "ready", label: "Ready", icon: CheckCircle, color: "bg-green-500/10 text-green-600" },
  { value: "served", label: "Served", icon: CheckCircle, color: "bg-purple-500/10 text-purple-600" },
  { value: "completed", label: "Completed", icon: CheckCircle, color: "bg-gray-500/10 text-gray-600" },
];

export default function OrdersPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/restaurants", restaurantId, "orders", statusFilter],
    queryFn: async () => {
      const endpoint = statusFilter === "active"
        ? `/api/restaurants/${restaurantId}/orders/live`
        : `/api/restaurants/${restaurantId}/orders?status=${statusFilter}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.orders;
    },
    enabled: !!accessToken && !!restaurantId,
    refetchInterval: 5000,
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
      toast({ title: "Order status updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    const statusInfo = ORDER_STATUSES.find(s => s.value === status);
    if (!statusInfo) return <Badge variant="outline">{status}</Badge>;
    return (
      <Badge className={statusInfo.color}>
        {statusInfo.label}
      </Badge>
    );
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const statusOrder = ["pending", "confirmed", "preparing", "ready", "served", "completed"];
    const currentIndex = statusOrder.indexOf(currentStatus);
    if (currentIndex < statusOrder.length - 1) {
      return statusOrder[currentIndex + 1];
    }
    return null;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Orders</h1>
          <p className="text-muted-foreground">Manage and track all orders</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="preparing">Preparing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="served">Served</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : orders && orders.length > 0 ? (
          <ScrollArea className="h-full">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pr-4">
              {orders.map((order) => (
                <Card key={order.id} data-testid={`order-card-${order.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <div>
                      <CardTitle className="text-lg">#{order.orderNumber}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(order.createdAt)}
                      </p>
                    </div>
                    {getStatusBadge(order.status)}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {order.items?.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>
                            {item.quantity}x {item.name}
                          </span>
                          <span className="text-muted-foreground">${item.totalPrice}</span>
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <p className="text-sm text-muted-foreground">
                          +{order.items.length - 3} more items
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="font-semibold">Total: ${order.total}</span>
                      {getNextStatus(order.status) && (
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({
                            orderId: order.id,
                            status: getNextStatus(order.status)!,
                          })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-next-status-${order.id}`}
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            `Mark ${getNextStatus(order.status)}`
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No orders</h3>
              <p className="text-muted-foreground">
                {statusFilter === "active" ? "No active orders at the moment." : "No orders with this status."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
