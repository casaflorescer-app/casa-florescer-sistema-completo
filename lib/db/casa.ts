import { Pool, type PoolClient } from "pg";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pool: Pool | null = null;

export function isCasaDatabaseConfigured() {
  return Boolean(process.env.CASA_DATABASE_URL);
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

export async function withCasaUser<T>(
  userId: string,
  run: (client: PoolClient) => Promise<T>,
) {
  if (!UUID.test(userId)) throw new Error("Usuário da sessão inválido.");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await assertNotSuperuser(client);
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query("set local role authenticated");
    const value = await run(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function staffLoginHash(email: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await assertNotSuperuser(client);
    const result = await client.query<{ user_id: string; password_hash: string }>(
      "select user_id, password_hash from public.staff_login_hash($1)",
      [email],
    );
    await client.query("commit");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
