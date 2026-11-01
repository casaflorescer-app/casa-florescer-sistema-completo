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

const APPOINTMENT_SQL = `
  select id, organization_id, practice_id, room_id, patient_id, professional_id, procedure_id,
         kind, starts_at, ends_at, scheduled_starts_at, scheduled_ends_at, status, urgency_note,
         source, checkin_at, checked_in_by, arrival_at, arrival_recorded_by, actual_start_at,
         actual_start_recorded_by, actual_end_at, actual_end_recorded_by, created_by
  from public.appointments
`;

const ENCOUNTER_SQL = `
  select id, organization_id, practice_id, appointment_id, patient_id, professional_id,
         procedure_id, status, signed_at, signed_by, created_at, return_of_encounter_id
  from public.encounters
`;

export async function readAppointmentCasa(appointmentId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${APPOINTMENT_SQL} where id = $1`, [appointmentId]);
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function readEncounterCasa(encounterId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${ENCOUNTER_SQL} where id = $1`, [encounterId]);
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function readEncounterByAppointmentCasa(appointmentId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${ENCOUNTER_SQL} where appointment_id = $1`, [appointmentId]);
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function readClinicalNotesCasa(encounterId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, encounter_id, organization_id, practice_id, body_ciphertext, template_code,
              version, created_by, created_at
       from public.clinical_notes
       where encounter_id = $1
       order by version desc, created_at desc`,
      [encounterId],
    );
    return result.rows.map(plain);
  });
}

export async function listClinicUsersCasa() {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const [profiles, roles, orgs, admins] = await Promise.all([
      client.query<SqlRow>(
        `select id, organization_id, full_name, email, is_active, created_at
         from public.profiles
         order by full_name`,
      ),
      client.query<SqlRow>(
        `select r.id, r.user_id, r.role, r.clinical_access, r.can_view_care_policies, r.practice_id,
                p.name as practice_name, p.kind as practice_kind
         from public.user_practice_roles r
         left join public.practice_units p on p.id = r.practice_id`,
      ),
      client.query<SqlRow>("select id, legal_name, trade_name from public.organizations"),
      client.query<SqlRow>("select user_id, revoked_at from public.system_admins"),
    ]);
    return {
      profiles: profiles.rows.map(plain),
      roles: roles.rows.map(plain),
      organizations: orgs.rows.map(plain),
      admins: admins.rows.map(plain),
    };
  });
}

export async function listEncountersForPatientCasa(practiceId: string, patientId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `${ENCOUNTER_SQL} where practice_id = $1 and patient_id = $2 order by created_at desc`,
      [practiceId, patientId],
    );
    return result.rows.map(plain);
  });
}

export async function listReturnsOfEncounterCasa(sourceEncounterId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `${ENCOUNTER_SQL} where return_of_encounter_id = $1 order by created_at asc`,
      [sourceEncounterId],
    );
    return result.rows.map(plain);
  });
}

export async function readClinicalNotesForEncountersCasa(
  encounterIds: string[],
  practiceId: string,
  templateCode: string,
): Promise<SqlRow[]> {
  if (encounterIds.length === 0) return [];
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, encounter_id, organization_id, practice_id, body_ciphertext, template_code,
              version, created_by, created_at
       from public.clinical_notes
       where encounter_id = any($1::uuid[])
         and practice_id = $2
         and template_code = $3`,
      [encounterIds, practiceId, templateCode],
    );
    return result.rows.map(plain);
  });
}

export async function readPatientClinicalCasa(patientId: string, practiceId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select patient_id, organization_id, practice_id, allergies, continuous_medications, comorbidities,
              pregnancies, births, abortions, lmp_date, edd, gyn_procedures, updated_at, updated_by
       from public.patient_clinical_data
       where patient_id = $1 and practice_id = $2`,
      [patientId, practiceId],
    );
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function listProfessionalLabelsCasa(practiceId?: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = practiceId
      ? await client.query<SqlRow>(
          `select id, practice_id, organization_id, council_type, council_number, full_name
           from public.professional_labels
           where practice_id = $1
           order by full_name`,
          [practiceId],
        )
      : await client.query<SqlRow>(
          `select id, practice_id, organization_id, council_type, council_number, full_name
           from public.professional_labels
           order by full_name`,
        );
    return result.rows.map(plain);
  });
}

