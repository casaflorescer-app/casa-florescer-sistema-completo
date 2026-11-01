/**
 * C070-C4.4 — resumo centrado na paciente (Patient 360 / Quick View).
 * Sem migration. Respeita RLS; camada clínica só quando `includeClinical`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { listProfessionalLabelsCasa } from "@/lib/casa/reads";
import { ageFromBirthDate, formatIsoDateBr, formatPhone } from "@/lib/patients/format";
import { getPatient, maskCpf, patientChartHref } from "@/lib/patients/directory";
import {
  APPOINTMENT_STATUS_LABEL,
  ENCOUNTER_STATUS_LABEL,
  listAppointments,
  listEncountersForPatient,
  type AppointmentRow,
} from "@/lib/attendance/directory";
import {
  effectiveEdd,
  listPatientPregnancies,
  PREGNANCY_STATUS_LABEL,
} from "@/lib/pregnancies/directory";
import { listExamOrdersForPatient } from "@/lib/exams/directory";
import { listPrescriptionsForPatient } from "@/lib/prescriptions/directory";
import { formatDateTime } from "@/lib/platform/format";
import type { AppointmentKind } from "@/lib/types/database";

const KIND_LABEL: Record<AppointmentKind, string> = {
  consultation: "Consulta",
  procedure: "Procedimento",
};

function todayInputDate(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function addDaysInputDate(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + days);
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${m}-${d}`;
}

function dateRangeBoundsIso(fromDate: string, toDate: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return null;
  if (toDate < fromDate) return null;
  const start = new Date(`${fromDate}T00:00:00`);
  const endInclusive = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime())) return null;
  const end = new Date(endInclusive);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export type Patient360Snapshot = {
  patientId: string;
  fullName: string;
  socialName: string | null;
  birthDate: string | null;
  ageYears: number | null;
  cpfMasked: string;
  phoneFormatted: string | null;
  includeClinical: boolean;
  lastEncounter: {
    id: string;
    whenLabel: string;
    statusLabel: string;
    isReturn: boolean;
  } | null;
  nextAppointment: {
    id: string;
    whenLabel: string;
    kindLabel: string;
    professionalName: string | null;
    statusLabel: string;
  } | null;
  pregnancy: {
    id: string;
    statusLabel: string;
    lmpLabel: string | null;
    eddLabel: string | null;
    href: string;
  } | null;
  examsCount: number;
  prescriptionsCount: number;
  links: {
    detail: string;
    chart: string | null;
    agenda: string;
    exams: string;
    prescriptions: string;
    obstetrics: string | null;
  };
};

async function resolveProfessionalName(
  supabase: SupabaseClient | null,
  appointment: AppointmentRow | undefined,
): Promise<string | null> {
  if (!appointment) return null;
  if (appointment.professionalName) return appointment.professionalName;
  if (!supabase) {
    if (!isCasaBrowserAuth()) return null;
    const labels = await listProfessionalLabelsCasa();
    const match = labels.find((row) => row.id === appointment.professionalId);
    const name = typeof match?.full_name === "string" ? match.full_name.trim() : "";
    return name || null;
  }
  const { data } = await supabase
    .from("professional_labels")
    .select("full_name")
    .eq("id", appointment.professionalId)
    .maybeSingle();
  const name = data && typeof (data as { full_name?: unknown }).full_name === "string"
    ? String((data as { full_name: string }).full_name).trim()
    : "";
  return name || null;
}

export async function loadPatient360Snapshot(
  supabase: SupabaseClient | null,
  input: {
    patientId: string;
    practiceId: string | null;
    /** Médica: inclui encounters/gestação/contagens clínicas. Secretaria: só operacional. */
    includeClinical: boolean;
  },
): Promise<Patient360Snapshot | null> {
  const patient = await getPatient(supabase, input.patientId);
  if (!patient) return null;

  const today = todayInputDate();
  const rangeEnd = addDaysInputDate(today, 60);
  const bounds = dateRangeBoundsIso(today, rangeEnd);

  const appointmentsPromise =
    input.practiceId && bounds
      ? listAppointments(supabase, {
          practiceId: input.practiceId,
          from: bounds.from,
          to: bounds.to,
          patientId: input.patientId,
        }).catch(() => [] as AppointmentRow[])
      : Promise.resolve([] as AppointmentRow[]);

  const clinicalPromise =
    input.includeClinical && input.practiceId
      ? Promise.all([
          listEncountersForPatient(supabase, input.practiceId, input.patientId).catch(() => []),
          listPatientPregnancies(supabase, input.patientId).catch(() => []),
          listExamOrdersForPatient(supabase, input.patientId).catch(() => []),
          listPrescriptionsForPatient(supabase, input.patientId).catch(() => []),
        ])
      : Promise.resolve([[], [], [], []] as const);

  const [appointments, clinicalBundle] = await Promise.all([
    appointmentsPromise,
    clinicalPromise,
  ]);

  const [encounters, pregnancies, exams, prescriptions] = clinicalBundle as [
    Awaited<ReturnType<typeof listEncountersForPatient>>,
    Awaited<ReturnType<typeof listPatientPregnancies>>,
    Awaited<ReturnType<typeof listExamOrdersForPatient>>,
    Awaited<ReturnType<typeof listPrescriptionsForPatient>>,
  ];

  const upcoming = appointments
    .filter((row) => row.status !== "cancelled" && row.status !== "no_show")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const professionalName = await resolveProfessionalName(supabase, upcoming);
  const lastEncounter = encounters[0] ?? null;
  const activePregnancy = pregnancies.find((row) => row.status === "in_care") ?? null;

  return {
    patientId: patient.id,
    fullName: patient.fullName,
    socialName: patient.socialName,
    birthDate: patient.birthDate,
    ageYears: patient.birthDate ? ageFromBirthDate(patient.birthDate) : null,
    cpfMasked: maskCpf(patient.cpf),
    phoneFormatted: patient.phone ? formatPhone(patient.phone) : null,
    includeClinical: input.includeClinical,
    lastEncounter: lastEncounter
      ? {
          id: lastEncounter.id,
          whenLabel: formatDateTime(lastEncounter.signedAt ?? lastEncounter.createdAt),
          statusLabel: ENCOUNTER_STATUS_LABEL[lastEncounter.status],
          isReturn: Boolean(lastEncounter.returnOfEncounterId),
        }
      : null,
    nextAppointment: upcoming
      ? {
          id: upcoming.id,
          whenLabel: formatDateTime(upcoming.startsAt),
          kindLabel: KIND_LABEL[upcoming.kind],
          professionalName,
          statusLabel: APPOINTMENT_STATUS_LABEL[upcoming.status],
        }
      : null,
    pregnancy: activePregnancy
      ? {
          id: activePregnancy.id,
          statusLabel: PREGNANCY_STATUS_LABEL[activePregnancy.status],
          lmpLabel: activePregnancy.lmpDate
            ? formatIsoDateBr(activePregnancy.lmpDate)
            : null,
          eddLabel: (() => {
            const edd = effectiveEdd(activePregnancy);
            return edd ? formatIsoDateBr(edd) : null;
          })(),
          href: `/app/patients/${patient.id}/pregnancies/${activePregnancy.id}`,
        }
      : null,
    examsCount: exams.length,
    prescriptionsCount: prescriptions.length,
    links: {
      detail: `/app/patients/${patient.id}`,
      chart: input.includeClinical ? patientChartHref(patient.id) : null,
      agenda: `/app/agenda?patientId=${patient.id}`,
      exams: `/app/exams?patientId=${patient.id}`,
      prescriptions: `/app/prescriptions?patientId=${patient.id}`,
      obstetrics: activePregnancy
        ? `/app/patients/${patient.id}/pregnancies/${activePregnancy.id}`
        : input.includeClinical
          ? `/app/patients/${patient.id}/pregnancies/new`
          : null,
    },
  };
}
