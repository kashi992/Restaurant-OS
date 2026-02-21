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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DialogFooter,
} from "@/components/ui/dialog";
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
  Eye,
  History,
  ClipboardList,
  DollarSign,
  Banknote,
  CreditCard,
  AlertTriangle,
  XCircle,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
} from "lucide-react";
import { useLocation } from "wouter";
import { hasPermission } from "@/components/protected-route";

function parseUTCDate(dateString: string): Date {
  if (!dateString) return new Date();
  let s = dateString.trim();
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  return new Date(s);
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  displayNumber: number | null;
  status: string;
  orderType: string;
  source: string;
  tableId: string | null;
  tableName: string | null;
  tableNumber: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  paidAmount: string;
  customerName: string | null;
  guestCount: number;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  displayNumber: number | null;
  status: string;
  orderType: string;
  source: string;
  tableId: string | null;
  tableName: string | null;
  tableNumber: string | null;
  subtotal: string;
  taxAmount: string;
  tipAmount: string;
  discountAmount: string;
  total: string;
  paidAmount: string;
  customerName: string | null;
  guestCount: number;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderItemType {
  id: string;
  orderId: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: string;
  modifiersPrice: string;
  totalPrice: string;
  modifiers: any[];
  notes: string | null;
  status: string;
}

interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  userId: string | null;
  createdAt: string;
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

interface SelectedModifier {
  id: string;
  name: string;
  price: string;
  groupId: string;
  groupName: string;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: SelectedModifier[];
  cartKey: string;
}

interface ModifierGroupData {
  id: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: {
    id: string;
    name: string;
    price: string;
    isDefault: boolean;
    isAvailable: boolean;
  }[];
}

const ORDER_STATUSES = [
  { value: "pending", label: "Pending", icon: Clock, color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  { value: "confirmed", label: "Confirmed", icon: CheckCircle, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "preparing", label: "Preparing", icon: ChefHat, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { value: "ready", label: "Ready", icon: CheckCircle, color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { value: "served", label: "Served", icon: CheckCircle, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { value: "completed", label: "Completed", icon: CheckCircle, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
  { value: "cancelled", label: "Cancelled", icon: Clock, color: "bg-red-500/10 text-red-600 dark:text-red-400" },
];

const STATUS_FLOW = ["pending", "confirmed", "preparing", "ready", "served", "completed"];

export default function OrdersPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const restaurantId = user?.restaurantId;

  const canCreateOrders = hasPermission(user?.permissions || [], "orders:create");
  const canUpdateOrders = hasPermission(user?.permissions || [], "orders:update");
  const canDeleteOrders = hasPermission(user?.permissions || [], "orders:delete");
  const canProcessPayments = hasPermission(user?.permissions || [], "payments:create");

  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get("table");
  const isNewOrder = canCreateOrders && urlParams.get("new") === "true";
  const viewOrderId = urlParams.get("order");
  const initialTab = urlParams.get("tab") || "active";
  const highlightOrderId = urlParams.get("highlight");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [counterNumber, setCounterNumber] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(viewOrderId);
  const [detailDialogOpen, setDetailDialogOpen] = useState(!!viewOrderId);
  const [highlightedOrder, setHighlightedOrder] = useState<string | null>(highlightOrderId);

  useEffect(() => {
    if (!highlightedOrder) return;
    const tryScroll = () => {
      const el = document.querySelector(`[data-order-id="${highlightedOrder}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const timer = setTimeout(() => setHighlightedOrder(null), 3000);
        return () => clearTimeout(timer);
      }
    };
    const cleanup = tryScroll();
    if (cleanup) return cleanup;
    const retryTimer = setTimeout(() => {
      tryScroll();
      setTimeout(() => setHighlightedOrder(null), 3000);
    }, 1500);
    return () => clearTimeout(retryTimer);
  }, [highlightedOrder, activeTab]);

  const [addingItemsToOrder, setAddingItemsToOrder] = useState(false);
  const [addItemsCart, setAddItemsCart] = useState<CartItem[]>([]);

  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [sortColumn, setSortColumn] = useState<"orderNumber" | "tableName" | "status" | "source" | "total" | "createdAt" | "resolvedAt">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupData[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, Set<string>>>({});
  const [modifierTargetCart, setModifierTargetCart] = useState<"new" | "add">("new");
  const [loadingModifiers, setLoadingModifiers] = useState(false);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payOrderNumber, setPayOrderNumber] = useState<string>("");
  const [payOrderTotal, setPayOrderTotal] = useState<string>("0");
  const [payOrderPaid, setPayOrderPaid] = useState<string>("0");
  const [payOrderTableId, setPayOrderTableId] = useState<string | null>(null);
  const [payTableSelection, setPayTableSelection] = useState<string>("");
  const [selectedPayMethod, setSelectedPayMethod] = useState("");
  const [tipAmount, setTipAmount] = useState("0");

  const [assignTableId, setAssignTableId] = useState<string>("");

  const userPaymentMethods = user?.paymentMethods;
  const userFeatures = user?.features as Record<string, boolean> | undefined;

  const availablePayMethods: { id: string; label: string; icon: "cash" | "card"; method: string }[] = (() => {
    const methods: { id: string; label: string; icon: "cash" | "card"; method: string }[] = [];
    const cashEnabled = userPaymentMethods
      ? (userPaymentMethods.cash === true || userPaymentMethods.counter === true)
      : (userFeatures?.counter_payments !== false);
    const cardEnabled = userPaymentMethods
      ? (userPaymentMethods.card === true || userPaymentMethods.stripe === true)
      : (userFeatures?.stripe_payments === true);
    const paypalEnabled = userPaymentMethods
      ? (userPaymentMethods.paypal === true)
      : (userFeatures?.paypal_payments === true);
    if (cashEnabled) methods.push({ id: "counter", label: "Cash / Counter", icon: "cash", method: "counter" });
    if (cardEnabled) methods.push({ id: "card", label: "Card (Stripe)", icon: "card", method: "card" });
    if (paypalEnabled) methods.push({ id: "paypal", label: "PayPal", icon: "card", method: "paypal" });
    return methods;
  })();
  const hasPayMethod = availablePayMethods.length > 0;
  const defaultPayMethod = hasPayMethod ? availablePayMethods[0].method : "";

  const { data: activeOrdersData, isLoading: loadingActive } = useQuery<{ orders: OrderSummary[] }>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "live"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/live`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return { orders: [] };
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !isNewOrder,
    refetchInterval: 5000,
  });

  const { data: completedOrdersRaw, isLoading: loadingCompletedRaw } = useQuery<{ orders: OrderSummary[] }>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "completed"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders?status=completed`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return { orders: [] };
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !isNewOrder && activeTab === "history",
  });

  const { data: cancelledOrdersRaw, isLoading: loadingCancelledRaw } = useQuery<{ orders: OrderSummary[] }>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "cancelled"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders?status=cancelled`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return { orders: [] };
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !isNewOrder && activeTab === "history",
  });

  const loadingCompleted = loadingCompletedRaw || loadingCancelledRaw;
  const allHistoryOrders = [
    ...(completedOrdersRaw?.orders || []),
    ...(cancelledOrdersRaw?.orders || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const sortedHistoryOrders = (() => {
    const filtered = historyFilter === "all"
      ? allHistoryOrders
      : allHistoryOrders.filter(o => o.status === historyFilter);

    return [...filtered].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      switch (sortColumn) {
        case "orderNumber":
          return dir * (a.orderNumber || "").localeCompare(b.orderNumber || "");
        case "tableName":
          return dir * (a.tableNumber || "").localeCompare(b.tableNumber || "");
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "source":
          return dir * a.source.localeCompare(b.source);
        case "total":
          return dir * (parseFloat(a.total) - parseFloat(b.total));
        case "createdAt":
          return dir * (parseUTCDate(a.createdAt).getTime() - parseUTCDate(b.createdAt).getTime());
        case "resolvedAt": {
          const aDate = a.status === "cancelled" ? a.cancelledAt : a.completedAt;
          const bDate = b.status === "cancelled" ? b.cancelledAt : b.completedAt;
          return dir * ((aDate ? parseUTCDate(aDate).getTime() : 0) - (bDate ? parseUTCDate(bDate).getTime() : 0));
        }
        default:
          return 0;
      }
    });
  })();

  const completedOrdersData = {
    orders: sortedHistoryOrders,
  };

  const { data: orderDetailData, isLoading: loadingDetail } = useQuery<{
    order: OrderDetail;
    items: OrderItemType[];
    statusHistory: StatusHistoryEntry[];
  }>({
    queryKey: ["/api/restaurants", restaurantId, "orders", detailOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${detailOrderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!detailOrderId,
  });

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
    enabled: !!accessToken && !!restaurantId && (isNewOrder || addingItemsToOrder),
  });

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
    enabled: !!accessToken && !!restaurantId && (isNewOrder || addingItemsToOrder),
  });

  interface DiningTable {
    id: string;
    number: string;
    capacity: number;
    status: string;
  }

  const { data: tablesData } = useQuery<DiningTable[]>({
    queryKey: ["/api/restaurants", restaurantId, "tables"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const assignTableMutation = useMutation({
    mutationFn: async ({ orderId, tableId: tId }: { orderId: string; tableId: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/table`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ tableId: tId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to assign table");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      toast({ title: "Table assigned successfully" });
      setAssignTableId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const items = cart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: "",
        modifiers: item.modifiers.map(m => ({ id: m.id, name: m.name, price: m.price })),
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
          customerName: counterNumber ? `Stand #${counterNumber}` : undefined,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to create order");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Order created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      setCart([]);
      setCounterNumber("");
      setLocation("/pos/orders");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: string; status: string; notes?: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      if (variables.status === "completed" || variables.status === "cancelled") {
        queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      }
      if (variables.status === "cancelled") {
        toast({ title: "Order cancelled" });
        setCancelDialogOpen(false);
        setCancelOrderId(null);
        setCancelReason("");
        setDetailDialogOpen(false);
      } else {
        toast({ title: "Order status updated" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCancelDialog = (orderId: string) => {
    setCancelOrderId(orderId);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const confirmCancelOrder = () => {
    if (!cancelOrderId) return;
    updateStatusMutation.mutate({
      orderId: cancelOrderId,
      status: "cancelled",
      notes: cancelReason.trim() || undefined,
    });
  };

  const addItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: CartItem[] }) => {
      const payload = items.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        notes: "",
        modifiers: item.modifiers.map(m => ({ id: m.id, name: m.name, price: m.price })),
      }));
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ items: payload }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to add items");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      setAddItemsCart([]);
      setAddingItemsToOrder(false);
      toast({ title: "Items added to order" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: string; itemId: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/${orderId}/items/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Failed to remove item");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      toast({ title: "Item removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      toast({ title: "Payment recorded & order completed!" });
      setPayDialogOpen(false);
      setPayOrderId(null);
      setTipAmount("0");
      setDetailDialogOpen(false);
      setDetailOrderId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Payment Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/bulk`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ orderIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to delete orders");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      toast({ title: `${data.deletedCount} order(s) deleted` });
      setSelectedOrders(new Set());
      setDeleteDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Delete Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === completedOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(completedOrders.map(o => o.id)));
    }
  };

  const openPaymentDialog = (order: { id: string; orderNumber: string; total: string; paidAmount: string; tableId?: string | null }) => {
    setPayOrderId(order.id);
    setPayOrderNumber(order.orderNumber);
    setPayOrderTotal(order.total);
    setPayOrderPaid(order.paidAmount || "0");
    setPayOrderTableId(order.tableId ?? null);
    setPayTableSelection("");
    setSelectedPayMethod(defaultPayMethod);
    setTipAmount("0");
    setPayDialogOpen(true);
  };

  const payBalance = async () => {
    if (!payOrderId || !selectedPayMethod) return;
    if (payTableSelection && !payOrderTableId) {
      try {
        await assignTableMutation.mutateAsync({ orderId: payOrderId, tableId: payTableSelection });
      } catch {
        return;
      }
    }
    const remaining = (parseFloat(payOrderTotal) - parseFloat(payOrderPaid)).toFixed(2);
    recordPaymentMutation.mutate({
      orderId: payOrderId,
      amount: remaining,
      method: selectedPayMethod,
      tip: tipAmount,
    });
  };

  const payRemainingBalance = (parseFloat(payOrderTotal) - parseFloat(payOrderPaid)).toFixed(2);

  const openModifierDialog = async (item: MenuItem, targetCart: "new" | "add") => {
    setModifierItem(item);
    setModifierTargetCart(targetCart);
    setLoadingModifiers(true);
    setModifierDialogOpen(true);

    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items/${item.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const groups: ModifierGroupData[] = data.modifierGroups || [];
        setModifierGroups(groups);
        const defaults: Record<string, Set<string>> = {};
        groups.forEach(g => {
          const defaultMods = g.modifiers.filter(m => m.isDefault && m.isAvailable).map(m => m.id);
          defaults[g.id] = new Set(defaultMods);
        });
        setSelectedModifiers(defaults);
      } else {
        setModifierGroups([]);
        setSelectedModifiers({});
      }
    } catch {
      setModifierGroups([]);
      setSelectedModifiers({});
    } finally {
      setLoadingModifiers(false);
    }
  };

  const toggleModifier = (groupId: string, modifierId: string, maxSelections: number) => {
    setSelectedModifiers(prev => {
      const groupSet = new Set(prev[groupId] || []);
      if (groupSet.has(modifierId)) {
        groupSet.delete(modifierId);
      } else {
        if (maxSelections === 1) {
          groupSet.clear();
        } else if (maxSelections > 0 && groupSet.size >= maxSelections) {
          return prev;
        }
        groupSet.add(modifierId);
      }
      return { ...prev, [groupId]: groupSet };
    });
  };

  const confirmModifiers = () => {
    if (!modifierItem) return;
    const mods: SelectedModifier[] = [];
    modifierGroups.forEach(group => {
      const selected = selectedModifiers[group.id] || new Set();
      group.modifiers.forEach(mod => {
        if (selected.has(mod.id)) {
          mods.push({ id: mod.id, name: mod.name, price: mod.price, groupId: group.id, groupName: group.name });
        }
      });
    });
    const modKey = mods.map(m => m.id).sort().join(",");
    const cartKey = `${modifierItem.id}:${modKey}`;
    const modPrice = mods.reduce((sum, m) => sum + parseFloat(m.price || "0"), 0);
    const setter = modifierTargetCart === "new" ? setCart : setAddItemsCart;
    setter(prev => {
      const existing = prev.find(c => c.cartKey === cartKey);
      if (existing) {
        return prev.map(c => c.cartKey === cartKey ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        menuItemId: modifierItem.id,
        name: modifierItem.name,
        price: parseFloat(modifierItem.price) + modPrice,
        quantity: 1,
        modifiers: mods,
        cartKey,
      }];
    });
    setModifierDialogOpen(false);
    setModifierItem(null);
    setModifierGroups([]);
    setSelectedModifiers({});
  };

  const addToCart = (item: MenuItem, targetCart: "new" | "add") => {
    openModifierDialog(item, targetCart);
  };

  const updateCartQuantity = (cartKey: string, delta: number, targetCart: "new" | "add") => {
    const setter = targetCart === "new" ? setCart : setAddItemsCart;
    setter(prev =>
      prev.map(item => {
        if (item.cartKey === cartKey) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null as any;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean)
    );
  };

  const removeFromCart = (cartKey: string, targetCart: "new" | "add") => {
    const setter = targetCart === "new" ? setCart : setAddItemsCart;
    setter(prev => prev.filter(item => item.cartKey !== cartKey));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const addItemsCartTotal = addItemsCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const getStatusBadge = (status: string) => {
    const statusInfo = ORDER_STATUSES.find(s => s.value === status);
    if (!statusInfo) return <Badge variant="outline">{status}</Badge>;
    return <Badge className={`${statusInfo.color} no-default-active-elevate`}>{statusInfo.label}</Badge>;
  };

  const getNextStatus = (currentStatus: string): string | null => {
    const idx = STATUS_FLOW.indexOf(currentStatus);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
    return null;
  };

  const formatDateTime = (dateString: string) => {
    const date = parseUTCDate(dateString);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateString: string) => {
    return parseUTCDate(dateString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getItemsByCategory = (categoryId: string) => {
    return menuItems?.filter(item => item.categoryId === categoryId && item.isAvailable) || [];
  };

  const openOrderDetail = (orderId: string) => {
    setDetailOrderId(orderId);
    setDetailDialogOpen(true);
    setAddingItemsToOrder(false);
    setAddItemsCart([]);
  };

  const renderMenuPicker = (targetCart: "new" | "add") => {
    const currentCart = targetCart === "new" ? cart : addItemsCart;
    const currentTotal = targetCart === "new" ? cartTotal : addItemsCartTotal;

    return (
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-medium" data-testid="text-menu-items-header">Menu Items</h2>
            <p className="text-sm text-muted-foreground">Select items to add to the order</p>
          </div>

          {loadingItems ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : categories && categories.length > 0 && menuItems && menuItems.filter(i => i.isAvailable).length > 0 ? (
            <ScrollArea className="flex-1 p-4">
              <Accordion type="multiple" defaultValue={categories.map(c => c.id)} className="space-y-2">
                {categories.map(category => {
                  const categoryItems = getItemsByCategory(category.id);
                  if (categoryItems.length === 0) return null;
                  return (
                    <AccordionItem key={category.id} value={category.id} className="border rounded-md">
                      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-category-${category.id}`}>
                        <span className="font-medium">{category.name}</span>
                        <Badge variant="secondary" className="ml-2 no-default-active-elevate">{categoryItems.length}</Badge>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="grid gap-2">
                          {categoryItems.map(item => {
                            const inCartCount = currentCart.filter(c => c.menuItemId === item.id).reduce((sum, c) => sum + c.quantity, 0);
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover-elevate"
                                onClick={() => addToCart(item, targetCart)}
                                data-testid={`menu-item-${item.id}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">{item.name}</p>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 ml-2">
                                  <span className="font-semibold">${parseFloat(item.price).toFixed(2)}</span>
                                  {inCartCount > 0 ? (
                                    <Badge variant="secondary" className="no-default-active-elevate">{inCartCount}</Badge>
                                  ) : (
                                    <Button size="icon" variant="ghost">
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <UtensilsCrossed className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No menu items available</h3>
              <p className="text-muted-foreground text-center mt-1">
                Create categories and items in the Menu Manager first.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setLocation("/dashboard/menu")} data-testid="button-go-to-menu">
                Go to Menu Manager
              </Button>
            </div>
          )}
        </div>

        <div className="w-80 border-l flex flex-col bg-muted/30">
          <div className="p-4 border-b flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 className="font-medium">{targetCart === "new" ? "New Order" : "Add Items"}</h2>
            <Badge variant="secondary" className="no-default-active-elevate">{currentCart.reduce((sum, i) => sum + i.quantity, 0)}</Badge>
          </div>

          <ScrollArea className="flex-1 p-4">
            {currentCart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Cart is empty</p>
                <p className="text-sm">Click items to add them</p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentCart.map(item => (
                  <Card key={item.cartKey} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="mt-0.5">
                            {item.modifiers.map(mod => (
                              <p key={mod.id} className="text-xs text-muted-foreground">
                                + {mod.name} {parseFloat(mod.price) > 0 && `($${parseFloat(mod.price).toFixed(2)})`}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">${item.price.toFixed(2)} each</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeFromCart(item.cartKey, targetCart)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => updateCartQuantity(item.cartKey, -1, targetCart)} data-testid={`button-decrease-${item.cartKey}`}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button size="icon" variant="outline" onClick={() => updateCartQuantity(item.cartKey, 1, targetCart)} data-testid={`button-increase-${item.cartKey}`}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t space-y-3">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>${currentTotal.toFixed(2)}</span>
            </div>
            {targetCart === "new" ? (
              <Button
                className="w-full"
                size="lg"
                disabled={cart.length === 0 || createOrderMutation.isPending}
                onClick={() => createOrderMutation.mutate()}
                data-testid="button-place-order"
              >
                {createOrderMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Order...</>
                ) : (
                  <><CheckCircle className="mr-2 h-4 w-4" />Place Order</>
                )}
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                disabled={addItemsCart.length === 0 || addItemsMutation.isPending}
                onClick={() => {
                  if (detailOrderId) {
                    addItemsMutation.mutate({ orderId: detailOrderId, items: addItemsCart });
                  }
                }}
                data-testid="button-add-items-to-order"
              >
                {addItemsMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding Items...</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" />Add to Order</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderModifierDialog = () => (
    <Dialog open={modifierDialogOpen} onOpenChange={(open) => {
      if (!open) {
        setModifierDialogOpen(false);
        setModifierItem(null);
        setModifierGroups([]);
        setSelectedModifiers({});
      }
    }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-modifier-dialog-title">
            {modifierItem?.name}
          </DialogTitle>
          <DialogDescription>
            ${modifierItem ? parseFloat(modifierItem.price).toFixed(2) : "0.00"} · Select options below
          </DialogDescription>
        </DialogHeader>
        {loadingModifiers ? (
          <div className="space-y-3 py-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : modifierGroups.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">
            <p>No modifiers available for this item.</p>
            <Button className="mt-4" onClick={confirmModifiers} data-testid="button-add-no-modifiers">
              <Plus className="mr-2 h-4 w-4" />
              Add to Order
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {modifierGroups.map(group => {
              const groupSelections = selectedModifiers[group.id] || new Set();
              const minNotMet = group.isRequired || group.minSelections > 0;
              const minRequired = Math.max(group.minSelections, group.isRequired ? 1 : 0);
              const isMissing = minNotMet && groupSelections.size < minRequired;
              return (
                <div key={group.id} className="space-y-2" data-testid={`modifier-group-${group.id}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{group.name}</h4>
                    <div className="flex items-center gap-2">
                      {minNotMet && (
                        <Badge variant={isMissing ? "destructive" : "secondary"} className="text-xs no-default-active-elevate">
                          {isMissing ? `Select ${minRequired}` : "Required"}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {group.maxSelections === 1 ? "Choose 1" : group.maxSelections === -1 ? "Choose any" : `Up to ${group.maxSelections}`}
                      </span>
                    </div>
                  </div>
                  {group.description && (
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  )}
                  <div className="space-y-1">
                    {group.modifiers.filter(m => m.isAvailable).map(mod => {
                      const isSelected = groupSelections.has(mod.id);
                      const atMax = group.maxSelections > 0 && groupSelections.size >= group.maxSelections && !isSelected;
                      return (
                        <div
                          key={mod.id}
                          className={`flex items-center justify-between p-2.5 rounded-md border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : atMax ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"}`}
                          onClick={() => !atMax && toggleModifier(group.id, mod.id, group.maxSelections)}
                          data-testid={`modifier-option-${mod.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`h-4 w-4 rounded-${group.maxSelections === 1 ? "full" : "sm"} border-2 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                              {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                            </div>
                            <span className="text-sm">{mod.name}</span>
                          </div>
                          {parseFloat(mod.price) > 0 && (
                            <span className="text-sm text-muted-foreground">+${parseFloat(mod.price).toFixed(2)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(() => {
              const hasUnmetRequirements = modifierGroups.some(group => {
                const min = Math.max(group.minSelections, group.isRequired ? 1 : 0);
                return min > 0 && (selectedModifiers[group.id]?.size || 0) < min;
              });
              return (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setModifierDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={confirmModifiers} disabled={hasUnmetRequirements} data-testid="button-confirm-modifiers">
                    <Plus className="mr-2 h-4 w-4" />
                    Add to Order
                  </Button>
                </DialogFooter>
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  if (isNewOrder) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 p-4 border-b flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/pos/orders")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold" data-testid="text-new-order-title">New Order</h1>
            <p className="text-sm text-muted-foreground">
              {tableId ? `Table selected` : "Counter order"}
            </p>
          </div>
          {!tableId && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Stand #</label>
              <Input
                type="text"
                value={counterNumber}
                onChange={(e) => setCounterNumber(e.target.value)}
                placeholder="e.g. 12"
                className="w-24"
                data-testid="input-counter-number"
              />
            </div>
          )}
        </div>
        {renderMenuPicker("new")}
        {renderModifierDialog()}
      </div>
    );
  }

  if (addingItemsToOrder && detailOrderId) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 p-4 border-b">
          <Button variant="ghost" size="icon" onClick={() => { setAddingItemsToOrder(false); setAddItemsCart([]); }} data-testid="button-back-from-add">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Add Items to Order</h1>
            <p className="text-sm text-muted-foreground">#{orderDetailData?.order?.orderNumber}</p>
          </div>
        </div>
        {renderMenuPicker("add")}
        {renderModifierDialog()}
      </div>
    );
  }

  const activeOrders = activeOrdersData?.orders || [];
  const completedOrders = completedOrdersData?.orders || [];

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection(column === "createdAt" || column === "resolvedAt" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Orders</h1>
          <p className="text-muted-foreground">Manage and track all orders</p>
        </div>
        {canCreateOrders && (
          <Button onClick={() => setLocation("/pos/orders?new=true")} data-testid="button-new-order">
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-fit mb-4">
          <TabsTrigger value="active" data-testid="tab-active-orders">
            <ClipboardList className="mr-2 h-4 w-4" />
            Active Orders
            {activeOrders.length > 0 && (
              <Badge variant="secondary" className="ml-2 no-default-active-elevate">{activeOrders.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-order-history">
            <History className="mr-2 h-4 w-4" />
            Order History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex-1 overflow-auto mt-0">
          {loadingActive ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : activeOrders.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeOrders.map(order => {
                const nextStatus = getNextStatus(order.status);
                return (
                  <Card key={order.id} data-testid={`order-card-${order.id}`} data-order-id={order.id} className={highlightedOrder === order.id ? "ring-2 ring-primary animate-pulse" : ""}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                      <div className="min-w-0">
                        <CardTitle className="text-lg">#{order.orderNumber}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Counter"}
                          {" - "}
                          {formatTime(order.createdAt)}
                        </p>
                      </div>
                      {getStatusBadge(order.status)}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold">${parseFloat(order.total).toFixed(2)}</span>
                        <Badge variant="outline" className="no-default-active-elevate">{order.source.toUpperCase()}</Badge>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openOrderDetail(order.id)}
                          data-testid={`button-view-order-${order.id}`}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View
                        </Button>
                        {nextStatus && nextStatus !== "completed" && canUpdateOrders && (
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: nextStatus })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-next-status-${order.id}`}
                          >
                            {updateStatusMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              `Mark ${ORDER_STATUSES.find(s => s.value === nextStatus)?.label || nextStatus}`
                            )}
                          </Button>
                        )}
                        {order.status === "served" && canProcessPayments && (
                          <Button
                            size="sm"
                            onClick={() => openPaymentDialog(order)}
                            data-testid={`button-complete-pay-${order.id}`}
                          >
                            <DollarSign className="mr-1 h-3.5 w-3.5" />
                            Pay & Complete
                          </Button>
                        )}
                        {canDeleteOrders && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => openCancelDialog(order.id)}
                            data-testid={`button-cancel-order-${order.id}`}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No active orders</h3>
                <p className="text-muted-foreground">
                  {canCreateOrders ? "Start a new order using the button above." : "No active orders at the moment."}
                </p>
                {canCreateOrders && (
                  <Button className="mt-4" onClick={() => setLocation("/pos/orders?new=true")} data-testid="button-start-new-order">
                    <Plus className="mr-2 h-4 w-4" />
                    New Order
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-auto mt-0">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter:</span>
              <Select value={historyFilter} onValueChange={(v) => { setHistoryFilter(v as "all" | "completed" | "cancelled"); setSelectedOrders(new Set()); }}>
                <SelectTrigger className="w-[160px]" data-testid="select-history-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="filter-all">All Orders</SelectItem>
                  <SelectItem value="completed" data-testid="filter-completed">Completed</SelectItem>
                  <SelectItem value="cancelled" data-testid="filter-cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canDeleteOrders && selectedOrders.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                data-testid="button-delete-selected"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete {selectedOrders.size} selected
              </Button>
            )}
          </div>
          {loadingCompleted ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : completedOrders.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canDeleteOrders && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={completedOrders.length > 0 && selectedOrders.size === completedOrders.length}
                            onCheckedChange={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                      )}
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("orderNumber")} data-testid="sort-order-number">
                        <span className="flex items-center">Order # <SortIcon column="orderNumber" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("tableName")} data-testid="sort-table">
                        <span className="flex items-center">Table <SortIcon column="tableName" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")} data-testid="sort-status">
                        <span className="flex items-center">Status <SortIcon column="status" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("source")} data-testid="sort-source">
                        <span className="flex items-center">Source <SortIcon column="source" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("total")} data-testid="sort-total">
                        <span className="flex items-center justify-end">Total <SortIcon column="total" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("createdAt")} data-testid="sort-created">
                        <span className="flex items-center">Created <SortIcon column="createdAt" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("resolvedAt")} data-testid="sort-resolved">
                        <span className="flex items-center">Resolved <SortIcon column="resolvedAt" /></span>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedOrders.map(order => (
                      <TableRow key={order.id} data-testid={`history-row-${order.id}`} data-order-id={order.id} className={highlightedOrder === order.id ? "bg-primary/10" : ""}>
                        {canDeleteOrders && (
                          <TableCell>
                            <Checkbox
                              checked={selectedOrders.has(order.id)}
                              onCheckedChange={() => toggleOrderSelection(order.id)}
                              data-testid={`checkbox-order-${order.id}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>{order.tableNumber ? `Table ${order.tableNumber}` : order.customerName || "Counter"}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="no-default-active-elevate">{order.source.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">${parseFloat(order.total).toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(order.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {order.status === "cancelled"
                            ? (order.cancelledAt ? formatDateTime(order.cancelledAt) : "-")
                            : (order.completedAt ? formatDateTime(order.completedAt) : "-")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openOrderDetail(order.id)}
                            data-testid={`button-view-history-${order.id}`}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <History className="h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">
                  {historyFilter === "all" ? "No order history yet" : historyFilter === "completed" ? "No completed orders" : "No cancelled orders"}
                </h3>
                <p className="text-muted-foreground">
                  {historyFilter === "cancelled" ? "Cancelled orders will appear here." : "Completed and cancelled orders will appear here."}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={detailDialogOpen} onOpenChange={(open: boolean) => {
        setDetailDialogOpen(open);
        if (!open) {
          setDetailOrderId(null);
          setAddingItemsToOrder(false);
          setAddItemsCart([]);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {loadingDetail ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : orderDetailData ? (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <DialogTitle className="text-xl">Order #{orderDetailData.order.orderNumber}</DialogTitle>
                    <DialogDescription>
                      {orderDetailData.order.tableNumber ? `Table ${orderDetailData.order.tableNumber}` : orderDetailData.order.customerName || "Counter order"}
                      {" - "}
                      {formatDateTime(orderDetailData.order.createdAt)}
                    </DialogDescription>
                  </div>
                  {getStatusBadge(orderDetailData.order.status)}
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                {!["completed", "cancelled"].includes(orderDetailData.order.status) && canUpdateOrders && (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">Table Assignment</h3>
                    </div>
                    {orderDetailData.order.tableNumber ? (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm" data-testid="text-assigned-table">
                          Currently assigned to <span className="font-semibold">Table {orderDetailData.order.tableNumber}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <Select value={assignTableId} onValueChange={setAssignTableId}>
                            <SelectTrigger className="w-[160px]" data-testid="select-reassign-table">
                              <SelectValue placeholder="Move to table..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(tablesData || []).filter(t => t.id !== orderDetailData.order.tableId).map(t => (
                                <SelectItem key={t.id} value={t.id} data-testid={`option-table-${t.id}`}>
                                  Table {t.number} ({t.capacity} seats)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            disabled={!assignTableId || assignTableMutation.isPending}
                            onClick={() => assignTableMutation.mutate({ orderId: orderDetailData.order.id, tableId: assignTableId })}
                            data-testid="button-reassign-table"
                          >
                            {assignTableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-muted-foreground">
                          {orderDetailData.order.customerName || "No table assigned"}
                        </p>
                        <div className="flex items-center gap-2 ml-auto">
                          <Select value={assignTableId} onValueChange={setAssignTableId}>
                            <SelectTrigger className="w-[160px]" data-testid="select-assign-table">
                              <SelectValue placeholder="Select table..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(tablesData || []).map(t => (
                                <SelectItem key={t.id} value={t.id} data-testid={`option-table-${t.id}`}>
                                  Table {t.number} ({t.capacity} seats)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            disabled={!assignTableId || assignTableMutation.isPending}
                            onClick={() => assignTableMutation.mutate({ orderId: orderDetailData.order.id, tableId: assignTableId })}
                            data-testid="button-assign-table"
                          >
                            {assignTableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="font-medium mb-3">Order Items</h3>
                  {orderDetailData.items.length > 0 ? (
                    <div className="space-y-2">
                      {orderDetailData.items.map(item => (
                        <div key={item.id} className="p-3 rounded-md border space-y-1" data-testid={`order-item-${item.id}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium">{item.name}</p>
                                {getStatusBadge(item.status)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {item.quantity} x ${parseFloat(item.unitPrice).toFixed(2)}
                                {parseFloat(item.modifiersPrice) > 0 && (
                                  <span> (+${parseFloat(item.modifiersPrice).toFixed(2)} addons)</span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <span className="font-semibold">${parseFloat(item.totalPrice).toFixed(2)}</span>
                              {!["completed", "cancelled"].includes(orderDetailData.order.status) && canUpdateOrders && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => removeItemMutation.mutate({ orderId: orderDetailData.order.id, itemId: item.id })}
                                  disabled={removeItemMutation.isPending}
                                  data-testid={`button-remove-item-${item.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="pl-3 border-l-2 border-muted ml-1 space-y-0.5" data-testid={`order-item-modifiers-${item.id}`}>
                              {item.modifiers.map((mod: any, idx: number) => (
                                <p key={idx} className="text-sm text-muted-foreground">
                                  {mod.name}
                                  {parseFloat(mod.price) > 0 && (
                                    <span className="ml-1">(+${parseFloat(mod.price).toFixed(2)})</span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No items in this order.</p>
                  )}
                </div>

                <div className="rounded-md border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${parseFloat(orderDetailData.order.subtotal).toFixed(2)}</span>
                  </div>
                  {parseFloat(orderDetailData.order.taxAmount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>${parseFloat(orderDetailData.order.taxAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {parseFloat(orderDetailData.order.discountAmount || "0") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span>-${parseFloat(orderDetailData.order.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span>${parseFloat(orderDetailData.order.total).toFixed(2)}</span>
                  </div>
                  {parseFloat(orderDetailData.order.paidAmount) > 0 && (
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                      <span>Paid</span>
                      <span>${parseFloat(orderDetailData.order.paidAmount).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {!["completed", "cancelled"].includes(orderDetailData.order.status) && (
                  <div className="flex gap-2 flex-wrap">
                    {canCreateOrders && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDetailDialogOpen(false);
                          setAddingItemsToOrder(true);
                        }}
                        data-testid="button-add-more-items"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add More Items
                      </Button>
                    )}
                    {getNextStatus(orderDetailData.order.status) && getNextStatus(orderDetailData.order.status) !== "completed" && canUpdateOrders && (
                      <Button
                        onClick={() => updateStatusMutation.mutate({
                          orderId: orderDetailData.order.id,
                          status: getNextStatus(orderDetailData.order.status)!,
                        })}
                        disabled={updateStatusMutation.isPending}
                        data-testid="button-advance-status"
                      >
                        {updateStatusMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Mark {ORDER_STATUSES.find(s => s.value === getNextStatus(orderDetailData.order.status))?.label}
                      </Button>
                    )}
                    {orderDetailData.order.status === "served" && canProcessPayments && (
                      <Button
                        variant="default"
                        onClick={() => openPaymentDialog(orderDetailData.order)}
                        data-testid="button-complete-order"
                      >
                        <DollarSign className="mr-2 h-4 w-4" />
                        Pay & Complete
                      </Button>
                    )}
                    {canDeleteOrders && (
                      <Button
                        variant="outline"
                        className="text-destructive"
                        onClick={() => openCancelDialog(orderDetailData.order.id)}
                        data-testid="button-cancel-order-detail"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancel Order
                      </Button>
                    )}
                  </div>
                )}

                {orderDetailData.statusHistory.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-3">Status History</h3>
                    <div className="space-y-2">
                      {orderDetailData.statusHistory.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground w-20 shrink-0">{formatTime(entry.createdAt)}</span>
                          <span>{entry.fromStatus || "created"}</span>
                          <span className="text-muted-foreground">&rarr;</span>
                          <span className="font-medium">{entry.toStatus}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Order not found</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={(open: boolean) => {
        setCancelDialogOpen(open);
        if (!open) {
          setCancelOrderId(null);
          setCancelReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block" htmlFor="cancel-reason">
                Reason for cancellation (optional)
              </label>
              <Input
                id="cancel-reason"
                placeholder="e.g. Customer changed their mind"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelOrderId(null);
                setCancelReason("");
              }}
              data-testid="button-cancel-dismiss"
            >
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelOrder}
              disabled={updateStatusMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment - Order #{payOrderNumber}</DialogTitle>
            <DialogDescription>Select payment method to complete this order</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex justify-between mb-2">
                <span>Order Total</span>
                <span className="font-bold">${parseFloat(payOrderTotal).toFixed(2)}</span>
              </div>
              {parseFloat(payOrderPaid) > 0 && (
                <div className="flex justify-between mb-2 text-sm text-green-600 dark:text-green-400">
                  <span>Already Paid</span>
                  <span>${parseFloat(payOrderPaid).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Balance Due</span>
                <span>${payRemainingBalance}</span>
              </div>
            </div>

            {!payOrderTableId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Table (optional)</label>
                <Select value={payTableSelection} onValueChange={setPayTableSelection}>
                  <SelectTrigger data-testid="select-pay-table">
                    <SelectValue placeholder="No table assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {tablesData?.filter(t => t.status === "available").map((t) => (
                      <SelectItem key={t.id} value={t.id} data-testid={`option-pay-table-${t.id}`}>
                        Table {t.number} (seats {t.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Method</label>
              {availablePayMethods.length > 1 ? (
                <Select value={selectedPayMethod} onValueChange={setSelectedPayMethod}>
                  <SelectTrigger data-testid="select-pay-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePayMethods.map((m) => (
                      <SelectItem key={m.id} value={m.method} data-testid={`option-pay-${m.id}`}>
                        <div className="flex items-center gap-2">
                          {m.icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                          {m.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : availablePayMethods.length === 1 ? (
                <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50" data-testid="text-pay-method-single">
                  {availablePayMethods[0].icon === "cash" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                  <span className="text-sm">{availablePayMethods[0].label}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/50 bg-destructive/10" data-testid="text-no-pay-methods">
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
                data-testid="input-order-tip"
              />
            </div>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex justify-between text-lg font-bold">
                <span>Total to Collect</span>
                <span data-testid="text-collect-total">
                  ${(parseFloat(payRemainingBalance) + parseFloat(tipAmount || "0")).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} data-testid="button-cancel-pay">
              Cancel
            </Button>
            {!hasPayMethod && payOrderId && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (payOrderId) {
                    if (payTableSelection && !payOrderTableId) {
                      try {
                        await assignTableMutation.mutateAsync({ orderId: payOrderId, tableId: payTableSelection });
                      } catch { return; }
                    }
                    updateStatusMutation.mutate({ orderId: payOrderId, status: "completed" });
                    setPayDialogOpen(false);
                    setPayOrderId(null);
                    setDetailDialogOpen(false);
                    setDetailOrderId(null);
                  }
                }}
                disabled={updateStatusMutation.isPending || assignTableMutation.isPending}
                data-testid="button-complete-no-pay"
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Complete Without Payment
                  </>
                )}
              </Button>
            )}
            {hasPayMethod && (
              <Button
                onClick={payBalance}
                disabled={recordPaymentMutation.isPending || assignTableMutation.isPending || !selectedPayMethod}
                data-testid="button-confirm-pay"
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedOrders.size} order(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected orders and all their associated data (items, payments). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedOrders))}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
