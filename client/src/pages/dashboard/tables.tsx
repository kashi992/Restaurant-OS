import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Plus,
  QrCode,
  Download,
  Grid3X3,
  Users,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: string;
  qrToken: string | null;
}

const tableSchema = z.object({
  tableNumber: z.string().min(1, "Table number is required"),
  capacity: z.coerce.number().min(1, "Capacity must be at least 1"),
});

export default function TablesManager() {
  const { accessToken, user } = useAuth();
  const { toast } = useToast();
  const restaurantId = user?.restaurantId;
  const qrEnabled = !user?.features || user.features["qr_ordering"] !== false;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTableTarget, setDeleteTableTarget] = useState<Table | null>(null);

  const { data: tables, isLoading } = useQuery<Table[]>({
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

  const form = useForm({
    resolver: zodResolver(tableSchema),
    defaultValues: { tableNumber: "", capacity: 4 },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: z.infer<typeof tableSchema>) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ number: data.tableNumber, capacity: data.capacity }),
      });
      if (!res.ok) throw new Error("Failed to create table");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Table created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const generateQrMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables/${tableId}/qr-token`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}` 
        },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate QR code");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      setSelectedTable({ ...selectedTable!, qrToken: data.token });
      toast({ title: "QR code generated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables/${tableId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to delete table");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", restaurantId, "stats"] });
      toast({ title: "Table deleted successfully" });
      setDeleteDialogOpen(false);
      setDeleteTableTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Delete Error", description: error.message, variant: "destructive" });
    },
  });

  const tableCounts = useMemo(() => {
    if (!tables) return { total: 0, available: 0, occupied: 0, reserved: 0 };
    return {
      total: tables.length,
      available: tables.filter(t => t.status === "available").length,
      occupied: tables.filter(t => t.status === "occupied").length,
      reserved: tables.filter(t => t.status === "reserved").length,
    };
  }, [tables]);

  const getStatusDot = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "occupied": return "bg-orange-500";
      case "reserved": return "bg-blue-500";
      default: return "bg-gray-400";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Available</Badge>;
      case "occupied":
        return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400">Occupied</Badge>;
      case "reserved":
        return <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400">Reserved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openQrDialog = (table: Table) => {
    setSelectedTable(table);
    setQrDialogOpen(true);
  };

  const downloadQrCode = () => {
    if (!selectedTable?.qrToken) return;
    const qrUrl = `${window.location.origin}/order/${selectedTable.qrToken}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
    
    const link = document.createElement("a");
    link.href = qrApiUrl;
    link.download = `table-${selectedTable.number}-qr.png`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Tables Manager</h1>
          <p className="text-muted-foreground">{qrEnabled ? "Manage your tables and QR codes" : "Manage your restaurant tables"}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-table">
          <Plus className="mr-2 h-4 w-4" />
          Add Table
        </Button>
      </div>

      {tables && tables.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3" data-testid="status-legend">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Grid3X3 className="h-4 w-4" />
            <span>{tableCounts.total} Tables</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5" data-testid="status-available-count">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-sm">Available ({tableCounts.available})</span>
          </div>
          <div className="flex items-center gap-1.5" data-testid="status-occupied-count">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            <span className="text-sm">Occupied ({tableCounts.occupied})</span>
          </div>
          <div className="flex items-center gap-1.5" data-testid="status-reserved-count">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="text-sm">Reserved ({tableCounts.reserved})</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <Card key={table.id} className={`relative ${table.status === "occupied" ? "ring-2 ring-orange-500/30" : ""}`} data-testid={`card-table-${table.id}`}>
              <span className={`absolute top-3 right-12 h-3 w-3 rounded-full ${getStatusDot(table.status)}`} data-testid={`dot-status-${table.id}`} />
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${table.status === "occupied" ? "bg-orange-500/10" : table.status === "reserved" ? "bg-blue-500/10" : "bg-primary/10"}`}>
                    <Grid3X3 className={`h-5 w-5 ${table.status === "occupied" ? "text-orange-600" : table.status === "reserved" ? "text-blue-600" : "text-primary"}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Table {table.number}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {table.capacity} seats
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => { setDeleteTableTarget(table); setDeleteDialogOpen(true); }}
                  data-testid={`button-delete-table-${table.id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  {getStatusBadge(table.status)}
                </div>
                {qrEnabled && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openQrDialog(table)}
                    data-testid={`button-qr-${table.id}`}
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    QR Code
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Grid3X3 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No tables yet</h3>
            <p className="text-muted-foreground">Add your first table to get started.</p>
            <Button className="mt-4" onClick={() => setDialogOpen(true)} data-testid="button-add-first-table">
              <Plus className="mr-2 h-4 w-4" />
              Add Table
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Table Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Table</DialogTitle>
            <DialogDescription>Create a new table for your restaurant.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createTableMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="tableNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Table Number</FormLabel>
                    <FormControl>
                      <Input placeholder="1" data-testid="input-table-number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacity</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" data-testid="input-table-capacity" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTableMutation.isPending} data-testid="button-save-table">
                  {createTableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Table
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Table Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Table {deleteTableTarget?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this table and any associated QR codes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-table">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTableTarget && deleteTableMutation.mutate(deleteTableTarget.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-table"
            >
              {deleteTableMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table {selectedTable?.number} QR Code</DialogTitle>
            <DialogDescription>
              Scan this code to open the ordering menu for this table.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {selectedTable?.qrToken ? (
              <>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/order/${selectedTable.qrToken}`)}`}
                  alt="QR Code"
                  className="rounded-lg border"
                />
                <p className="mt-4 text-sm text-muted-foreground text-center">
                  {window.location.origin}/order/{selectedTable.qrToken}
                </p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={downloadQrCode} data-testid="button-download-qr">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => window.open(`/order/${selectedTable.qrToken}`, "_blank")}
                        data-testid="button-test-scan"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Test Scan
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Opens the QR ordering page in a new tab</TooltipContent>
                  </Tooltip>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <QrCode className="h-16 w-16 mx-auto text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No QR code generated yet.</p>
                <Button
                  className="mt-4"
                  onClick={() => generateQrMutation.mutate(selectedTable!.id)}
                  disabled={generateQrMutation.isPending}
                  data-testid="button-generate-qr"
                >
                  {generateQrMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate QR Code
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
