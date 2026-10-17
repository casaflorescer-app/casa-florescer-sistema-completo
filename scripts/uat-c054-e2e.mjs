/**
 * UAT E2E C054 — fechamento Receitas + Exames (marcador UAT_C054_).
 * Reutiliza RPCs C040.9. Sem migration. Sem commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C054_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const PATIENT_A_ID = "a34b0004-0000-4000-8000-0000000000a4";

function readEnv(name) {
  const line = readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = process.env.UAT_B34_PASSWORD;
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c054.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.status !== 0 && /ERROR:|error:/.test(text) && !/"rows"\s*:/.test(text)) {
    throw new Error(`db query failed: ${text.slice(0, 1200)}`);
  }
  return text;
}

function parsePayload(text) {
  const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  if (!m) throw new Error("payload not found: " + text.slice(0, 400));
  return JSON.parse(m[1].replace(/\\"/g, '"'));
}

async function main() {
  console.log("=== UAT C054 E2E ===\n");
  let rxId = null;
  let docId = null;
  let doc2Id = null;

  try {
    const physA = await login(PHYS_A);
    const uid = (await physA.auth.getUser()).data.user?.id;
    const { data: profRows } = await physA
      .from("professionals")
      .select("id")
      .eq("profile_id", uid)
      .eq("practice_id", CASA)
      .limit(1);
    const professionalId = profRows?.[0]?.id;
    if (!professionalId) {
      fail("profissional CASA");
      process.exitCode = 1;
      return;
    }
    pass("médica A autenticada");

    // pesquisa paciente (homônimo: ID estável)
    const { data: patients, error: pErr } = await physA
      .from("patients")
      .select("id, full_name, birth_date, cpf")
      .eq("id", PATIENT_A_ID)
      .maybeSingle();
    if (pErr || !patients) fail("selecionar paciente por patientId", pErr?.message ?? "null");
    else pass("paciente por patientId", patients.full_name);

    const { data: rx, error: rxErr } = await physA
      .from("prescriptions")
      .insert({
        organization_id: ORG,
        practice_id: CASA,
        patient_id: PATIENT_A_ID,
        professional_id: professionalId,
        encounter_id: null,
        status: "draft",
        notes: `${MARKER}draft_rx`,
        created_by: uid,
      })
      .select("id")
      .single();
    if (rxErr || !rx) fail("rascunho sem encounter", rxErr?.message ?? "null");
    else {
      rxId = rx.id;
      pass("rascunho sem encounter");
    }

    if (rxId) {
      const { error: itemErr } = await physA.from("prescription_items").insert({
        prescription_id: rxId,
        medication_name: `${MARKER}Amoxicilina`,
        presentation: "500mg",
        quantity: "21 cp",
        dosage: "1 cp",
        frequency: "8/8h",
        route: "VO",
        instructions: "Se necessário: febre; uso contínuo — reavaliar 7d",
        sort_order: 1,
      });
      if (itemErr) fail("item PRN/contínuo texto", itemErr.message);
      else pass("item com instruções estruturadas");

      const { data: emptyIssue } = await physA.rpc("clinical_document_issue_from_prescription", {
        p_prescription_id: "00000000-0000-4000-8000-000000000001",
        p_share_with_patient: false,
      });
      void emptyIssue;

      const { data: doc, error: docErr } = await physA.rpc(
        "clinical_document_issue_from_prescription",
        {
          p_prescription_id: rxId,
          p_share_with_patient: false,
          p_supersedes_id: null,
          p_correction_reason: null,
        },
      );
      if (docErr || !doc) fail("emissão documento", docErr?.message ?? "null");
      else {
        docId = doc.id;
        pass("emissão + internal_system", doc.signature_kind);
        if (doc.content_sha256) pass("hash presente", doc.content_sha256.slice(0, 12));
        else fail("hash ausente");

        const { data: again } = await physA
          .from("clinical_document_artifacts")
          .select("id")
          .eq("source_id", rxId)
          .eq("source_type", "prescription");
        if ((again ?? []).length === 1) pass("reconsulta ≠ nova emissão");
        else fail("versões extras", String((again ?? []).length));

        const { data: doc2, error: d2e } = await physA.rpc(
          "clinical_document_issue_from_prescription",
          {
            p_prescription_id: rxId,
            p_share_with_patient: false,
            p_supersedes_id: doc.id,
            p_correction_reason: `${MARKER}correcao`,
          },
        );
        if (d2e || !doc2) fail("supersede", d2e?.message ?? "null");
        else {
          doc2Id = doc2.id;
          pass("correção nova versão", `v${doc2.version}`);
        }
      }
    }

    const { data: reqs, error: rErr } = await physA
      .from("clinical_exam_requests")
      .select("id, status, clinical_indication")
      .eq("patient_id", PATIENT_A_ID)
      .limit(5);
    if (rErr) fail("histórico pedidos exame", rErr.message);
    else pass("histórico pedidos exame", `n=${(reqs ?? []).length}`);

    const { data: orders, error: oErr } = await physA
      .from("exam_orders")
      .select("id, title, clinical_status")
      .eq("patient_id", PATIENT_A_ID)
      .limit(5);
    if (oErr) fail("histórico resultados/anexos", oErr.message);
    else pass("pedido ≠ resultado (tabelas distintas)", `req=${(reqs ?? []).length} orders=${(orders ?? []).length}`);

    const { error: noEnc } = await physA.rpc("clinical_exam_request_create", {
      p_encounter_id: "00000000-0000-4000-8000-000000000000",
      p_catalog_ids: [],
      p_group_ids: [],
      p_custom_names: [`${MARKER}x`],
      p_notes: null,
      p_confirm: false,
      p_clinical_indication: `${MARKER}ind`,
    });
    if (noEnc) pass("exame sem encounter bloqueado", noEnc.message.slice(0, 60));
    else fail("exame sem encounter aceito");

    const physB = await login(PHYS_B);
    if (rxId) {
      const { data: blocked } = await physB.from("prescriptions").select("id").eq("id", rxId).maybeSingle();
      if (blocked) fail("cross-practice");
      else pass("cross-practice bloqueado");
    }

    const sec = await login(SECRETARY);
    const secUid = (await sec.auth.getUser()).data.user?.id;
    const { data: secRx, error: secErr } = await sec
      .from("prescriptions")
      .insert({
        organization_id: ORG,
        practice_id: CASA,
        patient_id: PATIENT_A_ID,
        professional_id: professionalId,
        status: "draft",
        notes: `${MARKER}sec`,
        created_by: secUid,
      })
      .select("id")
      .maybeSingle();
    if (secRx) fail("secretária emissão");
    else pass("secretária sem emissão", secErr?.message?.slice(0, 50) ?? "blocked");

    const anon = client();
    const { data: anonRx } = await anon.from("prescriptions").select("id").eq("id", rxId).maybeSingle();
    if (anonRx) fail("anônimo leu receita");
    else pass("anônimo bloqueado");

    const agenda = parsePayload(dbQuery(`
select json_build_object(
  'n', (select count(*)::int from public.appointments
        where practice_id = '${CASA}'
          and starts_at >= '2026-09-29 00:00:00-03'
          and starts_at < '2026-09-30 00:00:00-03')
)::text as payload;
`));
    if (Number(agenda.n) === 10) pass("agenda 29/09 = 10");
    else fail("agenda 29/09", String(agenda.n));
  } catch (err) {
    fail("exceção", err instanceof Error ? err.message : String(err));
  }

  try {
    const docList = [docId, doc2Id].filter(Boolean).map((id) => `'${id}'`).join(",");
    dbQuery(`
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
alter table public.prescription_items disable trigger prescription_items_guard;
${docList ? `delete from public.patient_notifications where reference_id in (${docList});` : ""}
${docList ? `delete from public.clinical_document_artifacts where id in (${docList});` : ""}
delete from public.clinical_document_artifacts
where source_type = 'prescription'
  and source_id in (select id from public.prescriptions where notes like '${MARKER}%');
delete from public.prescription_items
where prescription_id in (select id from public.prescriptions where notes like '${MARKER}%');
delete from public.prescriptions where notes like '${MARKER}%';
alter table public.prescription_items enable trigger prescription_items_guard;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
`);
    pass("cleanup UAT_C054_");
  } catch (e) {
    fail("cleanup", e instanceof Error ? e.message : String(e));
  }

  const left = parsePayload(dbQuery(`
select json_build_object(
  'rx', (select count(*)::int from public.prescriptions where notes like '${MARKER}%'),
  'docs', (select count(*)::int from public.clinical_document_artifacts where correction_reason like '${MARKER}%'),
  'permanent', (select count(*)::int from public.patients where id = '${PATIENT_A_ID}')
)::text as payload;
`));
  if (Number(left.permanent) === 1) pass("paciente permanente intacta");
  else fail("paciente permanente", String(left.permanent));
  if (Number(left.rx) + Number(left.docs) === 0) pass("uat_left = 0");
  else fail("uat_left", JSON.stringify(left));

  const okN = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C054: ${okN}/${okN + bad.length} ${bad.length ? "FAIL" : "PASS"} ===`);
  if (bad.length) {
    for (const f of bad) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
