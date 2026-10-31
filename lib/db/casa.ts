import { Pool, type PoolClient } from "pg";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pool: Pool | null = null;

export function isCasaDatabaseConfigured() {
  return Boolean(process.env.CASA_DATABASE_URL);
}

export function connectionIsUnsafe(rolsuper: boolean, rolbypassrls: boolean) {
  return rolsuper || rolbypassrls;
}

function getPool() {
  const connectionString = process.env.CASA_DATABASE_URL;
  if (!connectionString) {
    throw new Error("CASA_DATABASE_URL ausente.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      statement_timeout: 15_000,
      application_name: "casa-florescer",
    });
  }
  return pool;
}

async function assertNotSuperuser(client: PoolClient) {
  const result = await client.query<{ unsafe: boolean }>(
    `select (rolsuper or rolbypassrls) as unsafe
     from pg_roles
     where rolname = current_user`,
  );
  if (result.rows[0]?.unsafe) {
    throw new Error("A conexão da casa não pode ser superusuário nem ignorar o RLS.");
  }
}

async function releaseCasa(client: PoolClient) {
  try {
    await client.query("reset role");
  } catch {
    // A conexão já pode ter caído. Devolver mesmo assim.
  }
  client.release();
}

async function withCasaConnection<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await assertNotSuperuser(client);
    const value = await run(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await releaseCasa(client);
  }
}

export async function withCasaUser<T>(
  userId: string,
  run: (client: PoolClient) => Promise<T>,
) {
  if (!UUID.test(userId)) throw new Error("Usuário da sessão inválido.");
  return withCasaConnection(async (client) => {
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query("set local role authenticated");
    return run(client);
  });
}

export async function staffLoginHash(email: string) {
  return withCasaConnection(async (client) => {
    const result = await client.query<{ user_id: string; password_hash: string }>(
      "select user_id, password_hash from public.staff_login_hash($1)",
      [email],
    );
    return result.rows[0] ?? null;
  });
}

export async function startCasaSession(sessionId: string, userId: string, expiresAt: Date) {
  if (!UUID.test(sessionId) || !UUID.test(userId)) {
    throw new Error("Sessão inválida.");
  }
  await withCasaConnection(async (client) => {
    await client.query("select public.casa_session_start($1, $2, $3)", [
      sessionId,
      userId,
      expiresAt.toISOString(),
    ]);
  });
}

export async function casaSessionActive(sessionId: string) {
  if (!UUID.test(sessionId)) return null;
  return withCasaConnection(async (client) => {
    const result = await client.query<{ casa_session_active: string | null }>(
      "select public.casa_session_active($1)",
      [sessionId],
    );
    return result.rows[0]?.casa_session_active ?? null;
  });
}

export async function revokeCasaSession(sessionId: string) {
  if (!UUID.test(sessionId)) return;
  await withCasaConnection(async (client) => {
    await client.query("select public.casa_session_revoke($1)", [sessionId]);
  });
}

export async function staffPasswordHash(userId: string) {
  if (!UUID.test(userId)) return null;
  return withCasaConnection(async (client) => {
    const result = await client.query<{ casa_staff_hash: string | null }>(
      "select public.casa_staff_hash($1)",
      [userId],
    );
    return result.rows[0]?.casa_staff_hash ?? null;
  });
}

export async function replaceStaffPassword(userId: string, passwordHash: string) {
  if (!UUID.test(userId)) throw new Error("Usuário inválido.");
  await withCasaConnection(async (client) => {
    await client.query("select public.casa_password_replace($1, $2)", [userId, passwordHash]);
  });
}

export async function storePasswordReset(email: string, tokenHash: string, expiresAt: Date) {
  await withCasaConnection(async (client) => {
    await client.query("select public.casa_password_reset_store($1, $2, $3)", [
      email,
      tokenHash,
      expiresAt.toISOString(),
    ]);
  });
}

export async function finishPasswordReset(tokenHash: string, passwordHash: string) {
  await withCasaConnection(async (client) => {
    await client.query("select public.casa_password_reset_finish($1, $2)", [
      tokenHash,
      passwordHash,
    ]);
  });
}

export type StaffMembershipInput = {
  practiceId: string;
  role: "admin" | "physician" | "secretary";
  canScheduleAnyPractice?: boolean;
};

export async function createStaffAccount(
  actorId: string,
  input: {
    email: string;
    fullName: string;
    passwordHash: string;
    organizationId: string;
    memberships: StaffMembershipInput[];
  },
) {
  if (!UUID.test(actorId) || !UUID.test(input.organizationId)) {
    throw new Error("Identificador inválido.");
  }
  if (input.memberships.some((item) => !UUID.test(item.practiceId))) {
    throw new Error("Prática inválida.");
  }
  return withCasaConnection(async (client) => {
    await client.query("select set_config('app.user_id', $1, true)", [actorId]);
    const result = await client.query<{ casa_staff_create: string }>(
      "select public.casa_staff_create($1, $2, $3, $4, $5::jsonb)",
      [
        input.email,
        input.fullName,
        input.passwordHash,
        input.organizationId,
        JSON.stringify(
          input.memberships.map((item) => ({
            practice_id: item.practiceId,
            role: item.role,
            can_schedule_any_practice: item.role === "secretary" && item.canScheduleAnyPractice === true,
          })),
        ),
      ],
    );
    return result.rows[0]?.casa_staff_create ?? null;
  });
}
