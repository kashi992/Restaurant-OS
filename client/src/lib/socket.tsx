import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./auth";
import { queryClient } from "./queryClient";

interface OrderNotification {
  orderId: string;
  orderNumber: number;
  displayNumber: number;
  tableLabel?: string;
  source: "qr" | "pos";
  itemCount?: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastOrderNotification: OrderNotification | null;
  clearNotification: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  lastOrderNotification: null,
  clearNotification: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastOrderNotification, setLastOrderNotification] = useState<OrderNotification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNotification = useCallback(() => {
    setLastOrderNotification(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !user?.restaurantId) return;

    const socket = io(window.location.origin, {
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join-tenant", user.restaurantId);
      socket.emit("join-kitchen", user.restaurantId);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("order:created", (data: OrderNotification) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setLastOrderNotification(data);
      timerRef.current = setTimeout(() => {
        setLastOrderNotification(null);
        timerRef.current = null;
      }, 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "stats"] });
    });

    socket.on("order:status-changed", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurants", user.restaurantId, "stats"] });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, user?.restaurantId]);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      lastOrderNotification,
      clearNotification,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
