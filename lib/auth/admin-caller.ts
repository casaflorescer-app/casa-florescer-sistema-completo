import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { loadCasaAuthorization } from "@/lib/auth/casa-authorization";
import {
  loadAuthorizationContext,
  type AuthorizationContext,
} from "@/lib/auth/authorization";
import { isCasaDatabaseConfigured } from "@/lib/db/casa";
import { createServerSupabase } from "@/lib/supabase/server";

export type AdminCaller = {
  userId: string;
  organizationId: string;
  isSystemAdmin: boolean;
  isHouseOwner: boolean;
  isHouseAdmin: boolean;
  mode: "casa" | "gotrue";
};

export function canManagePractices(caller: AdminCaller) {
  return caller.isSystemAdmin || caller.isHouseOwner || caller.isHouseAdmin;
}

function fromAuthorization(
  context: AuthorizationContext,
  mode: "casa" | "gotrue",
): AdminCaller | { error: string; status: number } {
  const profile = context.profile;
  if (!profile?.organizationId || !profile.isActive) {
    return { error: "Perfil do administrador não encontrado ou inativo.", status: 403 };
  }

  const organizationId = profile.organizationId;
  const houseRoles = context.memberships.filter(
    (item) =>
      item.practice?.organizationId === organizationId && item.practice.kind === "house",
  );

  return {
    userId: context.user.id,
    organizationId,
    isSystemAdmin: context.isSystemAdmin,
    isHouseOwner: houseRoles.some((item) => item.role === "owner"),
    isHouseAdmin: houseRoles.some((item) => item.role === "admin"),
    mode,
  };
}

/**
 * Identifica o caller admin em Casa Auth (cookie + SQL) ou GoTrue (quando Casa DB ausente).
 */
export async function resolveAdminCaller(): Promise<
  { ok: true; caller: AdminCaller } | { ok: false; response: NextResponse }
> {
  const authUser = await getAuthUser();
  if (!authUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 }),
    };
  }

  if (isCasaDatabaseConfigured()) {
    const loaded = await loadCasaAuthorization(authUser.userId, authUser.email || null);
    if (loaded.error && !loaded.context.profile) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Não foi possível validar permissões." },
          { status: 500 },
        ),
      };
    }
    const caller = fromAuthorization(loaded.context, "casa");
    if ("error" in caller) {
      return {
        ok: false,
        response: NextResponse.json({ error: caller.error }, { status: caller.status }),
      };
    }
    return { ok: true, caller };
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Autenticação não configurada neste ambiente." },
        { status: 503 },
      ),
    };
  }

  const loaded = await loadAuthorizationContext(supabase, {
    id: authUser.userId,
    email: authUser.email || null,
  });
  const caller = fromAuthorization(loaded.context, "gotrue");
  if ("error" in caller) {
    return {
      ok: false,
      response: NextResponse.json({ error: caller.error }, { status: caller.status }),
    };
  }
  return { ok: true, caller };
}
