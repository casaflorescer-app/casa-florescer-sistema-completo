"use server";

import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";

type SqlRow = Record<string, unknown>;

function plain(row: SqlRow): SqlRow {
  const out: SqlRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

async function actorId() {
  if (!isCasaDatabaseConfigured()) {
    throw new Error("A sessão da casa ainda não está ligada neste processo.");
  }
  const user = await getAuthUser();
  if (!user) throw new Error("Sem sessão.");
  return user.userId;
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function savePregnancyCasa(
  pregnancyId: string | null,
  input: {
    practiceId: string;
    primaryProfessionalId: string;
    backupProfessionalId: string;
    lmpDate: string;
    clinicalEdd: string;
    pregnancyNumber: string;
    risk: string;
    careStartedOn: string;
    notes: string;
    changeReason: string;
  },
  context: { patientId: string; organizationId: string },
): Promise<SqlRow> {
  const userId = await actorId();
  const numberText = input.pregnancyNumber.trim();
  const values = [
    context.organizationId,
    input.practiceId,
    context.patientId,
    input.primaryProfessionalId,
    textOrNull(input.backupProfessionalId),
    textOrNull(input.lmpDate),
    textOrNull(input.clinicalEdd),
    numberText ? Number(numberText) : null,
    input.risk || null,
    textOrNull(input.careStartedOn),
    textOrNull(input.notes),
    textOrNull(input.changeReason),
  ];
  return withCasaUser(userId, async (client) => {
    const result = pregnancyId
      ? await client.query<SqlRow>(
          `update public.pregnancies
              set practice_id = $2,
                  primary_professional_id = $4,
                  backup_professional_id = $5,
                  lmp_date = $6,
                  clinical_edd = $7,
                  pregnancy_number = $8,
                  risk = $9,
                  care_started_on = $10,
                  notes = $11,
                  last_change_reason = $12,
                  updated_at = now()
            where id = $13
              and organization_id = $1
              and patient_id = $3
            returning id, organization_id, practice_id, patient_id, primary_professional_id,
                      backup_professional_id, lmp_date, calculated_edd, clinical_edd,
                      pregnancy_number, risk, care_started_on, notes, status, status_reason,
                      status_changed_at, status_changed_by, created_by, created_at, updated_at`,
          [...values, pregnancyId],
        )
      : await client.query<SqlRow>(
          `insert into public.pregnancies (
             organization_id, practice_id, patient_id, primary_professional_id,
             backup_professional_id, lmp_date, clinical_edd, pregnancy_number, risk,
             care_started_on, notes, last_change_reason, created_by
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           returning id, organization_id, practice_id, patient_id, primary_professional_id,
                     backup_professional_id, lmp_date, calculated_edd, clinical_edd,
                     pregnancy_number, risk, care_started_on, notes, status, status_reason,
                     status_changed_at, status_changed_by, created_by, created_at, updated_at`,
          [...values, userId],
        );
    const row = result.rows[0];
    if (!row) throw new Error("A política de acesso do banco recusou esta operação.");
    return plain(row);
  });
}

export type FinanceSnapshot = {
  invoices: SqlRow[];
  payments: SqlRow[];
  splits: SqlRow[];
  expenses: SqlRow[];
  centers: SqlRow[];
};

export async function loadFinanceCasa(): Promise<FinanceSnapshot> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const [invoices, payments, splits, expenses, centers] = await Promise.all([
      client.query<SqlRow>(
        `select id, organization_id, practice_id, patient_id, payer_kind, issued_at, total_cents
         from public.invoices
         order by issued_at desc
         limit 80`,
      ),
      client.query<SqlRow>(
        `select id, invoice_id, method, paid_at, amount_cents
         from public.payments
         order by paid_at desc
         limit 80`,
      ),
      client.query<SqlRow>(
        `select id, payment_id, beneficiary_kind, beneficiary_practice_id, amount_cents
         from public.payment_splits
         order by id desc
         limit 80`,
      ),
      client.query<SqlRow>(
        `select a.id, a.organization_id, a.cost_center_id, a.practice_id, a.competence,
                a.description, a.amount_cents, c.is_shared, c.name as center_name
         from public.cost_allocations a
         join public.cost_centers c on c.id = a.cost_center_id
         order by a.competence desc
         limit 80`,
      ),
      client.query<SqlRow>(
        `select id, organization_id, code, name, is_shared
         from public.cost_centers
         order by name`,
      ),
    ]);
    return {
      invoices: invoices.rows.map(plain),
      payments: payments.rows.map(plain),
      splits: splits.rows.map(plain),
      expenses: expenses.rows.map(plain),
      centers: centers.rows.map(plain),
    };
  });
}

