import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Grid3X3,
  Users,
  Plus,
  ClipboardList,
} from "lucide-react";
import { Link } from "wouter";

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  tableId: string | null;
}

export default function POSHome() {
  const { accessToken, user } = useAuth();
  const restaurantId = user?.restaurantId;
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  const { data: tables, isLoading: loadingTables } = useQuery<Table[]>({
    queryKey: ["/api/restaurants", restaurantId, "tables"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tables");
      return res.json();
    },
    enabled: !!accessToken && !!restaurantId,
  });

  const { data: activeOrders } = useQuery<Order[]>({
    queryKey: ["/api/restaurants", restaurantId, "orders", "live"],
    queryFn: async () => {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders/live`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.orders) ? data.orders : Array.isArray(data) ? data : [];
    },
    enabled: !!accessToken && !!restaurantId,
    refetchInterval: 10000,
  });

  const getTableStatus = (table: Table) => {
    const hasOrder = activeOrders?.some(o => o.tableId === table.id);
    if (hasOrder) return "occupied";
    return table.status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-green-500/20 border-green-500 text-green-700 dark:text-green-300";
      case "occupied":
        return "bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300";
      case "reserved":
        return "bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300";
      default:
        return "bg-muted border-muted-foreground";
    }
  };

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
    setOrderDialogOpen(true);
  };

  const getTableOrder = (tableId: string) => {
    return activeOrders?.find(o => o.tableId === tableId);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Tables</h1>
          <p className="text-muted-foreground">Select a table to view or create orders</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-sm">Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm">Reserved</span>
          </div>
        </div>
      </div>

      {loadingTables ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {tables.map((table) => {
            const status = getTableStatus(table);
            const order = getTableOrder(table.id);
            return (
              <div
                key={table.id}
                className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:scale-105 ${getStatusColor(status)}`}
                onClick={() => handleTableClick(table)}
                data-testid={`table-${table.id}`}
              >
                <div className="text-center">
                  <Grid3X3 className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-lg font-bold">Table {table.number}</p>
                  <div className="flex items-center justify-center gap-1 text-sm">
                    <Users className="h-3 w-3" />
                    {table.capacity}
                  </div>
                  {order && (
                    <Badge className="mt-2" variant="secondary">
                      #{order.orderNumber}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Grid3X3 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No tables configured</h3>
            <p className="text-muted-foreground">Add tables in the dashboard first.</p>
            <Link href="/dashboard/tables">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Add Tables
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Table Order Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Table {selectedTable?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTable && getTableOrder(selectedTable.id) ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">Current Order</p>
                  <p className="text-lg font-bold">
                    #{getTableOrder(selectedTable.id)?.orderNumber}
                  </p>
                  <p className="text-sm">
                    Status: {getTableOrder(selectedTable.id)?.status}
                  </p>
                  <p className="text-lg font-semibold mt-2">
                    ${getTableOrder(selectedTable.id)?.total}
                  </p>
                </div>
                <Link href={`/pos/orders?table=${selectedTable.id}`}>
                  <Button className="w-full" data-testid="button-view-order">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    View Order
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground text-center py-4">
                  No active order for this table.
                </p>
                <Link href={`/pos/orders?table=${selectedTable?.id}&new=true`}>
                  <Button className="w-full" data-testid="button-new-order">
                    <Plus className="mr-2 h-4 w-4" />
                    Start New Order
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