export async function listPracticeNamesCasa(practiceIds: string[]): Promise<SqlRow[]> {
  if (practiceIds.length === 0) return [];
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      "select id, name from public.practice_units where id = any($1::uuid[])",
      [practiceIds],
    );
    return result.rows.map(plain);
  });
}

export async function listCurrentCarePoliciesCasa(): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select policy_id, version_id, professional_id, practice_id, organization_id, version_number,
              normal_birth_cents, cesarean_cents, requires_availability_for_prenatal,
              allows_prenatal_exception, effective_from, effective_to, created_by, created_at
       from public.professional_care_policy_current
       order by effective_from desc`,
    );
    return result.rows.map(plain);
  });
}

export async function listRoomsCasa(organizationId: string): Promise<{ rooms: SqlRow[]; occupancy: SqlRow[] }> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const [rooms, occupancy] = await Promise.all([
      client.query<SqlRow>(
        `select id, code, name, room_kind, is_house, status, sort_order, occupant_professional_id, organization_id
         from public.rooms
         where organization_id = $1
         order by sort_order, code`,
        [organizationId],
      ),
      client.query<SqlRow>(
        "select room_id, professional_id, professional_name, occupancy from public.room_occupancy_labels",
      ),
    ]);
    return { rooms: rooms.rows.map(plain), occupancy: occupancy.rows.map(plain) };
  });
}

export async function listClinicSpecialtiesCasa(
  organizationId: string,
  activeOnly: boolean,
  query: string,
): Promise<{ specialties: SqlRow[]; links: SqlRow[] }> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const specialties = await client.query<SqlRow>(
      `select id, organization_id, name, slug, description, is_active, created_at
       from public.clinic_specialties
       where organization_id = $1
         and ($2::boolean = false or is_active = true)
         and ($3 = '' or name ilike '%' || $3 || '%')
       order by name`,
      [organizationId, activeOnly, query],
    );
    const ids = specialties.rows.map((row) => String(row.id));
    const links = ids.length
      ? await client.query<SqlRow>(
          "select specialty_id, is_primary from public.professional_specialties where specialty_id = any($1::uuid[])",
          [ids],
        )
      : { rows: [] as SqlRow[] };
    return { specialties: specialties.rows.map(plain), links: links.rows.map(plain) };
  });
}

export async function listProfessionalSpecialtyIdsCasa(professionalId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      "select specialty_id, is_primary from public.professional_specialties where professional_id = $1",
      [professionalId],
    );
    return result.rows.map(plain);
  });
}

export async function listObstetricContractsCasa(organizationId: string, patientId?: string, status?: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select c.id, c.organization_id, c.practice_id, c.patient_id, c.professional_id, c.contract_code,
              c.status, c.contracted_on, c.starts_on, c.ends_on, c.includes_normal_birth, c.includes_cesarean,
              c.notes, c.created_at,
              jsonb_build_object('full_name', pt.full_name) as patients,
              jsonb_build_object('id', pr.id, 'profiles', jsonb_build_object('full_name', pf.full_name)) as professionals
       from public.obstetric_availability_contracts c
       left join public.patients pt on pt.id = c.patient_id
       left join public.professionals pr on pr.id = c.professional_id
       left join public.profiles pf on pf.id = pr.profile_id
       where c.organization_id = $1
         and ($2::uuid is null or c.patient_id = $2)
         and ($3::text is null or c.status = $3)
       order by c.contracted_on desc`,
      [organizationId, patientId ?? null, status ?? null],
    );
    return result.rows.map(plain);
  });
}

