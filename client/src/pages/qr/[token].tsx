import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Utensils,
  Loader2,
  MapPin,
} from "lucide-react";

interface TokenData {
  restaurant: {
    id: string;
    name: string;
    logoUrl: string | null;
    currency: string;
    taxRate: string;
  };
  qrToken: {
    id: string;
    type: string;
  };
  orderingMode: "auto" | "manual";
  table?: {
    id: string;
    number: string;
    name: string | null;
    label: string;
  };
  requiresTableSelection: boolean;
}

interface Menu {
  id: string;
  name: string;
  categories: Category[];
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  isAvailable: boolean;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

interface Table {
  id: string;
  number: string;
  name: string | null;
  label: string;
}

export default function QROrderingPage({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const { data: tokenData, isLoading: loadingToken, error: tokenError } = useQuery<TokenData>({
    queryKey: ["/api/order", token],
    queryFn: async () => {
      const res = await fetch(`/api/order/${token}`);
      if (!res.ok) throw new Error("Invalid QR code");
      return res.json();
    },
  });

  const { data: menu, isLoading: loadingMenu } = useQuery<Menu>({
    queryKey: ["/api/order", token, "menu"],
    queryFn: async () => {
      const res = await fetch(`/api/order/${token}/menu`);
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
    enabled: !!tokenData,
  });

  const { data: tablesData } = useQuery<{ tables: Table[] }>({
    queryKey: ["/api/order", token, "tables"],
    queryFn: async () => {
      const res = await fetch(`/api/order/${token}/tables`);
      if (!res.ok) return { tables: [] };
      return res.json();
    },
    enabled: !!tokenData && tokenData.requiresTableSelection,
  });

  const tables = tablesData?.tables;

  useEffect(() => {
    if (menu?.categories?.[0]?.id) {
      setSelectedCategory(menu.categories[0].id);
    }
  }, [menu]);

  useEffect(() => {
    if (tokenData?.table?.id) {
      setSelectedTable(tokenData.table.id);
    }
  }, [tokenData]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          tableId: selectedTable || tokenData?.table?.id,
          items: cart.map(item => ({
            menuItemId: item.menuItem.id,
            quantity: item.quantity,
          })),
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to place order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Order placed successfully!" });
      setCart([]);
      setCartOpen(false);
      setLocation(`/order/status/${data.order.id}?token=${data.trackingToken}`);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.menuItem.id === item.id 
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
    toast({ title: `Added ${item.name} to cart` });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      const updated = prev.map(item => {
        if (item.menuItem.id === itemId) {
          const newQuantity = item.quantity + delta;
          return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
      return updated;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(item => item.menuItem.id !== itemId));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + parseFloat(item.menuItem.price) * item.quantity,
    0
  );

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const currentCategory = menu?.categories?.find(c => c.id === selectedCategory);

  if (loadingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenError || !tokenData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <Utensils className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Invalid QR Code</h2>
            <p className="text-muted-foreground mt-2">
              This QR code is not valid or has expired. Please scan a valid QR code.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Utensils className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold" data-testid="text-restaurant-name">
                {tokenData.restaurant.name}
              </h1>
              {tokenData.table && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {tokenData.table.label}
                </p>
              )}
            </div>
          </div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="relative" data-testid="button-cart">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0">
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col">
              <SheetHeader>
                <SheetTitle>Your Order</SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                {cart.length > 0 ? (
                  <div className="space-y-4 py-4">
                    {cart.map((item) => (
                      <div key={item.menuItem.id} className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium">{item.menuItem.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${(parseFloat(item.menuItem.price) * item.quantity).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => updateQuantity(item.menuItem.id, -1)}
                            data-testid={`button-decrease-${item.menuItem.id}`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => updateQuantity(item.menuItem.id, 1)}
                            data-testid={`button-increase-${item.menuItem.id}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFromCart(item.menuItem.id)}
                            data-testid={`button-remove-${item.menuItem.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">Your cart is empty</p>
                  </div>
                )}
              </ScrollArea>
              {cart.length > 0 && (
                <div className="border-t pt-4 space-y-4">
                  {tokenData.requiresTableSelection && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Table</label>
                      <Select value={selectedTable} onValueChange={setSelectedTable}>
                        <SelectTrigger data-testid="select-table">
                          <SelectValue placeholder="Choose your table" />
                        </SelectTrigger>
                        <SelectContent>
                          {tables?.map((table) => (
                            <SelectItem key={table.id} value={table.id}>
                              {table.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => createOrderMutation.mutate()}
                    disabled={createOrderMutation.isPending || (tokenData.requiresTableSelection && !selectedTable)}
                    data-testid="button-place-order"
                  >
                    {createOrderMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      "Place Order"
                    )}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Category Pills */}
      {menu?.categories && menu.categories.length > 0 && (
        <div className="sticky top-[61px] z-40 bg-background border-b">
          <ScrollArea className="max-w-2xl mx-auto">
            <div className="flex gap-2 p-4">
              {menu.categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  data-testid={`button-category-${category.id}`}
                >
                  {category.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Menu Items */}
      <main className="flex-1 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {loadingMenu ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : currentCategory?.items && currentCategory.items.length > 0 ? (
            <div className="space-y-4">
              {currentCategory.items.map((item) => (
                <Card 
                  key={item.id} 
                  className={!item.isAvailable ? "opacity-60" : ""}
                  data-testid={`menu-item-${item.id}`}
                >
                  <CardContent className="flex gap-4 p-4">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{item.name}</h3>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                        <p className="font-semibold text-primary">${item.price}</p>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {item.isAvailable ? (
                          <Button
                            size="sm"
                            onClick={() => addToCart(item)}
                            data-testid={`button-add-${item.id}`}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add
                          </Button>
                        ) : (
                          <Badge variant="secondary">Unavailable</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Utensils className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No items in this category</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Floating Cart Button */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto">
          <Button
            className="w-full h-14 text-lg"
            onClick={() => setCartOpen(true)}
            data-testid="button-view-cart"
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            View Cart ({cartItemCount} items) - ${cartTotal.toFixed(2)}
          </Button>
        </div>
      )}
    </div>
  );
}
