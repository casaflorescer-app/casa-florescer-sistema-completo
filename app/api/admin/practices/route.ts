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

function normalizeCode(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
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

async function resolveCallerContext() {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { error: jsonError("Autenticação não configurada neste ambiente.", 503) };
  }

  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return { error: jsonError("Sessão inválida. Entre novamente.", 401) };
  }

  if (!getServiceRoleKey()) {
    return {
      error: jsonError(
        "Gestão de práticas indisponível: chave de serviço não configurada no servidor.",
        503,
      ),
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      error: jsonError(
        "Gestão de práticas indisponível: chave de serviço não configurada no servidor.",
        503,
      ),
    };
  }

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, organization_id, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError || !callerProfile?.organization_id || !callerProfile.is_active) {
    return { error: jsonError("Perfil do administrador não encontrado ou inativo.", 403) };
  }

  const organizationId = callerProfile.organization_id as string;

  const [{ data: callerRoles }, { data: adminRow }] = await Promise.all([
    admin
      .from("user_practice_roles")
      .select("role, practice_id, practice_units!inner ( organization_id, kind )")
      .eq("user_id", caller.id),
    admin
      .from("system_admins")
      .select("user_id, revoked_at")
      .eq("user_id", caller.id)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);

  const orgRoles = (callerRoles ?? []).filter((row) => {
    const practice = Array.isArray(row.practice_units) ? row.practice_units[0] : row.practice_units;
    const record = practice as { organization_id?: string; kind?: string } | null;
    return record?.organization_id === organizationId && record?.kind === "house";
  });

  const callerIsOwner = orgRoles.some((row) => row.role === "owner");
  const callerIsAdmin = orgRoles.some((row) => row.role === "admin");
  const isSystemAdmin = Boolean(adminRow?.user_id);

  if (!callerIsOwner && !callerIsAdmin && !isSystemAdmin) {
    return {
      error: jsonError("Apenas proprietária, administração ou SYSTEM_ADMIN podem gerir práticas.", 403),
    };
  }

  return {
    admin,
    callerId: caller.id,
    organizationId,
    callerIsOwner,
    callerIsAdmin,
    isSystemAdmin,
  };
}

export async function GET() {
  const ctx = await resolveCallerContext();
  if ("error" in ctx && ctx.error) return ctx.error;
  const { admin, organizationId } = ctx as Exclude<Awaited<ReturnType<typeof resolveCallerContext>>, { error: NextResponse }>;

  const { data, error } = await admin
    .from("practice_units")
    .select("id, organization_id, kind, code, name, specialty, isolation_label, is_active, created_at")
    .eq("organization_id", organizationId)
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
  const ctx = await resolveCallerContext();
  if ("error" in ctx && ctx.error) return ctx.error;
  const { admin, callerId, organizationId } = ctx as Exclude<
    Awaited<ReturnType<typeof resolveCallerContext>>,
    { error: NextResponse }
  >;

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

  const { count: houseCount, error: countError } = await admin
    .from("practice_units")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("kind", "house");

  if (countError) {
    return jsonError("Não foi possível verificar práticas existentes.", 500);
  }

  const isFirstHouse = (houseCount ?? 0) === 0;

  const { data: inserted, error: insertError } = await admin
    .from("practice_units")
    .insert({
      organization_id: organizationId,
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
      user_id: callerId,
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
