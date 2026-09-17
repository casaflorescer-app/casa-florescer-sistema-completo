import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAppPath } from "@/lib/auth/access";
import { loadAuthorizationContext } from "@/lib/auth/authorization";
import { APP_PATHNAME_HEADER } from "@/lib/auth/paths";
import { createServerSupabase } from "@/lib/supabase/server";

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/app";
}

/**
 * B3.4.1 — autorização server-side das rotas /app.
 *
 * Reutiliza canAccessAppPath (mesmas regras do AppRouteGuard client).
 * Não substitui RLS/RPC. Não substitui ACL client (UX).
 *
 * Sem sessão → /login
 * Sem acesso à rota (inativo, sem membership, papel insuficiente, etc.) → /unauthorized
 */
export async function requireAppRouteAccess(pathnameFromCaller?: string) {
  const headerPath = headers().get(APP_PATHNAME_HEADER);
  const pathname = normalizePath(pathnameFromCaller || headerPath || "/app");

  // /unauthorized não passa por este layout; defesa contra loop se reutilizado.
  if (pathname === "/unauthorized") {
    return null;
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { context } = await loadAuthorizationContext(supabase, user);

  if (!canAccessAppPath(context, pathname)) {
    redirect("/unauthorized");
  }

  return context;
}
