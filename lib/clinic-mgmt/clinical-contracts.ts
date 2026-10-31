"use client";

import { createClient } from "@/lib/supabase/client";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { callCasaRpc } from "@/lib/casa/rpc";
import { listObstetricContractsCasa, listProcedureAgreementsCasa } from "@/lib/casa/reads";
import type {
  ObstetricAvailabilityContract,
  ObstetricContractStatus,
  ProcedureAgreement,
  ProcedureAgreementKind,
  ProcedureAgreementStatus,
} from "@/lib/clinic-mgmt/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase && !isCasaBrowserAuth()) throw new Error("Autenticação não configurada neste ambiente.");
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

function mapObs(row: Record<string, unknown>): ObstetricAvailabilityContract {
  const patient = oneRecord(row.patients);
  const professional = oneRecord(row.professionals);
  const profile = professional ? oneRecord(professional.profiles) : null;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    practiceId: typeof row.practice_id === "string" ? row.practice_id : null,
    patientId: String(row.patient_id),
    patientName: typeof patient?.full_name === "string" ? patient.full_name : null,
    professionalId: String(row.professional_id),
    professionalName: typeof profile?.full_name === "string" ? profile.full_name : null,
    contractCode: typeof row.contract_code === "string" ? row.contract_code : null,
    status: (row.status as ObstetricContractStatus) ?? "active",
    contractedOn: String(row.contracted_on ?? ""),
    startsOn: typeof row.starts_on === "string" ? row.starts_on : null,
    endsOn: typeof row.ends_on === "string" ? row.ends_on : null,
    includesNormalBirth: row.includes_normal_birth === true,
    includesCesarean: row.includes_cesarean === true,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function mapProc(row: Record<string, unknown>): ProcedureAgreement {
  const patient = oneRecord(row.patients);
  const professional = oneRecord(row.professionals);
  const profile = professional ? oneRecord(professional.profiles) : null;
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    patientId: String(row.patient_id),
    patientName: typeof patient?.full_name === "string" ? patient.full_name : null,
    professionalId: typeof row.professional_id === "string" ? row.professional_id : null,
    professionalName: typeof profile?.full_name === "string" ? profile.full_name : null,
    encounterId: typeof row.encounter_id === "string" ? row.encounter_id : null,
    procedureName: String(row.procedure_name ?? ""),
    agreementKind: (row.agreement_kind as ProcedureAgreementKind) ?? "risk_acknowledgment",
    status: (row.status as ProcedureAgreementStatus) ?? "draft",
    versionNumber: Number(row.version_number ?? 1),
    title: String(row.title ?? ""),
    termBody: typeof row.term_body === "string" ? row.term_body : null,
    acknowledgedAt: typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    acknowledgedByName: typeof row.acknowledged_by_name === "string" ? row.acknowledged_by_name : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listObstetricContracts(
  organizationId: string,
  opts?: { patientId?: string; status?: ObstetricContractStatus; q?: string },
) {
  const supabase = requireClient();
  if (!supabase) {
    const data = await listObstetricContractsCasa(organizationId, opts?.patientId, opts?.status);
    return filterContracts(data.map((row) => mapObs(row)), opts?.q);
  }
  let query = supabase
    .from("obstetric_availability_contracts")
    .select(
      "id, organization_id, practice_id, patient_id, professional_id, contract_code, status, contracted_on, starts_on, ends_on, includes_normal_birth, includes_cesarean, notes, created_at, patients(full_name), professionals(id, profiles(full_name))",
    )
    .eq("organization_id", organizationId)
    .order("contracted_on", { ascending: false });
  if (opts?.patientId) query = query.eq("patient_id", opts.patientId);
  if (opts?.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []).map((row) => mapObs(row as Record<string, unknown>));
  return filterContracts(rows, opts?.q);
}

function filterContracts(rows: ObstetricAvailabilityContract[], q?: string) {
  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      (r.patientName ?? "").toLowerCase().includes(needle) ||
      (r.professionalName ?? "").toLowerCase().includes(needle) ||
      (r.contractCode ?? "").toLowerCase().includes(needle),
  );
}

export async function createObstetricContract(input: {
  organizationId: string;
  patientId: string;
  professionalId: string;
  includesNormalBirth: boolean;
  includesCesarean: boolean;
  contractedOn?: string;
  startsOn?: string;
  endsOn?: string;
  notes?: string;
  status?: ObstetricContractStatus;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    patient_id: input.patientId,
    professional_id: input.professionalId,
    includes_normal_birth: input.includesNormalBirth,
    includes_cesarean: input.includesCesarean,
    contracted_on: input.contractedOn ?? null,
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    notes: input.notes ?? null,
    status: input.status ?? "active",
  };
  if (!supabase) return String(await callCasaRpc("obstetric_availability_contract_create", [payload]));
  const { data, error } = await supabase.rpc("obstetric_availability_contract_create", {
    p_payload: payload,
  });
  if (error) throw new Error(friendlyObsError(error.message));
  return String(data);
}

export async function endObstetricContract(input: {
  organizationId: string;
  id: string;
  op: "end" | "cancel";
  reason?: string;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    id: input.id,
    op: input.op,
    reason: input.reason ?? null,
  };
  if (!supabase) {
    await callCasaRpc("obstetric_availability_contract_end", [payload]);
    return;
  }
  const { error } = await supabase.rpc("obstetric_availability_contract_end", {
    p_payload: payload,
  });
  if (error) throw new Error(friendlyObsError(error.message));
}

export async function listProcedureAgreements(
  organizationId: string,
  opts?: { patientId?: string; status?: ProcedureAgreementStatus; q?: string },
) {
  const supabase = requireClient();
  if (!supabase) {
    const data = await listProcedureAgreementsCasa(organizationId, opts?.patientId, opts?.status);
    return filterProcedures(data.map((row) => mapProc(row)), opts?.q);
  }
  let query = supabase
    .from("procedure_agreements")
    .select(
      "id, organization_id, patient_id, professional_id, encounter_id, procedure_name, agreement_kind, status, version_number, title, term_body, acknowledged_at, acknowledged_by_name, notes, created_at, patients(full_name), professionals(id, profiles(full_name))",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (opts?.patientId) query = query.eq("patient_id", opts.patientId);
  if (opts?.status) query = query.eq("status", opts.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []).map((row) => mapProc(row as Record<string, unknown>));
  return filterProcedures(rows, opts?.q);
}

function filterProcedures(rows: ProcedureAgreement[], q?: string) {
  const needle = q?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      (r.patientName ?? "").toLowerCase().includes(needle) ||
      r.procedureName.toLowerCase().includes(needle) ||
      r.title.toLowerCase().includes(needle),
  );
}

export async function createProcedureAgreement(input: {
  organizationId: string;
  patientId: string;
  procedureName: string;
  title: string;
  agreementKind: ProcedureAgreementKind;
  termBody?: string;
  professionalId?: string;
  notes?: string;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    patient_id: input.patientId,
    procedure_name: input.procedureName,
    title: input.title,
    agreement_kind: input.agreementKind,
    term_body: input.termBody ?? null,
    professional_id: input.professionalId ?? null,
    notes: input.notes ?? null,
    status: "draft",
  };
  if (!supabase) return String(await callCasaRpc("procedure_agreement_create", [payload]));
  const { data, error } = await supabase.rpc("procedure_agreement_create", {
    p_payload: payload,
  });
  if (error) throw new Error(friendlyProcError(error.message));
  return String(data);
}

export async function acknowledgeProcedureAgreement(input: {
  organizationId: string;
  id: string;
  acknowledgedByName: string;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    id: input.id,
    acknowledged_by_name: input.acknowledgedByName,
  };
  if (!supabase) {
    await callCasaRpc("procedure_agreement_acknowledge", [payload]);
    return;
  }
  const { error } = await supabase.rpc("procedure_agreement_acknowledge", {
    p_payload: payload,
  });
  if (error) throw new Error(friendlyProcError(error.message));
}

export async function cancelProcedureAgreement(input: {
  organizationId: string;
  id: string;
  reason?: string;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    id: input.id,
    reason: input.reason ?? null,
  };
  if (!supabase) {
    await callCasaRpc("procedure_agreement_cancel", [payload]);
    return;
  }
  const { error } = await supabase.rpc("procedure_agreement_cancel", {
    p_payload: payload,
  });
  if (error) throw new Error(friendlyProcError(error.message));
}

export function obstetricDashboard(rows: ObstetricAvailabilityContract[]) {
  return {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    ended: rows.filter((r) => r.status === "ended").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    withNormal: rows.filter((r) => r.includesNormalBirth).length,
    withCesarean: rows.filter((r) => r.includesCesarean).length,
  };
}

function friendlyObsError(message: string) {
  if (/OBS_CONTRACT_FORBIDDEN|42501/i.test(message)) {
    return "Você não tem permissão para administrar contratos obstétricos.";
  }
  if (/OBS_CONTRACT_AVAILABILITY_REQUIRED/i.test(message)) {
    return "Selecione parto normal e/ou cesariana.";
  }
  if (/OBS_CONTRACT_PATIENT_NOT_FOUND/i.test(message)) {
    return "Paciente não encontrada nesta organização.";
  }
  return "Não foi possível concluir a operação no contrato obstétrico.";
}

function friendlyProcError(message: string) {
  if (/PROC_AGREEMENT_FORBIDDEN|42501/i.test(message)) {
    return "Você não tem permissão para administrar termos de procedimento.";
  }
  if (/PROC_AGREEMENT_ACK_NAME_REQUIRED/i.test(message)) {
    return "Informe quem registrou a ciência do termo.";
  }
  return "Não foi possível concluir a operação no termo/contrato.";
}
