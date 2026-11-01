"use server";

import { getAuthUser } from "@/lib/auth/session";
import {
  toAgendaBlockRow,
  toAppointmentRow,
  toEncounterRow,
  type AgendaBlockRow,
  type AppointmentRow,
} from "@/lib/attendance/directory";
import type { PatientClinicalSummaryData } from "@/lib/attendance/patient-summary";
import type { ExamRequestRow } from "@/lib/attendance/clinical-support-directory";
import {
  ENCOUNTER_STATUS_LABEL,
  type AppointmentListFilter,
  type EncounterRow,
} from "@/lib/attendance/types";
import { ageFromBirthDate } from "@/lib/patients/format";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";
import {
  toPersistPayload,
  validatePatientCreateInput,
  type PatientCreateInput,
  type PatientDetailRow,
  type PatientListRow,
} from "@/lib/patients/directory";
import type { PregnancyRow } from "@/lib/pregnancies/directory";

type SqlRow = Record<string, unknown>;

async function actorId() {
  if (!isCasaDatabaseConfigured()) {
    throw new Error("A sessão da casa ainda não está ligada neste processo.");
  }
  const user = await getAuthUser();
  if (!user) throw new Error("Sem sessão.");
  return user.userId;
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

function plain(row: SqlRow): SqlRow {
  const out: SqlRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) out[key] = value.toISOString();
    else out[key] = value;
  }
  return out;
}

function listRow(row: SqlRow): PatientListRow | null {
  const id = asText(row.id);
  const organizationId = asText(row.organization_id);
  const fullName = asText(row.full_name);
  const createdAt = asText(row.created_at);
  if (!id || !organizationId || !fullName || !createdAt) return null;
  const specialties = Array.isArray(row.care_specialties)
    ? row.care_specialties.filter((item): item is "gynecology" | "obstetrics" =>
        item === "gynecology" || item === "obstetrics",
      )
    : [];
  return {
    id,
    organizationId,
    fullName,
    socialName: asText(row.social_name),
    cpf: asText(row.cpf),
    birthDate: asText(row.birth_date)?.slice(0, 10) ?? null,
    phone: asText(row.phone),
    email: asText(row.email),
    createdBy: asText(row.created_by),
    createdAt,
    photoPath: asText(row.photo_path),
    careSpecialties: specialties,
  };
}

const PATIENT_LIST_SQL = `
  select id, organization_id, full_name, social_name, cpf, birth_date, phone, email,
         created_by, created_at, photo_path, care_specialties
  from public.patients
`;

