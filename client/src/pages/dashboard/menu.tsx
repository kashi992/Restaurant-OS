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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  FolderOpen,
  Loader2,
  ChevronRight,
} from "lucide-react";

interface Menu {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface Category {
  id: string;
  menuId: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
  imageUrl: string | null;
}

const menuSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const categorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  description: z.string().optional(),
});

const menuItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    "Price must be a valid number"
  ),
  isAvailable: z.boolean(),
});

export default function MenuManager() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const [menuDialogOpen, setMenuDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "category" | "item"; id: string; name: string } | null>(null);

  const { data: menus, isLoading: loadingMenus } = useQuery<Menu[]>({
    queryKey: ["/api/restaurants", restaurantId, "menus"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menus`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch menus");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: categories, isLoading: loadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/restaurants", restaurantId, "categories", selectedMenu?.id || ""],
    queryFn: async () => {
      const url = selectedMenu?.id
        ? `/api/restaurants/${restaurantId}/categories?menuId=${selectedMenu.id}`
        : `/api/restaurants/${restaurantId}/categories`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!selectedMenu?.id,
  });

  const { data: allItems, isLoading: loadingItems } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurants", restaurantId, "menu-items"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const items = allItems?.filter(item => item.categoryId === selectedCategory?.id);

  const menuForm = useForm({
    resolver: zodResolver(menuSchema),
    defaultValues: { name: "", description: "" },
  });

  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "" },
  });

  const itemForm = useForm({
    resolver: zodResolver(menuItemSchema),
    defaultValues: { name: "", description: "", price: "", isAvailable: true },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menus"] });
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menu-items"] });
  };

  const createMenuMutation = useMutation({
    mutationFn: async (data: z.infer<typeof menuSchema>) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create menu");
      }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      setMenuDialogOpen(false);
      menuForm.reset();
      setSelectedMenu(data);
      toast({ title: "Menu created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof categorySchema>) => {
      const url = editingCategory
        ? `/api/restaurants/${restaurantId}/categories/${editingCategory.id}`
        : `/api/restaurants/${restaurantId}/categories`;
      const res = await fetch(url, {
        method: editingCategory ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ ...data, menuId: selectedMenu?.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save category");
      }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      categoryForm.reset();
      if (!editingCategory) {
        setSelectedCategory(data);
      }
      toast({ title: editingCategory ? "Category updated" : "Category created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof menuItemSchema>) => {
      const url = editingItem
        ? `/api/restaurants/${restaurantId}/menu-items/${editingItem.id}`
        : `/api/restaurants/${restaurantId}/menu-items`;
      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ ...data, categoryId: selectedCategory?.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save item");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setItemDialogOpen(false);
      setEditingItem(null);
      itemForm.reset({ name: "", description: "", price: "", isAvailable: true });
      toast({ title: editingItem ? "Item updated" : "Item created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: "category" | "item"; id: string }) => {
      const endpoint = type === "category"
        ? `/api/restaurants/${restaurantId}/categories/${id}`
        : `/api/restaurants/${restaurantId}/menu-items/${id}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to delete ${type}`);
      }
      return { type, id };
    },
    onSuccess: ({ type, id }) => {
      invalidateAll();
      if (type === "category" && selectedCategory?.id === id) {
        setSelectedCategory(null);
      }
      setDeleteTarget(null);
      toast({ title: `${type === "category" ? "Category" : "Item"} deleted` });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      categoryForm.reset({ name: category.name, description: category.description || "" });
    } else {
      setEditingCategory(null);
      categoryForm.reset({ name: "", description: "" });
    }
    setCategoryDialogOpen(true);
  };

  const openItemDialog = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      itemForm.reset({
        name: item.name,
        description: item.description || "",
        price: item.price,
        isAvailable: item.isAvailable,
      });
    } else {
      setEditingItem(null);
      itemForm.reset({ name: "", description: "", price: "", isAvailable: true });
    }
    setItemDialogOpen(true);
  };

  const getCategoryItemCount = (categoryId: string) => {
    return allItems?.filter(item => item.categoryId === categoryId).length || 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Menu Manager</h1>
          <p className="text-muted-foreground">Manage your menus, categories, and items</p>
        </div>
        <Button onClick={() => { menuForm.reset(); setMenuDialogOpen(true); }} data-testid="button-create-menu">
          <Plus className="mr-2 h-4 w-4" />
          Create Menu
        </Button>
      </div>

      {selectedMenu && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="cursor-pointer hover:text-foreground" onClick={() => { setSelectedMenu(null); setSelectedCategory(null); }}>
            Menus
          </span>
          <ChevronRight className="h-4 w-4" />
          <span className={selectedCategory ? "cursor-pointer hover:text-foreground" : "text-foreground font-medium"} onClick={() => setSelectedCategory(null)}>
            {selectedMenu.name}
          </span>
          {selectedCategory && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground font-medium">{selectedCategory.name}</span>
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5" />
              Menus
            </CardTitle>
            <CardDescription>Select a menu to manage categories</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMenus ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : menus && menus.length > 0 ? (
              <div className="space-y-2">
                {menus.map((menu) => (
                  <div
                    key={menu.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedMenu?.id === menu.id ? "bg-accent border-primary" : "hover-elevate"
                    }`}
                    onClick={() => {
                      setSelectedMenu(menu);
                      setSelectedCategory(null);
                    }}
                    data-testid={`menu-item-${menu.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{menu.name}</p>
                      {menu.description && (
                        <p className="text-sm text-muted-foreground truncate">{menu.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {menu.isActive && (
                        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 no-default-active-elevate">
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No menus yet</p>
                <p className="text-muted-foreground text-xs mt-1">Create your first menu to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Categories
                </CardTitle>
                <CardDescription>
                  {selectedMenu ? `Categories in "${selectedMenu.name}"` : "Select a menu first"}
                </CardDescription>
              </div>
              {selectedMenu && (
                <Button
                  size="sm"
                  onClick={() => openCategoryDialog()}
                  data-testid="button-add-category"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedMenu ? (
              <div className="text-center py-8">
                <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Select a menu to view categories</p>
              </div>
            ) : loadingCategories ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : categories && categories.length > 0 ? (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors group ${
                      selectedCategory?.id === category.id ? "bg-accent border-primary" : "hover-elevate"
                    }`}
                    onClick={() => setSelectedCategory(category)}
                    data-testid={`category-item-${category.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{category.name}</p>
                      {category.description && (
                        <p className="text-sm text-muted-foreground truncate">{category.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Badge variant="secondary" className="no-default-active-elevate">
                        {getCategoryItemCount(category.id)}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); openCategoryDialog(category); }}
                        data-testid={`button-edit-category-${category.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "category", id: category.id, name: category.name }); }}
                        data-testid={`button-delete-category-${category.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No categories yet</p>
                <p className="text-muted-foreground text-xs mt-1">Add a category to organize your menu items</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5" />
                  Menu Items
                </CardTitle>
                <CardDescription>
                  {selectedCategory ? `Items in "${selectedCategory.name}"` : "Select a category first"}
                </CardDescription>
              </div>
              {selectedCategory && (
                <Button
                  size="sm"
                  onClick={() => openItemDialog()}
                  data-testid="button-add-item"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedCategory ? (
              <div className="text-center py-8">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Select a category to view items</p>
              </div>
            ) : loadingItems ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : items && items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-md border group"
                    data-testid={`item-card-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{item.name}</p>
                          {!item.isAvailable && (
                            <Badge variant="secondary" className="no-default-active-elevate">Unavailable</Badge>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                        )}
                        <p className="text-sm font-semibold mt-1">${parseFloat(item.price).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={() => openItemDialog(item)}
                          data-testid={`button-edit-item-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() => setDeleteTarget({ type: "item", id: item.id, name: item.name })}
                          data-testid={`button-delete-item-${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No items in this category</p>
                <p className="text-muted-foreground text-xs mt-1">Add items for customers to order</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Menu</DialogTitle>
            <DialogDescription>Add a new menu for your restaurant.</DialogDescription>
          </DialogHeader>
          <Form {...menuForm}>
            <form onSubmit={menuForm.handleSubmit((data) => createMenuMutation.mutate(data))} className="space-y-4">
              <FormField
                control={menuForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Lunch Menu" data-testid="input-menu-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={menuForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Available 11am - 3pm" data-testid="input-menu-description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMenuDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMenuMutation.isPending} data-testid="button-save-menu">
                  {createMenuMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Menu
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={(open: boolean) => { setCategoryDialogOpen(open); if (!open) setEditingCategory(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>
              {editingCategory ? "Update category details" : `Add a category to "${selectedMenu?.name}"`}
            </DialogDescription>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit((data) => createCategoryMutation.mutate(data))} className="space-y-4">
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Pizza, Burgers, Drinks" data-testid="input-category-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="A short description for this category" data-testid="input-category-description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCategoryMutation.isPending} data-testid="button-save-category">
                  {createCategoryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingCategory ? "Update Category" : "Add Category"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={(open: boolean) => { setItemDialogOpen(open); if (!open) setEditingItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update menu item details" : `Add an item to "${selectedCategory?.name}"`}
            </DialogDescription>
          </DialogHeader>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit((data) => createItemMutation.mutate(data))} className="space-y-4">
              <FormField
                control={itemForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Margherita Pizza" data-testid="input-item-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={itemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="A description for this item" data-testid="input-item-description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={itemForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" placeholder="9.99" data-testid="input-item-price" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={itemForm.control}
                name="isAvailable"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <FormLabel>Available</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-item-available"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createItemMutation.isPending} data-testid="button-save-item">
                  {createItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? "Update Item" : "Add Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "category" ? "Category" : "Item"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
              {deleteTarget?.type === "category" && " All items in this category may be affected."}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ type: deleteTarget.type, id: deleteTarget.id });
                }
              }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