export async function listProcedureAgreementsCasa(organizationId: string, patientId?: string, status?: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select a.id, a.organization_id, a.patient_id, a.professional_id, a.encounter_id, a.procedure_name,
              a.agreement_kind, a.status, a.version_number, a.title, a.term_body, a.acknowledged_at,
              a.acknowledged_by_name, a.notes, a.created_at,
              jsonb_build_object('full_name', pt.full_name) as patients,
              jsonb_build_object('id', pr.id, 'profiles', jsonb_build_object('full_name', pf.full_name)) as professionals
       from public.procedure_agreements a
       left join public.patients pt on pt.id = a.patient_id
       left join public.professionals pr on pr.id = a.professional_id
       left join public.profiles pf on pf.id = pr.profile_id
       where a.organization_id = $1
         and ($2::uuid is null or a.patient_id = $2)
         and ($3::text is null or a.status = $3)
       order by a.created_at desc`,
      [organizationId, patientId ?? null, status ?? null],
    );
    return result.rows.map(plain);
  });
}

export async function readEncounterPregnancyCasa(encounterId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select p.id, p.status, p.lmp_date, p.calculated_edd, p.clinical_edd, p.risk,
              p.primary_professional_id, p.backup_professional_id, p.notes
       from public.encounters e
       join public.pregnancies p on p.id = e.pregnancy_id
       where e.id = $1`,
      [encounterId],
    );
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function listPatientPregnanciesCasa(patientId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select p.id, p.organization_id, p.practice_id, p.patient_id, p.primary_professional_id,
              p.backup_professional_id, p.lmp_date, p.calculated_edd, p.clinical_edd, p.pregnancy_number,
              p.risk, p.care_started_on, p.notes, p.status, p.status_reason, p.status_changed_at,
              p.status_changed_by, p.created_by, p.created_at, p.updated_at,
              jsonb_build_object('name', pu.name) as practice_units,
              prim.full_name as primary_full_name,
              back.full_name as backup_full_name
       from public.pregnancies p
       left join public.practice_units pu on pu.id = p.practice_id
       left join public.professional_labels prim on prim.id = p.primary_professional_id
       left join public.professional_labels back on back.id = p.backup_professional_id
       where p.patient_id = $1
       order by p.created_at desc`,
      [patientId],
    );
    return result.rows.map(plain);
  });
}

export async function listMembershipsCasa(userIdFilter: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select r.id, r.user_id, r.role, r.clinical_access, r.can_view_care_policies, r.practice_id,
              jsonb_build_object('name', p.name, 'code', p.code, 'kind', p.kind, 'organization_id', p.organization_id) as practice_units
       from public.user_practice_roles r
       left join public.practice_units p on p.id = r.practice_id
       where r.user_id = $1`,
      [userIdFilter],
    );
    return result.rows.map(plain);
  });
}

export async function listPracticeUnitsCasa(): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, organization_id, name, code, kind, is_active
       from public.practice_units
       order by name`,
    );
    return result.rows.map(plain);
  });
}

export async function listOrganizationsCasa(): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, legal_name, trade_name, cnpj, created_at
       from public.organizations
       order by trade_name`,
    );
    return result.rows.map(plain);
  });
}

export async function listSystemAdminsCasa(): Promise<{ admins: SqlRow[]; profiles: SqlRow[] }> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const [admins, profiles] = await Promise.all([
      client.query<SqlRow>(
        `select user_id, granted_by, granted_at, revoked_at, reason
         from public.system_admins
         order by granted_at desc`,
      ),
      client.query<SqlRow>("select id, full_name, email from public.profiles"),
    ]);
    return { admins: admins.rows.map(plain), profiles: profiles.rows.map(plain) };
  });
}