export async function listPatientsCasa(): Promise<PatientListRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${PATIENT_LIST_SQL} order by full_name`);
    return result.rows.flatMap((row) => {
      const mapped = listRow(plain(row));
      return mapped ? [mapped] : [];
    });
  });
}

export async function searchPatientsCasa(rawQuery: string): Promise<PatientListRow[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const userId = await actorId();
  const digits = query.replace(/\D/g, "");
  const pattern = `%${query.replace(/[%_]/g, "")}%`;
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `${PATIENT_LIST_SQL}
       where full_name ilike $1
          or coalesce(social_name, '') ilike $1
          or coalesce(cpf, '') ilike $2
          or coalesce(phone, '') ilike $2
       order by full_name
       limit 40`,
      [pattern, `%${digits}%`],
    );
    return result.rows.flatMap((row) => {
      const mapped = listRow(plain(row));
      return mapped ? [mapped] : [];
    });
  });
}

export async function createPatientCasa(input: PatientCreateInput): Promise<PatientDetailRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  const userId = await actorId();
  const payload = toPersistPayload(input);
  return withCasaUser(userId, async (client) => {
    const org = await client.query<{ organization_id: string }>(
      "select organization_id from public.profiles where id = $1",
      [userId],
    );
    const organizationId = org.rows[0]?.organization_id;
    if (!organizationId) throw new Error("Não foi possível identificar o vínculo da sessão atual.");
    const result = await client.query<SqlRow>(
      `insert into public.patients (
         organization_id, created_by, full_name, social_name, cpf, birth_date, phone, email,
         preferred_channel, address_street, address_number, address_complement, address_district,
         address_city, address_state, address_cep, reception_notes, care_specialties,
         billing_modality, private_payment_method, insurance_name, insurance_card_number,
         insurance_valid_until
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )
       returning id, organization_id, full_name, social_name, cpf, birth_date, phone, email,
                 created_by, created_at, photo_path, care_specialties, preferred_channel,
                 address_street, address_number, address_complement, address_district,
                 address_city, address_state, address_cep, reception_notes, billing_modality,
                 private_payment_method, insurance_name, insurance_card_number, insurance_valid_until`,
      [
        organizationId,
        userId,
        payload.full_name,
        payload.social_name,
        payload.cpf,
        payload.birth_date,
        payload.phone,
        payload.email,
        payload.preferred_channel,
        payload.address_street,
        payload.address_number,
        payload.address_complement,
        payload.address_district,
        payload.address_city,
        payload.address_state,
        payload.address_cep,
        payload.reception_notes,
        payload.care_specialties,
        payload.billing_modality,
        payload.private_payment_method,
        payload.insurance_name,
        payload.insurance_card_number,
        payload.insurance_valid_until,
      ],
    );
    const base = listRow(plain(result.rows[0] ?? {}));
    if (!base) throw new Error("Não foi possível cadastrar a paciente. Tente novamente.");
    const row = plain(result.rows[0] ?? {});
    return {
      ...base,
      preferredChannel: input.preferredChannel,
      addressStreet: asText(row.address_street),
      addressNumber: asText(row.address_number),
      addressComplement: asText(row.address_complement),
      addressDistrict: asText(row.address_district),
      addressCity: asText(row.address_city),
      addressState: asText(row.address_state),
      addressCep: asText(row.address_cep),
      receptionNotes: asText(row.reception_notes),
      billingModality: (asText(row.billing_modality) as PatientDetailRow["billingModality"]) ?? null,
      insuranceName: asText(row.insurance_name),
      insuranceCardNumber: asText(row.insurance_card_number),
      insuranceValidUntil: asText(row.insurance_valid_until)?.slice(0, 10) ?? null,
      privatePaymentMethod:
        (asText(row.private_payment_method) as PatientDetailRow["privatePaymentMethod"]) ?? null,
    };
  });
}

export async function listAppointmentsCasa(filter: AppointmentListFilter): Promise<AppointmentRow[]> {
  const userId = await actorId();
  const values: unknown[] = [filter.practiceId, filter.from, filter.to];
  const where = ["practice_id = $1", "starts_at >= $2", "starts_at < $3"];
  function add(column: string, value: string | undefined) {
    if (!value) return;
    values.push(value);
    where.push(`${column} = $${values.length}`);
  }
  add("professional_id", filter.professionalId);
  add("patient_id", filter.patientId);
  add("room_id", filter.roomId);
  add("procedure_id", filter.procedureId);
  add("kind", filter.kind);
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    values.push(statuses);
    where.push(`status = any($${values.length}::text[])`);
  }
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, organization_id, practice_id, room_id, patient_id, professional_id, procedure_id,
              kind, starts_at, ends_at, scheduled_starts_at, scheduled_ends_at, status, urgency_note,
              source, checkin_at, checked_in_by, arrival_at, arrival_recorded_by, actual_start_at,
              actual_start_recorded_by, actual_end_at, actual_end_recorded_by, created_by
       from public.appointments
       where ${where.join(" and ")}
       order by starts_at`,
      values,
    );
    return result.rows.flatMap((row) => {
      const mapped = toAppointmentRow(plain(row));
      return mapped ? [mapped] : [];
    });
  });
}

export type AgendaBoardCasa = {
  appointments: AppointmentRow[];
  blocks: AgendaBlockRow[];
  professionals: { id: string; fullName: string; practiceId: string }[];
  rooms: SqlRow[];
  occupancy: SqlRow[];
  patientNames: [string, string][];
  procedureNames: [string, string][];
};

