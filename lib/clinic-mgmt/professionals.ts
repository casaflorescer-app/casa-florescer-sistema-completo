"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClinicProfessional, ProfessionalCategory } from "@/lib/clinic-mgmt/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function oneRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function mapCategory(raw: unknown): ProfessionalCategory {
  const v = typeof raw === "string" ? raw : "outro";
  const allowed: ProfessionalCategory[] = [
    "medico",
    "enfermeiro",
    "fisioterapeuta",
    "psicologo",
    "nutricionista",
    "outro",
  ];
  return (allowed.includes(v as ProfessionalCategory) ? v : "outro") as ProfessionalCategory;
}

function mapRow(row: Record<string, unknown>): ClinicProfessional {
  const practice = oneRecord(row.practice_units);
  const profile = oneRecord(row.profiles);
  const links = Array.isArray(row.professional_specialties)
    ? (row.professional_specialties as Record<string, unknown>[])
    : [];
  const specialties = links.flatMap((link) => {
    const spec = oneRecord(link.clinic_specialties);
    const id = typeof link.specialty_id === "string" ? link.specialty_id : null;
    const name = typeof spec?.name === "string" ? spec.name : null;
    if (!id || !name) return [];
    return [{ id, name, isPrimary: link.is_primary === true }];
  });
  specialties.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "pt-BR"));

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    practiceId: String(row.practice_id),
    practiceName: typeof practice?.name === "string" ? practice.name : null,
    profileId: typeof row.profile_id === "string" ? row.profile_id : null,
    profileName: typeof profile?.full_name === "string" ? profile.full_name : null,
    displayName: String(row.display_name ?? profile?.full_name ?? "Profissional"),
    category: mapCategory(row.category),
    councilType: String(row.council_type ?? ""),
    councilNumber: String(row.council_number ?? ""),
    councilUf: typeof row.council_uf === "string" ? row.council_uf : null,
    phone: typeof row.professional_phone === "string" ? row.professional_phone : null,
    email: typeof row.professional_email === "string" ? row.professional_email : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    isActive: row.is_active !== false,
    specialties,
  };
}

const SELECT = `
  id, organization_id, practice_id, profile_id, display_name, category,
  council_type, council_number, council_uf, professional_phone, professional_email,
  notes, is_active,
  practice_units ( id, name ),
  profiles ( id, full_name ),
  professional_specialties ( specialty_id, is_primary, clinic_specialties ( id, name ) )
`;

export async function listClinicProfessionals(
  organizationId: string,
  opts?: {
    q?: string;
    category?: ProfessionalCategory | "all";
    specialtyId?: string | null;
    status?: "all" | "active" | "inactive";
    practiceId?: string | null;
  },
): Promise<ClinicProfessional[]> {
  const supabase = requireClient();
  let query = supabase
    .from("professionals")
    .select(SELECT)
    .eq("organization_id", organizationId)
    .order("display_name");

  if (opts?.category && opts.category !== "all") query = query.eq("category", opts.category);
  if (opts?.practiceId) query = query.eq("practice_id", opts.practiceId);
  if (opts?.status === "active") query = query.eq("is_active", true);
  if (opts?.status === "inactive") query = query.eq("is_active", false);
  if (opts?.q?.trim()) {
    const q = opts.q.trim().replace(/[%_,]/g, "");
    if (q) {
      query = query.or(
        `display_name.ilike.%${q}%,council_number.ilike.%${q}%,council_type.ilike.%${q}%,professional_email.ilike.%${q}%,professional_phone.ilike.%${q}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    if (/column .* does not exist|display_name|category/i.test(error.message)) {
      throw new Error(
        "O banco ainda não tem a migration C074 (0056). Aplique 0056_c074_professionals_mgmt.sql antes de usar este módulo.",
      );
    }
    throw new Error(error.message);
  }

  let rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  if (opts?.specialtyId) {
    rows = rows.filter((r) => r.specialties.some((s) => s.id === opts.specialtyId));
  }
  return rows;
}

export async function upsertClinicProfessional(input: {
  organizationId: string;
  id?: string;
  practiceId: string;
  displayName: string;
  category: ProfessionalCategory;
  councilType: string;
  councilNumber?: string;
  councilUf?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
  profileId?: string | null;
  specialtyIds: string[];
  primarySpecialtyId?: string | null;
}) {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("professional_upsert", {
    p_payload: {
      organization_id: input.organizationId,
      id: input.id ?? null,
      practice_id: input.practiceId,
      display_name: input.displayName,
      category: input.category,
      council_type: input.councilType,
      council_number: input.councilNumber ?? null,
      council_uf: input.councilUf ?? null,
      professional_phone: input.phone ?? null,
      professional_email: input.email ?? null,
      notes: input.notes ?? null,
      is_active: input.isActive ?? true,
      profile_id: input.profileId ?? null,
      specialty_ids: input.specialtyIds,
      primary_specialty_id: input.primarySpecialtyId ?? null,
    },
  });
  if (error) {
    if (/PROFESSIONAL_UPSERT_FORBIDDEN|42501/i.test(error.message)) {
      throw new Error("Você não tem permissão para administrar profissionais.");
    }
    if (/function public.professional_upsert|Could not find the function/i.test(error.message)) {
      throw new Error(
        "RPC professional_upsert ausente. Aplique a migration 0056_c074_professionals_mgmt.sql.",
      );
    }
    throw new Error(error.message || "Não foi possível salvar o profissional.");
  }
  return String(data);
}

export async function listHousePracticeOptions(organizationId: string) {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("practice_units")
    .select("id, name, code, kind, is_active")
    .eq("organization_id", organizationId)
    .eq("kind", "house")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      label: String(r.name ?? r.code ?? "Prática"),
    };
  });
}

export async function listOrgProfileOptions(organizationId: string, q: string) {
  const supabase = requireClient();
  const needle = q.trim();
  if (needle.length < 2) return [] as Array<{ id: string; label: string }>;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(`full_name.ilike.%${needle.replace(/[%_,]/g, "")}%,email.ilike.%${needle.replace(/[%_,]/g, "")}%`)
    .order("full_name")
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const name = String(r.full_name ?? "");
    const email = typeof r.email === "string" ? r.email : "";
    return {
      id: String(r.id),
      label: email ? `${name} (${email})` : name,
    };
  });
}
