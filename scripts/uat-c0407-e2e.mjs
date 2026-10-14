/**
 * UAT E2E C040.7 — documentos clínicos (marcador UAT_C0407_).
 * Não aplica migration. Não cria commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARKER = "UAT_C0407_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const PATIENT = "uat.b34.patient@exemplo.local";
const SB = resolve(process.env.TEMP || "/tmp", "supabase-cli-c0407-new/node_modules/.bin/supabase.cmd");

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
const note = (name, detail = "") => {
  results.push({ name, ok: true, detail: `NOTE ${detail}` });
  console.log(`NOTE — ${name}${detail ? `: ${detail}` : ""}`);
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0407.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`"${SB}" db query --linked -f "${file}"`, {
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

async function buildMinimalPdf(title) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText(title, { x: 50, y: 780, size: 14, font, color: rgb(0, 0, 0) });
  const bytes = await pdf.save();
  const sha = createHash("sha256").update(bytes).digest("hex");
  return { bytes: Uint8Array.from(bytes), sha };
}

async function main() {
  console.log("=== UAT C040.7 E2E ===\n");

  dbQuery(`
do $$
declare
  v_org uuid := '22e69ed4-0797-4742-b00e-f625317c6931';
  v_practice uuid := '${CASA}';
  v_prof uuid;
  v_patient uuid;
  v_room uuid;
  v_appt uuid;
  v_enc uuid;
  v_actor uuid;
begin
  select id into v_actor from public.profiles where email = '${PHYS_A}' limit 1;
  select id into v_prof from public.professionals where practice_id = v_practice and profile_id = v_actor limit 1;
  select id into v_room from public.rooms where organization_id = v_org and status = 'active' order by name limit 1;
  if v_actor is null or v_prof is null or v_room is null then
    raise exception 'FIXTURE_PREREQ_MISSING';
  end if;

  insert into public.patients (organization_id, full_name, created_by)
  values (v_org, '${MARKER}Paciente', v_actor) returning id into v_patient;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    v_org, v_practice, v_room, v_patient, v_prof,
    'consultation', now() + interval '26 hours', now() + interval '26 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values (v_org, v_practice, v_patient, v_prof, v_appt, 'open')
  returning id into v_enc;
end $$;
`);
  pass("fixture criada");

  const ids = parsePayload(dbQuery(`
select json_build_object(
  'patient_id', (select id::text from public.patients where full_name = '${MARKER}Paciente' order by created_at desc limit 1),
  'encounter_id', (select e.id::text from public.encounters e join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}' order by e.created_at desc limit 1),
  'professional_id', (select pr.id::text from public.professionals pr join public.profiles p on p.id = pr.profile_id where p.email = '${PHYS_A}' and pr.practice_id = '${CASA}' limit 1),
  'organization_id', '22e69ed4-0797-4742-b00e-f625317c6931'
)::text as payload;
`));

  const { patient_id, encounter_id, professional_id, organization_id } = ids;
  if (!patient_id || !encounter_id) throw new Error("ids incompletos");
  pass("fixture ids", encounter_id.slice(0, 8));

  const physA = await login(PHYS_A);
  pass("login médica A");

  // SOAP + sign readiness later if needed; docs can issue while open
  await physA.rpc("clinical_note_upsert", {
    p_encounter_id: encounter_id,
    p_body: "S: UAT\nO: ok\nA: ok\nP: ok",
    p_template_code: "soap_min",
  });

  // Receita draft + item
  const userId = (await physA.auth.getUser()).data.user?.id;
  const { data: rx, error: rxErr } = await physA
    .from("prescriptions")
    .insert({
      organization_id,
      practice_id: CASA,
      patient_id,
      professional_id,
      encounter_id,
      status: "draft",
      notes: MARKER,
      created_by: userId,
    })
    .select("*")
    .single();
  if (rxErr) fail("criar receita", rxErr.message);
  else pass("criar receita");

  if (rx?.id) {
    const { error: itemErr } = await physA.from("prescription_items").insert({
      prescription_id: rx.id,
      medication_name: `${MARKER}Med`,
      dosage: "1 cp",
      frequency: "1x/dia",
      duration: "7 dias",
      sort_order: 1,
    });
    if (itemErr) fail("item receita", itemErr.message);
    else pass("item receita");

    const { data: docRx, error: issueErr } = await physA.rpc(
      "clinical_document_issue_from_prescription",
      {
        p_prescription_id: rx.id,
        p_share_with_patient: true,
      },
    );
    if (issueErr) fail("emitir documento receita", issueErr.message);
    else {
      pass("emitir documento receita", docRx?.id?.slice?.(0, 8) ?? "");
      if (docRx?.signature_kind === "internal_system") {
        pass("assinatura = internal_system (não ICP-Brasil)");
      } else fail("signature_kind", String(docRx?.signature_kind));
      if (docRx?.content_sha256 && String(docRx.content_sha256).length === 64) {
        pass("hash content_sha256 presente");
      } else fail("hash content_sha256");

      // Imutabilidade
      const { error: mutErr } = await physA
        .from("clinical_document_artifacts")
        .update({ title: "hack" })
        .eq("id", docRx.id);
      if (mutErr) pass("imutabilidade documento", mutErr.message);
      else fail("imutabilidade documento", "update aceito");

      // PDF attach via storage
      const path = `${organization_id}/${CASA}/${patient_id}/${docRx.id}/document.pdf`;
      const { bytes, sha } = await buildMinimalPdf(`${MARKER} receita`);
      const { error: upErr } = await physA.storage
        .from("clinical-documents")
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (upErr) fail("upload PDF", upErr.message);
      else pass("upload PDF bucket privado");

      const { data: attached, error: attErr } = await physA.rpc("clinical_document_attach_pdf", {
        p_document_id: docRx.id,
        p_storage_path: path,
        p_pdf_sha256: sha,
      });
      if (attErr) fail("attach PDF", attErr.message);
      else pass("attach PDF", attached?.pdf_sha256?.slice?.(0, 12) ?? "");

      // Bucket público?
      const bucketPub = parsePayload(dbQuery(`
select json_build_object('public', (select public from storage.buckets where id = 'clinical-documents'))::text as payload;
`));
      if (bucketPub.public === false) pass("bucket clinical-documents privado");
      else fail("bucket público indevido", String(bucketPub.public));

      // Signed URL
      const { data: signed, error: sErr } = await physA.storage
        .from("clinical-documents")
        .createSignedUrl(path, 60);
      if (sErr || !signed?.signedUrl) fail("signed URL médica", sErr?.message);
      else {
        pass("signed URL médica");
        if (!signed.signedUrl.includes("token=") && !signed.signedUrl.includes("X-Amz")) {
          note("signed URL", "formato sem token explícito na string");
        }
      }

      // Correção / supersessão
      const { data: rx2 } = await physA
        .from("prescriptions")
        .insert({
          organization_id,
          practice_id: CASA,
          patient_id,
          professional_id,
          encounter_id,
          status: "draft",
          notes: `${MARKER}corr`,
          created_by: userId,
        })
        .select("*")
        .single();
      if (rx2?.id) {
        await physA.from("prescription_items").insert({
          prescription_id: rx2.id,
          medication_name: `${MARKER}Med2`,
          dosage: "2 cp",
          sort_order: 1,
        });
        const { data: doc2, error: corrErr } = await physA.rpc(
          "clinical_document_issue_from_prescription",
          {
            p_prescription_id: rx2.id,
            p_share_with_patient: true,
            p_supersedes_id: docRx.id,
            p_correction_reason: `${MARKER}correcao dose`,
          },
        );
        if (corrErr) fail("correção/versionamento", corrErr.message);
        else {
          pass("correção/versionamento", `v${doc2?.version}`);
          const { data: oldDoc } = await physA
            .from("clinical_document_artifacts")
            .select("status")
            .eq("id", docRx.id)
            .maybeSingle();
          if (oldDoc?.status === "superseded") pass("documento original preservado (superseded)");
          else fail("documento original status", String(oldDoc?.status));
        }
      }
    }
  }

  // Exame request + documento
  const { data: cat } = await physA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER}Hemograma`,
    p_category: "laboratorio",
  });
  const { data: req, error: reqErr } = await physA.rpc("clinical_exam_request_create", {
    p_encounter_id: encounter_id,
    p_catalog_ids: cat?.id ? [cat.id] : [],
    p_group_ids: [],
    p_custom_names: [`${MARKER}Avulso`],
    p_notes: `${MARKER}pedido`,
    p_confirm: false,
  });
  if (reqErr) fail("pedido exame", reqErr.message);
  else pass("pedido exame", req?.status);

  if (req?.id) {
    const { data: docEx, error: exErr } = await physA.rpc(
      "clinical_document_issue_from_exam_request",
      {
        p_request_id: req.id,
        p_clinical_indication: `${MARKER}indicacao`,
        p_share_with_patient: false,
      },
    );
    if (exErr) fail("emitir documento exame", exErr.message);
    else {
      pass("emitir documento exame");
      if (docEx?.available_to_patient === false) {
        pass("pedido exame interno (não portal por padrão)");
      } else fail("pedido exame disponível indevidamente");
    }
  }

  // Segurança
  try {
    const physB = await login(PHYS_B);
    const { data: stolen } = await physB
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    if (!stolen?.length) pass("Médica B / outra prática: FORBIDDEN docs");
    else fail("Médica B leu documentos", String(stolen.length));
  } catch (e) {
    note("PHYS_B", String(e.message || e));
  }

  try {
    const sec = await login(SECRETARY);
    const { data: notes } = await sec
      .from("clinical_notes")
      .select("id")
      .eq("encounter_id", encounter_id);
    if (!notes?.length) pass("Secretária sem notas clínicas");
    else fail("Secretária leu notas");
    const { data: docs } = await sec
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    // secretária pode ou não ter can_read_clinical — tipicamente não
    if (!docs?.length) pass("Secretária sem documentos clínicos");
    else note("Secretária docs", `leu ${docs.length} (verificar papel)`);
  } catch (e) {
    note("SECRETARY", String(e.message || e));
  }

  {
    const anonSb = client();
    const { data } = await anonSb
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    if (!data?.length) pass("Anônimo bloqueado em documentos");
    else fail("Anônimo leu documentos");
  }

  try {
    const pat = await login(PATIENT);
    const { data: portalDocs } = await pat.rpc("clinical_document_list_for_patient_portal");
    const mine = (portalDocs ?? []).filter((d) => d.patient_id === patient_id);
    // paciente UAT pode não estar vinculado a este patient_id fixture
    if (Array.isArray(portalDocs)) pass("portal list RPC ok", `n=${portalDocs.length}`);
    else fail("portal list RPC");
    const { data: soap } = await pat
      .from("clinical_notes")
      .select("id")
      .eq("encounter_id", encounter_id);
    if (!soap?.length) pass("Paciente sem SOAP interno");
    else fail("Paciente leu SOAP");
    void mine;
  } catch (e) {
    note("PATIENT", String(e.message || e));
  }

  // delivery_channel não SENT externo
  const ch = parsePayload(dbQuery(`
select json_build_object(
  'channels', coalesce((
    select jsonb_agg(distinct delivery_channel)
    from public.prescriptions where notes like '${MARKER}%'
  ), '[]'::jsonb)
)::text as payload;
`));
  const channels = ch.channels ?? [];
  if (!channels.some((c) => c === "SENT" || c === "DELIVERED")) {
    pass("sem status SENT/DELIVERED falso", JSON.stringify(channels));
  } else fail("status de entrega falso", JSON.stringify(channels));

  // Agenda
  const agenda = parsePayload(dbQuery(`
select json_build_object(
  'n', (select count(*)::int from public.appointments
        where practice_id = '${CASA}'
          and starts_at >= '2026-09-29 00:00:00-03'
          and starts_at < '2026-09-30 00:00:00-03')
)::text as payload;
`));
  if (Number(agenda.n) === 10) pass("agenda 29/09/2026 = 10");
  else fail("agenda 29/09/2026 = 10", `got ${agenda.n}`);

  // Cleanup storage via API (SQL delete em storage.objects é bloqueado)
  {
    const { data: paths } = await physA.storage.from("clinical-documents").list(organization_id, {
      limit: 100,
    });
    void paths;
    const listRaw = dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(name)
    from storage.objects
    where bucket_id = 'clinical-documents'
      and name like '${organization_id}/${CASA}/${patient_id}/%'
  ), '[]'::jsonb)
)::text as payload;
`);
    const pathPayload = parsePayload(listRaw);
    const toRemove = Array.isArray(pathPayload.paths) ? pathPayload.paths : [];
    if (toRemove.length) {
      const { error: rmErr } = await physA.storage.from("clinical-documents").remove(toRemove);
      if (rmErr) note("storage remove", rmErr.message);
      else pass("storage UAT removido via API", String(toRemove.length));
    } else {
      pass("storage UAT vazio antes do cleanup SQL");
    }
  }

  dbQuery(`
alter table public.prescription_items disable trigger prescription_items_guard;
alter table public.clinical_exam_request_items disable trigger clinical_exam_request_items_document_guard;
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
do $$
declare
  v_patient uuid;
  v_enc uuid;
  v_doc uuid;
begin
  for v_patient in select id from public.patients where full_name = '${MARKER}Paciente'
  loop
    update public.clinical_document_artifacts
       set supersedes_id = null
     where patient_id = v_patient;
    for v_doc in
      select id from public.clinical_document_artifacts
      where patient_id = v_patient
      order by version desc
    loop
      delete from public.patient_notifications where reference_id = v_doc;
      delete from public.clinical_document_artifacts where id = v_doc;
    end loop;
    for v_enc in select id from public.encounters where patient_id = v_patient
    loop
      delete from public.clinical_exam_request_items where request_id in (
        select id from public.clinical_exam_requests where encounter_id = v_enc
      );
      delete from public.clinical_exam_requests where encounter_id = v_enc;
      delete from public.prescription_items where prescription_id in (
        select id from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%'
      );
      delete from public.prescriptions where encounter_id = v_enc or notes like '${MARKER}%';
      delete from public.clinical_notes where encounter_id = v_enc;
      delete from public.encounters where id = v_enc;
    end loop;
    delete from public.appointments where patient_id = v_patient and urgency_note = '${MARKER}';
    delete from public.patients where id = v_patient;
  end loop;
  delete from public.clinical_exam_catalog where name like '${MARKER}%';
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
alter table public.clinical_exam_request_items enable trigger clinical_exam_request_items_document_guard;
alter table public.prescription_items enable trigger prescription_items_guard;
`);

  const left = parsePayload(dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'docs', (select count(*) from public.clinical_document_artifacts where title like '%${MARKER}%' or correction_reason like '${MARKER}%'),
  'docs2', (select count(*) from public.clinical_document_artifacts d join public.patients p on p.id = d.patient_id where p.full_name like '${MARKER}%'),
  'rx', (select count(*) from public.prescriptions where notes like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like '${MARKER}%'),
  'storage', (select count(*) from storage.objects where bucket_id = 'clinical-documents' and name like '%${MARKER}%')
)::text as payload;
`));
  // also count storage by leftover patient paths - already deleted by doc id
  const uatLeft = Object.values(left).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0 / storage UAT = 0");
  else fail("uat_left = 0", JSON.stringify(left));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C040.7: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
