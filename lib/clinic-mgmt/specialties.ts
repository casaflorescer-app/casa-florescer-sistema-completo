"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClinicSpecialty } from "@/lib/clinic-mgmt/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function mapSpecialty(row: Record<string, unknown>, count?: number): ClinicSpecialty {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    isActive: row.is_active === true,
    createdAt: String(row.created_at ?? ""),
    professionalCount: count,
  };
}

export async function listClinicSpecialties(organizationId: string, opts?: { q?: string; activeOnly?: boolean }) {
  const supabase = requireClient();
  let query = supabase
    .from("clinic_specialties")
    .select("id, organization_id, name, slug, description, is_active, created_at")
    .eq("organization_id", organizationId)
    .order("name");
  if (opts?.activeOnly) query = query.eq("is_active", true);
  if (opts?.q?.trim()) query = query.ilike("name", `%${opts.q.trim()}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((r) => String((r as Record<string, unknown>).id));
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: links } = await supabase
      .from("professional_specialties")
      .select("specialty_id")
      .in("specialty_id", ids);
    for (const link of links ?? []) {
      const sid = String((link as Record<string, unknown>).specialty_id);
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return mapSpecialty(r, counts.get(String(r.id)) ?? 0);
  });
}

export async function upsertClinicSpecialty(input: {
  organizationId: string;
  id?: string;
  name: string;
  description?: string;
  isActive?: boolean;
}) {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("clinic_specialty_upsert", {
    p_payload: {
      organization_id: input.organizationId,
      id: input.id ?? null,
      name: input.name,
      description: input.description ?? null,
      is_active: input.isActive ?? true,
    },
  });
  if (error) throw new Error(friendlySpecialtyError(error.message));
  return String(data);
}

export async function setProfessionalSpecialty(input: {
  organizationId: string;
  professionalId: string;
  specialtyId: string;
  isPrimary?: boolean;
  op?: "link" | "unlink";
}) {
  const supabase = requireClient();
  const { error } = await supabase.rpc("professional_specialty_set", {
    p_payload: {
      organization_id: input.organizationId,
      professional_id: input.professionalId,
      specialty_id: input.specialtyId,
      is_primary: input.isPrimary ?? false,
      op: input.op ?? "link",
    },
  });
  if (error) throw new Error(friendlySpecialtyError(error.message));
}

export async function listProfessionalSpecialtyIds(professionalId: string) {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("professional_specialties")
    .select("specialty_id, is_primary")
    .eq("professional_id", professionalId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    specialtyId: String((row as Record<string, unknown>).specialty_id),
    isPrimary: (row as Record<string, unknown>).is_primary === true,
  }));
}

function friendlySpecialtyError(message: string) {
  if (/CLINIC_SPECIALTY_FORBIDDEN|42501/i.test(message)) {
    return "Você não tem permissão para administrar especialidades.";
  }
  if (/duplicate|unique|clinic_specialties_org_name/i.test(message)) {
    return "Já existe uma especialidade com este nome.";
  }
  if (/CLINIC_SPECIALTY_NAME_REQUIRED/i.test(message)) {
    return "Informe o nome da especialidade.";
  }
  return "Não foi possível salvar a especialidade.";
}
