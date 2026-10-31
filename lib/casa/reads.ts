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
         procedure_id, status, signed_at, signed_by, created_at
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