export async function loadAgendaBoardCasa(input: {
  organizationId: string;
  filter: AppointmentListFilter;
}): Promise<AgendaBoardCasa> {
  const appointments = await listAppointmentsCasa(input.filter);
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const professionals = await client.query<{ id: string; full_name: string; practice_id: string }>(
      `select id, full_name, practice_id
       from public.professional_labels
       where practice_id = $1
       order by full_name`,
      [input.filter.practiceId],
    );
    const rooms = await client.query<SqlRow>(
      `select id, name, code, status, room_kind, is_house
       from public.rooms
       where organization_id = $1 and status = 'active'
       order by name`,
      [input.organizationId],
    );
    const occupancy = await client.query<SqlRow>(
      `select room_id, organization_id, professional_id, professional_name, occupancy
       from public.room_occupancy_labels
       where organization_id = $1`,
      [input.organizationId],
    );
    const blocks = await client.query<SqlRow>(
      `select id, organization_id, practice_id, professional_id, room_id, starts_at, ends_at,
              block_type, reason_code, title, description, status, recorded_after_start,
              created_by, created_at, updated_at, cancelled_at, cancellation_reason
       from public.agenda_blocks
       where practice_id = $1
         and status in ('scheduled', 'active')
         and starts_at < $3
         and ends_at > $2
       order by starts_at`,
      [input.filter.practiceId, input.filter.from, input.filter.to],
    );
    const patientIds = [...new Set(appointments.map((row) => row.patientId))];
    const procedureIds = [...new Set(appointments.flatMap((row) => (row.procedureId ? [row.procedureId] : [])))];
    const patientNames = patientIds.length
      ? await client.query<{ id: string; full_name: string }>(
          "select id, full_name from public.patients where id = any($1::uuid[])",
          [patientIds],
        )
      : { rows: [] };
    const procedureNames = procedureIds.length
      ? await client.query<{ id: string; name: string }>(
          "select id, name from public.procedures where id = any($1::uuid[])",
          [procedureIds],
        )
      : { rows: [] };
    return {
      appointments,
      blocks: blocks.rows.flatMap((row) => {
        const mapped = toAgendaBlockRow(plain(row));
        return mapped ? [mapped] : [];
      }),
      professionals: professionals.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        practiceId: row.practice_id,
      })),
      rooms: rooms.rows.map(plain),
      occupancy: occupancy.rows.map(plain),
      patientNames: patientNames.rows
        .filter((row) => row.full_name?.trim())
        .map((row) => [row.id, row.full_name.trim()] as [string, string]),
      procedureNames: procedureNames.rows
        .filter((row) => row.name?.trim())
        .map((row) => [row.id, row.name.trim()] as [string, string]),
    };
  });
}

