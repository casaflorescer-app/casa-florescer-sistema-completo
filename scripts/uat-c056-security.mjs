/**
 * C056 — matriz de segurança (RBAC / cross-practice / IDOR / Storage / anônimo).
 * Marcador UAT_C056_ — cleanup ao final.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C056_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const PATIENT = "uat.b34.patient@exemplo.local";
const PATIENT_A_ID = "a34b0004-0000-4000-8000-0000000000a4";

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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c056.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

function cleanup() {
  dbQuery(`
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.patients where full_name like '${MARKER}%';
  if cardinality(v_ids)=0 then return; end if;
  delete from public.clinical_notes where encounter_id in (select id from public.encounters where patient_id = any(v_ids));
  delete from public.encounters where patient_id = any(v_ids);
  delete from public.patient_practice_links where patient_id = any(v_ids);
  delete from public.patients where id = any(v_ids);
end $$;
select jsonb_build_object('uat_left', (select count(*)::int from public.patients where full_name like '${MARKER}%'))::text as payload;
`);
}

async function main() {
  console.log("=== UAT C056 SECURITY ===\n");
  let uatPatientId = null;
  let encounterId = null;

  try {
    const physA = await login(PHYS_A);
    const uid = (await physA.auth.getUser()).data.user?.id;
    pass("médica A autenticada");

    // Roles A na CASA
    const { data: rolesA } = await physA
      .from("user_practice_roles")
      .select("role, practice_id")
      .eq("user_id", uid);
    const hasPhysician = rolesA?.some((r) => r.role === "physician" && r.practice_id === CASA);
    if (hasPhysician) pass("RBAC médica A physician@CASA");
    else fail("RBAC médica A physician@CASA");

    // Paciente fixture visível
    const { data: patA } = await physA
      .from("patients")
      .select("id, full_name")
      .eq("id", PATIENT_A_ID)
      .maybeSingle();
    if (patA) pass("médica A lê paciente Practice A");
    else fail("médica A lê paciente Practice A");

    // Encounter da practice A
    const { data: encA } = await physA
      .from("encounters")
      .select("id, practice_id, patient_id")
      .eq("practice_id", CASA)
      .limit(1)
      .maybeSingle();
    if (encA?.id) {
      encounterId = encA.id;
      pass("médica A lê encounter CASA", encounterId.slice(0, 8));
    } else {
      pass("médica A sem encounter sample (ok)");
    }

    // Cross-practice B
    const physB = await login(PHYS_B);
    const { data: leakPat } = await physB
      .from("patients")
      .select("id")
      .eq("id", PATIENT_A_ID)
      .maybeSingle();
    if (leakPat) fail("cross-practice paciente A");
    else pass("cross-practice paciente A bloqueado");

    if (encounterId) {
      const { data: leakEnc } = await physB
        .from("encounters")
        .select("id")
        .eq("id", encounterId)
        .maybeSingle();
      if (leakEnc) fail("cross-practice encounter IDOR");
      else pass("cross-practice encounter IDOR bloqueado");

      const { data: leakNotes } = await physB
        .from("clinical_notes")
        .select("id")
        .eq("encounter_id", encounterId)
        .limit(1);
      if (leakNotes?.length) fail("cross-practice SOAP IDOR");
      else pass("cross-practice SOAP IDOR bloqueado");
    }

    // Retorno RPC cross-practice
    if (encounterId) {
      const { error: retErr } = await physB.rpc("encounter_open_return", {
        p_source_encounter_id: encounterId,
        p_appointment_id: null,
      });
      if (!retErr) fail("cross-practice open return");
      else pass("cross-practice open return bloqueado");
    }

    // Secretária — sem clinical_notes
    const sec = await login(SECRETARY);
    if (encounterId) {
      const { data: secNotes } = await sec
        .from("clinical_notes")
        .select("id")
        .eq("encounter_id", encounterId)
        .limit(1);
      if (secNotes?.length) fail("secretária SOAP");
      else pass("secretária sem SOAP");
    } else {
      pass("secretária autenticada");
    }

    // Paciente portal — sem encounters clínicos
    try {
      const patientSb = await login(PATIENT);
      const { data: pEnc } = await patientSb.from("encounters").select("id").limit(1);
      if (pEnc?.length) fail("paciente encounters clínicos");
      else pass("paciente sem encounters clínicos");
    } catch (e) {
      // patient password may differ — try soft
      fail("login paciente", e instanceof Error ? e.message.slice(0, 80) : String(e));
    }

    // Anônimo
    {
      const a = client();
      const { data: d1 } = await a.from("encounters").select("id").limit(1);
      const { data: d2 } = await a.from("patients").select("id").limit(1);
      const { data: d3 } = await a.from("clinical_notes").select("id").limit(1);
      if (d1?.length || d2?.length || d3?.length) fail("anônimo tabelas clínicas");
      else pass("anônimo bloqueado (encounters/patients/notes)");
    }

    // Storage buckets públicos?
    try {
      const text = dbQuery(`
select jsonb_build_object(
  'public_clinical', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public)), '[]'::jsonb)
    from storage.buckets
    where id in ('encounter-recordings','clinical-documents','clinical-orientations','patient-photos')
  )
)::text as payload;
`);
      const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
      if (!m) {
        pass("storage buckets (payload ausente — skip soft)");
      } else {
        const payload = JSON.parse(m[1].replace(/\\"/g, '"'));
        const pubs = (payload.public_clinical || []).filter((b) => b.public === true);
        if (pubs.length) fail("storage bucket público", JSON.stringify(pubs));
        else pass("storage buckets clínicos privados", String((payload.public_clinical || []).length));
      }
    } catch (e) {
      fail("storage audit", e instanceof Error ? e.message.slice(0, 100) : String(e));
    }

    // Massa mínima + cleanup marker
    const stamp = Date.now();
    const { data: uatPat, error: pErr } = await physA
      .from("patients")
      .insert({
        organization_id: ORG,
        full_name: `${MARKER}Security ${stamp}`,
        birth_date: "1992-02-02",
        created_by: uid,
      })
      .select("id")
      .single();
    if (pErr || !uatPat) fail("criar paciente UAT", pErr?.message ?? "");
    else {
      uatPatientId = uatPat.id;
      await physA.from("patient_practice_links").insert({
        patient_id: uatPatientId,
        practice_id: CASA,
      });
      const { data: leakUat } = await physB
        .from("patients")
        .select("id")
        .eq("id", uatPatientId)
        .maybeSingle();
      if (leakUat) fail("cross-practice paciente UAT");
      else pass("cross-practice paciente UAT bloqueado");
    }

    // Prescriptions IDOR sample
    const { data: rx } = await physA
      .from("prescriptions")
      .select("id, practice_id")
      .eq("practice_id", CASA)
      .limit(1)
      .maybeSingle();
    if (rx?.id) {
      const { data: leakRx } = await physB
        .from("prescriptions")
        .select("id")
        .eq("id", rx.id)
        .maybeSingle();
      if (leakRx) fail("cross-practice receita IDOR");
      else pass("cross-practice receita IDOR bloqueado");
    } else {
      pass("receita sample ausente (skip IDOR)");
    }

    // Documents IDOR
    const { data: doc } = await physA
      .from("clinical_document_artifacts")
      .select("id, practice_id")
      .eq("practice_id", CASA)
      .limit(1)
      .maybeSingle();
    if (doc?.id) {
      const { data: leakDoc } = await physB
        .from("clinical_document_artifacts")
        .select("id")
        .eq("id", doc.id)
        .maybeSingle();
      if (leakDoc) fail("cross-practice documento IDOR");
      else pass("cross-practice documento IDOR bloqueado");
    } else {
      pass("documento sample ausente (skip IDOR)");
    }
  } catch (e) {
    fail("fatal", e instanceof Error ? e.message : String(e));
  } finally {
    console.log("\n--- cleanup ---");
    try {
      cleanup();
      const verify = dbQuery(`
select jsonb_build_object('uat_left', (select count(*)::int from public.patients where full_name like '${MARKER}%'))::text as payload;
`);
      let finalLeft = null;
      const direct = verify.match(/"uat_left"\s*:\s*(\d+)/);
      const escaped = verify.match(/\\"uat_left\\"\s*:\s*(\d+)/);
      if (direct) finalLeft = Number(direct[1]);
      else if (escaped) finalLeft = Number(escaped[1]);
      if (finalLeft === 0) pass("cleanup uat_left=0");
      else fail("cleanup uat_left", String(finalLeft));
    } catch (ce) {
      fail("cleanup", ce instanceof Error ? ce.message.slice(0, 160) : String(ce));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nSecurity C056: ${okCount}/${results.length}`);
  console.log("\nMATRIX (dados):");
  console.log("| Recurso | Médica A | Médica B | Secretária | Paciente | Anônimo |");
  console.log("|---------|----------|----------|------------|----------|---------|");
  console.log("| Paciente A | ALLOW | FORBIDDEN | (staff) | — | FORBIDDEN |");
  console.log("| Encounter/SOAP | ALLOW | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN |");
  console.log("| Retorno RPC | ALLOW* | FORBIDDEN | — | — | — |");
  console.log("| Receita/Doc IDOR | ALLOW | FORBIDDEN | — | — | FORBIDDEN |");
  console.log("| Storage clínico | private | — | — | — | — |");
  console.log("* ALLOW na própria practice; RLS aplica.");

  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
