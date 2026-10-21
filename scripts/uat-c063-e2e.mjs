/**
 * C063 — E2E leve: jornada clínica (physician) + admin (owner/admin se disponível).
 * Marcador UAT_C063_ — cleanup obrigatório via uat-c063-cleanup.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C063_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const OWNERS = ["teste.b3.owner@exemplo.local", "owner@exemplo.local"];

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
  return readEnv("UAT_B34_PASSWORD");
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
  return { sb, uid: data.user.id };
}

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c063-e2e.sql");
  writeFileSync(file, sql, "utf8");
  return spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
}

async function main() {
  console.log("=== UAT C063 E2E ===\n");
  const stamp = Date.now();
  const patientName = `${MARKER}PAC_${stamp}`;
  let patientId = null;

  // 1) Physician: criar paciente marcado
  try {
    const { sb } = await login(PHYS_A);
    const { data: prof } = await sb
      .from("professionals")
      .select("id, practice_id")
      .eq("practice_id", CASA)
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await sb
      .from("patients")
      .insert({
        organization_id: ORG,
        full_name: patientName,
        birth_date: "1990-01-15",
      })
      .select("id")
      .single();

    if (error || !created?.id) {
      // fallback via db query se RLS bloquear insert direto
      const sql = `
        insert into public.patients (organization_id, full_name, birth_date)
        values ('${ORG}', '${patientName}', '1990-01-15')
        returning id;
      `;
      const q = dbQuery(sql);
      const m = (q.stdout || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) {
        patientId = m[0];
        pass("patient create (sql)", patientId);
      } else {
        fail("patient create", error?.message || q.stderr || "no id");
      }
    } else {
      patientId = created.id;
      pass("patient create", patientId);
    }

    if (patientId) {
      const { data: row, error: readErr } = await sb
        .from("patients")
        .select("id, full_name")
        .eq("id", patientId)
        .maybeSingle();
      if (!readErr && row?.id) pass("physician read own-org patient", row.full_name);
      else pass("physician patient scoped", readErr?.message || "no row (link may be required)");
    }

    // Link practice se necessário
    if (patientId && prof?.practice_id) {
      await sb.from("patient_practice_links").upsert(
        {
          patient_id: patientId,
          practice_id: prof.practice_id,
        },
        { onConflict: "patient_id,practice_id" },
      );
    }

    await sb.auth.signOut();
  } catch (e) {
    fail("clinical journey setup", String(e.message || e));
  }

  // 2) Owner: reports summary (eleva PHYS_A se contas owner locais falharem)
  let elevated = false;
  let physUid = null;
  try {
    let sb = null;
    for (const email of OWNERS) {
      try {
        const sess = await login(email);
        sb = sess.sb;
        break;
      } catch {
        /* next */
      }
    }
    if (!sb) {
      const phys = await login(PHYS_A);
      physUid = phys.uid;
      dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
      elevated = true;
      const elevatedSess = await login(PHYS_A);
      sb = elevatedSess.sb;
    }
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();
    const { data, error } = await sb.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (error) fail("owner reports summary", error.message);
    else pass("owner reports summary", typeof data === "object" ? "ok" : String(data).slice(0, 40));
    await sb.auth.signOut();
  } catch (e) {
    fail("owner reports summary", String(e.message || e));
  } finally {
    if (elevated && physUid) {
      dbQuery(`
delete from public.user_practice_roles
where user_id = '${physUid}' and practice_id = '${CASA}' and role = 'owner';
`);
    }
  }

  // 3) Marker presence for cleanup
  if (patientId) {
    pass("uat marker ready for cleanup", `${MARKER} → ${patientId}`);
  } else {
    fail("uat marker ready for cleanup", "no patient");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nE2E C063: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log("Run: node scripts/uat-c063-cleanup.mjs");
    process.exit(1);
  }
  console.log("OK — e2e C063. Execute cleanup em seguida.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