export async function listVisiblePregnanciesCasa(): Promise<PregnancyRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select p.id, p.organization_id, p.practice_id, p.patient_id, p.primary_professional_id,
              p.backup_professional_id, p.lmp_date, p.calculated_edd, p.clinical_edd,
              p.pregnancy_number, p.risk, p.care_started_on, p.notes, p.status, p.status_reason,
              p.status_changed_at, p.status_changed_by, p.created_by, p.created_at, p.updated_at,
              pu.name as practice_name, pt.full_name as patient_name
       from public.pregnancies p
       left join public.practice_units pu on pu.id = p.practice_id
       left join public.patients pt on pt.id = p.patient_id
       order by p.updated_at desc
       limit 80`,
    );
    return result.rows.flatMap((raw) => {
      const row = plain(raw);
      const id = asText(row.id);
      const organizationId = asText(row.organization_id);
      const practiceId = asText(row.practice_id);
      const patientId = asText(row.patient_id);
      const primaryProfessionalId = asText(row.primary_professional_id);
      const status = asText(row.status);
      const createdAt = asText(row.created_at);
      const updatedAt = asText(row.updated_at);
      if (!id || !organizationId || !practiceId || !patientId || !primaryProfessionalId || !status || !createdAt || !updatedAt) {
        return [];
      }
      const mapped: PregnancyRow = {
        id,
        organizationId,
        practiceId,
        patientId,
        primaryProfessionalId,
        backupProfessionalId: asText(row.backup_professional_id),
        lmpDate: asText(row.lmp_date)?.slice(0, 10) ?? null,
        calculatedEdd: asText(row.calculated_edd)?.slice(0, 10) ?? null,
        clinicalEdd: asText(row.clinical_edd)?.slice(0, 10) ?? null,
        pregnancyNumber: typeof row.pregnancy_number === "number" ? row.pregnancy_number : null,
        risk: (asText(row.risk) as PregnancyRow["risk"]) ?? null,
        careStartedOn: asText(row.care_started_on)?.slice(0, 10) ?? null,
        notes: asText(row.notes),
        status: status as PregnancyRow["status"],
        statusReason: asText(row.status_reason),
        statusChangedAt: asText(row.status_changed_at),
        statusChangedBy: asText(row.status_changed_by),
        createdBy: asText(row.created_by),
        createdAt,
        updatedAt,
        practiceName: asText(row.practice_name),
        primaryName: null,
        backupName: null,
        patientName: asText(row.patient_name),
      };
      return [mapped];
    });
  });
}

export async function reportsSummaryCasa(
  organizationId: string,
  fromIso: string,
  toIso: string,
): Promise<unknown> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ reports_operational_summary: unknown }>(
      "select public.reports_operational_summary($1, $2, $3)",
      [organizationId, fromIso, toIso],
    );
    return result.rows[0]?.reports_operational_summary ?? null;
  });
}

export async function reportsAppointmentsCasa(input: {
  organizationId: string;
  fromIso: string;
  toIso: string;
  status: string | null;
  kind: string | null;
  limit: number;
  offset: number;
}): Promise<unknown> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ reports_appointments_detail: unknown }>(
      "select public.reports_appointments_detail($1, $2, $3, $4, $5, $6, $7)",
      [
        input.organizationId,
        input.fromIso,
        input.toIso,
        input.status,
        input.kind,
        input.limit,
        input.offset,
      ],
    );
    return result.rows[0]?.reports_appointments_detail ?? null;
  });
}

async function casaRpc(name: string, args: unknown[]): Promise<string | null> {
  const userId = await actorId();
  try {
    await withCasaUser(userId, async (client) => {
      const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
      await client.query(`select public.${name}(${placeholders})`, args);
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  }
}

export async function updatePayoutNotesCasa(payoutId: string, notes: string) {
  return casaRpc("update_pregnancy_procedure_payout_notes", [payoutId, notes]);
}

export async function updatePayoutAmountCasa(payoutId: string, amountCents: number) {
  return casaRpc("update_pregnancy_procedure_payout_amount", [payoutId, amountCents]);
}

export async function settlePayoutCasa(payoutId: string, effectiveOn: string) {
  return casaRpc("settle_pregnancy_procedure_payout", [payoutId, effectiveOn]);
}

export async function cancelPayoutCasa(payoutId: string, reason: string) {
  return casaRpc("cancel_pregnancy_procedure_payout", [payoutId, reason]);
}

export async function listPregnancyProceduresCasa(pregnancyId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select * from public.pregnancy_procedures
       where pregnancy_id = $1
       order by performed_at desc, created_at desc`,
      [pregnancyId],
    );
    return result.rows.map(plain);
  });
}

export async function listPregnancyProcedurePayoutsCasa(pregnancyId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select * from public.pregnancy_procedure_payouts
       where pregnancy_id = $1
       order by created_at desc`,
      [pregnancyId],
    );
    return result.rows.map(plain);
  });
}

export async function listPayoutEventsCasa(payoutId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select * from public.pregnancy_procedure_payout_events
       where payout_id = $1
       order by occurred_at desc`,
      [payoutId],
    );
    return result.rows.map(plain);
  });
}

export async function listPayoutLedgerCasa(payoutId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select * from public.professional_payout_ledger_entries
       where payout_id = $1
       order by entry_at`,
      [payoutId],
    );
    return result.rows.map(plain);
  });
}

export async function createPregnancyProcedureCasa(input: {
  pregnancyId: string;
  procedureCode: string;
  performedByProfessionalId: string;
  performedAt: string;
  notes: string | null;
}): Promise<string | null> {
  const userId = await actorId();
  const result = await withCasaUser(userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_pregnancy_procedure($1, $2, $3, $4, $5) as id`,
      [
        input.pregnancyId,
        input.procedureCode,
        input.performedByProfessionalId,
        input.performedAt,
        input.notes,
      ],
    ),
  );
  return result.rows[0]?.id ?? null;
}

