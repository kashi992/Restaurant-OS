import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Minus,
  Clock,
  CheckCircle,
  ChefHat,
  Loader2,
  ArrowLeft,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useLocation } from "wouter";

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

interface Category {
  id: string;
  name: string;
  menuId: string;
}

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
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
  const [, setLocation] = useLocation();
  const restaurantId = user?.restaurantId;
  const [statusFilter, setStatusFilter] = useState<string>("active");
  
  // Parse URL params
  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get("table");
  const isNewOrder = urlParams.get("new") === "true";
  
  // New order state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

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
    enabled: !!accessToken && !!restaurantId && !isNewOrder,
    refetchInterval: 5000,
  });

  // Fetch categories
  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/restaurants", restaurantId, "categories"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/categories`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && isNewOrder,
  });

  // Fetch menu items
  const { data: menuItems, isLoading: loadingItems } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "menu-items"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && isNewOrder,
  });

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const items = cart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: "",
      }));
      
      const res = await fetch(`/api/restaurants/${restaurantId}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          tableId: tableId || null,
          items,
          notes: "",
          source: "pos",
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Order created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      setCart([]);
      setLocation("/pos/orders");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) {
        return prev.map(c =>
          c.menuItemId === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, {
        menuItemId: item.id,
        name: item.name,
        price: parseFloat(item.price),
        quantity: 1,
      }];
    });
  };

  const updateCartQuantity = (menuItemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.menuItemId === menuItemId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(item => item.menuItemId !== menuItemId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

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

  // Get items by category
  const getItemsByCategory = (categoryId: string) => {
    return menuItems?.filter(item => item.categoryId === categoryId && item.isAvailable) || [];
  };

  // If creating new order, show the order builder UI
  if (isNewOrder && tableId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 p-4 border-b">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/pos")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-new-order-title">New Order</h1>
            <p className="text-sm text-muted-foreground">Table {tableId.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Menu Items Panel */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h2 className="font-medium">Menu Items</h2>
              <p className="text-sm text-muted-foreground">Select items to add to the order</p>
            </div>
            
            {loadingItems ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : categories && categories.length > 0 ? (
              <ScrollArea className="flex-1 p-4">
                <Accordion type="multiple" className="space-y-2">
                  {categories.map(category => {
                    const categoryItems = getItemsByCategory(category.id);
                    if (categoryItems.length === 0) return null;
                    return (
                      <AccordionItem 
                        key={category.id} 
                        value={category.id}
                        className="border rounded-lg"
                      >
                        <AccordionTrigger className="px-4 hover:no-underline">
                          <span className="font-medium">{category.name}</span>
                          <Badge variant="secondary" className="ml-2">
                            {categoryItems.length}
                          </Badge>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="grid gap-2">
                            {categoryItems.map(item => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover-elevate"
                                onClick={() => addToCart(item)}
                                data-testid={`menu-item-${item.id}`}
                              >
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold">${parseFloat(item.price).toFixed(2)}</span>
                                  <Button size="icon" variant="ghost">
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            ) : menuItems && menuItems.length > 0 ? (
              <ScrollArea className="flex-1 p-4">
                <div className="grid gap-2">
                  {menuItems.filter(i => i.isAvailable).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover-elevate"
                      onClick={() => addToCart(item)}
                      data-testid={`menu-item-${item.id}`}
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">${parseFloat(item.price).toFixed(2)}</span>
                        <Button size="icon" variant="ghost">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No menu items</h3>
                <p className="text-muted-foreground text-center">
                  Add menu items in the Dashboard first to create orders.
                </p>
                <Button 
                  className="mt-4" 
                  variant="outline"
                  onClick={() => setLocation("/dashboard/menu")}
                >
                  Go to Menu Manager
                </Button>
              </div>
            )}
          </div>

          {/* Cart Panel */}
          <div className="w-80 border-l flex flex-col bg-muted/30">
            <div className="p-4 border-b flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <h2 className="font-medium">Current Order</h2>
              <Badge variant="secondary">{cart.length}</Badge>
            </div>
            
            <ScrollArea className="flex-1 p-4">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Cart is empty</p>
                  <p className="text-sm">Click items to add them</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <Card key={item.menuItemId} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${item.price.toFixed(2)} each
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeFromCart(item.menuItemId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateCartQuantity(item.menuItemId, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateCartQuantity(item.menuItemId, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="font-semibold">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t space-y-4">
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Total</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || createOrderMutation.isPending}
                onClick={() => createOrderMutation.mutate()}
                data-testid="button-place-order"
              >
                {createOrderMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Order...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Place Order
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default orders list view
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
