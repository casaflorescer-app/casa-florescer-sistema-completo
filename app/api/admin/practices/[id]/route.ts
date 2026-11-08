import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceRoleClient, getServiceRoleKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PracticeRow = {
  id: string;
  organization_id: string;
  kind: string;
  code: string;
  name: string;
  specialty: string;
  isolation_label: string;
  is_active: boolean;
  created_at?: string;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function toPublic(row: PracticeRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    kind: row.kind,
    code: row.code,
    name: row.name,
    specialty: row.specialty,
    isolationLabel: row.isolation_label,
    isActive: row.is_active,
    createdAt: row.created_at ?? null,
  };
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
) {
  const practiceId = context.params.id?.trim();
  if (!practiceId) return jsonError("Prática inválida.", 400);

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
      "Gestão de práticas indisponível: chave de serviço não configurada no servidor.",
      503,
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return jsonError(
      "Gestão de práticas indisponível: chave de serviço não configurada no servidor.",
      503,
    );
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("id, organization_id, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile?.organization_id || !callerProfile.is_active) {
    return jsonError("Perfil do administrador não encontrado ou inativo.", 403);
  }

  const organizationId = callerProfile.organization_id as string;

  const [{ data: callerRoles }, { data: adminRow }] = await Promise.all([
    admin
      .from("user_practice_roles")
      .select("role, practice_units!inner ( organization_id, kind )")
      .eq("user_id", caller.id),
    admin
      .from("system_admins")
      .select("user_id")
      .eq("user_id", caller.id)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  const orgRoles = (callerRoles ?? []).filter((row) => {
    const practice = Array.isArray(row.practice_units) ? row.practice_units[0] : row.practice_units;
    const record = practice as { organization_id?: string; kind?: string } | null;
    return record?.organization_id === organizationId && record?.kind === "house";
  });

  const allowed =
    orgRoles.some((row) => row.role === "owner" || row.role === "admin") ||
    Boolean(adminRow?.user_id);
  if (!allowed) {
    return jsonError("Apenas proprietária, administração ou SYSTEM_ADMIN podem gerir práticas.", 403);
  }

  const { data: existing, error: existingError } = await admin
    .from("practice_units")
    .select("id, organization_id, kind")
    .eq("id", practiceId)
    .maybeSingle();

  if (existingError || !existing) {
    return jsonError("Prática não encontrada.", 404);
  }
  if (existing.organization_id !== organizationId || existing.kind !== "house") {
    return jsonError("Prática fora do escopo da organização.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Corpo da requisição inválido.", 400);
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = asTrimmedString(body.name);
    if (!name || name.length < 2) return jsonError("Informe o nome da prática.", 400);
    patch.name = name;
  }
  if (body.specialty !== undefined) {
    const specialty = asTrimmedString(body.specialty);
    if (!specialty) return jsonError("Informe a especialidade.", 400);
    patch.specialty = specialty;
  }
  if (body.isolationLabel !== undefined) {
    const isolationLabel = asTrimmedString(body.isolationLabel);
    if (!isolationLabel) return jsonError("Informe o rótulo de isolamento.", 400);
    patch.isolation_label = isolationLabel;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return jsonError("Status inválido.", 400);
    }
    patch.is_active = body.isActive;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("Nenhuma alteração informada.", 400);
  }

  const { data: updated, error: updateError } = await admin
    .from("practice_units")
    .update(patch)
    .eq("id", practiceId)
    .select("id, organization_id, kind, code, name, specialty, isolation_label, is_active, created_at")
    .single();

  if (updateError || !updated) {
    console.error("[admin/practices] update failed", {
      code: updateError?.code,
      message: updateError?.message,
    });
    return jsonError("Não foi possível atualizar a prática.", 500);
  }

  return NextResponse.json({ practice: toPublic(updated as PracticeRow) });
}
