import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAppPath } from "@/lib/auth/access";
import { loadAuthorizationContext } from "@/lib/auth/authorization";
import {
  APP_PATHNAME_HEADER,
  isProtectedPath,
  isPublicPath,
} from "@/lib/auth/paths";
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
 * Sem sessão no servidor → o cliente mostra o carregamento ou volta ao login.
 * Sem acesso à rota (inativo, sem membership, papel insuficiente, etc.) → /unauthorized
 */
export async function requireAppRouteAccess(pathnameFromCaller?: string) {
  const headerPath = headers().get(APP_PATHNAME_HEADER);
  const raw = pathnameFromCaller || headerPath;
  // Sem caminho confirmado, não redirecionar: assumir /app em /login
  // gera NEXT_REDIRECT para a mesma URL e o navegador entra em ciclo.
  if (!raw || isPublicPath(raw) || !isProtectedPath(raw)) return null;

  const pathname = normalizePath(raw);

  // /unauthorized não passa por este layout; defesa contra loop se reutilizado.
  if (pathname === "/unauthorized") {
    return null;
  }

  const supabase = await createServerSupabase();
  if (!supabase) return null;

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const text = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();
      if (text.includes("fetch") || text.includes("network")) return null;
    }
    user = data.user;
  } catch {
    return null;
  }

  // Sem usuário no servidor, o cliente decide. Redirecionar daqui para /login
  // enquanto o browser já tem sessão troca as duas telas até a página ficar branca.
  if (!user) return null;

  const { context, error } = await loadAuthorizationContext(supabase, user);
  if (error?.kind === "network") return null;

  if (!canAccessAppPath(context, pathname)) {
    redirect("/unauthorized");
  }

  return context;
}
