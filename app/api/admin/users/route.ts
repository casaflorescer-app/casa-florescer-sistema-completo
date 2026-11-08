import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { AppRole } from "@/lib/types/database";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleClient, getServiceRoleKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CREATABLE_ROLES: AppRole[] = ["owner", "admin", "physician", "secretary"];

type CreateBody = {
  fullName?: unknown;
  email?: unknown;
  practiceId?: unknown;
  role?: unknown;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateTemporaryPassword() {
  // 18 bytes → ~24 chars base64url; strong enough for one-time WhatsApp handoff.
  return randomBytes(18).toString("base64url");
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return jsonError("Autenticação não configurada neste ambiente.", 503);
  }

  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return jsonError("Sessão inválida. Entre novamente.", 401);
  }

  if (!getServiceRoleKey()) {
    return jsonError(
      "Criação de usuários indisponível: chave de serviço não configurada no servidor.",
      503,
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return jsonError("Corpo da requisição inválido.", 400);
  }

  const fullName = asTrimmedString(body.fullName);
  const email = asTrimmedString(body.email).toLowerCase();
  const practiceId = asTrimmedString(body.practiceId);
  const roleRaw = asTrimmedString(body.role);

  if (!fullName || fullName.length < 2) {
    return jsonError("Informe o nome completo.", 400);
  }
  if (!email || !isEmail(email)) {
    return jsonError("Informe um e-mail válido.", 400);
  }
  if (!practiceId) {
    return jsonError("Selecione a prática.", 400);
  }
  if (!(CREATABLE_ROLES as string[]).includes(roleRaw)) {
    return jsonError("Papel inválido.", 400);
  }
  const role = roleRaw as AppRole;

  const { data: callerProfile, error: callerProfileError } = await supabase
    .from("profiles")
    .select("id, organization_id, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile?.organization_id || !callerProfile.is_active) {
    return jsonError("Perfil do administrador não encontrado ou inativo.", 403);
  }

  const organizationId = callerProfile.organization_id as string;

  const { data: callerRoles, error: callerRolesError } = await supabase
    .from("user_practice_roles")
    .select("role, practice_id, practice_units!inner ( organization_id, kind )")
    .eq("user_id", caller.id);

  if (callerRolesError) {
    return jsonError("Não foi possível validar permissões.", 500);
  }

  const orgRoles = (callerRoles ?? []).filter((row) => {
    const practice = Array.isArray(row.practice_units) ? row.practice_units[0] : row.practice_units;
    const record = practice as { organization_id?: string; kind?: string } | null;
    return record?.organization_id === organizationId && record?.kind === "house";
  });

  const callerIsOwner = orgRoles.some((row) => row.role === "owner");
  const callerIsAdmin = orgRoles.some((row) => row.role === "admin");
  if (!callerIsOwner && !callerIsAdmin) {
    return jsonError("Apenas proprietária ou administração podem criar usuários.", 403);
  }
  if (role === "owner" && !callerIsOwner) {
    return jsonError("Somente a proprietária pode conceder o papel de proprietária.", 403);
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practice_units")
    .select("id, organization_id, kind, is_active")
    .eq("id", practiceId)
    .maybeSingle();

  if (practiceError || !practice) {
    return jsonError("Prática não encontrada.", 400);
  }
  if (practice.organization_id !== organizationId) {
    return jsonError("A prática não pertence à sua organização.", 403);
  }
  if (practice.kind !== "house") {
    return jsonError("Selecione uma prática da casa (não locatária).", 400);
  }
  if (practice.is_active === false) {
    return jsonError("A prática selecionada está inativa.", 400);
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return jsonError(
      "Criação de usuários indisponível: chave de serviço não configurada no servidor.",
      503,
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  const created = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      must_change_password: true,
    },
  });

  if (created.error || !created.data.user) {
    const msg = created.error?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return jsonError("Já existe uma conta Auth com este e-mail.", 409);
    }
    console.error("[admin/users] createUser failed", {
      code: created.error?.status,
      message: created.error?.message,
    });
    return jsonError("Não foi possível criar a conta Auth.", 500);
  }

  const userId = created.data.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    organization_id: organizationId,
    is_active: true,
  });

  if (profileError) {
    console.error("[admin/users] profile insert failed", {
      code: profileError.code,
      message: profileError.message,
    });
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      /* best-effort rollback */
    }
    return jsonError("Conta Auth criada, mas o perfil falhou. Tente novamente.", 500);
  }

  const { error: roleError } = await admin.from("user_practice_roles").insert({
    user_id: userId,
    practice_id: practiceId,
    role,
  });

  if (roleError) {
    console.error("[admin/users] membership insert failed", {
      code: roleError.code,
      message: roleError.message,
    });
    try {
      await admin.from("profiles").delete().eq("id", userId);
    } catch {
      /* best-effort rollback */
    }
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch {
      /* best-effort rollback */
    }
    if (role === "owner" && /owner/i.test(roleError.message)) {
      return jsonError("Somente a proprietária pode conceder o papel de proprietária.", 403);
    }
    return jsonError("Não foi possível vincular o papel. Tente novamente.", 500);
  }

  // Senha provisória só na resposta — nunca logada.
  return NextResponse.json({ userId, temporaryPassword, email, fullName });
}