export async function createPregnancyProcedurePayoutCasa(input: {
  pregnancyProcedureId: string;
  amountCents: number;
  notes: string | null;
  effectiveOn: string | null;
}): Promise<string | null> {
  const userId = await actorId();
  const result = await withCasaUser(userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_pregnancy_procedure_payout($1, $2, $3, $4) as id`,
      [input.pregnancyProcedureId, input.amountCents, input.notes, input.effectiveOn],
    ),
  );
  return result.rows[0]?.id ?? null;
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function patientDetail(row: SqlRow): PatientDetailRow | null {
  const base = listRow(row);
  if (!base) return null;
  const channel = asText(row.preferred_channel);
  const preferredChannel =
    channel === "whatsapp" || channel === "phone" || channel === "email" || channel === "other"
      ? channel
      : "whatsapp";
  const modality = asText(row.billing_modality);
  const payment = asText(row.private_payment_method);
  return {
    ...base,
    preferredChannel,
    addressStreet: asText(row.address_street),
    addressNumber: asText(row.address_number),
    addressComplement: asText(row.address_complement),
    addressDistrict: asText(row.address_district),
    addressCity: asText(row.address_city),
    addressState: asText(row.address_state),
    addressCep: asText(row.address_cep),
    receptionNotes: asText(row.reception_notes),
    billingModality: modality === "private" || modality === "insurance" ? modality : null,
    insuranceName: asText(row.insurance_name),
    insuranceCardNumber: asText(row.insurance_card_number),
    insuranceValidUntil: asText(row.insurance_valid_until)?.slice(0, 10) ?? null,
    privatePaymentMethod: payment === "pix" || payment === "card" || payment === "cash" ? payment : null,
  };
}

const PATIENT_DETAIL_SQL = `
  select id, organization_id, full_name, social_name, cpf, birth_date, phone, email,
         created_by, created_at, photo_path, care_specialties, preferred_channel,
         address_street, address_number, address_complement, address_district,
         address_city, address_state, address_cep, reception_notes, billing_modality,
         private_payment_method, insurance_name, insurance_card_number, insurance_valid_until
  from public.patients
`;

export async function getPatientCasa(patientId: string): Promise<PatientDetailRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${PATIENT_DETAIL_SQL} where id = $1`, [patientId]);
    const row = result.rows[0];
    return row ? patientDetail(plain(row)) : null;
  });
}

export async function updatePatientCasa(
  patientId: string,
  input: PatientCreateInput,
): Promise<PatientDetailRow> {
  const message = validatePatientCreateInput(input);
  if (message) throw new Error(message);
  const userId = await actorId();
  const payload = toPersistPayload(input);
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `update public.patients set
         full_name = $2, social_name = $3, cpf = $4, birth_date = $5, phone = $6, email = $7,
         preferred_channel = $8, address_street = $9, address_number = $10,
         address_complement = $11, address_district = $12, address_city = $13,
         address_state = $14, address_cep = $15, reception_notes = $16,
         care_specialties = $17, billing_modality = $18, private_payment_method = $19,
         insurance_name = $20, insurance_card_number = $21, insurance_valid_until = $22
       where id = $1
       returning id, organization_id, full_name, social_name, cpf, birth_date, phone, email,
                 created_by, created_at, photo_path, care_specialties, preferred_channel,
                 address_street, address_number, address_complement, address_district,
                 address_city, address_state, address_cep, reception_notes, billing_modality,
                 private_payment_method, insurance_name, insurance_card_number, insurance_valid_until`,
      [
        patientId,
        payload.full_name,
        payload.social_name,
        payload.cpf,
        payload.birth_date,
        payload.phone,
        payload.email,
        payload.preferred_channel,
        payload.address_street,
        payload.address_number,
        payload.address_complement,
        payload.address_district,
        payload.address_city,
        payload.address_state,
        payload.address_cep,
        payload.reception_notes,
        payload.care_specialties,
        payload.billing_modality,
        payload.private_payment_method,
        payload.insurance_name,
        payload.insurance_card_number,
        payload.insurance_valid_until,
      ],
    );
    const row = result.rows[0];
    const mapped = row ? patientDetail(plain(row)) : null;
    if (!mapped) throw new Error("Não foi possível alterar o cadastro da paciente. Tente novamente.");
    return mapped;
  });
}

export type PatientChartCasa = {
  patient: PatientDetailRow | null;
  summary: PatientClinicalSummaryData | null;
  encounters: EncounterRow[];
  prescriptions: { id: string; status: string; when: string }[];
  exams: { id: string; title: string; when: string }[];
  examRequests: { id: string; status: string; when: string; indication: string | null; itemCount: number }[];
  orientations: { id: string; title: string; when: string }[];
};

