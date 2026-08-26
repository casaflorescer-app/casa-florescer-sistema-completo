"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { toAuthUser, type AuthUser } from "@/lib/auth/user";
import { signOutBrowser } from "@/lib/auth/sign-out";
import {
  loadAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationLoadError,
} from "@/lib/auth/authorization";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  configured: boolean;
  authorization: AuthorizationContext | null;
  authorizationLoading: boolean;
  authorizationError: AuthorizationLoadError | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [authorizationLoading, setAuthorizationLoading] = useState(false);
  const [authorizationError, setAuthorizationError] =
    useState<AuthorizationLoadError | null>(null);
  const loadSeq = useRef(0);
  const configured = isSupabaseConfigured();

  const clearAuthorization = useCallback(() => {
    loadSeq.current += 1;
    setAuthorization(null);
    setAuthorizationError(null);
    setAuthorizationLoading(false);
  }, []);

  const refreshAuthorization = useCallback(async (authUser: User) => {
    const supabase = createClient();
    if (!supabase) {
      setAuthorization(null);
      setAuthorizationError(null);
      setAuthorizationLoading(false);
      return;
    }

    const seq = ++loadSeq.current;
    setAuthorizationLoading(true);
    try {
      const { context, error } = await loadAuthorizationContext(supabase, authUser);
      if (seq !== loadSeq.current) return;
      setAuthorization(context);
      setAuthorizationError(error);
    } catch {
      if (seq !== loadSeq.current) return;
      setAuthorization({
        user: { id: authUser.id, email: authUser.email ?? null },
        profile: null,
        patientAccount: null,
        isSystemAdmin: false,
        organization: null,
        memberships: [],
      });
      setAuthorizationError({
        kind: "unknown",
        message: "Não foi possível carregar o contexto de acesso.",
      });
    } finally {
      if (seq === loadSeq.current) setAuthorizationLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let handledInitial = false;

    const applyUser = (next: User | null, loadContext: boolean) => {
      if (cancelled) return;
      setUser(next ? toAuthUser(next) : null);
      setLoading(false);
      if (!next) {
        clearAuthorization();
        return;
      }
      if (loadContext) void refreshAuthorization(next);
    };

    supabase.auth.getUser().then(({ data }) => {
      handledInitial = true;
      applyUser(data.user ?? null, Boolean(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        applyUser(null, false);
        return;
      }
      if (event === "INITIAL_SESSION") {
        if (handledInitial) return;
        applyUser(session?.user ?? null, Boolean(session?.user));
        return;
      }
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY"
      ) {
        applyUser(session?.user ?? null, Boolean(session?.user));
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [clearAuthorization, refreshAuthorization]);

  const signOut = useCallback(async () => {
    await signOutBrowser();
    setUser(null);
    clearAuthorization();
  }, [clearAuthorization]);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured,
      authorization,
      authorizationLoading,
      authorizationError,
      signOut,
    }),
    [
      user,
      loading,
      configured,
      authorization,
      authorizationLoading,
      authorizationError,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() precisa do AuthProvider");
  }
  return ctx;
}
