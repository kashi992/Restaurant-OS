import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Search,
  MoreVertical,
  Settings,
  Ban,
  RotateCcw,
  ChevronRight,
  Trash2
} from "lucide-react";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: restaurants, isLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/admin/restaurants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/restaurants", {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch restaurants");
      const data = await res.json();
      return data.restaurants;
    },
    enabled: !!accessToken,
  });

  const suspendMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/restaurants/${id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      toast({ title: "Restaurant suspended", description: "The restaurant has been suspended." });
      setSuspendDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/restaurants/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      toast({ title: "Restaurant restored", description: "The restaurant has been restored." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredRestaurants = restaurants?.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Active</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await fetch(`/api/admin/restaurants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Failed to delete restaurant");
    }
    return res.json();
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
    toast({
      title: "Restaurant deleted",
      description: `${data.restaurantName} has been permanently deleted.`,
    });
    setDeleteDialogOpen(false);
    setSelectedRestaurant(null);
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  },
});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Restaurants</h1>
          <p className="text-muted-foreground">Manage all restaurants on the platform</p>
        </div>
        <Link href="/admin/restaurants/new">
          <Button data-testid="button-create-restaurant">
            <Plus className="mr-2 h-4 w-4" />
            Add Restaurant
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search restaurants..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-restaurants"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRestaurants && filteredRestaurants.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRestaurants.map((restaurant) => (
            <Card key={restaurant.id} data-testid={`card-restaurant-${restaurant.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                    <CardDescription>/{restaurant.slug}</CardDescription>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" data-testid={`button-menu-${restaurant.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <Link href={`/admin/restaurants/${restaurant.id}`}>
                      <DropdownMenuItem data-testid={`menu-item-settings-${restaurant.id}`}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                    </Link>
                    {restaurant.status === "active" ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedRestaurant(restaurant);
                          setSuspendDialogOpen(true);
                        }}
                        className="text-destructive"
                        data-testid={`menu-item-suspend-${restaurant.id}`}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Suspend
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => restoreMutation.mutate(restaurant.id)}
                        data-testid={`menu-item-restore-${restaurant.id}`}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore
                      </DropdownMenuItem>
                    )}
                     <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedRestaurant(restaurant);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-destructive focus:text-destructive"
                      data-testid={`menu-item-delete-${restaurant.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Restaurant
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {getStatusBadge(restaurant.status)}
                  <Link href={`/admin/restaurants/${restaurant.id}`}>
                    <Button variant="ghost" size="sm" data-testid={`button-view-${restaurant.id}`}>
                      View
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No restaurants found</h3>
            <p className="text-muted-foreground">Get started by adding your first restaurant.</p>
            <Link href="/admin/restaurants/new">
              <Button className="mt-4" data-testid="button-create-first-restaurant">
                <Plus className="mr-2 h-4 w-4" />
                Add Restaurant
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Restaurant</DialogTitle>
            <DialogDescription>
              Are you sure you want to suspend {selectedRestaurant?.name}? This will prevent staff
              and customers from accessing the restaurant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedRestaurant && suspendMutation.mutate(selectedRestaurant.id)}
              disabled={suspendMutation.isPending}
              data-testid="button-confirm-suspend"
            >
              {suspendMutation.isPending ? "Suspending..." : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              🗑️ Delete Restaurant Permanently?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-4">
              <p className="font-semibold text-foreground">
                You are about to permanently delete:{" "}
                <span className="text-destructive">{selectedRestaurant?.name}</span>
              </p>
              
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <p className="font-semibold text-destructive mb-2">⚠️ This will delete:</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✗ All staff accounts and roles</li>
                  <li>✗ All menus, categories, and menu items</li>
                  <li>✗ All orders and payments</li>
                  <li>✗ All tables and QR codes</li>
                  <li>✗ All settings and configurations</li>
                </ul>
              </div>

              <p className="text-destructive font-bold text-center pt-2">
                ⚠️ THIS ACTION CANNOT BE UNDONE!
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedRestaurant(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedRestaurant && deleteMutation.mutate(selectedRestaurant.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
