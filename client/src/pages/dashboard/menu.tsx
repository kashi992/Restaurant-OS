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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  FolderOpen,
  Loader2,
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
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

const menuItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required"),
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
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

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

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/restaurants", restaurantId, "categories", { menuId: selectedMenu?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/categories?menuId=${selectedMenu?.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!selectedMenu?.id,
  });

  const { data: allItems } = useQuery<MenuItem[]>({
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
      if (!res.ok) throw new Error("Failed to create menu");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menus"] });
      setMenuDialogOpen(false);
      menuForm.reset();
      toast({ title: "Menu created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof categorySchema>) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ ...data, menuId: selectedMenu?.id }),
      });
      if (!res.ok) throw new Error("Failed to create category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "categories"] });
      setCategoryDialogOpen(false);
      categoryForm.reset();
      toast({ title: "Category created successfully" });
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
      if (!res.ok) throw new Error("Failed to save item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menu-items"] });
      setItemDialogOpen(false);
      setEditingItem(null);
      itemForm.reset({ name: "", description: "", price: "", isAvailable: true });
      toast({ title: editingItem ? "Item updated successfully" : "Item created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Menu Manager</h1>
          <p className="text-muted-foreground">Manage your menus, categories, and items</p>
        </div>
        <Button onClick={() => setMenuDialogOpen(true)} data-testid="button-create-menu">
          <Plus className="mr-2 h-4 w-4" />
          Create Menu
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Menus List */}
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
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedMenu?.id === menu.id ? "bg-accent border-primary" : "hover-elevate"
                    }`}
                    onClick={() => {
                      setSelectedMenu(menu);
                      setSelectedCategory(null);
                    }}
                    data-testid={`menu-item-${menu.id}`}
                  >
                    <div>
                      <p className="font-medium">{menu.name}</p>
                      {menu.description && (
                        <p className="text-sm text-muted-foreground">{menu.description}</p>
                      )}
                    </div>
                    {menu.isActive && (
                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">
                        Active
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No menus yet. Create your first menu.</p>
            )}
          </CardContent>
        </Card>

        {/* Categories List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Categories
            </CardTitle>
            <CardDescription>
              {selectedMenu ? `Categories in ${selectedMenu.name}` : "Select a menu first"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedMenu ? (
              <>
                <Button
                  variant="outline"
                  className="w-full mb-4"
                  onClick={() => setCategoryDialogOpen(true)}
                  data-testid="button-add-category"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Category
                </Button>
                {categories && categories.length > 0 ? (
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedCategory?.id === category.id ? "bg-accent border-primary" : "hover-elevate"
                        }`}
                        onClick={() => setSelectedCategory(category)}
                        data-testid={`category-item-${category.id}`}
                      >
                        <p className="font-medium">{category.name}</p>
                        {category.description && (
                          <p className="text-sm text-muted-foreground">{category.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No categories yet.</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Select a menu to view categories.</p>
            )}
          </CardContent>
        </Card>

        {/* Items List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5" />
              Menu Items
            </CardTitle>
            <CardDescription>
              {selectedCategory ? `Items in ${selectedCategory.name}` : "Select a category first"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedCategory ? (
              <>
                <Button
                  variant="outline"
                  className="w-full mb-4"
                  onClick={() => openItemDialog()}
                  data-testid="button-add-item"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
                {items && items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border"
                        data-testid={`item-card-${item.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            )}
                            <p className="text-sm font-medium text-primary">${item.price}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.isAvailable && (
                              <Badge variant="secondary">Unavailable</Badge>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openItemDialog(item)}
                              data-testid={`button-edit-item-${item.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No items yet.</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Select a category to view items.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Menu Dialog */}
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

      {/* Create Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>Add a category to {selectedMenu?.name}</DialogDescription>
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
                      <Input placeholder="Appetizers" data-testid="input-category-name" {...field} />
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
                      <Textarea placeholder="Start your meal right" data-testid="input-category-description" {...field} />
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
                  Add Category
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update menu item details" : `Add an item to ${selectedCategory?.name}`}
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
                      <Input placeholder="Grilled Salmon" data-testid="input-item-name" {...field} />
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
                      <Textarea placeholder="Fresh Atlantic salmon with herbs" data-testid="input-item-description" {...field} />
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
                      <Input type="number" step="0.01" placeholder="19.99" data-testid="input-item-price" {...field} />
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
    </div>
  );
}
