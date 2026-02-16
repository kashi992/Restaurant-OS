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
  Pencil,
  Trash2,
  UtensilsCrossed,
  FolderOpen,
  Loader2,
  Settings2,
  Link2,
  Unlink,
  X,
  ImagePlus,
  Upload,
} from "lucide-react";
import { Label } from "@/components/ui/label";

interface Category {
  id: string;
  menuId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
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

interface ModifierGroupData {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
}

interface ModifierData {
  id: string;
  modifierGroupId: string;
  name: string;
  price: string;
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

interface ItemModifierLink extends ModifierGroupData {
  linkSortOrder: number;
  modifiers: ModifierData[];
}

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

const modifierGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
  isRequired: z.boolean(),
  maxSelections: z.number().int(),
});

const modifierSchema = z.object({
  name: z.string().min(1, "Modifier name is required"),
  price: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    "Price must be a valid number"
  ),
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
});

export default function MenuManager() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "category" | "item" | "modifierGroup" | "modifier"; id: string; name: string; parentId?: string } | null>(null);
  const [addItemToCategoryId, setAddItemToCategoryId] = useState<string | null>(null);
  const [modifierGroupDialogOpen, setModifierGroupDialogOpen] = useState(false);
  const [editingModifierGroup, setEditingModifierGroup] = useState<ModifierGroupData | null>(null);
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<ModifierData | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [managingItemModifiers, setManagingItemModifiers] = useState<string | null>(null);
  const [categoryImageFile, setCategoryImageFile] = useState<File | null>(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState<string | null>(null);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload image");
    const data = await res.json();
    return data.imageUrl;
  };

  const handleImageSelect = (
    file: File | null,
    setFile: (f: File | null) => void,
    setPreview: (p: string | null) => void
  ) => {
    if (file) {
      setFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFile(null);
      setPreview(null);
    }
  };

  const { data: categories, isLoading: loadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/restaurants", restaurantId, "categories"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/categories`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
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

  const { data: modifierGroups, isLoading: loadingModifierGroups } = useQuery<ModifierGroupData[]>({
    queryKey: ["/api/restaurants", restaurantId, "modifier-groups"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/modifier-groups`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch modifier groups");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: activeGroupModifiers } = useQuery<ModifierData[]>({
    queryKey: ["/api/restaurants", restaurantId, "modifier-groups", activeGroupId, "modifiers"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/modifier-groups/${activeGroupId}/modifiers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch modifiers");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!activeGroupId,
  });

  const { data: itemModifierLinks } = useQuery<{ modifierGroups: ItemModifierLink[] }>({
    queryKey: ["/api/restaurants", restaurantId, "menu-items", managingItemModifiers, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items/${managingItemModifiers}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch item details");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId && !!managingItemModifiers,
  });

  const categoryForm = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "" },
  });

  const itemForm = useForm({
    resolver: zodResolver(menuItemSchema),
    defaultValues: { name: "", description: "", price: "", isAvailable: true },
  });

  const modifierGroupForm = useForm({
    resolver: zodResolver(modifierGroupSchema),
    defaultValues: { name: "", description: "", isRequired: false, maxSelections: -1 },
  });

  const modifierForm = useForm({
    resolver: zodResolver(modifierSchema),
    defaultValues: { name: "", price: "0.00", isDefault: false, isAvailable: true },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "categories"] });
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menu-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "modifier-groups"] });
  };

  const invalidateModifiers = (groupId?: string) => {
    if (groupId) {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "modifier-groups", groupId, "modifiers"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "modifier-groups"] });
  };

  const invalidateItemDetail = (itemId?: string) => {
    if (itemId) {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "menu-items", itemId, "detail"] });
    }
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof categorySchema>) => {
      setUploadingImage(true);
      try {
        let imageUrl: string | undefined;
        if (categoryImageFile) {
          imageUrl = await uploadImage(categoryImageFile);
        } else if (!editingCategory) {
          throw new Error("An image is required when creating a category");
        }
        const url = editingCategory
          ? `/api/restaurants/${restaurantId}/categories/${editingCategory.id}`
          : `/api/restaurants/${restaurantId}/categories`;
        const body: Record<string, unknown> = { ...data };
        if (imageUrl) body.imageUrl = imageUrl;
        const res = await fetch(url, {
          method: editingCategory ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Failed to save category"); }
        return res.json();
      } finally {
        setUploadingImage(false);
      }
    },
    onSuccess: () => {
      invalidateAll();
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryImageFile(null);
      setCategoryImagePreview(null);
      categoryForm.reset();
      toast({ title: editingCategory ? "Category updated" : "Category created successfully" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof menuItemSchema>) => {
      setUploadingImage(true);
      try {
        let imageUrl: string | undefined;
        if (itemImageFile) {
          imageUrl = await uploadImage(itemImageFile);
        } else if (!editingItem) {
          throw new Error("An image is required when creating a menu item");
        }
        const targetCategoryId = editingItem ? editingItem.categoryId : addItemToCategoryId;
        const url = editingItem
          ? `/api/restaurants/${restaurantId}/menu-items/${editingItem.id}`
          : `/api/restaurants/${restaurantId}/menu-items`;
        const body: Record<string, unknown> = { ...data, categoryId: targetCategoryId };
        if (imageUrl) body.imageUrl = imageUrl;
        const res = await fetch(url, {
          method: editingItem ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Failed to save item"); }
        return res.json();
      } finally {
        setUploadingImage(false);
      }
    },
    onSuccess: () => {
      invalidateAll();
      setItemDialogOpen(false);
      setEditingItem(null);
      setAddItemToCategoryId(null);
      setItemImageFile(null);
      setItemImagePreview(null);
      itemForm.reset({ name: "", description: "", price: "", isAvailable: true });
      toast({ title: editingItem ? "Item updated" : "Item created successfully" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id, parentId }: { type: string; id: string; parentId?: string }) => {
      let endpoint = "";
      if (type === "category") endpoint = `/api/restaurants/${restaurantId}/categories/${id}`;
      else if (type === "item") endpoint = `/api/restaurants/${restaurantId}/menu-items/${id}`;
      else if (type === "modifierGroup") endpoint = `/api/restaurants/${restaurantId}/modifier-groups/${id}`;
      else if (type === "modifier") endpoint = `/api/restaurants/${restaurantId}/modifier-groups/${parentId}/modifiers/${id}`;
      const res = await fetch(endpoint, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `Failed to delete`); }
      return { type, id, parentId };
    },
    onSuccess: ({ type, id, parentId }) => {
      invalidateAll();
      if (type === "category" && selectedCategory?.id === id) setSelectedCategory(null);
      if (type === "modifier" && parentId) invalidateModifiers(parentId);
      if (type === "modifierGroup" && activeGroupId === id) setActiveGroupId(null);
      setDeleteTarget(null);
      toast({ title: "Deleted successfully" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const saveModifierGroupMutation = useMutation({
    mutationFn: async (data: z.infer<typeof modifierGroupSchema>) => {
      const body = {
        ...data,
        minSelections: data.isRequired ? 1 : 0,
      };
      const url = editingModifierGroup
        ? `/api/restaurants/${restaurantId}/modifier-groups/${editingModifierGroup.id}`
        : `/api/restaurants/${restaurantId}/modifier-groups`;
      const res = await fetch(url, {
        method: editingModifierGroup ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Failed to save modifier group"); }
      return res.json();
    },
    onSuccess: () => {
      invalidateModifiers();
      setModifierGroupDialogOpen(false);
      setEditingModifierGroup(null);
      modifierGroupForm.reset({ name: "", description: "", isRequired: false, maxSelections: -1 });
      toast({ title: editingModifierGroup ? "Modifier group updated" : "Modifier group created" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const saveModifierMutation = useMutation({
    mutationFn: async (data: z.infer<typeof modifierSchema>) => {
      const groupId = editingModifier ? editingModifier.modifierGroupId : activeGroupId;
      const url = editingModifier
        ? `/api/restaurants/${restaurantId}/modifier-groups/${groupId}/modifiers/${editingModifier.id}`
        : `/api/restaurants/${restaurantId}/modifier-groups/${groupId}/modifiers`;
      const res = await fetch(url, {
        method: editingModifier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Failed to save modifier"); }
      return res.json();
    },
    onSuccess: () => {
      if (activeGroupId) invalidateModifiers(activeGroupId);
      setModifierDialogOpen(false);
      setEditingModifier(null);
      modifierForm.reset({ name: "", price: "0.00", isDefault: false, isAvailable: true });
      toast({ title: editingModifier ? "Modifier updated" : "Modifier added" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const linkModifierGroupMutation = useMutation({
    mutationFn: async ({ itemId, modifierGroupId }: { itemId: string; modifierGroupId: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items/${itemId}/modifier-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        credentials: "include",
        body: JSON.stringify({ modifierGroupId }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to link modifier group"); }
      return res.json();
    },
    onSuccess: () => {
      if (managingItemModifiers) invalidateItemDetail(managingItemModifiers);
      setLinkDialogOpen(false);
      toast({ title: "Modifier group linked" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const unlinkModifierGroupMutation = useMutation({
    mutationFn: async ({ itemId, groupId }: { itemId: string; groupId: string }) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu-items/${itemId}/modifier-groups/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to unlink modifier group"); }
      return res.json();
    },
    onSuccess: () => {
      if (managingItemModifiers) invalidateItemDetail(managingItemModifiers);
      toast({ title: "Modifier group unlinked" });
    },
    onError: (error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const openCategoryDialog = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      categoryForm.reset({ name: category.name, description: category.description || "" });
      setCategoryImagePreview(category.imageUrl || null);
    } else {
      setEditingCategory(null);
      categoryForm.reset({ name: "", description: "" });
      setCategoryImagePreview(null);
    }
    setCategoryImageFile(null);
    setCategoryDialogOpen(true);
  };

  const openItemDialog = (categoryId: string, item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setAddItemToCategoryId(null);
      itemForm.reset({ name: item.name, description: item.description || "", price: item.price, isAvailable: item.isAvailable });
      setItemImagePreview(item.imageUrl || null);
    } else {
      setEditingItem(null);
      setAddItemToCategoryId(categoryId);
      itemForm.reset({ name: "", description: "", price: "", isAvailable: true });
      setItemImagePreview(null);
    }
    setItemImageFile(null);
    setItemDialogOpen(true);
  };

  const openModifierGroupDialog = (group?: ModifierGroupData) => {
    if (group) {
      setEditingModifierGroup(group);
      modifierGroupForm.reset({ name: group.name, description: group.description || "", isRequired: group.isRequired, maxSelections: group.maxSelections });
    } else {
      setEditingModifierGroup(null);
      modifierGroupForm.reset({ name: "", description: "", isRequired: false, maxSelections: -1 });
    }
    setModifierGroupDialogOpen(true);
  };

  const openModifierDialog = (mod?: ModifierData) => {
    if (mod) {
      setEditingModifier(mod);
      modifierForm.reset({ name: mod.name, price: mod.price, isDefault: mod.isDefault, isAvailable: mod.isAvailable });
    } else {
      setEditingModifier(null);
      modifierForm.reset({ name: "", price: "0.00", isDefault: false, isAvailable: true });
    }
    setModifierDialogOpen(true);
  };

  const getItemsForCategory = (categoryId: string) => {
    return allItems?.filter(item => item.categoryId === categoryId) || [];
  };

  const linkedGroupIds = itemModifierLinks?.modifierGroups?.map((l: ItemModifierLink) => l.id) || [];
  const unlinkableGroups = modifierGroups?.filter(g => !linkedGroupIds.includes(g.id)) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Menu</h1>
          <p className="text-muted-foreground">Manage your categories, menu items, and modifier groups</p>
        </div>
        <Button onClick={() => openCategoryDialog()} data-testid="button-add-category">
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {loadingCategories || loadingItems ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : categories && categories.length > 0 ? (
        <div className="space-y-4">
          {categories.map((category) => {
            const categoryItems = getItemsForCategory(category.id);
            return (
              <Card key={category.id} data-testid={`category-card-${category.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3">
                      {category.imageUrl ? (
                        <img
                          src={category.imageUrl}
                          alt={category.name}
                          className="h-10 w-10 rounded-md object-cover"
                          data-testid={`img-category-${category.id}`}
                        />
                      ) : (
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-lg">{category.name}</CardTitle>
                        {category.description && (
                          <CardDescription>{category.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="no-default-active-elevate">
                        {categoryItems.length} {categoryItems.length === 1 ? "item" : "items"}
                      </Badge>
                      <Button size="icon" variant="ghost" onClick={() => openItemDialog(category.id)} data-testid={`button-add-item-${category.id}`}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openCategoryDialog(category)} data-testid={`button-edit-category-${category.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: "category", id: category.id, name: category.name })} data-testid={`button-delete-category-${category.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {categoryItems.length > 0 ? (
                    <div className="space-y-2">
                      {categoryItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 rounded-md border group" data-testid={`item-card-${item.id}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-10 w-10 rounded-md object-cover shrink-0"
                                data-testid={`img-item-${item.id}`}
                              />
                            )}
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
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setManagingItemModifiers(item.id)}
                              data-testid={`button-manage-modifiers-${item.id}`}
                              title="Manage modifiers"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="visibility-hidden group-hover:visibility-visible" onClick={() => openItemDialog(category.id, item)} data-testid={`button-edit-item-${item.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="visibility-hidden group-hover:visibility-visible text-destructive" onClick={() => setDeleteTarget({ type: "item", id: item.id, name: item.name })} data-testid={`button-delete-item-${item.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <UtensilsCrossed className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No items in this category</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => openItemDialog(category.id)} data-testid={`button-add-first-item-${category.id}`}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add Item
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No categories yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Create your first category to start building your menu</p>
            <Button className="mt-4" onClick={() => openCategoryDialog()} data-testid="button-add-first-category">
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
          <div>
            <h2 className="text-2xl font-semibold" data-testid="text-modifier-groups-title">Modifier Groups</h2>
            <p className="text-muted-foreground text-sm">Create modifier groups (e.g. "Choose bun", "Add ons") and link them to menu items</p>
          </div>
          <Button onClick={() => openModifierGroupDialog()} data-testid="button-add-modifier-group">
            <Plus className="mr-2 h-4 w-4" />
            Add Modifier Group
          </Button>
        </div>

        {loadingModifierGroups ? (
          <div className="space-y-3 mt-4">
            {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : modifierGroups && modifierGroups.length > 0 ? (
          <div className="space-y-3 mt-4">
            {modifierGroups.map((group) => (
              <Card
                key={group.id}
                className={`${activeGroupId === group.id ? "ring-2 ring-primary" : ""}`}
                data-testid={`modifier-group-card-${group.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setActiveGroupId(activeGroupId === group.id ? null : group.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{group.name}</p>
                        {group.isRequired && <Badge variant="secondary" className="no-default-active-elevate text-xs">Required</Badge>}
                        <Badge variant="outline" className="no-default-active-elevate text-xs">
                          {group.maxSelections === 1 ? "Single select" : group.maxSelections === -1 ? "Multi select" : `Max ${group.maxSelections}`}
                        </Badge>
                      </div>
                      {group.description && <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openModifierGroupDialog(group)} data-testid={`button-edit-group-${group.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget({ type: "modifierGroup", id: group.id, name: group.name })} data-testid={`button-delete-group-${group.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {activeGroupId === group.id && (
                    <div className="mt-4 border-t pt-3">
                      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <p className="text-sm font-medium">Options</p>
                        <Button size="sm" variant="outline" onClick={() => openModifierDialog()} data-testid={`button-add-modifier-${group.id}`}>
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add Option
                        </Button>
                      </div>
                      {activeGroupModifiers && activeGroupModifiers.length > 0 ? (
                        <div className="space-y-1">
                          {activeGroupModifiers.map((mod) => (
                            <div key={mod.id} className="flex items-center justify-between p-2 rounded-md border text-sm group" data-testid={`modifier-card-${mod.id}`}>
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-medium">{mod.name}</span>
                                {parseFloat(mod.price) > 0 && <span className="text-muted-foreground">+${parseFloat(mod.price).toFixed(2)}</span>}
                                {mod.isDefault && <Badge variant="secondary" className="no-default-active-elevate text-xs">Default</Badge>}
                                {!mod.isAvailable && <Badge variant="secondary" className="no-default-active-elevate text-xs">Hidden</Badge>}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="visibility-hidden group-hover:visibility-visible" onClick={() => openModifierDialog(mod)} data-testid={`button-edit-modifier-${mod.id}`}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="visibility-hidden group-hover:visibility-visible text-destructive" onClick={() => setDeleteTarget({ type: "modifier", id: mod.id, name: mod.name, parentId: group.id })} data-testid={`button-delete-modifier-${mod.id}`}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-3">No options yet. Add options for this modifier group.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-4">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Settings2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No modifier groups yet. Create groups like "Choose bun", "Toppings", or "Sauces".</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>{editingCategory ? "Update category details." : "Create a new category to organize your menu items."}</DialogDescription>
          </DialogHeader>
          <Form {...categoryForm}>
            <form onSubmit={categoryForm.handleSubmit((data) => {
              if (!editingCategory && !categoryImageFile) {
                toast({ title: "Image required", description: "Please upload an image for this category.", variant: "destructive" });
                return;
              }
              createCategoryMutation.mutate(data);
            })} className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  Image {!editingCategory && <span className="text-destructive">*</span>}
                </Label>
                <div className="mt-1.5">
                  {categoryImagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={categoryImagePreview}
                        alt="Category preview"
                        className="h-24 w-24 rounded-md object-cover"
                        data-testid="img-category-preview"
                      />
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover-elevate"
                        onClick={() => {
                          setCategoryImageFile(null);
                          setCategoryImagePreview(null);
                        }}
                        data-testid="button-remove-category-image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label
                      className="flex items-center justify-center w-24 h-24 rounded-md border-2 border-dashed border-muted-foreground/25 cursor-pointer hover-elevate"
                      data-testid="label-category-image-upload"
                    >
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImagePlus className="h-6 w-6" />
                        <span className="text-xs">Upload</span>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => handleImageSelect(e.target.files?.[0] || null, setCategoryImageFile, setCategoryImagePreview)}
                        data-testid="input-category-image"
                      />
                    </label>
                  )}
                </div>
              </div>
              <FormField control={categoryForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Pizza, Burgers, Drinks" {...field} data-testid="input-category-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={categoryForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea placeholder="Brief description" {...field} data-testid="input-category-description" /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={createCategoryMutation.isPending || uploadingImage} data-testid="button-submit-category">
                  {(createCategoryMutation.isPending || uploadingImage) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingCategory ? "Update Category" : "Add Category"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Menu Item"}</DialogTitle>
            <DialogDescription>{editingItem ? "Update item details." : "Add a new item to this category."}</DialogDescription>
          </DialogHeader>
          <Form {...itemForm}>
            <form onSubmit={itemForm.handleSubmit((data) => {
              if (!editingItem && !itemImageFile) {
                toast({ title: "Image required", description: "Please upload an image for this menu item.", variant: "destructive" });
                return;
              }
              createItemMutation.mutate(data);
            })} className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  Image {!editingItem && <span className="text-destructive">*</span>}
                </Label>
                <div className="mt-1.5">
                  {itemImagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={itemImagePreview}
                        alt="Item preview"
                        className="h-24 w-24 rounded-md object-cover"
                        data-testid="img-item-preview"
                      />
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover-elevate"
                        onClick={() => {
                          setItemImageFile(null);
                          setItemImagePreview(null);
                        }}
                        data-testid="button-remove-item-image"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label
                      className="flex items-center justify-center w-24 h-24 rounded-md border-2 border-dashed border-muted-foreground/25 cursor-pointer hover-elevate"
                      data-testid="label-item-image-upload"
                    >
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImagePlus className="h-6 w-6" />
                        <span className="text-xs">Upload</span>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => handleImageSelect(e.target.files?.[0] || null, setItemImageFile, setItemImagePreview)}
                        data-testid="input-item-image"
                      />
                    </label>
                  )}
                </div>
              </div>
              <FormField control={itemForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Item name" {...field} data-testid="input-item-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={itemForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea placeholder="Item description" {...field} data-testid="input-item-description" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={itemForm.control} name="price" render={({ field }) => (
                <FormItem><FormLabel>Price</FormLabel><FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} data-testid="input-item-price" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={itemForm.control} name="isAvailable" render={({ field }) => (
                <FormItem className="flex items-center gap-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-item-available" /></FormControl><FormLabel className="!mt-0">Available</FormLabel></FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={createItemMutation.isPending || uploadingImage} data-testid="button-submit-item">
                  {(createItemMutation.isPending || uploadingImage) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingItem ? "Update Item" : "Add Item"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={modifierGroupDialogOpen} onOpenChange={setModifierGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModifierGroup ? "Edit Modifier Group" : "Add Modifier Group"}</DialogTitle>
            <DialogDescription>
              {editingModifierGroup ? "Update modifier group settings." : "Create a group like 'Choose bun', 'Toppings', or 'Sauces'."}
            </DialogDescription>
          </DialogHeader>
          <Form {...modifierGroupForm}>
            <form onSubmit={modifierGroupForm.handleSubmit((data) => saveModifierGroupMutation.mutate(data))} className="space-y-4">
              <FormField control={modifierGroupForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Choose bun, Add ons" {...field} data-testid="input-group-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={modifierGroupForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea placeholder="Brief description" {...field} data-testid="input-group-description" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={modifierGroupForm.control} name="isRequired" render={({ field }) => (
                <FormItem className="flex items-center gap-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-group-required" /></FormControl><FormLabel className="!mt-0">Required</FormLabel></FormItem>
              )} />
              <FormField control={modifierGroupForm.control} name="maxSelections" render={({ field }) => (
                <FormItem>
                  <FormLabel>Selection Type</FormLabel>
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                    <FormControl>
                      <SelectTrigger data-testid="select-max-selections">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">Single select (radio buttons)</SelectItem>
                      <SelectItem value="-1">Multi select (checkboxes, unlimited)</SelectItem>
                      <SelectItem value="2">Max 2 selections</SelectItem>
                      <SelectItem value="3">Max 3 selections</SelectItem>
                      <SelectItem value="5">Max 5 selections</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={saveModifierGroupMutation.isPending} data-testid="button-submit-group">
                  {saveModifierGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingModifierGroup ? "Update Group" : "Add Group"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={modifierDialogOpen} onOpenChange={setModifierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModifier ? "Edit Option" : "Add Option"}</DialogTitle>
            <DialogDescription>
              {editingModifier ? "Update modifier option details." : "Add a new option to this modifier group."}
            </DialogDescription>
          </DialogHeader>
          <Form {...modifierForm}>
            <form onSubmit={modifierForm.handleSubmit((data) => saveModifierMutation.mutate(data))} className="space-y-4">
              <FormField control={modifierForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. + bacon, no cheese" {...field} data-testid="input-modifier-name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={modifierForm.control} name="price" render={({ field }) => (
                <FormItem><FormLabel>Extra Price</FormLabel><FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} data-testid="input-modifier-price" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-6">
                <FormField control={modifierForm.control} name="isDefault" render={({ field }) => (
                  <FormItem className="flex items-center gap-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-modifier-default" /></FormControl><FormLabel className="!mt-0">Default</FormLabel></FormItem>
                )} />
                <FormField control={modifierForm.control} name="isAvailable" render={({ field }) => (
                  <FormItem className="flex items-center gap-2"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-modifier-available" /></FormControl><FormLabel className="!mt-0">Available</FormLabel></FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveModifierMutation.isPending} data-testid="button-submit-modifier">
                  {saveModifierMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingModifier ? "Update Option" : "Add Option"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingItemModifiers} onOpenChange={(open: boolean) => !open && setManagingItemModifiers(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Modifiers</DialogTitle>
            <DialogDescription>
              Link modifier groups to {allItems?.find(i => i.id === managingItemModifiers)?.name || "this item"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {itemModifierLinks?.modifierGroups && itemModifierLinks.modifierGroups.length > 0 ? (
              <div className="space-y-2">
                {itemModifierLinks.modifierGroups.map((link: ItemModifierLink) => (
                  <div key={link.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`linked-group-${link.id}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{link.name}</span>
                      <Badge variant="secondary" className="no-default-active-elevate text-xs">{link.modifiers.length} options</Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => managingItemModifiers && unlinkModifierGroupMutation.mutate({ itemId: managingItemModifiers, groupId: link.id })}
                      data-testid={`button-unlink-${link.id}`}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No modifier groups linked yet.</p>
            )}
            {unlinkableGroups.length > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLinkDialogOpen(true)}
                data-testid="button-link-group"
              >
                <Plus className="mr-2 h-4 w-4" />
                Link Modifier Group
              </Button>
            )}
            {!modifierGroups || modifierGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center">Create modifier groups first in the section below.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Modifier Group</DialogTitle>
            <DialogDescription>Select a modifier group to link to this item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {unlinkableGroups.map((group) => (
              <Button
                key={group.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => managingItemModifiers && linkModifierGroupMutation.mutate({ itemId: managingItemModifiers, modifierGroupId: group.id })}
                disabled={linkModifierGroupMutation.isPending}
                data-testid={`button-link-select-${group.id}`}
              >
                <Link2 className="mr-2 h-4 w-4" />
                {group.name}
                {group.isRequired && <Badge variant="secondary" className="ml-2 no-default-active-elevate text-xs">Required</Badge>}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
              {deleteTarget?.type === "category" && " All items in this category will also be affected."}
              {deleteTarget?.type === "modifierGroup" && " All options in this group will be removed and it will be unlinked from all menu items."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ type: deleteTarget.type, id: deleteTarget.id, parentId: deleteTarget.parentId })}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
