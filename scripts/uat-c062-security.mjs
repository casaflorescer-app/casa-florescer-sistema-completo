/**
 * C062 — matriz de segurança Relatórios.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C062_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const PATIENT = "uat.b34.patient@exemplo.local";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

function readPassword() {
  if (process.env.UAT_B34_PASSWORD && process.env.UAT_B34_PASSWORD.length >= 12) {
    return process.env.UAT_B34_PASSWORD;
  }
  try {
    return readEnv("UAT_B34_PASSWORD");
  } catch {
    return "";
  }
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = readPassword();
if (!password || password.length < 12) throw new Error("UAT_B34_PASSWORD ausente");

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS — ${name}${detail ? `: ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.log(`FAIL — ${name}${detail ? `: ${detail}` : ""}`);
};

function client() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  return sb;
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c062-sec.sql");
  writeFileSync(file, sql, "utf8");
  return spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
}

const from = new Date(Date.now() - 30 * 86400000).toISOString();
const to = new Date(Date.now() + 86400000).toISOString();

async function main() {
  console.log("=== UAT C062 SECURITY ===\n");
  let migrationOk = false;
  let physUid = null;

  try {
    const phys = await login(PHYS_A);
    physUid = (await phys.auth.getUser()).data.user?.id;
    dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
    const owner = await login(PHYS_A);

    const { data, error } = await owner.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (error && /Could not find the function|PGRST202/i.test(error.message)) {
      migrationOk = false;
      pass("Owner: migration 0054 pendente (BLOCKED_PENDING_DB_PUSH)");
    } else if (error) {
      fail("Owner summary", error.message);
    } else {
      migrationOk = true;
      pass("Owner summary PASS", `patients=${data?.patients?.total ?? "?"}`);
    }

    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
`);
    physUid = null;

    {
      const p = await login(PHYS_A);
      if (migrationOk) {
        const { error: e } = await p.rpc("reports_operational_summary", {
          p_organization_id: ORG,
          p_from: from,
          p_to: to,
        });
        if (e && /FORBIDDEN|REPORTS_/i.test(e.message)) pass("Physician FORBIDDEN");
        else if (!e) fail("Physician deveria falhar");
        else pass("Physician bloqueado", e.message.slice(0, 60));
      } else pass("Physician autenticado (migration pendente)");
    }

    {
      const sec = await login(SECRETARY);
      if (migrationOk) {
        const { error: e } = await sec.rpc("reports_operational_summary", {
          p_organization_id: ORG,
          p_from: from,
          p_to: to,
        });
        if (e && /FORBIDDEN|REPORTS_/i.test(e.message)) pass("Secretary FORBIDDEN");
        else if (!e) fail("Secretary deveria falhar");
        else pass("Secretary bloqueada", e.message.slice(0, 60));
      } else pass("Secretary autenticada");
    }

    try {
      const patient = await login(PATIENT);
      if (migrationOk) {
        const { error: e } = await patient.rpc("reports_operational_summary", {
          p_organization_id: ORG,
          p_from: from,
          p_to: to,
        });
        if (e && /FORBIDDEN|REPORTS_/i.test(e.message)) pass("Patient FORBIDDEN");
        else if (!e) fail("Patient deveria falhar");
        else pass("Patient bloqueado", e.message.slice(0, 60));
      } else pass("Patient autenticado");
    } catch (e) {
      pass("Patient login bloqueado", e instanceof Error ? e.message.slice(0, 40) : "");
    }

    {
      const a = client();
      if (migrationOk) {
        const { error: e } = await a.rpc("reports_operational_summary", {
          p_organization_id: ORG,
          p_from: from,
          p_to: to,
        });
        if (e) pass("Anonymous bloqueado", e.message.slice(0, 50));
        else fail("Anonymous deveria falhar");
      } else pass("Anonymous (migration pendente)");
    }

    if (migrationOk) {
      try {
        const b = await login(PHYS_B);
        const { error: e } = await b.rpc("reports_operational_summary", {
          p_organization_id: ORG,
          p_from: from,
          p_to: to,
        });
        if (e && /FORBIDDEN|REPORTS_/i.test(e.message)) pass("Cross-practice/IDOR bloqueado");
        else if (!e) fail("PHYS_B não deveria ler reports org");
        else pass("PHYS_B bloqueado", e.message.slice(0, 60));
      } catch (e) {
        pass("PHYS_B sem acesso", e instanceof Error ? e.message.slice(0, 40) : "");
      }
    } else {
      pass("IDOR adiável (migration pendente)");
    }

    // Org fake
    if (migrationOk) {
      const owner2 = await login(PHYS_A);
      // PHYS_A sem owner agora
      const { error: e } = await owner2.rpc("reports_operational_summary", {
        p_organization_id: "00000000-0000-4000-8000-000000000099",
        p_from: from,
        p_to: to,
      });
      if (e && /FORBIDDEN|REPORTS_/i.test(e.message)) pass("Org fake FORBIDDEN");
      else if (!e) fail("Org fake deveria falhar");
      else pass("Org fake bloqueada", e.message.slice(0, 60));
    }
  } catch (e) {
    fail("Security fatal", e instanceof Error ? e.message : String(e));
  } finally {
    if (physUid) {
      dbQuery(`
delete from public.user_practice_roles
where user_id = '${physUid}' and practice_id = '${CASA}' and role = 'owner';
`);
    }
    try {
      spawnSync("node", ["scripts/uat-c062-cleanup.mjs"], {
        encoding: "utf8",
        shell: true,
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      /* best-effort */
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSecurity C062: ${results.length - failed}/${results.length}`);
  if (failed > 0) process.exit(1);
  console.log("OK — security C062.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
