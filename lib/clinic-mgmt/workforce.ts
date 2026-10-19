"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  ClinicWorkforceMember,
  WorkforceEngagement,
  WorkforceStatus,
} from "@/lib/clinic-mgmt/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function mapMember(row: Record<string, unknown>): ClinicWorkforceMember {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    fullName: String(row.full_name ?? ""),
    documentCpf: typeof row.document_cpf === "string" ? row.document_cpf : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    email: typeof row.email === "string" ? row.email : null,
    roleTitle: String(row.role_title ?? ""),
    engagementKind: (row.engagement_kind as WorkforceEngagement) ?? "employee",
    status: (row.status as WorkforceStatus) ?? "active",
    startsOn: typeof row.starts_on === "string" ? row.starts_on : null,
    endsOn: typeof row.ends_on === "string" ? row.ends_on : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listClinicWorkforce(
  organizationId: string,
  opts?: { q?: string; status?: WorkforceStatus; engagementKind?: WorkforceEngagement },
) {
  const supabase = requireClient();
  let query = supabase
    .from("clinic_workforce")
    .select(
      "id, organization_id, full_name, document_cpf, phone, email, role_title, engagement_kind, status, starts_on, ends_on, notes, created_at",
    )
    .eq("organization_id", organizationId)
    .order("full_name");
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.engagementKind) query = query.eq("engagement_kind", opts.engagementKind);
  if (opts?.q?.trim()) query = query.ilike("full_name", `%${opts.q.trim()}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMember(row as Record<string, unknown>));
}

export async function upsertClinicWorkforce(input: {
  organizationId: string;
  id?: string;
  fullName: string;
  roleTitle: string;
  engagementKind: WorkforceEngagement;
  status: WorkforceStatus;
  documentCpf?: string;
  phone?: string;
  email?: string;
  startsOn?: string;
  endsOn?: string;
  notes?: string;
}) {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("clinic_workforce_upsert", {
    p_payload: {
      organization_id: input.organizationId,
      id: input.id ?? null,
      full_name: input.fullName,
      role_title: input.roleTitle,
      engagement_kind: input.engagementKind,
      status: input.status,
      document_cpf: input.documentCpf ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      starts_on: input.startsOn || null,
      ends_on: input.endsOn || null,
      notes: input.notes ?? null,
    },
  });
  if (error) {
    if (/CLINIC_WORKFORCE_FORBIDDEN/i.test(error.message)) {
      throw new Error("Você não tem permissão para administrar funcionários.");
    }
    throw new Error("Não foi possível salvar o cadastro.");
  }
  return String(data);
}

export function workforceDashboard(rows: ClinicWorkforceMember[]) {
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    inactive: rows.filter((r) => r.status === "inactive").length,
    employees: rows.filter((r) => r.engagementKind === "employee").length,
    contractors: rows.filter((r) => r.engagementKind === "contractor").length,
  };
}
