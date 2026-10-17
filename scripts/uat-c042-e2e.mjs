/**
 * UAT E2E C042 — módulos Receitas + Exames (marcador UAT_C042_).
 * Reutiliza RPCs/tabelas C040.9. Sem migration. Sem commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C042_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c042.sql");
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
  console.log("=== UAT C042 E2E ===\n");
  let rxId = null;
  let docId = null;
  let doc2Id = null;

  try {
    const physA = await login(PHYS_A);
    const { data: me } = await physA.auth.getUser();
    const uid = me.user?.id;
    if (!uid) throw new Error("no uid");

    const { data: profRows } = await physA
      .from("professionals")
      .select("id")
      .eq("profile_id", uid)
      .eq("practice_id", CASA)
      .limit(1);
    const professionalId = profRows?.[0]?.id;
    if (!professionalId) {
      fail("profissional CASA", "não encontrado");
      process.exitCode = 1;
      return;
    }
    pass("médica A autenticada na CASA");

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
      .select("id, status")
      .single();
    if (rxErr || !rx) fail("criar rascunho sem encounter", rxErr?.message ?? "null");
    else {
      rxId = rx.id;
      pass("criar rascunho sem encounter", rx.id.slice(0, 8));
    }

    if (rxId) {
      const { error: itemErr } = await physA.from("prescription_items").insert({
        prescription_id: rxId,
        medication_name: `${MARKER}Dipirona`,
        presentation: "500mg",
        quantity: "20 cp",
        dosage: "1 cp",
        frequency: "8/8h",
        route: "VO",
        instructions: "Se necessário: dor",
        sort_order: 1,
      });
      if (itemErr) fail("adicionar item", itemErr.message);
      else pass("adicionar item à receita");

      const { data: doc, error: docErr } = await physA.rpc(
        "clinical_document_issue_from_prescription",
        {
          p_prescription_id: rxId,
          p_share_with_patient: false,
          p_supersedes_id: null,
          p_correction_reason: null,
        },
      );
      if (docErr || !doc) fail("emitir documento receita", docErr?.message ?? "null");
      else {
        docId = doc.id;
        pass("emitir documento receita", `v${doc.version}`);
        if (doc.signature_kind === "internal_system") pass("assinatura internal_system");
        else fail("assinatura", String(doc.signature_kind));

        const { data: docs } = await physA
          .from("clinical_document_artifacts")
          .select("id, version")
          .eq("source_type", "prescription")
          .eq("source_id", rxId);
        if ((docs ?? []).length === 1) pass("consulta pós-emissão não cria versão extra");
        else fail("versões receita", String((docs ?? []).length));

        const { data: doc2, error: doc2Err } = await physA.rpc(
          "clinical_document_issue_from_prescription",
          {
            p_prescription_id: rxId,
            p_share_with_patient: false,
            p_supersedes_id: doc.id,
            p_correction_reason: `${MARKER}correcao`,
          },
        );
        if (doc2Err || !doc2) fail("correção (nova versão)", doc2Err?.message ?? "null");
        else {
          doc2Id = doc2.id;
          pass("correção nova versão", `v${doc2.version}`);
          const { data: prev } = await physA
            .from("clinical_document_artifacts")
            .select("id, status")
            .eq("id", doc.id)
            .maybeSingle();
          if (prev) pass("versão anterior preservada", prev.status);
          else fail("versão anterior ausente");
        }
      }
    }

    const { error: erErr } = await physA
      .from("clinical_exam_requests")
      .select("id, status, clinical_indication")
      .eq("patient_id", PATIENT_A_ID)
      .limit(5);
    if (erErr) fail("listar pedidos exame", erErr.message);
    else pass("listar pedidos exame do paciente");

    // pedido exige encounter aberto — sem encounter: RPC deve falhar
    const { error: noEncErr } = await physA.rpc("clinical_exam_request_create", {
      p_encounter_id: "00000000-0000-4000-8000-000000000000",
      p_catalog_ids: [],
      p_group_ids: [],
      p_custom_names: [`${MARKER}avulso`],
      p_notes: null,
      p_confirm: false,
      p_clinical_indication: `${MARKER}ind`,
    });
    if (noEncErr) pass("pedido exame sem encounter válido bloqueado", noEncErr.message.slice(0, 80));
    else fail("pedido exame sem encounter", "RPC aceitou UUID inválido");

    const physB = await login(PHYS_B);
    if (rxId) {
      const { data: blocked } = await physB
        .from("prescriptions")
        .select("id")
        .eq("id", rxId)
        .maybeSingle();
      if (blocked) fail("cross-practice receita", "médica B leu receita da CASA");
      else pass("cross-practice receita bloqueada");
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
        notes: `${MARKER}sec_blocked`,
        created_by: secUid,
      })
      .select("id")
      .maybeSingle();
    if (secRx) {
      rxId = rxId || secRx.id;
      fail("secretária emissão", "insert permitido indevidamente");
    } else pass("secretária sem emissão de receita", secErr?.message?.slice(0, 60) ?? "blocked");

    const agenda = parsePayload(dbQuery(`
select json_build_object(
  'agenda_2909', (
    select count(*)::int from public.appointments a
    where a.practice_id = '${CASA}'
      and a.starts_at >= '2026-09-29 00:00:00-03'
      and a.starts_at < '2026-09-30 00:00:00-03'
  )
)::text as payload;
`));
    if (Number(agenda.agenda_2909) === 10) pass("agenda 29/09/2026 = 10");
    else fail("agenda 29/09", String(agenda.agenda_2909));
  } catch (err) {
    fail("exceção", err instanceof Error ? err.message : String(err));
  }

  // cleanup (mesmo padrão C040.9 — disable triggers UAT)
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
    pass("cleanup UAT_C042_");
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
  if (Number(left.permanent) !== 1) fail("paciente permanente", String(left.permanent));
  else pass("paciente permanente intacta");
  const uatLeft = Number(left.rx) + Number(left.docs);
  if (uatLeft === 0) pass("uat_left = 0");
  else fail("uat_left", JSON.stringify(left));

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n=== RESULTADO C042: ${ok}/${ok + bad} ${bad ? "FAIL" : "PASS"} ===`);
  if (bad) {
    for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
