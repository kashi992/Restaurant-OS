import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  SplitSquareVertical,
  Users,
  DollarSign,
  ShoppingBag,
  Loader2,
  CheckCircle,
  CreditCard,
  Banknote,
  ArrowLeft,
  X,
  Minus,
  Plus,
} from "lucide-react";

interface OrderForSplit {
  id: string;
  orderNumber: string;
  total: string;
  paidAmount: string;
  status: string;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  modifiers: unknown[];
  modifiersPrice: string;
}

interface SplitShare {
  id: string;
  shareNumber: number;
  label: string;
  amount: string;
  paidAmount: string;
  paidTip: string;
  status: string;
  itemIds: string[];
  remainingAmount: string;
  payments: unknown[];
}

interface SplitSession {
  id: string;
  orderId: string;
  splitType: string;
  totalShares: number;
  status: string;
}

interface PaymentMethodConfig {
  id: string;
  label: string;
  icon: "cash" | "card";
  method: string;
}

type SplitMode = "equal" | "by_amount" | "by_item";
type Step = "choose_mode" | "configure" | "pay_shares";

interface SplitBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderForSplit | null;
  availableMethods: PaymentMethodConfig[];
}

export function SplitBillingDialog({ open, onOpenChange, order, availableMethods }: SplitBillingDialogProps) {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const [step, setStep] = useState<Step>("choose_mode");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [guestCount, setGuestCount] = useState(2);
  const [amountShares, setAmountShares] = useState<{ label: string; amount: string }[]>([]);
  const [itemAssignments, setItemAssignments] = useState<Map<number, Set<string>>>(new Map());
  const [itemGuestCount, setItemGuestCount] = useState(2);

  const [payingShareId, setPayingShareId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState(availableMethods[0]?.method || "counter");
  const [tipAmount, setTipAmount] = useState("0");

  const defaultMethod = availableMethods[0]?.method || "counter";

  useEffect(() => {
    if (open) {
      setStep("choose_mode");
      setSplitMode("equal");
      setGuestCount(2);
      setAmountShares([]);
      setItemAssignments(new Map());
      setItemGuestCount(2);
      setPayingShareId(null);
      setPaymentMethod(defaultMethod);
      setTipAmount("0");
    }
  }, [open, defaultMethod]);

  useEffect(() => {
    if (itemGuestCount < itemAssignments.size) {
      const newAssignments = new Map(itemAssignments);
      for (const key of Array.from(newAssignments.keys())) {
        if (key >= itemGuestCount) {
          newAssignments.delete(key);
        }
      }
      setItemAssignments(newAssignments);
    }
  }, [itemGuestCount]);

  const orderTotal = parseFloat(order?.total || "0");

  const { data: orderItems } = useQuery<OrderItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "orders", order?.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${order!.id}/items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!order?.id && open,
  });

  const { data: existingSession, refetch: refetchSession } = useQuery<{ session: SplitSession; shares: SplitShare[] } | null>({
    queryKey: ["/api/restaurants", restaurantId, "orders", order?.id, "split"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${order!.id}/split`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!order?.id && open,
  });

  const allSharesPaid = existingSession?.shares?.every(s => s.status === "paid") || false;
  const totalPaidInSession = existingSession?.shares?.reduce((sum, s) => sum + parseFloat(s.paidAmount || "0"), 0) || 0;
  const sessionRemaining = orderTotal - totalPaidInSession;

  useEffect(() => {
    if (existingSession?.session) {
      setStep("pay_shares");
    }
  }, [existingSession]);

  useEffect(() => {
    if (allSharesPaid && existingSession?.session && step === "pay_shares") {
      const timer = setTimeout(() => {
        toast({ title: "Bill fully paid!", description: "All shares have been settled" });
        onOpenChange(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [allSharesPaid, existingSession, step]);

  const createSplitMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${order!.id}/split`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to create split session");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchSession();
      setStep("pay_shares");
      toast({ title: "Split session created" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const payShareMutation = useMutation({
    mutationFn: async ({ shareId, amount, method, tip }: { shareId: string; amount: number; method: string; tip: number }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${order!.id}/split/shares/${shareId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ amount, method, tipAmount: tip }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to process payment");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchSession();
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      setPayingShareId(null);
      setTipAmount("0");
      toast({ title: "Payment recorded" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelSplitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${order!.id}/split`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to cancel split");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchSession();
      setStep("choose_mode");
      toast({ title: "Split session cancelled" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateEqual = () => {
    createSplitMutation.mutate({
      splitType: "equal",
      shares: { count: guestCount },
    });
  };

  const handleCreateByAmount = () => {
    const amounts = amountShares.map(s => parseFloat(s.amount) || 0);
    const total = amounts.reduce((sum, a) => sum + a, 0);
    if (Math.abs(total - orderTotal) > 0.01) {
      toast({
        title: "Amounts don't match",
        description: `Share amounts ($${total.toFixed(2)}) must equal order total ($${orderTotal.toFixed(2)})`,
        variant: "destructive",
      });
      return;
    }
    createSplitMutation.mutate({
      splitType: "by_amount",
      shares: {
        amounts,
        labels: amountShares.map(s => s.label),
      },
    });
  };

  const handleCreateByItem = () => {
    const items = orderItems || [];
    const allItemIds = new Set(items.map(i => i.id));
    const assignedItems = new Set<string>();
    const assignments: { itemIds: string[]; label: string }[] = [];

    for (let guest = 0; guest < itemGuestCount; guest++) {
      const guestItems = itemAssignments.get(guest) || new Set<string>();
      const itemIds = Array.from(guestItems);
      itemIds.forEach(id => assignedItems.add(id));
      assignments.push({
        itemIds,
        label: `Guest ${guest + 1}`,
      });
    }

    if (assignedItems.size !== allItemIds.size) {
      toast({
        title: "Items not fully assigned",
        description: "All items must be assigned to a guest",
        variant: "destructive",
      });
      return;
    }

    const emptyGuests = assignments.filter(a => a.itemIds.length === 0);
    if (emptyGuests.length > 0) {
      toast({
        title: "Empty shares",
        description: "Each guest must have at least one item",
        variant: "destructive",
      });
      return;
    }

    createSplitMutation.mutate({
      splitType: "by_item",
      shares: { itemAssignments: assignments },
    });
  };

  const initAmountShares = (count: number) => {
    const perPerson = (orderTotal / count).toFixed(2);
    const shares = Array.from({ length: count }, (_, i) => ({
      label: `Guest ${i + 1}`,
      amount: perPerson,
    }));
    const totalAssigned = parseFloat(perPerson) * count;
    if (Math.abs(totalAssigned - orderTotal) > 0.001) {
      const diff = orderTotal - totalAssigned;
      shares[count - 1].amount = (parseFloat(perPerson) + diff).toFixed(2);
    }
    setAmountShares(shares);
  };

  const amountTotal = useMemo(() => {
    return amountShares.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  }, [amountShares]);

  const amountDiff = useMemo(() => {
    return orderTotal - amountTotal;
  }, [orderTotal, amountTotal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SplitSquareVertical className="h-5 w-5" />
            Split Bill - #{order?.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Order Total: ${orderTotal.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="pr-4 space-y-4 h-[60vh]">
            {step === "choose_mode" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choose how to split the bill:</p>
                <div className="grid gap-3">
                  <Card
                    className="cursor-pointer hover-elevate"
                    onClick={() => { setSplitMode("equal"); setStep("configure"); }}
                    data-testid="button-split-equal"
                  >
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">Split Equally</p>
                        <p className="text-sm text-muted-foreground">Divide the total evenly among guests</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer hover-elevate"
                    onClick={() => {
                      setSplitMode("by_amount");
                      initAmountShares(2);
                      setStep("configure");
                    }}
                    data-testid="button-split-amount"
                  >
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">Split by Amount</p>
                        <p className="text-sm text-muted-foreground">Enter custom amounts for each person</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer hover-elevate"
                    onClick={() => { setSplitMode("by_item"); setStep("configure"); }}
                    data-testid="button-split-items"
                  >
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">Split by Items</p>
                        <p className="text-sm text-muted-foreground">Assign specific items to each person</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {step === "configure" && splitMode === "equal" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose_mode")} data-testid="button-back">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div className="text-center space-y-4">
                  <p className="font-medium">How many guests?</p>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setGuestCount(Math.max(2, guestCount - 1))}
                      disabled={guestCount <= 2}
                      data-testid="button-decrease-guests"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold w-16 text-center" data-testid="text-guest-count">{guestCount}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setGuestCount(Math.min(20, guestCount + 1))}
                      disabled={guestCount >= 20}
                      data-testid="button-increase-guests"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Each guest pays</p>
                    <p className="text-2xl font-bold" data-testid="text-per-guest-amount">
                      ${(orderTotal / guestCount).toFixed(2)}
                    </p>
                    {orderTotal % guestCount !== 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last guest adjusted for rounding
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === "configure" && splitMode === "by_amount" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose_mode")} data-testid="button-back">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium">Custom amounts per guest</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newShares = [...amountShares, { label: `Guest ${amountShares.length + 1}`, amount: "0" }];
                        setAmountShares(newShares);
                      }}
                      disabled={amountShares.length >= 20}
                      data-testid="button-add-share"
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add Guest
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {amountShares.map((share, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-16 shrink-0">Guest {idx + 1}</span>
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={share.amount}
                          onChange={(e) => {
                            const newShares = [...amountShares];
                            newShares[idx].amount = e.target.value;
                            setAmountShares(newShares);
                          }}
                          className="pl-8"
                          data-testid={`input-amount-${idx}`}
                        />
                      </div>
                      {amountShares.length > 2 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const newShares = amountShares.filter((_, i) => i !== idx);
                            setAmountShares(newShares);
                          }}
                          data-testid={`button-remove-share-${idx}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className={`p-3 rounded-lg border ${Math.abs(amountDiff) > 0.01 ? "border-destructive bg-destructive/10" : "bg-muted"}`}>
                  <div className="flex justify-between text-sm">
                    <span>Total of shares</span>
                    <span className="font-medium" data-testid="text-amount-total">${amountTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Order total</span>
                    <span className="font-medium">${orderTotal.toFixed(2)}</span>
                  </div>
                  {Math.abs(amountDiff) > 0.01 && (
                    <div className="flex justify-between text-sm text-destructive mt-1">
                      <span>Difference</span>
                      <span className="font-medium">{amountDiff > 0 ? `$${amountDiff.toFixed(2)} remaining` : `-$${Math.abs(amountDiff).toFixed(2)} over`}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === "configure" && splitMode === "by_item" && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setStep("choose_mode")} data-testid="button-back">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium">Assign items to guests</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemGuestCount(Math.max(2, itemGuestCount - 1))}
                      disabled={itemGuestCount <= 2}
                      data-testid="button-decrease-item-guests"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-medium" data-testid="text-item-guest-count">{itemGuestCount} guests</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setItemGuestCount(Math.min(10, itemGuestCount + 1))}
                      disabled={itemGuestCount >= 10}
                      data-testid="button-increase-item-guests"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {Array.from({ length: itemGuestCount }, (_, guestIdx) => {
                  const guestItems = itemAssignments.get(guestIdx) || new Set<string>();
                  const guestTotal = (orderItems || [])
                    .filter(item => guestItems.has(item.id))
                    .reduce((sum, item) => sum + parseFloat(item.totalPrice), 0);

                  return (
                    <div key={guestIdx} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Guest {guestIdx + 1}</p>
                        <Badge variant="outline" className="no-default-active-elevate" data-testid={`badge-guest-total-${guestIdx}`}>
                          ${guestTotal.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="space-y-1 ml-2">
                        {(orderItems || []).map(item => {
                          const isAssignedElsewhere = Array.from(itemAssignments.entries()).some(
                            ([gIdx, items]) => gIdx !== guestIdx && items.has(item.id)
                          );
                          const isChecked = guestItems.has(item.id);

                          return (
                            <label
                              key={item.id}
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${isAssignedElsewhere ? "opacity-40" : "hover-elevate"}`}
                              data-testid={`checkbox-item-${guestIdx}-${item.id}`}
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={isAssignedElsewhere}
                                onCheckedChange={(checked) => {
                                  const newAssignments = new Map(itemAssignments);
                                  const currentSet = new Set(newAssignments.get(guestIdx) || []);
                                  if (checked) {
                                    currentSet.add(item.id);
                                  } else {
                                    currentSet.delete(item.id);
                                  }
                                  newAssignments.set(guestIdx, currentSet);
                                  setItemAssignments(newAssignments);
                                }}
                              />
                              <span className="flex-1 text-sm">{item.quantity}x {item.name}</span>
                              <span className="text-sm text-muted-foreground">${item.totalPrice}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {(() => {
                  const allAssigned = new Set<string>();
                  itemAssignments.forEach(items => items.forEach(id => allAssigned.add(id)));
                  const unassigned = (orderItems || []).filter(item => !allAssigned.has(item.id));
                  if (unassigned.length > 0) {
                    return (
                      <div className="p-3 rounded-lg border border-destructive bg-destructive/10">
                        <p className="text-sm text-destructive font-medium">
                          {unassigned.length} item(s) not assigned to any guest
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {step === "pay_shares" && existingSession && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Split type: <span className="font-medium capitalize">{existingSession.session.splitType.replace("_", " ")}</span>
                    </p>
                  </div>
                  {!allSharesPaid && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelSplitMutation.mutate()}
                      disabled={cancelSplitMutation.isPending}
                      data-testid="button-cancel-split"
                    >
                      {cancelSplitMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}
                      Cancel Split
                    </Button>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-muted so">
                  <div className="flex justify-between text-sm">
                    <span>Order Total</span>
                    <span className="font-medium">${orderTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Paid So Far</span>
                    <span className="font-medium text-green-600 dark:text-green-400">${totalPaidInSession.toFixed(2)}</span>
                  </div>
                  {sessionRemaining > 0.01 && (
                    <div className="flex justify-between text-sm border-t mt-2 pt-2">
                      <span className="font-medium">Remaining</span>
                      <span className="font-bold">${sessionRemaining.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {existingSession.shares.map((share) => {
                    const remaining = parseFloat(share.remainingAmount || "0");
                    const isPaid = share.status === "paid";
                    const isPayingThis = payingShareId === share.id;

                    return (
                      <Card key={share.id} data-testid={`card-share-${share.shareNumber}`}>
                        <CardContent className="py-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{share.label}</span>
                              <Badge
                                variant={isPaid ? "default" : "outline"}
                                className={`no-default-active-elevate ${isPaid ? "bg-green-500/10 text-green-600 dark:text-green-400" : ""}`}
                              >
                                {isPaid ? "Paid" : share.status === "partial" ? "Partial" : "Pending"}
                              </Badge>
                            </div>
                            <span className="font-bold">${share.amount}</span>
                          </div>

                          {!isPaid && (
                            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                              <span>Remaining: ${remaining.toFixed(2)}</span>
                              {parseFloat(share.paidAmount || "0") > 0 && (
                                <span>Paid: ${parseFloat(share.paidAmount).toFixed(2)}</span>
                              )}
                            </div>
                          )}

                          {share.itemIds && share.itemIds.length > 0 && orderItems && (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {share.itemIds.map((itemId: string) => {
                                const item = orderItems.find(i => i.id === itemId);
                                return item ? (
                                  <div key={itemId} className="flex justify-between">
                                    <span>{item.quantity}x {item.name}</span>
                                    <span>${item.totalPrice}</span>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          )}

                          {!isPaid && !isPayingThis && (
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                setPayingShareId(share.id);
                                setPaymentMethod(defaultMethod);
                                setTipAmount("0");
                              }}
                              data-testid={`button-pay-share-${share.shareNumber}`}
                            >
                              <DollarSign className="mr-1 h-3 w-3" /> Pay ${remaining.toFixed(2)}
                            </Button>
                          )}

                          {isPayingThis && (
                            <div className="space-y-3 p-3 rounded-lg border bg-muted/50">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Payment Method</label>
                                {availableMethods.length > 1 ? (
                                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                    <SelectTrigger data-testid="select-share-payment-method">
                                      <SelectValue placeholder="Select method" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableMethods.map((m) => (
                                        <SelectItem key={m.id} value={m.method} data-testid={`option-share-method-${m.id}`}>
                                          <div className="flex items-center gap-2">
                                            {m.icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                                            {m.label}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50" data-testid="text-share-single-method">
                                    {availableMethods[0]?.icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                                    <span className="text-sm">{availableMethods[0]?.label}</span>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium">Tip (optional)</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={tipAmount}
                                  onChange={(e) => setTipAmount(e.target.value)}
                                  placeholder="0.00"
                                  data-testid="input-share-tip"
                                />
                              </div>

                              <div className="p-2 rounded bg-primary/10 border border-primary/20">
                                <div className="flex justify-between text-sm font-bold">
                                  <span>Total to collect</span>
                                  <span data-testid="text-share-collect-total">
                                    ${(remaining + parseFloat(tipAmount || "0")).toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPayingShareId(null)}
                                  className="flex-1"
                                  data-testid="button-cancel-share-pay"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => {
                                    payShareMutation.mutate({
                                      shareId: share.id,
                                      amount: remaining,
                                      method: paymentMethod,
                                      tip: parseFloat(tipAmount || "0"),
                                    });
                                  }}
                                  disabled={payShareMutation.isPending}
                                  data-testid="button-confirm-share-pay"
                                >
                                  {payShareMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="mr-1 h-3 w-3" /> Confirm
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}

                          {isPaid && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <CheckCircle className="h-4 w-4" />
                              <span>Fully paid</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {allSharesPaid && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="font-medium text-green-600 dark:text-green-400">All shares paid!</p>
                    <p className="text-sm text-muted-foreground">The bill has been fully settled</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={() => setStep("choose_mode")} data-testid="button-footer-back">
                Back
              </Button>
              <Button
                onClick={() => {
                  if (splitMode === "equal") handleCreateEqual();
                  else if (splitMode === "by_amount") handleCreateByAmount();
                  else if (splitMode === "by_item") handleCreateByItem();
                }}
                disabled={createSplitMutation.isPending || (splitMode === "by_amount" && Math.abs(amountDiff) > 0.01)}
                data-testid="button-create-split"
              >
                {createSplitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <SplitSquareVertical className="mr-2 h-4 w-4" />
                    Create Split
                  </>
                )}
              </Button>
            </>
          )}
          {step === "pay_shares" && (
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-split">
              {allSharesPaid ? "Done" : "Close"}
            </Button>
          )}
          {step === "choose_mode" && (
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-split-dialog">
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
