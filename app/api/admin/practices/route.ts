import { NextResponse } from "next/server";
import {
  canManagePractices,
  resolveAdminCaller,
  type AdminCaller,
} from "@/lib/auth/admin-caller";
import {
  countHousePracticesCasa,
  deletePracticeCasa,
  insertHousePracticeCasa,
  linkOwnerOnPracticeCasa,
  listHousePracticesCasa,
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

function normalizeCode(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
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

async function requirePracticeAcl(): Promise<
  { caller: AdminCaller } | { error: NextResponse }
> {
  const resolved = await resolveAdminCaller();
  if (!resolved.ok) return { error: resolved.response };
  if (!canManagePractices(resolved.caller)) {
    return {
      error: jsonError(
        "Apenas proprietária, administração ou SYSTEM_ADMIN podem gerir práticas.",
        403,
      ),
    };
  }
  return { caller: resolved.caller };
}

export async function GET() {
  const ctx = await requirePracticeAcl();
  if ("error" in ctx) return ctx.error;
  const { caller } = ctx;

  if (caller.mode === "casa") {
    try {
      const rows = await listHousePracticesCasa(caller.userId, caller.organizationId);
      return NextResponse.json({ practices: rows.map(toPublic) });
    } catch (error) {
      console.error("[admin/practices] casa list failed", error);
      return jsonError("Não foi possível listar as práticas.", 500);
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

  const { data, error } = await admin
    .from("practice_units")
    .select("id, organization_id, kind, code, name, specialty, isolation_label, is_active, created_at")
    .eq("organization_id", caller.organizationId)
    .eq("kind", "house")
    .order("name");

  if (error) {
    console.error("[admin/practices] list failed", { code: error.code, message: error.message });
    return jsonError("Não foi possível listar as práticas.", 500);
  }

  return NextResponse.json({
    practices: ((data ?? []) as PracticeRow[]).map(toPublic),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePracticeAcl();
  if ("error" in ctx) return ctx.error;
  const { caller } = ctx;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Corpo da requisição inválido.", 400);
  }

  const name = asTrimmedString(body.name);
  const code = normalizeCode(asTrimmedString(body.code));
  const specialty = asTrimmedString(body.specialty) || "ginecologia";
  const isolationLabel =
    asTrimmedString(body.isolationLabel) ||
    `prontuario-${code.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
  const isActive = body.isActive === false ? false : true;

  if (!name || name.length < 2) {
    return jsonError("Informe o nome da prática.", 400);
  }
  if (!code || code.length < 2) {
    return jsonError("Informe um código válido (letras/números).", 400);
  }

  if (caller.mode === "casa") {
    try {
      const houseCount = await countHousePracticesCasa(caller.userId, caller.organizationId);
      const isFirstHouse = houseCount === 0;
      const inserted = await insertHousePracticeCasa(caller.userId, {
        organizationId: caller.organizationId,
        code,
        name,
        specialty,
        isolationLabel,
        isActive,
      });

      let linkedOwner = false;
      if (isFirstHouse) {
        try {
          await linkOwnerOnPracticeCasa(caller.userId, inserted.id);
          linkedOwner = true;
        } catch (roleError) {
          console.error("[admin/practices] casa bootstrap owner link failed", roleError);
          try {
            await deletePracticeCasa(caller.userId, inserted.id);
          } catch {
            /* best-effort */
          }
          return jsonError(
            "Prática criada, mas o vínculo de proprietária falhou. Tente novamente.",
            500,
          );
        }
      }

      return NextResponse.json({ practice: toPublic(inserted), linkedOwner });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === "duplicate_code" || /duplicate_code/i.test(err.message ?? "")) {
        return jsonError("Já existe uma prática com este código nesta organização.", 409);
      }
      console.error("[admin/practices] casa insert failed", error);
      return jsonError("Não foi possível criar a prática.", 500);
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

  const { count: houseCount, error: countError } = await admin
    .from("practice_units")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", caller.organizationId)
    .eq("kind", "house");

  if (countError) {
    return jsonError("Não foi possível verificar práticas existentes.", 500);
  }

  const isFirstHouse = (houseCount ?? 0) === 0;

  const { data: inserted, error: insertError } = await admin
    .from("practice_units")
    .insert({
      organization_id: caller.organizationId,
      kind: "house",
      code,
      name,
      specialty,
      isolation_label: isolationLabel,
      is_active: isActive,
    })
    .select("id, organization_id, kind, code, name, specialty, isolation_label, is_active, created_at")
    .single();

  if (insertError || !inserted) {
    const text = `${insertError?.code ?? ""} ${insertError?.message ?? ""}`.toLowerCase();
    if (insertError?.code === "23505" || text.includes("unique") || text.includes("duplicate")) {
      return jsonError("Já existe uma prática com este código nesta organização.", 409);
    }
    console.error("[admin/practices] insert failed", {
      code: insertError?.code,
      message: insertError?.message,
    });
    return jsonError("Não foi possível criar a prática.", 500);
  }

  let linkedOwner = false;
  if (isFirstHouse) {
    const { error: roleError } = await admin.from("user_practice_roles").insert({
      user_id: caller.userId,
      practice_id: inserted.id,
      role: "owner",
    });
    if (roleError) {
      console.error("[admin/practices] bootstrap owner link failed", {
        code: roleError.code,
        message: roleError.message,
      });
      await admin.from("practice_units").delete().eq("id", inserted.id);
      return jsonError("Prática criada, mas o vínculo de proprietária falhou. Tente novamente.", 500);
    }
    linkedOwner = true;
  }

  return NextResponse.json({
    practice: toPublic(inserted as PracticeRow),
    linkedOwner,
  });
}
