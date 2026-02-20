import { useSocket } from "@/lib/socket";
import { Bell, X, QrCode, Monitor } from "lucide-react";

export function OrderNotificationBanner() {
  const { lastOrderNotification, clearNotification } = useSocket();

  if (!lastOrderNotification) return null;

  const isQr = lastOrderNotification.source === "qr";

  return (
    <div
      className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 fade-in duration-300 max-w-sm w-full"
      data-testid="notification-new-order"
    >
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-sm" data-testid="text-notification-title">
                New Order Received!
              </p>
              {isQr ? (
                <QrCode className="h-3.5 w-3.5 opacity-80" />
              ) : (
                <Monitor className="h-3.5 w-3.5 opacity-80" />
              )}
            </div>
            <p className="text-sm opacity-90" data-testid="text-notification-details">
              Order #{lastOrderNotification.displayNumber}
              {lastOrderNotification.tableLabel && ` · ${lastOrderNotification.tableLabel}`}
              {` · via ${isQr ? "QR" : "POS"}`}
            </p>
            {lastOrderNotification.itemCount && (
              <p className="text-xs opacity-75 mt-0.5">
                {lastOrderNotification.itemCount} item{lastOrderNotification.itemCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={clearNotification}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            data-testid="button-dismiss-notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
