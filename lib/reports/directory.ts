"use client";

import { createClient } from "@/lib/supabase/client";
import {
  periodToTimestamptzRange,
  type ReportPeriod,
} from "@/lib/reports/period";
import type {
  AppointmentsDetail,
  AppointmentDetailRow,
  ReportsSummary,
} from "@/lib/reports/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function mapRpcError(message: string): string {
  if (message.includes("REPORTS_FORBIDDEN") || message.includes("42501")) {
    return "Sem permissão para relatórios (owner/admin da casa).";
  }
  if (message.includes("REPORTS_PERIOD_INVALID")) {
    return "Período inválido. Informe data inicial e final coerentes.";
  }
  if (message.includes("REPORTS_PERIOD_TOO_LONG")) {
    return "Período máximo de 400 dias.";
  }
  if (/Could not find the function|PGRST202|schema cache/i.test(message)) {
    return "Funções de relatório ainda não aplicadas no banco (migration 0054).";
  }
  return message;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asObjNum(value: unknown): Record<string, number> {
  const rec = asRecord(value);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = asNum(v);
  return out;
}

function parseSummary(raw: unknown): ReportsSummary {
  const r = asRecord(raw);
  const period = asRecord(r.period);
  const patients = asRecord(r.patients);
  const appointments = asRecord(r.appointments);
  const encounters = asRecord(r.encounters);
  const documents = asRecord(r.documents);
  const exam_requests = asRecord(r.exam_requests);
  const prescriptions = asRecord(r.prescriptions);
  const rentals = asRecord(r.rentals);
  const rooms = asRecord(r.rooms);
  const clinical_contracts = asRecord(r.clinical_contracts);
  const workforce = asRecord(r.workforce);
  const stock = asRecord(r.stock);
  const equipment = asRecord(r.equipment);
  const unavailable = asRecord(r.unavailable);

  const dailyRaw = Array.isArray(appointments.daily) ? appointments.daily : [];
  const daily = dailyRaw.map((item) => {
    const row = asRecord(item);
    return { day: String(row.day ?? ""), count: asNum(row.count) };
  });

  const unavailableMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(unavailable)) {
    if (typeof v === "string") unavailableMap[k] = v;
  }

  return {
    period: {
      from: String(period.from ?? ""),
      to: String(period.to ?? ""),
      timezone: String(period.timezone ?? "America/Sao_Paulo"),
    },
    patients: {
      total: asNum(patients.total),
      new_in_period: asNum(patients.new_in_period),
    },
    appointments: {
      total_in_period: asNum(appointments.total_in_period),
      by_status: asObjNum(appointments.by_status),
      by_kind: asObjNum(appointments.by_kind),
      completed: asNum(appointments.completed),
      cancelled: asNum(appointments.cancelled),
      no_show: asNum(appointments.no_show),
      daily,
    },
    encounters: {
      opened_in_period: asNum(encounters.opened_in_period),
      signed_in_period: asNum(encounters.signed_in_period),
      cancelled_in_period: asNum(encounters.cancelled_in_period),
      returns_opened_in_period: asNum(encounters.returns_opened_in_period),
      open_now: asNum(encounters.open_now),
    },
    documents: {
      finalized_in_period: asNum(documents.finalized_in_period),
      by_kind_finalized: asObjNum(documents.by_kind_finalized),
      superseded_in_period: asNum(documents.superseded_in_period),
      published_to_portal_in_period: asNum(documents.published_to_portal_in_period),
    },
    exam_requests: {
      confirmed_in_period: asNum(exam_requests.confirmed_in_period),
      draft_in_period: asNum(exam_requests.draft_in_period),
      cancelled_in_period: asNum(exam_requests.cancelled_in_period),
    },
    prescriptions: {
      signed_in_period: asNum(prescriptions.signed_in_period),
      draft_in_period: asNum(prescriptions.draft_in_period),
      cancelled_in_period: asNum(prescriptions.cancelled_in_period),
    },
    rentals: {
      active: asNum(rentals.active),
      scheduled: asNum(rentals.scheduled),
      ended: asNum(rentals.ended),
      cancelled: asNum(rentals.cancelled),
      expiring_soon: asNum(rentals.expiring_soon),
    },
    rooms: {
      total: asNum(rooms.total),
      active: asNum(rooms.active),
    },
    clinical_contracts: {
      obstetric_active: asNum(clinical_contracts.obstetric_active),
      procedure_active: asNum(clinical_contracts.procedure_active),
    },
    workforce: {
      active: asNum(workforce.active),
      inactive: asNum(workforce.inactive),
    },
    stock: {
      items_active: asNum(stock.items_active),
      low_stock: asNum(stock.low_stock),
      lots_expired: asNum(stock.lots_expired),
      lots_expiring_soon: asNum(stock.lots_expiring_soon),
      movements_in_period: asNum(stock.movements_in_period),
      movements_by_kind: asObjNum(stock.movements_by_kind),
    },
    equipment: {
      total: asNum(equipment.total),
      by_status: asObjNum(equipment.by_status),
    },
    unavailable: unavailableMap,
  };
}

export async function loadReportsSummary(
  organizationId: string,
  period: ReportPeriod,
): Promise<ReportsSummary> {
  const supabase = requireClient();
  const { fromIso, toIso } = periodToTimestamptzRange(period);
  const { data, error } = await supabase.rpc("reports_operational_summary", {
    p_organization_id: organizationId,
    p_from: fromIso,
    p_to: toIso,
  });
  if (error) throw new Error(mapRpcError(error.message));
  return parseSummary(data);
}

export async function loadAppointmentsDetail(params: {
  organizationId: string;
  period: ReportPeriod;
  status?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}): Promise<AppointmentsDetail> {
  const supabase = requireClient();
  const { fromIso, toIso } = periodToTimestamptzRange(params.period);
  const { data, error } = await supabase.rpc("reports_appointments_detail", {
    p_organization_id: params.organizationId,
    p_from: fromIso,
    p_to: toIso,
    p_status: params.status || null,
    p_kind: params.kind || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(mapRpcError(error.message));
  const rec = asRecord(data);
  const rowsRaw = Array.isArray(rec.rows) ? rec.rows : [];
  const rows: AppointmentDetailRow[] = rowsRaw.map((item) => {
    const row = asRecord(item);
    return {
      id: String(row.id ?? ""),
      scheduled_starts_at: String(row.scheduled_starts_at ?? ""),
      status: String(row.status ?? ""),
      kind: String(row.kind ?? ""),
      practice_id: String(row.practice_id ?? ""),
      professional_id: String(row.professional_id ?? ""),
      room_id: String(row.room_id ?? ""),
      patient_id: String(row.patient_id ?? ""),
      patient_name: String(row.patient_name ?? ""),
      professional_name: String(row.professional_name ?? ""),
    };
  });
  return {
    total: asNum(rec.total),
    limit: asNum(rec.limit),
    offset: asNum(rec.offset),
    rows,
  };
}

/** Exportação CSV simples (somente dados já carregados na UI). */
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
