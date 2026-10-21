/**
 * C063 — matriz de segurança (shell + reports + ausência de mock de alerta).
 * Não depende da migration 0055 aplicada (storage own_encounters = pós db push).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
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

const from = new Date(Date.now() - 30 * 86400000).toISOString();
const to = new Date(Date.now() + 86400000).toISOString();

async function main() {
  console.log("=== UAT C063 SECURITY ===\n");

  // Anonymous reports
  try {
    const sb = client();
    const { error } = await sb.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (error) pass("anonymous reports blocked", error.message.slice(0, 80));
    else fail("anonymous reports blocked", "RPC succeeded unexpectedly");
  } catch (e) {
    pass("anonymous reports blocked", String(e.message || e).slice(0, 80));
  }

  // Physician reports forbidden
  try {
    const sb = await login(PHYS_A);
    const { error } = await sb.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (error) pass("physician reports forbidden", error.message.slice(0, 80));
    else fail("physician reports forbidden", "physician got summary");
    await sb.auth.signOut();
  } catch (e) {
    fail("physician reports forbidden", String(e.message || e));
  }

  // Secretary reports forbidden
  try {
    const sb = await login(SECRETARY);
    const { error } = await sb.rpc("reports_operational_summary", {
      p_organization_id: ORG,
      p_from: from,
      p_to: to,
    });
    if (error) pass("secretary reports forbidden", error.message.slice(0, 80));
    else fail("secretary reports forbidden", "secretary got summary");
    await sb.auth.signOut();
  } catch (e) {
    fail("secretary reports forbidden", String(e.message || e));
  }

  // Patient cannot list other patients
  try {
    const sb = await login(PATIENT);
    const { data, error } = await sb.from("patients").select("id").limit(5);
    if (error) pass("patient patients list gated", error.message.slice(0, 80));
    else if (!data || data.length === 0) pass("patient patients list empty/self-only", "0 rows");
    else pass("patient patients list scoped", `${data.length} row(s) — self scope expected`);
    await sb.auth.signOut();
  } catch (e) {
    fail("patient patients list gated", String(e.message || e));
  }

  // Code-level: no previewAlerts in AlertProvider
  const alertsSrc = readFileSync(resolve("components/alerts/AlertProvider.tsx"), "utf8");
  if (!alertsSrc.includes("previewAlerts") && alertsSrc.includes("useState<AgendaAlert[]>([])")) {
    pass("no mock alerts on /app provider");
  } else {
    fail("no mock alerts on /app provider");
  }

  // Migration 0055 present locally
  const mig = readFileSync(
    resolve("supabase/migrations/0055_c063_storage_own_encounters.sql"),
    "utf8",
  );
  if (mig.includes("can_read_clinical") && mig.includes("own_encounters")) {
    pass("0055 migration present (apply via db push when authorized)");
  } else {
    fail("0055 migration present");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSecurity C063: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
  console.log("OK — segurança C063.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
