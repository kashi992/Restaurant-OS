import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, LogIn } from "lucide-react";

export default function UnauthorizedPage() {
  const { logout } = useAuth();

  const handleReturnToLogin = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive">
            <ShieldX className="h-6 w-6 text-destructive-foreground" />
          </div>
          <CardTitle className="text-2xl font-semibold">Access Denied</CardTitle>
          <CardDescription>
            You don't have permission to access this page. Your session may have expired or your account may have been removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={handleReturnToLogin} data-testid="button-go-login">
            <LogIn className="h-4 w-4 mr-2" />
            Go to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
