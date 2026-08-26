import type { User } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/types/domain";

export type AuthUser = {
  userId: string;
  email: string;
  fullName: string;
};

export function toAuthUser(user: User): AuthUser {
  const email = user.email ?? "";
  const metaName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "";
  return {
    userId: user.id,
    email,
    fullName: metaName.trim() || email || "Usuária",
  };
}

/**
 * Contexto mínimo para o shell atual.
 * FASE 5/6: preencher papéis via user_practice_roles + system_admins.
 * Nunca inferir manager / Admin Master aqui.
 */
export function sessionFromAuthUser(user: AuthUser): SessionContext {
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    uiRole: null,
    staffRoles: [],
    practiceIds: [],
    patientId: null,
    isPreview: false,
    permissions: [],
  };
}