export async function loadPatientChartCasa(input: {
  patientId: string;
  practiceId: string;
}): Promise<PatientChartCasa> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const patientResult = await client.query<SqlRow>(`${PATIENT_DETAIL_SQL} where id = $1`, [input.patientId]);
    const patient = patientResult.rows[0] ? patientDetail(plain(patientResult.rows[0])) : null;
    const empty: PatientChartCasa = {
      patient: null,
      summary: null,
      encounters: [],
      prescriptions: [],
      exams: [],
      examRequests: [],
      orientations: [],
    };
    if (!patient) return empty;
    const [clinical, encounters, prescriptions, exams, requests, orientations] = await Promise.all([
      client.query<SqlRow>(
        `select allergies, continuous_medications, comorbidities, pregnancies, births, abortions,
                lmp_date, edd, gyn_procedures
         from public.patient_clinical_data
         where patient_id = $1 and practice_id = $2`,
        [input.patientId, input.practiceId],
      ),
      client.query<SqlRow>(
        `select id, organization_id, practice_id, appointment_id, patient_id, professional_id,
                procedure_id, status, signed_at, signed_by, created_at
         from public.encounters
         where practice_id = $1 and patient_id = $2
         order by created_at desc`,
        [input.practiceId, input.patientId],
      ),
      client.query<SqlRow>(
        `select id, status, signed_at, published_to_patient_at, created_at
         from public.prescriptions
         where patient_id = $1
         order by created_at desc
         limit 40`,
        [input.patientId],
      ),
      client.query<SqlRow>(
        `select id, title, document_date, received_at, updated_at, requested_at
         from public.exam_orders
         where patient_id = $1
         order by requested_at desc
         limit 40`,
        [input.patientId],
      ),
      client.query<SqlRow>(
        `select id, status, clinical_indication, created_at
         from public.clinical_exam_requests
         where patient_id = $1
         order by created_at desc
         limit 40`,
        [input.patientId],
      ),
      client.query<SqlRow>(
        `select id, title, updated_at, created_at
         from public.clinical_orientations
         where patient_id = $1
         order by updated_at desc
         limit 40`,
        [input.patientId],
      ),
    ]);
    const encounterRows = encounters.rows.flatMap((row) => {
      const mapped = toEncounterRow(plain(row));
      return mapped ? [mapped] : [];
    });
    const clinicalRow = clinical.rows[0] ? plain(clinical.rows[0]) : null;
    const pregnancies = asCount(clinicalRow?.pregnancies);
    const births = asCount(clinicalRow?.births);
    const abortions = asCount(clinicalRow?.abortions);
    const prior = encounterRows[0] ?? null;
    const examRows = exams.rows
      .map((raw) => {
        const row = plain(raw);
        return {
          id: asText(row.id) ?? "",
          title: asText(row.title) ?? "Exame",
          when:
            asText(row.document_date) ??
            asText(row.received_at) ??
            asText(row.updated_at) ??
            asText(row.requested_at) ??
            "",
        };
      })
      .filter((item) => item.id);
    const rxRows = prescriptions.rows
      .map((raw) => {
        const row = plain(raw);
        return {
          id: asText(row.id) ?? "",
          status: asText(row.status) ?? "",
          when: asText(row.published_to_patient_at) ?? asText(row.signed_at) ?? asText(row.created_at) ?? "",
        };
      })
      .filter((item) => item.id);
    const requestIds = requests.rows.flatMap((raw) => {
      const id = asText(plain(raw).id);
      return id ? [id] : [];
    });
    const itemCounts = new Map<string, number>();
    if (requestIds.length) {
      const items = await client.query<{ request_id: string; n: string }>(
        `select request_id, count(*)::text as n
         from public.clinical_exam_request_items
         where request_id = any($1::uuid[])
         group by request_id`,
        [requestIds],
      );
      for (const item of items.rows) itemCounts.set(item.request_id, Number(item.n) || 0);
    }
    const requestRows = requests.rows
      .map((raw) => {
        const row = plain(raw);
        const id = asText(row.id) ?? "";
        return {
          id,
          status: asText(row.status) ?? "",
          when: asText(row.created_at) ?? "",
          indication: asText(row.clinical_indication),
          itemCount: itemCounts.get(id) ?? 0,
        };
      })
      .filter((item) => item.id);
    const orientationRows = orientations.rows
      .map((raw) => {
        const row = plain(raw);
        return {
          id: asText(row.id) ?? "",
          title: asText(row.title) ?? "Orientação",
          when: asText(row.updated_at) ?? asText(row.created_at) ?? "",
        };
      })
      .filter((item) => item.id);
    const summary: PatientClinicalSummaryData = {
      fullName: patient.fullName,
      birthDate: patient.birthDate,
      ageYears: patient.birthDate ? ageFromBirthDate(patient.birthDate) : null,
      phone: patient.phone,
      allergies: asText(clinicalRow?.allergies),
      continuousMedications: asText(clinicalRow?.continuous_medications),
      comorbidities: asText(clinicalRow?.comorbidities),
      gpa:
        pregnancies != null && births != null && abortions != null
          ? { pregnancies, births, abortions }
          : null,
      lmpDate: asText(clinicalRow?.lmp_date)?.slice(0, 10) ?? null,
      edd: asText(clinicalRow?.edd)?.slice(0, 10) ?? null,
      gynProcedures: Array.isArray(clinicalRow?.gyn_procedures)
        ? clinicalRow.gyn_procedures.filter((item): item is string => typeof item === "string")
        : [],
      lastEncounter: prior
        ? { id: prior.id, createdAt: prior.createdAt, statusLabel: ENCOUNTER_STATUS_LABEL[prior.status] }
        : null,
      recentExams: examRows.slice(0, 3),
      recentPrescriptions: rxRows.slice(0, 3),
      recentOrientations: orientationRows.slice(0, 3),
    };
    return {
      patient,
      summary,
      encounters: encounterRows,
      prescriptions: rxRows,
      exams: examRows,
      examRequests: requestRows,
      orientations: orientationRows,
    };
  });
}

