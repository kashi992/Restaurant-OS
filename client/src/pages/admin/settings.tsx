import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Shield } from "lucide-react";

export default function AdminSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">Manage your super admin preferences</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>Your super admin account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="font-medium">{user?.firstName} {user?.lastName}</div>
            </div>
            <div className="grid gap-2">
              <div className="text-sm text-muted-foreground">Email</div>
              <div className="font-medium">{user?.email}</div>
            </div>
            <div className="grid gap-2">
              <div className="text-sm text-muted-foreground">Role</div>
              <div className="font-medium">Super Administrator</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
