import { withCasaUser } from "@/lib/db/casa";

export type CasaPracticeRow = {
  id: string;
  organization_id: string;
  kind: string;
  code: string;
  name: string;
  specialty: string;
  isolation_label: string;
  is_active: boolean;
  created_at: string | null;
};

const SELECT_COLS =
  "id, organization_id, kind, code, name, specialty, isolation_label, is_active, created_at";

export async function listHousePracticesCasa(userId: string, organizationId: string) {
  return withCasaUser(userId, async (client) => {
    const result = await client.query<CasaPracticeRow>(
      `select ${SELECT_COLS}
       from public.practice_units
       where organization_id = $1
         and kind = 'house'
       order by name`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      ...row,
      created_at: row.created_at ? String(row.created_at) : null,
    }));
  });
}

export async function countHousePracticesCasa(userId: string, organizationId: string) {
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.practice_units
       where organization_id = $1
         and kind = 'house'`,
      [organizationId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

export async function insertHousePracticeCasa(
  userId: string,
  input: {
    organizationId: string;
    code: string;
    name: string;
    specialty: string;
    isolationLabel: string;
    isActive: boolean;
  },
) {
  return withCasaUser(userId, async (client) => {
    try {
      const result = await client.query<CasaPracticeRow>(
        `insert into public.practice_units (
           organization_id, kind, code, name, specialty, isolation_label, is_active
         ) values ($1, 'house', $2, $3, $4, $5, $6)
         returning ${SELECT_COLS}`,
        [
          input.organizationId,
          input.code,
          input.name,
          input.specialty,
          input.isolationLabel,
          input.isActive,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("insert_failed");
      return {
        ...row,
        created_at: row.created_at ? String(row.created_at) : null,
      };
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === "23505" || /unique|duplicate/i.test(err.message ?? "")) {
        const duplicate = new Error("duplicate_code");
        (duplicate as Error & { code: string }).code = "duplicate_code";
        throw duplicate;
      }
      throw error;
    }
  });
}

export async function linkOwnerOnPracticeCasa(
  userId: string,
  practiceId: string,
) {
  return withCasaUser(userId, async (client) => {
    await client.query(
      `insert into public.user_practice_roles (user_id, practice_id, role)
       values ($1, $2, 'owner')`,
      [userId, practiceId],
    );
  });
}

export async function deletePracticeCasa(userId: string, practiceId: string) {
  return withCasaUser(userId, async (client) => {
    await client.query(`delete from public.practice_units where id = $1`, [practiceId]);
  });
}

export async function getHousePracticeCasa(
  userId: string,
  practiceId: string,
) {
  return withCasaUser(userId, async (client) => {
    const result = await client.query<{
      id: string;
      organization_id: string;
      kind: string;
    }>(
      `select id, organization_id, kind from public.practice_units where id = $1`,
      [practiceId],
    );
    return result.rows[0] ?? null;
  });
}

export async function updateHousePracticeCasa(
  userId: string,
  practiceId: string,
  patch: {
    name?: string;
    specialty?: string;
    isolationLabel?: string;
    isActive?: boolean;
  },
) {
  return withCasaUser(userId, async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if (patch.specialty !== undefined) {
      sets.push(`specialty = $${i++}`);
      values.push(patch.specialty);
    }
    if (patch.isolationLabel !== undefined) {
      sets.push(`isolation_label = $${i++}`);
      values.push(patch.isolationLabel);
    }
    if (patch.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(patch.isActive);
    }
    if (sets.length === 0) return null;
    values.push(practiceId);
    const result = await client.query<CasaPracticeRow>(
      `update public.practice_units
          set ${sets.join(", ")}
        where id = $${i}
        returning ${SELECT_COLS}`,
      values,
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      created_at: row.created_at ? String(row.created_at) : null,
    };
  });
}