export async function listAuditEventsCasa(filters: {
  from?: string;
  to?: string;
  action?: string;
  actorId?: string;
  entity?: string;
}): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, occurred_at, actor_id, action, entity_table, entity_id, metadata
       from public.audit_events
       where ($1::timestamptz is null or occurred_at >= $1)
         and ($2::timestamptz is null or occurred_at <= $2)
         and ($3::text is null or action = $3)
         and ($4::uuid is null or actor_id = $4)
         and ($5::text is null or entity_table ilike '%' || $5 || '%')
       order by occurred_at desc
       limit 200`,
      [filters.from || null, filters.to || null, filters.action || null, filters.actorId || null, filters.entity?.trim() || null],
    );
    return result.rows.map(plain);
  });
}

export async function listCarePolicyVersionsCasa(policyId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, policy_id, professional_id, practice_id, organization_id, version_number,
              normal_birth_cents, cesarean_cents, requires_availability_for_prenatal,
              allows_prenatal_exception, effective_from, effective_to, created_by, created_at
       from public.professional_care_policy_versions
       where policy_id = $1
       order by version_number desc`,
      [policyId],
    );
    return result.rows.map(plain);
  });
}

const PREGNANCY_SQL = `
  select p.id, p.organization_id, p.practice_id, p.patient_id, p.primary_professional_id,
         p.backup_professional_id, p.lmp_date, p.calculated_edd, p.clinical_edd, p.pregnancy_number,
         p.risk, p.care_started_on, p.notes, p.status, p.status_reason, p.status_changed_at,
         p.status_changed_by, p.created_by, p.created_at, p.updated_at,
         jsonb_build_object('name', pu.name) as practice_units,
         jsonb_build_object('full_name', pat.full_name) as patients,
         prim.full_name as primary_full_name,
         back.full_name as backup_full_name
  from public.pregnancies p
  left join public.practice_units pu on pu.id = p.practice_id
  left join public.patients pat on pat.id = p.patient_id
  left join public.professional_labels prim on prim.id = p.primary_professional_id
  left join public.professional_labels back on back.id = p.backup_professional_id
`;

export async function getPregnancyCasa(pregnancyId: string): Promise<SqlRow | null> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(`${PREGNANCY_SQL} where p.id = $1`, [pregnancyId]);
    return result.rows[0] ? plain(result.rows[0]) : null;
  });
}

export async function listPregnancyEventsCasa(pregnancyId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, pregnancy_id, kind, actor_id, occurred_at, reason, from_value, to_value
       from public.pregnancy_events
       where pregnancy_id = $1
       order by occurred_at desc`,
      [pregnancyId],
    );
    return result.rows.map(plain);
  });
}

export async function listBackupGrantsCasa(pregnancyId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, pregnancy_id, principal_professional_id, backup_professional_id,
              granted_by, granted_at, revoked_at, revoked_by
       from public.pregnancy_backup_grants
       where pregnancy_id = $1
       order by granted_at desc`,
      [pregnancyId],
    );
    return result.rows.map(plain);
  });
}

export async function listProfileNamesCasa(ids: string[]): Promise<SqlRow[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      "select id, full_name from public.profiles where id = any($1::uuid[])",
      [unique],
    );
    return result.rows.map(plain);
  });
}

export async function listPermissionProfilesCasa(organizationId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const profiles = await client.query<SqlRow>(
      `select id, full_name, email, permissions
       from public.profiles
       where organization_id = $1
       order by full_name`,
      [organizationId],
    );
    const ids = profiles.rows.map((row) => String(row.id));
    const roles = ids.length
      ? await client.query<SqlRow>(
          `select user_id, role from public.user_practice_roles where user_id = any($1::uuid[])`,
          [ids],
        )
      : { rows: [] as SqlRow[] };
    return profiles.rows.map((row) =>
      plain({
        ...row,
        roles: roles.rows.filter((role) => role.user_id === row.id).map((role) => role.role),
      }),
    );
  });
}

