import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiRequest } from "./queryClient";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  restaurantId?: string;
  isSuperAdmin: boolean;
  permissions: string[];
  features: Record<string, boolean>;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const fetchUser = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        // Map the response to our User interface
        setUser({
          id: data.id,
          email: data.email,
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          role: data.currentRestaurant?.roleName || "",
          restaurantId: data.currentRestaurant?.restaurantId,
          isSuperAdmin: data.isSuperAdmin || false,
          permissions: data.currentRestaurant?.permissions || [],
          features: data.currentRestaurant?.features || {},
        });
      } else {
        setUser(null);
        setAccessToken(null);
      }
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // Try to refresh the session using the httpOnly cookie
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          await fetchUser(data.accessToken);
        }
      } catch {
        // No valid session
      }
      setIsLoading(false);
    };
    init();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
      if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Login failed");
  }

    const data = await res.json();
    console.log("🔐 Login response:", data);
    setAccessToken(data.accessToken);

   // ✅ Set user immediately from login response
  const userObj = {
    id: data.user.id,
    email: data.user.email,
    firstName: data.user.firstName || "",
    lastName: data.user.lastName || "",
    role: data.user.roleName || "",
    restaurantId: data.user.restaurantId || null,
    isSuperAdmin: data.user.isSuperAdmin || false,
    permissions: data.user.permissions || [],
    features: data.user.features || {},
  };
  
   console.log("👤 Setting user:", userObj); // ✅ DEBUG LOG
  setUser(userObj);
 
  return;
    // await fetchUser(data.accessToken);
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include", // Uses httpOnly cookie for auth
      });
    } catch {
      // ignore logout errors
    }
    setUser(null);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useAuthenticatedFetch() {
  const { accessToken, refreshToken } = useAuth();
  
  return useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    
    let res = await fetch(url, { ...options, headers, credentials: "include" });
    
    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const newRes = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (newRes.ok) {
          const data = await newRes.json();
          headers.set("Authorization", `Bearer ${data.accessToken}`);
          res = await fetch(url, { ...options, headers, credentials: "include" });
        }
      }
    }
    
    return res;
  }, [accessToken, refreshToken]);
}
