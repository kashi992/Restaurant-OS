import { useState, useEffect, useMemo } from "react";
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
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  Utensils,
  Loader2,
  MapPin,
  X,
  ChevronUp,
  ChevronDown,
  Check,
  Circle,
} from "lucide-react";

import LuxeDarkTheme from "./themes/luxe-dark";
import FreshMinimalTheme from "./themes/fresh-minimal";
import WarmSpiceTheme from "./themes/warm-spice";

type QrTemplate = "luxe-dark" | "fresh-minimal" | "warm-spice";

// ── Per-theme color overrides (all optional — themes have built-in defaults) ──
interface ThemeColors {
  bg?: string;
  primary?: string;
  primaryLight?: string;
  primaryDark?: string;
  text?: string;
  surface?: string;
}

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
  qrTemplate?: QrTemplate;
  table?: {
    id: string;
    number: string;
    name: string | null;
    label: string;
  };
  requiresTableSelection: boolean;
  paymentMethods?: {
    card: boolean;
    stripe: boolean;
    paypal: boolean;
  };
  qrThemeColors?: ThemeColors | null;
}

interface Modifier {
  id: string;
  name: string;
  price: string;
  isDefault: boolean;
  isAvailable: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  modifiers: Modifier[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  isAvailable?: boolean;
  allergens?: string[];
  tags?: string[];
  isPopular?: boolean;
  isNew?: boolean;
  modifierGroups?: ModifierGroup[];
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  items: MenuItem[];
}

interface MenuResponse {
  menus: {
    id: string;
    name: string;
    categories: Category[];
  }[];
}

interface SelectedModifier {
  id: string;
  name: string;
  price: string;
}

interface CartItem {
  cartId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  modifiersTotal: number;
}

interface Table {
  id: string;
  number: string;
  name: string | null;
  label: string;
}

function generateCartId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function ItemDetailDialog({
  item,
  open,
  onClose,
  onAddToCart,
  currency,
}: {
  item: MenuItem;
  open: boolean;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, selectedModifiers: SelectedModifier[]) => void;
  currency: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setCollapsedGroups({});
      const defaults: Record<string, string[]> = {};
      item.modifierGroups?.forEach((group) => {
        const defaultMods = group.modifiers.filter((m) => m.isDefault).map((m) => m.id);
        if (defaultMods.length > 0) {
          defaults[group.id] = defaultMods;
        } else if (group.isRequired && group.maxSelections === 1 && group.modifiers.length > 0) {
          defaults[group.id] = [group.modifiers[0].id];
        }
      });
      setSelectedModifiers(defaults);
    }
  }, [open, item]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleRadioSelect = (groupId: string, modifierId: string) => {
    setSelectedModifiers((prev) => ({ ...prev, [groupId]: [modifierId] }));
  };

  const handleCheckboxToggle = (groupId: string, modifierId: string, maxSelections: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(modifierId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modifierId) };
      }
      if (maxSelections > 0 && current.length >= maxSelections) {
        return prev;
      }
      return { ...prev, [groupId]: [...current, modifierId] };
    });
  };

  const allModifiers = useMemo(() => {
    const result: SelectedModifier[] = [];
    item.modifierGroups?.forEach((group) => {
      const selected = selectedModifiers[group.id] || [];
      group.modifiers.forEach((mod) => {
        if (selected.includes(mod.id)) {
          result.push({ id: mod.id, name: mod.name, price: mod.price });
        }
      });
    });
    return result;
  }, [selectedModifiers, item.modifierGroups]);

  const modifiersTotal = allModifiers.reduce((sum, m) => sum + parseFloat(m.price), 0);
  const itemPrice = parseFloat(item.price);
  const totalPerItem = itemPrice + modifiersTotal;
  const totalPrice = totalPerItem * quantity;

  const isValid = useMemo(() => {
    if (!item.modifierGroups) return true;
    return item.modifierGroups.every((group) => {
      if (!group.isRequired) return true;
      const selected = selectedModifiers[group.id] || [];
      return selected.length >= (group.minSelections || 1);
    });
  }, [selectedModifiers, item.modifierGroups]);

  const handleAdd = () => {
    if (!isValid) return;
    onAddToCart(item, quantity, allModifiers);
    onClose();
  };

  const isRadioGroup = (group: ModifierGroup) => group.maxSelections === 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold" data-testid="text-item-detail-name">{item.name}</h2>
          {/* <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-item-detail">
            <X className="h-4 w-4" />
          </Button> */}
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-0">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-48 object-cover"
                data-testid="img-item-detail"
              />
            )}

            <div className="p-4 space-y-1">
              {item.description && (
                <p className="text-sm text-muted-foreground" data-testid="text-item-description">
                  {item.description}
                </p>
              )}
              <p className="font-semibold text-lg" data-testid="text-item-base-price">
                {currency}{itemPrice.toFixed(2)}
              </p>
            </div>

            {item.modifierGroups && item.modifierGroups.length > 0 && (
              <div className="space-y-0">
                {item.modifierGroups.map((group) => {
                  const isRadio = isRadioGroup(group);
                  const isCollapsed = collapsedGroups[group.id];
                  const selected = selectedModifiers[group.id] || [];

                  return (
                    <div key={group.id} className="border-t" data-testid={`modifier-group-${group.id}`}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 bg-primary/10 text-left"
                        onClick={() => toggleGroupCollapse(group.id)}
                        data-testid={`button-toggle-group-${group.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{group.name}</span>
                          {group.isRequired && (
                            <Badge variant="secondary" className="no-default-active-elevate text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        {isCollapsed ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>

                      {!isCollapsed && (
                        <div className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4">
                            {group.modifiers.map((mod) => {
                              const isSelected = selected.includes(mod.id);
                              const price = parseFloat(mod.price);

                              if (isRadio) {
                                return (
                                  <label
                                    key={mod.id}
                                    className="flex items-start gap-2 cursor-pointer"
                                    data-testid={`modifier-option-${mod.id}`}
                                  >
                                    <button
                                      type="button"
                                      className="mt-0.5 shrink-0"
                                      onClick={() => handleRadioSelect(group.id, mod.id)}
                                      data-testid={`radio-${mod.id}`}
                                    >
                                      {isSelected ? (
                                        <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                                        </div>
                                      ) : (
                                        <Circle className="h-5 w-5 text-muted-foreground" />
                                      )}
                                    </button>
                                    <div
                                      className="flex-1 min-w-0"
                                      onClick={() => handleRadioSelect(group.id, mod.id)}
                                    >
                                      <span className="text-sm leading-tight block">{mod.name}</span>
                                      {price > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          + {currency}{price.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </label>
                                );
                              }

                              return (
                                <label
                                  key={mod.id}
                                  className="flex items-start gap-2 cursor-pointer"
                                  data-testid={`modifier-option-${mod.id}`}
                                >
                                  <button
                                    type="button"
                                    className="mt-0.5 shrink-0"
                                    onClick={() => handleCheckboxToggle(group.id, mod.id, group.maxSelections)}
                                    data-testid={`checkbox-${mod.id}`}
                                  >
                                    {isSelected ? (
                                      <div className="h-5 w-5 rounded-md bg-primary flex items-center justify-center">
                                        <Check className="h-3 w-3 text-primary-foreground" />
                                      </div>
                                    ) : (
                                      <div className="h-5 w-5 rounded-md border-2 border-muted-foreground/40" />
                                    )}
                                  </button>
                                  <div
                                    className="flex-1 min-w-0"
                                    onClick={() => handleCheckboxToggle(group.id, mod.id, group.maxSelections)}
                                  >
                                    <span className="text-sm leading-tight block">{mod.name}</span>
                                    {price > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        + {currency}{price.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4 flex items-center gap-3 bg-background">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              data-testid="button-detail-decrease"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-semibold" data-testid="text-detail-quantity">
              {quantity}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setQuantity((q) => q + 1)}
              data-testid="button-detail-increase"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            className="flex-1"
            onClick={handleAdd}
            disabled={!isValid}
            data-testid="button-add-to-cart"
          >
            Add {quantity} for {currency}{totalPrice.toFixed(2)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QROrderingPage({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [customerName, setCustomerName] = useState("");

  const { data: tokenData, isLoading: loadingToken, error: tokenError } = useQuery<TokenData>({
    queryKey: ["/api/order", token],
    queryFn: async () => {
      const res = await fetch(`/api/order/${token}`);
      if (!res.ok) throw new Error("Invalid QR code");
      return res.json();
    },
  });

  const { data: menuResponse, isLoading: loadingMenu } = useQuery<MenuResponse>({
    queryKey: ["/api/order", token, "menu"],
    queryFn: async () => {
      const res = await fetch(`/api/order/${token}/menu`);
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
    enabled: !!tokenData,
  });

  const menu = menuResponse?.menus?.[0];

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
  const currency = tokenData?.restaurant?.currency === "USD" ? "$" : tokenData?.restaurant?.currency || "$";

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

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "payment">("cart");

  const availableQrPayMethods = useMemo(() => {
    const methods: { id: string; label: string; value: string }[] = [];
    if (tokenData?.paymentMethods?.card || tokenData?.paymentMethods?.stripe) {
      methods.push({ id: "card", label: "Credit / Debit Card", value: "card" });
    }
    if (tokenData?.paymentMethods?.paypal) {
      methods.push({ id: "paypal", label: "PayPal", value: "paypal" });
    }
    return methods;
  }, [tokenData?.paymentMethods]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPaymentMethod && availableQrPayMethods.length > 0) {
        throw new Error("Please select a payment method");
      }
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrTokenId: tokenData?.qrToken?.id,
          tableId: selectedTable || tokenData?.table?.id,
          paymentMethod: selectedPaymentMethod || undefined,
          customerName,
          items: cart.map((ci) => ({
            menuItemId: ci.menuItem.id,
            name: ci.menuItem.name,
            quantity: ci.quantity,
            unitPrice: ci.menuItem.price,
            modifiers: ci.selectedModifiers.map((m) => ({
              id: m.id,
              name: m.name,
              price: m.price,
            })),
          })),
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || error.error || "Failed to place order");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Order placed & paid successfully!" });
      setCart([]);
      setCartOpen(false);
      setCheckoutStep("cart");
      setSelectedPaymentMethod("");
      const orderId = data.orderId || data.order?.id;
      if (orderId) {
        setLocation(`/order/status/${orderId}?token=${data.trackingToken}`);
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addToCart = (item: MenuItem, quantity: number, selectedMods: SelectedModifier[]) => {
    const modifiersTotal = selectedMods.reduce((sum, m) => sum + parseFloat(m.price), 0);
    setCart((prev) => [
      ...prev,
      {
        cartId: generateCartId(),
        menuItem: item,
        quantity,
        selectedModifiers: selectedMods,
        modifiersTotal,
      },
    ]);
    toast({ title: `Added ${item.name} to cart` });
  };

  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.cartId === cartId) {
            const newQuantity = item.quantity + delta;
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (cartId: string) => {
    setCart((prev) => prev.filter((item) => item.cartId !== cartId));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + (parseFloat(item.menuItem.price) + item.modifiersTotal) * item.quantity,
    0
  );

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const currentCategory = menu?.categories?.find((c) => c.id === selectedCategory);

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

  // ── New full-page themes ──────────────────────────────────────────────────
  const activeTemplate: QrTemplate = (tokenData.qrTemplate as QrTemplate) ?? "luxe-dark";
  const isCustomTheme = true; // All templates are now custom themes

  if (isCustomTheme) {
    const themeProps = {
      restaurantName: tokenData.restaurant.name,
      tableLabel: tokenData.table?.label ?? null,
      categories: menu?.categories ?? [],
      currentCategory,
      selectedCategory,
      onCategorySelect: setSelectedCategory,
      cartItemCount,
      cartTotal,
      currency,
      onItemClick: (item: MenuItem) => setSelectedItem(item),
      onQuickAdd: (item: MenuItem) => addToCart(item, 1, []),
      onCartOpen: () => setCartOpen(true),
      isLoadingMenu: loadingMenu,
      themeColors: tokenData.qrThemeColors ?? undefined, // ← NEW
    };

    return (
      <div>
        {activeTemplate === "luxe-dark" && <LuxeDarkTheme {...themeProps} />}
        {activeTemplate === "fresh-minimal" && <FreshMinimalTheme {...themeProps} />}
        {activeTemplate === "warm-spice" && <WarmSpiceTheme {...themeProps} />}

        {/* Shared Cart Sheet */}
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetContent
            className="flex flex-col w-full sm:max-w-md"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>Your Order</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 -mx-6 px-6">
              {cart.length > 0 ? (
                <div className="space-y-4 py-4">
                  {cart.map((ci) => {
                    const unitTotal = parseFloat(ci.menuItem.price) + ci.modifiersTotal;
                    return (
                      <div key={ci.cartId} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{ci.menuItem.name}</p>
                            {ci.selectedModifiers.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {ci.selectedModifiers.map((mod) => (
                                  <p key={mod.id} className="text-xs text-muted-foreground">
                                    {mod.name}
                                    {parseFloat(mod.price) > 0 && ` (+${currency}${parseFloat(mod.price).toFixed(2)})`}
                                  </p>
                                ))}
                              </div>
                            )}
                            <p className="text-sm font-semibold mt-1">
                              {currency}{(unitTotal * ci.quantity).toFixed(2)}
                            </p>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeFromCart(ci.cartId)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" onClick={() => updateCartQuantity(ci.cartId, -1)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-medium">{ci.quantity}</span>
                          <Button size="icon" variant="outline" onClick={() => updateCartQuantity(ci.cartId, 1)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
                      <SelectTrigger><SelectValue placeholder="Choose your table" /></SelectTrigger>
                      <SelectContent>
                        {tables?.map((table) => (
                          <SelectItem key={table.id} value={table.id}>{table.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Your Name</label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g., Alice" />
                </div>
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>{currency}{cartTotal.toFixed(2)}</span>
                </div>
                {checkoutStep === "cart" ? (
                  <Button
                    className="w-full" size="lg"
                    onClick={() => {
                      if (availableQrPayMethods.length > 0) {
                        setCheckoutStep("payment");
                        if (availableQrPayMethods.length === 1) setSelectedPaymentMethod(availableQrPayMethods[0].value);
                      } else {
                        createOrderMutation.mutate();
                      }
                    }}
                    disabled={createOrderMutation.isPending || (tokenData.requiresTableSelection && !selectedTable) || !customerName.trim()}
                  >
                    Proceed to Payment
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm font-medium">Select Payment Method</div>
                    <div className="space-y-2">
                      {availableQrPayMethods.map((method) => (
                        <button
                          key={method.id}
                          onClick={() => setSelectedPaymentMethod(method.value)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${selectedPaymentMethod === method.value ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"}`}
                        >
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === method.value ? "border-primary" : "border-muted-foreground/30"}`}>
                            {selectedPaymentMethod === method.value && <div className="h-3 w-3 rounded-full bg-primary" />}
                          </div>
                          <span className="font-medium">{method.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setCheckoutStep("cart"); setSelectedPaymentMethod(""); }}>Back</Button>
                      <Button className="flex-1" size="lg" onClick={() => createOrderMutation.mutate()} disabled={createOrderMutation.isPending || !selectedPaymentMethod}>
                        {createOrderMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `Pay ${currency}${cartTotal.toFixed(2)}`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Shared Item Detail Dialog */}
        {selectedItem && (
          <ItemDetailDialog
            item={selectedItem}
            open={!!selectedItem}
            onClose={() => setSelectedItem(null)}
            onAddToCart={addToCart}
            currency={currency}
          />
        )}
      </div>
    );
  }
  // ── End of new themes block ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-[85%] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary shrink-0">
              <Utensils className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold truncate" data-testid="text-restaurant-name">
                {tokenData.restaurant.name}
              </h1>
              {tokenData.table && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{tokenData.table.label}</span>
                </p>
              )}
            </div>
          </div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="relative shrink-0" data-testid="button-cart">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0">
                    {cartItemCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col w-full sm:max-w-md" onInteractOutside={(e) => {
              // Prevent closing when clicking outside the drawer
              e.preventDefault();
            }}
              onEscapeKeyDown={(e) => {
                // Optional: also prevent closing with ESC
                e.preventDefault();
              }}>
              <SheetHeader>
                <SheetTitle>Your Order</SheetTitle>
              </SheetHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                {cart.length > 0 ? (
                  <div className="space-y-4 py-4">
                    {cart.map((ci) => {
                      const unitTotal = parseFloat(ci.menuItem.price) + ci.modifiersTotal;
                      return (
                        <div key={ci.cartId} className="border rounded-md p-3 space-y-2" data-testid={`cart-item-${ci.cartId}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{ci.menuItem.name}</p>
                              {ci.selectedModifiers.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {ci.selectedModifiers.map((mod) => (
                                    <p key={mod.id} className="text-xs text-muted-foreground">
                                      {mod.name}
                                      {parseFloat(mod.price) > 0 && ` (+${currency}${parseFloat(mod.price).toFixed(2)})`}
                                    </p>
                                  ))}
                                </div>
                              )}
                              <p className="text-sm font-semibold mt-1">
                                {currency}{(unitTotal * ci.quantity).toFixed(2)}
                              </p>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeFromCart(ci.cartId)}
                              data-testid={`button-remove-${ci.cartId}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => updateCartQuantity(ci.cartId, -1)}
                              data-testid={`button-decrease-${ci.cartId}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{ci.quantity}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => updateCartQuantity(ci.cartId, 1)}
                              data-testid={`button-increase-${ci.cartId}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Name</label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g., Alice"
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span data-testid="text-cart-total">{currency}{cartTotal.toFixed(2)}</span>
                  </div>

                  {checkoutStep === "cart" ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => {
                        if (availableQrPayMethods.length > 0) {
                          setCheckoutStep("payment");
                          if (availableQrPayMethods.length === 1) {
                            setSelectedPaymentMethod(availableQrPayMethods[0].value);
                          }
                        } else {
                          createOrderMutation.mutate();
                        }
                      }}
                      disabled={
                        createOrderMutation.isPending ||
                        (tokenData.requiresTableSelection && !selectedTable) ||
                        !customerName.trim()
                      }
                      data-testid="button-proceed-payment"
                    >
                      Proceed to Payment
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Select Payment Method</div>
                      <div className="space-y-2">
                        {availableQrPayMethods.map((method) => (
                          <button
                            key={method.id}
                            onClick={() => setSelectedPaymentMethod(method.value)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${selectedPaymentMethod === method.value
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-muted-foreground/30"
                              }`}
                            data-testid={`button-pay-method-${method.id}`}
                          >
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === method.value ? "border-primary" : "border-muted-foreground/40"
                              }`}>
                              {selectedPaymentMethod === method.value && (
                                <div className="h-3 w-3 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="font-medium">{method.label}</span>
                          </button>
                        ))}
                      </div>
                      {availableQrPayMethods.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          No online payment methods available. Please contact staff.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setCheckoutStep("cart");
                            setSelectedPaymentMethod("");
                          }}
                          data-testid="button-back-to-cart"
                        >
                          Back
                        </Button>
                        <Button
                          className="flex-1"
                          size="lg"
                          onClick={() => createOrderMutation.mutate()}
                          disabled={createOrderMutation.isPending || !selectedPaymentMethod}
                          data-testid="button-place-order"
                        >
                          {createOrderMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            `Pay ${currency}${cartTotal.toFixed(2)}`
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {menu?.categories && menu.categories.length > 0 && (
        <div className="sticky top-[61px] z-40 bg-background border-b">
          <ScrollArea className="max-w-[85%] mx-auto">
            <div className="flex gap-2 p-4">
              {menu.categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="shrink-0"
                  data-testid={`button-category-${category.id}`}
                >
                  {category.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <main className="flex-1 px-4 py-6">
        <div className="max-w-[85%] mx-auto">
          {(() => {
            const template: QrTemplate = tokenData.qrTemplate ?? "classic";
            if (loadingMenu) {
              return (
                <div className={template === "bento" ? "grid grid-cols-2 gap-4 beneto" : "space-y-4"}>
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className={template === "bento" ? "h-44 w-full" : "h-28 w-full"} />
                  ))}
                </div>
              );
            }
            if (!currentCategory?.items || currentCategory.items.length === 0) {
              return (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Utensils className="h-12 w-12 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">No items in this category</p>
                  </CardContent>
                </Card>
              );
            }

            if (template === "bento") {
              return (
                <div className="grid grid-cols-2 gap-4">
                  {currentCategory.items.map((item) => {
                    const isAvailable = item.isAvailable !== false;
                    const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border bg-card overflow-hidden flex flex-col ${!isAvailable ? "opacity-60" : "cursor-pointer hover:shadow-md transition-shadow"}`}
                        onClick={() => isAvailable && setSelectedItem(item)}
                        data-testid={`menu-item-${item.id}`}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-[250px] object-cover" />
                        ) : (
                          <div className="w-full h-[250px] bg-primary/10 flex items-center justify-center">
                            <Utensils className="h-[50%] w-[50%] text-primary/40" />
                          </div>
                        )}
                        <div className="p-3 flex flex-col flex-1">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <h3 className="font-semibold text-lg leading-tight line-clamp-2 flex-1">{item.name}</h3>
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                          )}
                          <div className="mt-auto flex items-center justify-between gap-1">
                            <span className="font-bold text-primary text-lg">{currency}{parseFloat(item.price).toFixed(2)}</span>
                            {isAvailable ? (
                              <Button
                                size="icon"
                                className="w-fit px-3"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasModifiers) setSelectedItem(item);
                                  else addToCart(item, 1, []);
                                }}
                                data-testid={`button-add-${item.id}`}
                              > Add to Cart
                                <Plus className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="no-default-active-elevate text-xs">Unavail.</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (template === "minimal") {
              return (
                <div className="flex flex-col gap-4">
                  {currentCategory.items.map((item) => {
                    const isAvailable = item.isAvailable !== false;
                    const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-4 py-6 px-6 bg-card shadow-sm rounded-xl border border-card-border ${!isAvailable ? "opacity-60" : "cursor-pointer"}`}
                        onClick={() => isAvailable && setSelectedItem(item)}
                        data-testid={`menu-item-${item.id}`}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                        ) :
                          <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center shrink-0" data-testid={`img-placeholder-${item.id}`}>
                            <UtensilsCrossed className="h-[50%] w-[50%] text-muted-foreground" />
                          </div>
                        }
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg">{item.name}</h3>
                            {item.isPopular && <Badge variant="secondary" className="no-default-active-elevate text-xs">Popular</Badge>}
                            {item.isNew && <Badge variant="secondary" className="no-default-active-elevate text-xs">New</Badge>}
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                          {hasModifiers && <p className="text-xs text-muted-foreground/60 mt-0.5">Customizable</p>}

                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-semibold text-lg">{currency}{parseFloat(item.price).toFixed(2)}</span>
                          {isAvailable ? (
                            <Button
                              className="h-8 px-2 bg-primary text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasModifiers) setSelectedItem(item);
                                else addToCart(item, 1, []);
                              }}
                              data-testid={`button-add-${item.id}`}
                            > Add to Cart
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="no-default-active-elevate text-xs">Unavailable</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {currentCategory.items.map((item) => {
                  const isAvailable = item.isAvailable !== false;
                  const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;
                  return (
                    <Card
                      key={item.id}
                      className={`${!isAvailable ? "opacity-60" : "hover-elevate cursor-pointer"}`}
                      onClick={() => isAvailable && setSelectedItem(item)}
                      data-testid={`menu-item-${item.id}`}
                    >
                      <CardContent className="flex gap-4 p-4">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="w-24 h-24 rounded-md object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{item.name}</h3>
                                {item.isPopular && <Badge variant="secondary" className="no-default-active-elevate text-xs">Popular</Badge>}
                                {item.isNew && <Badge variant="secondary" className="no-default-active-elevate text-xs">New</Badge>}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                              )}
                            </div>
                            <p className="font-semibold text-primary shrink-0">{currency}{parseFloat(item.price).toFixed(2)}</p>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                            {hasModifiers && <p className="text-xs text-muted-foreground">Customizable</p>}
                            <div className="ml-auto">
                              {isAvailable ? (
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (hasModifiers) setSelectedItem(item);
                                    else addToCart(item, 1, []);
                                  }}
                                  data-testid={`button-add-${item.id}`}
                                >
                                  <Plus className="mr-1 h-4 w-4" />
                                  Add
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="no-default-active-elevate">Unavailable</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </main>

      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-4 left-4 right-4 max-w-[85%] mx-auto z-30">
          <Button
            className="w-fit ms-auto h-14 text-lg flex"
            onClick={() => setCartOpen(true)}
            data-testid="button-view-cart"
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            View Cart ({cartItemCount} items) - {currency}{cartTotal.toFixed(2)}
          </Button>
        </div>
      )}

      {selectedItem && (
        <ItemDetailDialog
          item={selectedItem}
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onAddToCart={addToCart}
          currency={currency}
        />
      )}
    </div>
  );
}