export async function loadExamBoardCasa(input: {
  patientId: string;
  practiceId: string;
}): Promise<{ encounters: EncounterRow[]; requests: ExamRequestRow[] }> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const [encounters, requests] = await Promise.all([
      client.query<SqlRow>(
        `select id, organization_id, practice_id, appointment_id, patient_id, professional_id,
                procedure_id, status, signed_at, signed_by, created_at
         from public.encounters
         where practice_id = $1 and patient_id = $2
         order by created_at desc`,
        [input.practiceId, input.patientId],
      ),
      client.query<SqlRow>(
        `select id, encounter_id, patient_id, status, notes, clinical_indication, confirmed_at, created_at
         from public.clinical_exam_requests
         where patient_id = $1
         order by created_at desc`,
        [input.patientId],
      ),
    ]);
    const requestIds = requests.rows.flatMap((raw) => {
      const id = asText(plain(raw).id);
      return id ? [id] : [];
    });
    const items = requestIds.length
      ? await client.query<SqlRow>(
          `select id, request_id, catalog_id, group_id, custom_name
           from public.clinical_exam_request_items
           where request_id = any($1::uuid[])
           order by sort_order`,
          [requestIds],
        )
      : { rows: [] as SqlRow[] };
    const byRequest = new Map<string, ExamRequestRow["items"]>();
    for (const raw of items.rows) {
      const row = plain(raw);
      const requestId = asText(row.request_id);
      const id = asText(row.id);
      if (!requestId || !id) continue;
      const list = byRequest.get(requestId) ?? [];
      list.push({
        id,
        catalogId: asText(row.catalog_id),
        groupId: asText(row.group_id),
        customName: asText(row.custom_name),
        catalogName: null,
        groupName: null,
      });
      byRequest.set(requestId, list);
    }
    return {
      encounters: encounters.rows.flatMap((row) => {
        const mapped = toEncounterRow(plain(row));
        return mapped ? [mapped] : [];
      }),
      requests: requests.rows.flatMap((raw) => {
        const row = plain(raw);
        const id = asText(row.id);
        const encounterId = asText(row.encounter_id);
        const status = asText(row.status);
        const createdAt = asText(row.created_at);
        if (!id || !encounterId || !createdAt) return [];
        if (status !== "draft" && status !== "confirmed" && status !== "cancelled") return [];
        return [
          {
            id,
            encounterId,
            patientId: asText(row.patient_id),
            status,
            notes: asText(row.notes),
            clinicalIndication: asText(row.clinical_indication),
            confirmedAt: asText(row.confirmed_at),
            createdAt,
            items: byRequest.get(id) ?? [],
          } satisfies ExamRequestRow,
        ];
      }),
    };
  });
}