export async function createInvoiceCasa(input: {
  organizationId: string;
  practiceId: string;
  patientId: string;
  payerKind: string;
  totalCents: number;
}) {
  if (!Number.isInteger(input.totalCents) || input.totalCents < 0) {
    throw new Error("Informe o valor em centavos.");
  }
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `insert into public.invoices (organization_id, practice_id, patient_id, payer_kind, total_cents)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [input.organizationId, input.practiceId, input.patientId || null, input.payerKind, input.totalCents],
    );
    if (!result.rows[0]) throw new Error("A política de acesso do banco recusou esta operação.");
    return String(result.rows[0].id);
  });
}

export async function createPaymentCasa(input: { invoiceId: string; method: string; amountCents: number }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Informe o valor em centavos.");
  }
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `insert into public.payments (invoice_id, method, amount_cents, received_by)
       values ($1, $2, $3, $4)
       returning id`,
      [input.invoiceId, input.method.trim(), input.amountCents, userId],
    );
    if (!result.rows[0]) throw new Error("A política de acesso do banco recusou esta operação.");
    return String(result.rows[0].id);
  });
}

export async function createExpenseCasa(input: {
  organizationId: string;
  costCenterId: string;
  practiceId: string;
  competence: string;
  description: string;
  amountCents: number;
  shared: boolean;
}) {
  if (!Number.isInteger(input.amountCents)) throw new Error("Informe o valor em centavos.");
  const userId = await actorId();
  const practiceId = input.shared ? null : input.practiceId;
  if (!input.shared && !practiceId) throw new Error("A despesa particular precisa da prática.");
  return withCasaUser(userId, async (client) => {
    const center = await client.query<{ is_shared: boolean }>(
      "select is_shared from public.cost_centers where id = $1",
      [input.costCenterId],
    );
    const isShared = center.rows[0]?.is_shared === true;
    if (input.shared !== isShared) {
      throw new Error("A despesa compartilhada usa um centro compartilhado e sem prática. A particular fica na prática.");
    }
    const result = await client.query<SqlRow>(
      `insert into public.cost_allocations (
         organization_id, cost_center_id, practice_id, competence, description, amount_cents
       ) values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.organizationId,
        input.costCenterId,
        practiceId,
        input.competence,
        input.description.trim(),
        input.amountCents,
      ],
    );
    if (!result.rows[0]) throw new Error("A política de acesso do banco recusou esta operação.");
    return String(result.rows[0].id);
  });
}

export async function createAppointmentCasa(input: {
  organizationId: string;
  practiceId: string;
  roomId: string;
  patientId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  kind: string;
  procedureId: string | null;
  urgencyNote: string | null;
  source: string | null;
}): Promise<SqlRow | null> {
  if (input.endsAt <= input.startsAt) {
    throw new Error("O horário de término deve ser após o início.");
  }
  if (input.kind !== "consultation" && input.kind !== "procedure") {
    throw new Error("Tipo de agendamento inválido.");
  }
  if (input.kind === "procedure" && !input.procedureId) {
    throw new Error("Informe o procedimento para agendamentos deste tipo.");
  }
  const note = (input.urgencyNote ?? "").trim().slice(0, 2000);
  const source = (input.source ?? "reception").trim().slice(0, 40) || "reception";
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ data: SqlRow | null }>(
      `insert into public.appointments (
         organization_id, practice_id, room_id, patient_id, professional_id, procedure_id,
         kind, starts_at, ends_at, urgency_note, source, created_by, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled')
       returning to_jsonb(appointments.*) as data`,
      [
        input.organizationId,
        input.practiceId,
        input.roomId,
        input.patientId,
        input.professionalId,
        input.kind === "consultation" ? null : input.procedureId,
        input.kind,
        input.startsAt,
        input.endsAt,
        note || null,
        source,
        userId,
      ],
    );
    const data = result.rows[0]?.data;
    return data ? plain(data) : null;
  });
}

