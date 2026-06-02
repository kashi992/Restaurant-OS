import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FlaskConical,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  price: string;
  cost: string | null;
}

interface RecipeIngredient {
  id: string;
  menuItemId: string;
  inventoryItemId: string;
  modifierId: string | null;
  quantity: string;
  unit: string;
  notes: string | null;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

interface ProfitReportItem {
  menuItemId: string;
  name: string;
  sellingPrice: string;
  costPrice: string;
  grossProfit: string;
  marginPercent: string;
  hasCost: boolean;
}

interface ProfitReport {
  items: ProfitReportItem[];
  summary: {
    totalItems: number;
    itemsWithCost: number;
    avgMarginPercent: string;
  };
}

// ─── Recipe Builder Tab ───────────────────────────────────────────────────────

function RecipeBuilderTab({ restaurantId }: { restaurantId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>("");

  // Form state
  const [form, setForm] = useState({
    inventoryItemId: "",
    quantity: "",
    unit: "",
    notes: "",
  });

  const { data: menuItemsData, isLoading: menuLoading } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "menu-items"],
    enabled: !!restaurantId,
  });

  const { data: recipesData, isLoading: recipesLoading } = useQuery<{
    recipes: (RecipeIngredient & { menuItemName: string })[];
  }>({
    queryKey: ["/api/restaurants", restaurantId, "recipes"],
    enabled: !!restaurantId,
  });

  const { data: inventoryItemsData } = useQuery<InventoryItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "inventory"],
    enabled: !!restaurantId,
  });
  const inventoryItems = inventoryItemsData || [];

  const addMutation = useMutation({
    mutationFn: async (data: typeof form & { menuItemId: string }) => {
      return apiRequest(
        "POST",
        `/api/restaurants/${restaurantId}/menu-items/${data.menuItemId}/recipes`,
        data
      );
    },
    onSuccess: () => {
      toast({ title: "Ingredient added to recipe" });
      qc.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "recipes"] });
      setAddOpen(false);
      setForm({ inventoryItemId: "", quantity: "", unit: "", notes: "" });
    },
    onError: () => {
      toast({ title: "Failed to add ingredient", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      return apiRequest(
        "DELETE",
        `/api/restaurants/${restaurantId}/recipes/${recipeId}`
      );
    },
    onSuccess: () => {
      toast({ title: "Ingredient removed" });
      qc.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "recipes"] });
    },
    onError: () => {
      toast({ title: "Failed to remove ingredient", variant: "destructive" });
    },
  });

  const menuItems = menuItemsData || [];
  const recipes = recipesData?.recipes || [];

  // Group recipes by menuItemId
  const recipesByItem = recipes.reduce(
    (acc, r) => {
      if (!acc[r.menuItemId]) acc[r.menuItemId] = [];
      acc[r.menuItemId].push(r);
      return acc;
    },
    {} as Record<string, typeof recipes>
  );

  const handleAdd = () => {
    if (!selectedMenuItemId || !form.inventoryItemId || !form.quantity || !form.unit) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    addMutation.mutate({ ...form, menuItemId: selectedMenuItemId });
  };

  if (menuLoading || recipesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Link inventory ingredients to menu items to track food costs.
        </p>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Ingredient
        </Button>
      </div>

      {menuItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No menu items found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add menu items first, then build recipes for them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {menuItems.map((item) => {
            const itemRecipes = recipesByItem[item.id] || [];
            const isExpanded = expandedItem === item.id;
            return (
              <Card key={item.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() =>
                    setExpandedItem(isExpanded ? null : item.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Price: ${parseFloat(item.price).toFixed(2)}
                        {item.cost
                          ? ` · Cost: $${parseFloat(item.cost).toFixed(2)}`
                          : " · No cost set"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={itemRecipes.length > 0 ? "default" : "secondary"}>
                    {itemRecipes.length} ingredient{itemRecipes.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {itemRecipes.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-2">
                        No ingredients linked yet.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ingredient</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemRecipes.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">
                                {inventoryItems.find((i) => i.id === r.inventoryItemId)?.name ?? r.inventoryItemId}
                              </TableCell>
                              <TableCell>{r.quantity}</TableCell>
                              <TableCell>{r.unit}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {r.notes || "—"}
                              </TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => deleteMutation.mutate(r.id)}
                                      disabled={deleteMutation.isPending}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove ingredient</TooltipContent>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        setSelectedMenuItemId(item.id);
                        setAddOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Ingredient
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Ingredient Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Recipe Ingredient</DialogTitle>
            <DialogDescription>
              Link an inventory item to a menu item recipe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Menu Item *</Label>
              <Select
                value={selectedMenuItemId}
                onValueChange={setSelectedMenuItemId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select menu item…" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Inventory Item *</Label>
              <Select
                value={form.inventoryItemId}
                onValueChange={(v) => setForm((f) => ({ ...f, inventoryItemId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select inventory item…" />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.name} ({inv.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="0.250"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unit…" />
                  </SelectTrigger>
                  <SelectContent>
                    {["kg", "g", "lb", "oz", "L", "ml", "pcs", "cup", "tbsp", "tsp"].map(
                      (u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                placeholder="e.g. finely chopped"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add Ingredient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Profit Report Tab ────────────────────────────────────────────────────────

function ProfitReportTab({ restaurantId }: { restaurantId: string }) {
  const { data, isLoading, isError } = useQuery<ProfitReport>({
    queryKey: ["/api/restaurants", restaurantId, "recipes", "profit-report"],
    enabled: !!restaurantId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="font-medium">Failed to load profit report</p>
        </CardContent>
      </Card>
    );
  }

  const { items, summary } = data;

  const getMarginColor = (margin: string) => {
    const m = parseFloat(margin);
    if (m >= 70) return "text-green-600 dark:text-green-400";
    if (m >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getMarginBadge = (margin: string, hasCost: boolean) => {
    if (!hasCost) return <Badge variant="secondary">No cost</Badge>;
    const m = parseFloat(margin);
    if (m >= 70)
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          High
        </Badge>
      );
    if (m >= 40)
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          Medium
        </Badge>
      );
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
        Low
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Items</CardDescription>
            <CardTitle className="text-3xl">{summary.totalItems}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Items with Cost</CardDescription>
            <CardTitle className="text-3xl">{summary.itemsWithCost}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Profit Margin</CardDescription>
            <CardTitle className={`text-3xl ${getMarginColor(summary.avgMarginPercent)}`}>
              {summary.avgMarginPercent}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Per-item table */}
      <Card>
        <CardHeader>
          <CardTitle>Item Breakdown</CardTitle>
          <CardDescription>
            Profit margin per menu item based on selling price vs cost.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No menu items found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Selling Price</TableHead>
                  <TableHead className="text-right">Cost Price</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.menuItemId}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right">
                      ${item.sellingPrice}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.hasCost ? `$${item.costPrice}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.hasCost ? (
                        <span
                          className={
                            parseFloat(item.grossProfit) >= 0
                              ? "text-green-600 dark:text-green-400 flex items-center justify-end gap-1"
                              : "text-red-600 dark:text-red-400 flex items-center justify-end gap-1"
                          }
                        >
                          {parseFloat(item.grossProfit) >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          ${item.grossProfit}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${item.hasCost
                          ? getMarginColor(item.marginPercent)
                          : "text-muted-foreground"
                        }`}
                    >
                      {item.hasCost ? `${item.marginPercent}%` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {getMarginBadge(item.marginPercent, item.hasCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecipeCostingPage() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;

  // Feature gate check
  const hasRecipeFeature  = user?.features?.["recipe_management"] === true;

if (!hasRecipeFeature) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FlaskConical className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold">Recipe Costing Unavailable</h2>
      <p className="text-muted-foreground mt-2 max-w-sm">
        The <strong>Recipe & Cost Management</strong> feature is not enabled for
        your restaurant. Please contact your platform administrator.
      </p>
    </div>
  );
}

  if (!restaurantId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recipe Costing</h1>
        <p className="text-muted-foreground">
          Build recipes by linking inventory ingredients to menu items, and
          track your profit margins.
        </p>
      </div>

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">
            <FlaskConical className="h-4 w-4 mr-2" />
            Recipe Builder
          </TabsTrigger>
          <TabsTrigger value="profit">
            <TrendingUp className="h-4 w-4 mr-2" />
            Profit Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <RecipeBuilderTab restaurantId={restaurantId} />
        </TabsContent>

        <TabsContent value="profit" className="mt-4">
          <ProfitReportTab restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}