export async function listClinicProfessionalsCasa(organizationId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select p.id, p.organization_id, p.practice_id, p.profile_id, p.display_name, p.category,
              p.council_type, p.council_number, p.council_uf, p.professional_phone,
              p.professional_email, p.notes, p.is_active,
              jsonb_build_object('id', pu.id, 'name', pu.name) as practice_units,
              jsonb_build_object('id', pr.id, 'full_name', pr.full_name) as profiles,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'specialty_id', ps.specialty_id,
                  'is_primary', ps.is_primary,
                  'clinic_specialties', jsonb_build_object('id', cs.id, 'name', cs.name)
                ))
                from public.professional_specialties ps
                join public.clinic_specialties cs on cs.id = ps.specialty_id
                where ps.professional_id = p.id
              ), '[]'::jsonb) as professional_specialties
       from public.professionals p
       left join public.practice_units pu on pu.id = p.practice_id
       left join public.profiles pr on pr.id = p.profile_id
       where p.organization_id = $1
       order by p.display_name`,
      [organizationId],
    );
    return result.rows.map(plain);
  });
}

export async function listHousePracticesCasa(organizationId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, name from public.practice_units
       where organization_id = $1 and kind = 'house' and is_active
       order by name`,
      [organizationId],
    );
    return result.rows.map(plain);
  });
}

export async function listOrgProfilesCasa(organizationId: string, query: string): Promise<SqlRow[]> {
  const needle = query.trim().replace(/[%_]/g, "");
  if (needle.length < 2) return [];
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, full_name, email
       from public.profiles
       where organization_id = $1
         and is_active
         and (full_name ilike $2 or coalesce(email, '') ilike $2)
       order by full_name
       limit 20`,
      [organizationId, `%${needle}%`],
    );
    return result.rows.map(plain);
  });
}

export async function listClinicWorkforceCasa(organizationId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, organization_id, full_name, document_cpf, phone, email, role_title,
              engagement_kind, status, starts_on, ends_on, notes, created_at
       from public.clinic_workforce
       where organization_id = $1
       order by full_name`,
      [organizationId],
    );
    return result.rows.map(plain);
  });
}

export async function searchProceduresCasa(
  organizationId: string,
  query: string,
  limit: number,
): Promise<SqlRow[]> {
  const needle = query.trim().replace(/[%_]/g, "");
  if (needle.length < 2) return [];
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, name, code, practice_id, is_shared, organization_id
       from public.procedures
       where organization_id = $1
         and (name ilike $2 or coalesce(code, '') ilike $2)
       order by name
       limit $3`,
      [organizationId, `%${needle}%`, limit],
    );
    return result.rows.map(plain);
  });
}

export async function listUnreadNotificationsCasa(
  table: "staff_notifications" | "patient_notifications",
  limit: number,
): Promise<SqlRow[]> {
  if (table !== "staff_notifications" && table !== "patient_notifications") return [];
  const userId = await actorId();
  const patientColumn = table === "patient_notifications" ? ", patient_id" : "";
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, organization_id, practice_id, event_type, title, message, reference_type,
              reference_id, read_at, dismissed_at, created_at${patientColumn}
       from public.${table}
       where dismissed_at is null
       order by created_at desc
       limit $1`,
      [limit],
    );
    return result.rows.map(plain);
  });
}

export async function listProcedureDurationsCasa(organizationId: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      "select id, duration_min from public.procedures where organization_id = $1",
      [organizationId],
    );
    return result.rows.map(plain);
  });
}

export async function listHistoricalDurationsCasa(practiceId: string, limit: number): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select procedure_id, professional_id, practice_id, actual_start_at, actual_end_at
       from public.appointments
       where practice_id = $1
         and actual_start_at is not null
         and actual_end_at is not null
         and procedure_id is not null
       order by actual_end_at desc
       limit $2`,
      [practiceId, limit],
    );
    return result.rows.map(plain);
  });
}

export async function listAgendaBlocksCasa(practiceId: string, from: string, to: string): Promise<SqlRow[]> {
  const userId = await actorId();
  return withCasaUser(userId, async (client) => {
    const result = await client.query<SqlRow>(
      `select id, organization_id, practice_id, professional_id, room_id, starts_at, ends_at,
              block_type, reason_code, title, description, status, recorded_after_start,
              created_by, created_at, updated_at, cancelled_at, cancellation_reason
       from public.agenda_blocks
       where practice_id = $1
         and status in ('scheduled', 'active')
         and starts_at < $3
         and ends_at > $2
       order by starts_at`,
      [practiceId, from, to],
    );
    return result.rows.map(plain);
  });
}
