import { NextResponse } from "next/server";
import { canManagePractices, resolveAdminCaller } from "@/lib/auth/admin-caller";
import {
  getHousePracticeCasa,
  updateHousePracticeCasa,
  type CasaPracticeRow,
} from "@/lib/casa/admin-practices";
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
  created_at?: string | null;
};

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function toPublic(row: PracticeRow | CasaPracticeRow) {
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

  const resolved = await resolveAdminCaller();
  if (!resolved.ok) return resolved.response;
  const { caller } = resolved;

  if (!canManagePractices(caller)) {
    return jsonError(
      "Apenas proprietária, administração ou SYSTEM_ADMIN podem gerir práticas.",
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Corpo da requisição inválido.", 400);
  }

  const patch: {
    name?: string;
    specialty?: string;
    isolationLabel?: string;
    isActive?: boolean;
  } = {};
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
    patch.isolationLabel = isolationLabel;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return jsonError("Status inválido.", 400);
    }
    patch.isActive = body.isActive;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("Nenhuma alteração informada.", 400);
  }

  if (caller.mode === "casa") {
    try {
      const existing = await getHousePracticeCasa(caller.userId, practiceId);
      if (!existing) return jsonError("Prática não encontrada.", 404);
      if (existing.organization_id !== caller.organizationId || existing.kind !== "house") {
        return jsonError("Prática fora do escopo da organização.", 403);
      }
      const updated = await updateHousePracticeCasa(caller.userId, practiceId, patch);
      if (!updated) return jsonError("Não foi possível atualizar a prática.", 500);
      return NextResponse.json({ practice: toPublic(updated) });
    } catch (error) {
      console.error("[admin/practices] casa update failed", error);
      return jsonError("Não foi possível atualizar a prática.", 500);
    }
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

  const { data: existing, error: existingError } = await admin
    .from("practice_units")
    .select("id, organization_id, kind")
    .eq("id", practiceId)
    .maybeSingle();

  if (existingError || !existing) {
    return jsonError("Prática não encontrada.", 404);
  }
  if (existing.organization_id !== caller.organizationId || existing.kind !== "house") {
    return jsonError("Prática fora do escopo da organização.", 403);
  }

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.specialty !== undefined) dbPatch.specialty = patch.specialty;
  if (patch.isolationLabel !== undefined) dbPatch.isolation_label = patch.isolationLabel;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

  const { data: updated, error: updateError } = await admin
    .from("practice_units")
    .update(dbPatch)
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