export async function updateAppointmentOpenCasa(input: {
  appointmentId: string;
  patientId: string;
  professionalId: string;
  roomId: string | null;
  kind: string;
  startsAt: string;
  endsAt: string;
  urgencyNote: string | null;
}): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ data: SqlRow | null }>(
      `update public.appointments
       set patient_id = $2,
           professional_id = $3,
           room_id = $4,
           procedure_id = null,
           kind = $5,
           starts_at = $6,
           ends_at = $7,
           urgency_note = $8
       where id = $1
         and status in ('scheduled', 'confirmed')
         and not exists (
           select 1 from public.encounters e where e.appointment_id = appointments.id
         )
       returning to_jsonb(appointments.*) as data`,
      [
        input.appointmentId,
        input.patientId,
        input.professionalId,
        input.roomId,
        input.kind,
        input.startsAt,
        input.endsAt,
        input.urgencyNote,
      ],
    );
    const data = result.rows[0]?.data;
    return data ? plain(data) : null;
  });
}

export async function createPrescriptionDraftCasa(input: {
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  encounterId: string | null;
  notes: string | null;
}): Promise<SqlRow> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `insert into public.prescriptions (
         organization_id, practice_id, patient_id, professional_id, encounter_id,
         status, notes, created_by
       ) values ($1,$2,$3,$4,$5,'draft',$6,$7)
       returning id, organization_id, practice_id, patient_id, professional_id, encounter_id,
                 orientation_id, exam_order_id, status, notes, signed_at, published_to_patient_at,
                 viewed_by_patient_at, created_at`,
      [
        input.organizationId,
        input.practiceId,
        input.patientId,
        input.professionalId,
        input.encounterId,
        input.notes,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("A política de acesso do banco recusou esta operação.");
    return plain(row);
  });
}

export async function closePregnancyCasa(
  pregnancyId: string,
  status: string,
  reason: string,
): Promise<void> {
  const userId = await actorId();
  const updated = await withCasaUser(userId, (client) =>
    client.query(
      `update public.pregnancies
          set status = $2, status_reason = $3
        where id = $1`,
      [pregnancyId, status, reason],
    ),
  );
  if ((updated.rowCount ?? 0) === 0) throw new Error("A política de acesso do banco recusou esta operação.");
}

export async function setProfilePermissionsCasa(profileId: string, permissions: string[]): Promise<void> {
  const userId = await actorId();
  const updated = await withCasaUser(userId, (client) =>
    client.query("update public.profiles set permissions = $2::jsonb where id = $1", [
      profileId,
      JSON.stringify(permissions),
    ]),
  );
  if ((updated.rowCount ?? 0) === 0) throw new Error("A política de acesso do banco recusou esta operação.");
}

export async function setProfileActiveCasa(profileId: string, isActive: boolean): Promise<void> {
  const userId = await actorId();
  const updated = await withCasaUser(userId, (client) =>
    client.query("update public.profiles set is_active = $2 where id = $1", [profileId, isActive]),
  );
  if ((updated.rowCount ?? 0) === 0) throw new Error("A política de acesso do banco recusou esta operação.");
}

