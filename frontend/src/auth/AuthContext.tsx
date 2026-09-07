import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { AppUser } from "../api/types";

export type AuthStatus = "loading" | "anonymous" | "pending" | "rejected" | "disabled" | "authenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AppUser | null;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  user: null,
  refetch: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: AppUser }>("/auth/me"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const value = useMemo<AuthContextValue>(() => {
    if (query.isLoading) return { status: "loading", user: null, refetch: query.refetch };
    if (query.isSuccess) return { status: "authenticated", user: query.data.user, refetch: query.refetch };
    if (query.isError) {
      const err = query.error;
      if (err instanceof ApiError) {
        if (err.code === "PENDING_APPROVAL") return { status: "pending", user: null, refetch: query.refetch };
        if (err.code === "REJECTED") return { status: "rejected", user: null, refetch: query.refetch };
        if (err.code === "DISABLED") return { status: "disabled", user: null, refetch: query.refetch };
      }
      return { status: "anonymous", user: null, refetch: query.refetch };
    }
    return { status: "loading", user: null, refetch: query.refetch };
  }, [query.isLoading, query.isSuccess, query.isError, query.data, query.error, query.refetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
