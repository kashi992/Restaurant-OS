import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  currentStock: string;
  minStockLevel: string;
  maxStockLevel: string | null;
  costPerUnit: string;
  supplier: string | null;
  storageLocation: string | null;
  isActive: boolean;
}

interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  type: string;
  quantity: string;
  costPerUnit: string | null;
  // totalCost: string | null;
  notes: string | null;
  createdAt: string;
}

interface InventoryAlert {
  id: string;
  inventoryItemId: string;
  alertType: string;
  isResolved: boolean;
  createdAt: string;
}

interface Summary {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  activeAlertsCount: number;
  totalStockValue: string;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────��

const itemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sku: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  currentStock: z.string().min(1, "Current stock is required"),
  minStockLevel: z.string().min(1, "Min stock level is required"),
  maxStockLevel: z.string().optional(),
  costPerUnit: z.string().min(1, "Cost per unit is required"),
  supplier: z.string().optional(),
  storageLocation: z.string().optional(),
});

const transactionSchema = z.object({
  inventoryItemId: z.string().min(1, "Please select an item"),
  type: z.enum(["purchase", "usage", "waste", "adjustment", "return"]),
  quantity: z.string().min(1, "Quantity is required"),
  costPerUnit: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function getStockStatus(item: InventoryItem) {
  const current = parseFloat(item.currentStock ?? "0");
  const min = parseFloat(item.minStockLevel ?? "0");
  if (current <= 0) return { label: "Out of Stock", color: "bg-red-500/10 text-red-600 dark:text-red-400" };
  if (current <= min) return { label: "Low Stock", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" };
  return { label: "In Stock", color: "bg-green-500/10 text-green-600 dark:text-green-400" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<InventoryItem | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: items, isLoading: loadingItems } = useQuery<InventoryItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/inventory`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/restaurants", restaurantId, "inventory", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/inventory/summary`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: transactions, isLoading: loadingTx } = useQuery<InventoryTransaction[]>({
    queryKey: ["/api/restaurants", restaurantId, "inventory-transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/inventory-transactions`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: alerts, isLoading: loadingAlerts } = useQuery<InventoryAlert[]>({
    queryKey: ["/api/restaurants", restaurantId, "inventory-alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/inventory-alerts?unresolved=true`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof itemSchema>) => {
      const url = editingItem
        ? `/api/restaurants/${restaurantId}/inventory/${editingItem.id}`
        : `/api/restaurants/${restaurantId}/inventory`;
      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory", "summary"] });
      setItemDialogOpen(false);
      setEditingItem(null);
      itemForm.reset();
      toast({ title: editingItem ? "Item updated" : "Item created" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/inventory/${id}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete item");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory", "summary"] });
      setDeleteConfirmItem(null);
      toast({ title: "Item deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const logTransactionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof transactionSchema>) => {
      // For usage/waste, store as negative quantity
      const isOutgoing = data.type === "usage" || data.type === "waste";
      const quantity = isOutgoing
        ? (-Math.abs(parseFloat(data.quantity))).toString()
        : Math.abs(parseFloat(data.quantity)).toString();

      const res = await fetch(`/api/restaurants/${restaurantId}/inventory-transactions`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ ...data, quantity }),
      });
      if (!res.ok) throw new Error("Failed to log transaction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory", "summary"] });
      setTxDialogOpen(false);
      txForm.reset();
      toast({ title: "Transaction logged" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(
        `/api/restaurants/${restaurantId}/inventory-alerts/${alertId}/resolve`,
        { method: "PATCH", headers: authHeaders, credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to resolve alert");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "inventory", "summary"] });
      toast({ title: "Alert resolved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Forms ──────────────────────────────────────────────────────────────────

  const itemForm = useForm<z.infer<typeof itemSchema>>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "", description: "", sku: "", unit: "pcs",
      currentStock: "0", minStockLevel: "0", maxStockLevel: "",
      costPerUnit: "0.00", supplier: "", storageLocation: "",
    },
  });

  const txForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      inventoryItemId: "", type: "purchase", quantity: "", costPerUnit: "", notes: "",
    },
  });

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    itemForm.reset({
      name: item.name,
      description: item.description ?? "",
      sku: item.sku ?? "",
      unit: item.unit,
      currentStock: item.currentStock,
      minStockLevel: item.minStockLevel,
      maxStockLevel: item.maxStockLevel ?? "",
      costPerUnit: item.costPerUnit,
      supplier: item.supplier ?? "",
      storageLocation: item.storageLocation ?? "",
    });
    setItemDialogOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">
            Inventory
          </h1>
          <p className="text-muted-foreground">Track stock levels, log transactions and manage alerts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTxDialogOpen(true)}>
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            Log Transaction
          </Button>
          <Button onClick={() => { setEditingItem(null); itemForm.reset(); setItemDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary?.totalItems ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <TrendingDown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{summary?.lowStockCount ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{summary?.activeAlertsCount ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${summary?.totalStockValue ?? "0.00"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="alerts" className="relative">
            Alerts
            {(summary?.activeAlertsCount ?? 0) > 0 && (
              <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                {summary?.activeAlertsCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Items Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="items" className="mt-4">
          {loadingItems ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : items && items.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Cost/Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const status = getStockStatus(item);
                    return (
                      <TableRow key={item.id} data-testid={`inventory-row-${item.id}`}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.sku ?? "—"}</TableCell>
                        <TableCell>
                          {parseFloat(item.currentStock).toFixed(2)} {item.unit}
                        </TableCell>
                        <TableCell>
                          {parseFloat(item.minStockLevel).toFixed(2)} {item.unit}
                        </TableCell>
                        <TableCell>${parseFloat(item.costPerUnit).toFixed(2)}</TableCell>
                        <TableCell>{item.supplier ?? "—"}</TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditDialog(item)}
                              data-testid={`button-edit-inventory-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmItem(item)}
                              data-testid={`button-delete-inventory-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No inventory items yet</p>
              <p className="text-sm text-muted-foreground">Add your first item to start tracking stock</p>
              <Button className="mt-4" onClick={() => setItemDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Transactions Tab ───────────────────────────────────────────── */}
        <TabsContent value="transactions" className="mt-4">
          {loadingTx ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const item = items?.find((i) => i.id === tx.inventoryItemId);
                    const qty = parseFloat(tx.quantity);
                    const isOutgoing = qty < 0;
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium">{item?.name ?? "Unknown"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{tx.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={isOutgoing ? "text-red-600" : "text-green-600"}>
                            {isOutgoing ? (
                              <ArrowDownCircle className="mr-1 inline h-3 w-3" />
                            ) : (
                              <ArrowUpCircle className="mr-1 inline h-3 w-3" />
                            )}
                            {Math.abs(qty).toFixed(3)} {item?.unit}
                          </span>
                        </TableCell>
                      <TableCell>
  {tx.costPerUnit
    ? `$${(Math.abs(parseFloat(tx.quantity)) * parseFloat(tx.costPerUnit)).toFixed(2)}`
    : "—"}
</TableCell>
                        <TableCell className="text-muted-foreground">{tx.notes ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground">No transactions logged yet</p>
              <Button className="mt-4" variant="outline" onClick={() => setTxDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Log Transaction
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── Alerts Tab ────────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="mt-4">
          {loadingAlerts ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : alerts && alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const item = items?.find((i) => i.id === alert.inventoryItemId);
                const isOutOfStock = alert.alertType === "out_of_stock";
                return (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                    data-testid={`alert-row-${alert.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`h-5 w-5 ${isOutOfStock ? "text-red-500" : "text-yellow-500"}`} />
                      <div>
                        <p className="font-medium">{item?.name ?? "Unknown Item"}</p>
                        <p className="text-sm text-muted-foreground">
                          {isOutOfStock ? "Out of stock" : "Stock below minimum level"} ·{" "}
                          {new Date(alert.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveAlertMutation.mutate(alert.id)}
                      disabled={resolveAlertMutation.isPending}
                      data-testid={`button-resolve-alert-${alert.id}`}
                    >
                      {resolveAlertMutation.isPending ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-3 w-3" />
                      )}
                      Resolve
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">All clear!</p>
              <p className="text-sm text-muted-foreground">No active inventory alerts</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Item Dialog ─────��────────────────────────────────── */}
      <Dialog open={itemDialogOpen} onOpenChange={(open) => { setItemDialogOpen(open); if (!open) setEditingItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the item details below." : "Fill in the details for the new inventory item."}
            </DialogDescription>
          </DialogHeader>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit((d) => saveItemMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 overflow-y-auto overflow-x-hidden h-[60vh] p-2">
                <FormField control={itemForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Name *</FormLabel>
                    <FormControl><Input placeholder="All-Purpose Flour" data-testid="input-inventory-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl><Input placeholder="FLOUR-001" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-inventory-unit">
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["pcs", "kg", "g", "L", "ml", "box", "dozen", "lb", "oz"].map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="currentStock" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Stock *</FormLabel>
                    <FormControl><Input type="number" step="0.001" placeholder="100" data-testid="input-current-stock" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="minStockLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Stock Level *</FormLabel>
                    <FormControl><Input type="number" step="0.001" placeholder="20" data-testid="input-min-stock" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="maxStockLevel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Stock Level</FormLabel>
                    <FormControl><Input type="number" step="0.001" placeholder="500" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="costPerUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost per Unit ($) *</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="2.50" data-testid="input-cost-per-unit" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="supplier" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Supplier</FormLabel>
                    <FormControl><Input placeholder="Local Farm Co." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="storageLocation" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Storage Location</FormLabel>
                    <FormControl><Input placeholder="Dry Store Shelf A3" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={itemForm.control} name="description" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Optional notes about this item" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveItemMutation.isPending} data-testid="button-save-inventory-item">
                  {saveItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? "Update Item" : "Add Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Log Transaction Dialog ──────────────────────────────────────── */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Inventory Transaction</DialogTitle>
            <DialogDescription>Record stock movement for an inventory item.</DialogDescription>
          </DialogHeader>
          <Form {...txForm}>
            <form onSubmit={txForm.handleSubmit((d) => logTransactionMutation.mutate(d))}>
              <div className="space-y-4 h-[60vh] overflow-x-hidden overflow-y-auto p-2">
              <FormField control={txForm.control} name="inventoryItemId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Item *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-tx-item">
                        <SelectValue placeholder="Select an item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(items ?? []).map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={txForm.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-tx-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="purchase">📦 Purchase (stock in)</SelectItem>
                      <SelectItem value="return">↩️ Return (stock in)</SelectItem>
                      <SelectItem value="usage">🍳 Usage (stock out)</SelectItem>
                      <SelectItem value="waste">🗑️ Waste (stock out)</SelectItem>
                      <SelectItem value="adjustment">✏️ Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={txForm.control} name="quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity *</FormLabel>
                  <FormControl><Input type="number" step="0.001" placeholder="10" data-testid="input-tx-quantity" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={txForm.control} name="costPerUnit" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost per Unit ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="2.50" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={txForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="e.g. Weekly supplier delivery" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={logTransactionMutation.isPending} data-testid="button-save-transaction">
                  {logTransactionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Log Transaction
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ───────────────────────────────────────── */}
      <Dialog open={!!deleteConfirmItem} onOpenChange={(open) => { if (!open) setDeleteConfirmItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Inventory Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmItem?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmItem(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteItemMutation.isPending}
              onClick={() => deleteConfirmItem && deleteItemMutation.mutate(deleteConfirmItem.id)}
              data-testid="button-confirm-delete"
            >
              {deleteItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}