export async function upsertPatientClinicalCasa(input: {
  patientId: string;
  organizationId: string;
  practiceId: string;
  allergies: string | null;
  continuousMedications: string | null;
  comorbidities: string | null;
  updatedBy: string;
}): Promise<void> {
  const userId = await actorId();
  await withCasaUser(userId, async (client) => {
    const updated = await client.query(
      `update public.patient_clinical_data
          set allergies = $3,
              continuous_medications = $4,
              comorbidities = $5,
              updated_by = $6,
              updated_at = now()
        where patient_id = $1 and practice_id = $2`,
      [
        input.patientId,
        input.practiceId,
        input.allergies,
        input.continuousMedications,
        input.comorbidities,
        userId,
      ],
    );
    if ((updated.rowCount ?? 0) > 0) return;
    await client.query(
      `insert into public.patient_clinical_data (
         patient_id, organization_id, practice_id, allergies, continuous_medications, comorbidities, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.patientId,
        input.organizationId,
        input.practiceId,
        input.allergies,
        input.continuousMedications,
        input.comorbidities,
        userId,
      ],
    );
  });
}

export async function upsertRoomCasa(input: {
  organizationId: string;
  id?: string;
  code: string;
  name: string;
  roomKind: string;
  isHouse: boolean;
  status: string;
  sortOrder: number;
  occupantProfessionalId: string | null;
}): Promise<string> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    if (input.id) {
      const updated = await client.query(
        `update public.rooms
            set code = $3, name = $4, room_kind = $5, is_house = $6, status = $7,
                sort_order = $8, occupant_professional_id = $9
          where id = $1 and organization_id = $2`,
        [
          input.id,
          input.organizationId,
          input.code,
          input.name,
          input.roomKind,
          input.isHouse,
          input.status,
          input.sortOrder,
          input.occupantProfessionalId,
        ],
      );
      if ((updated.rowCount ?? 0) === 0) throw new Error("A política de acesso do banco recusou esta operação.");
      return input.id;
    }
    const inserted = await client.query<{ id: string }>(
      `insert into public.rooms (
         organization_id, code, name, room_kind, is_house, status, sort_order, occupant_professional_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id`,
      [
        input.organizationId,
        input.code,
        input.name,
        input.roomKind,
        input.isHouse,
        input.status,
        input.sortOrder,
        input.occupantProfessionalId,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("A política de acesso do banco recusou esta operação.");
    return id;
  });
}

export async function createMembershipCasa(input: {
  userId: string;
  practiceId: string;
  role: string;
}): Promise<SqlRow> {
  const actor = await actorId();
  return withCasaUser(actor, async (client) => {
    const [profile, practice] = await Promise.all([
      client.query<{ organization_id: string }>(
        `select organization_id from public.profiles where id = $1`,
        [input.userId],
      ),
      client.query<{ organization_id: string }>(
        `select organization_id from public.practice_units where id = $1`,
        [input.practiceId],
      ),
    ]);
    const profileOrg = profile.rows[0]?.organization_id;
    const practiceOrg = practice.rows[0]?.organization_id;
    if (!profileOrg || !practiceOrg || profileOrg !== practiceOrg) {
      throw new Error("A prática selecionada não pertence à organização deste usuário.");
    }
    const inserted = await client.query<SqlRow>(
      `insert into public.user_practice_roles (user_id, practice_id, role)
       values ($1, $2, $3)
       returning id, user_id, role, clinical_access, can_view_care_policies, practice_id`,
      [input.userId, input.practiceId, input.role],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("A política de acesso do banco recusou esta operação.");
    const named = await client.query<SqlRow>(
      `select r.id, r.user_id, r.role, r.clinical_access, r.can_view_care_policies, r.practice_id,
              jsonb_build_object('name', p.name, 'code', p.code, 'kind', p.kind, 'organization_id', p.organization_id) as practice_units
       from public.user_practice_roles r
       left join public.practice_units p on p.id = r.practice_id
       where r.id = $1`,
      [row.id],
    );
    const full = named.rows[0];
    if (!full) throw new Error("Não foi possível alterar o acesso. Tente novamente.");
    return plain(full);
  });
}

export async function deleteMembershipCasa(membershipId: string) {
  const actor = await actorId();
  await withCasaUser(actor, async (client) => {
    await client.query(`delete from public.user_practice_roles where id = $1`, [membershipId]);
  });
}

export async function createOrganizationCasa(input: {
  legalName: string;
  tradeName: string;
  cnpj: string;
}): Promise<SqlRow> {
  const actor = await actorId();
  return withCasaUser(actor, async (client) => {
    const inserted = await client.query<SqlRow>(
      `insert into public.organizations (legal_name, trade_name, cnpj)
       values ($1, $2, $3)
       returning id, legal_name, trade_name, cnpj, created_at`,
      [input.legalName, input.tradeName, input.cnpj],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("A política de acesso do banco recusou esta operação.");
    return plain(row);
  });
}

export async function updateOrganizationCasa(
  id: string,
  input: { legalName: string; tradeName: string; cnpj: string },
): Promise<SqlRow> {
  const actor = await actorId();
  return withCasaUser(actor, async (client) => {
    const updated = await client.query<SqlRow>(
      `update public.organizations
       set legal_name = $2, trade_name = $3, cnpj = $4
       where id = $1
       returning id, legal_name, trade_name, cnpj, created_at`,
      [id, input.legalName, input.tradeName, input.cnpj],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("A política de acesso do banco recusou esta operação.");
    return plain(row);
  });
}
