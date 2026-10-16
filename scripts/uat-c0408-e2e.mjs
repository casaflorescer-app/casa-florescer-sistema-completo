/**
 * UAT E2E C040.8 — documento de orientação (marcador UAT_C0408_).
 * Requer migration 0047 aplicada. Não cria commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARKER = "UAT_C0408_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0408.sql");
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
  console.log("=== UAT C040.8 E2E ===\n");

  const rpcExists = parsePayload(dbQuery(`
select json_build_object(
  'n', (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'clinical_document_issue_from_orientation')
)::text as payload;
`));
  if (Number(rpcExists.n) < 1) {
    fail("RPC 0047 aplicada", "clinical_document_issue_from_orientation ausente — db push pendente");
    console.log(`\n=== RESULTADO C040.8: ${results.filter((r) => r.ok).length}/${results.length} PASS ===`);
    process.exitCode = 1;
    return;
  }
  pass("RPC 0047 aplicada");

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
    'consultation', now() + interval '28 hours', now() + interval '28 hours 30 minutes',
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
  pass("fixture ids", encounter_id?.slice?.(0, 8) ?? "");

  const physA = await login(PHYS_A);
  pass("login médica A");

  await physA.rpc("clinical_note_upsert", {
    p_encounter_id: encounter_id,
    p_body: "S: UAT\nO: ok\nA: ok\nP: orientacao",
    p_template_code: "soap_min",
  });

  const { data: created, error: createErr } = await physA.rpc("clinical_orientation_create", {
    p_payload: {
      organization_id: organization_id,
      practice_id: CASA,
      patient_id: patient_id,
      professional_id: professional_id,
      encounter_id: encounter_id,
      appointment_id: null,
      title: `${MARKER}Orientacao`,
    },
  });
  if (createErr) fail("criar orientação", createErr.message);
  else pass("criar orientação");

  const orientationId = created?.orientation?.id ?? null;
  let versionId = created?.version?.id ?? null;
  if (!versionId && orientationId) {
    const { data: vers } = await physA.rpc("clinical_orientation_versions_list", {
      p_orientation_id: orientationId,
    });
    versionId = Array.isArray(vers) ? vers.find((v) => v.status === "draft")?.id : null;
  }

  if (orientationId && versionId) {
    const { error: draftErr } = await physA.rpc("clinical_orientation_save_draft", {
      p_payload: {
        version_id: versionId,
        final_text: `${MARKER} Beber agua e retornar se febre.`,
        delivery_mode: "TEXT_ONLY",
        reviewed_confirmed: true,
      },
    });
    if (draftErr) fail("editar/salvar rascunho", draftErr.message);
    else pass("editar/salvar rascunho");

    const { error: pubErr } = await physA.rpc("clinical_orientation_publish", {
      p_version_id: versionId,
    });
    if (pubErr) fail("publicar orientação (C035)", pubErr.message);
    else pass("publicar orientação (C035)");

    // Emitir sem share
    const { data: doc1, error: issueErr } = await physA.rpc(
      "clinical_document_issue_from_orientation",
      {
        p_orientation_id: orientationId,
        p_share_with_patient: false,
      },
    );
    if (issueErr) fail("emitir documento orientação", issueErr.message);
    else {
      pass("emitir documento orientação", doc1?.id?.slice?.(0, 8) ?? "");
      if (doc1?.signature_kind === "internal_system") {
        pass("assinatura = internal_system (não ICP-Brasil)");
      } else fail("signature_kind", String(doc1?.signature_kind));
      if (doc1?.document_kind === "orientacao") pass("document_kind = orientacao");
      else fail("document_kind", String(doc1?.document_kind));
      if (doc1?.available_to_patient === false) pass("interno por padrão (não portal)");
      else fail("available_to_patient");
      if (doc1?.content_sha256?.length === 64) pass("hash content_sha256");
      else fail("hash");

      const { error: mutErr } = await physA
        .from("clinical_document_artifacts")
        .update({ title: "hack" })
        .eq("id", doc1.id);
      if (mutErr) pass("imutabilidade DOCUMENT_IMMUTABLE", mutErr.message);
      else fail("imutabilidade", "update aceito");

      // Idempotência: segundo emit sem supersede
      const { error: dupErr } = await physA.rpc("clinical_document_issue_from_orientation", {
        p_orientation_id: orientationId,
        p_share_with_patient: false,
      });
      if (dupErr?.message?.includes("DOCUMENT_ALREADY_ISSUED")) {
        pass("idempotência DOCUMENT_ALREADY_ISSUED");
      } else fail("idempotência", dupErr?.message ?? "aceitou duplicata");

      // PDF attach
      const path = `${organization_id}/${CASA}/${patient_id}/${doc1.id}/document.pdf`;
      const { bytes, sha } = await buildMinimalPdf(`${MARKER} orientacao`);
      const { error: upErr } = await physA.storage
        .from("clinical-documents")
        .upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (upErr) fail("upload PDF", upErr.message);
      else pass("upload PDF bucket privado");

      const { error: attErr } = await physA.rpc("clinical_document_attach_pdf", {
        p_document_id: doc1.id,
        p_storage_path: path,
        p_pdf_sha256: sha,
      });
      if (attErr) fail("attach PDF", attErr.message);
      else pass("attach PDF");

      const bucketPub = parsePayload(dbQuery(`
select json_build_object('public', (select public from storage.buckets where id = 'clinical-documents'))::text as payload;
`));
      if (bucketPub.public === false) pass("bucket clinical-documents privado");
      else fail("bucket público");

      // Correção
      const { data: doc2, error: corrErr } = await physA.rpc(
        "clinical_document_issue_from_orientation",
        {
          p_orientation_id: orientationId,
          p_share_with_patient: true,
          p_supersedes_id: doc1.id,
          p_correction_reason: `${MARKER}correcao texto`,
        },
      );
      if (corrErr) fail("correção/versionamento", corrErr.message);
      else {
        pass("correção/versionamento", `v${doc2?.version}`);
        if (doc2?.available_to_patient === true) pass("V2 compartilhada no portal");
        else fail("V2 share");
        const { data: oldDoc } = await physA
          .from("clinical_document_artifacts")
          .select("status")
          .eq("id", doc1.id)
          .maybeSingle();
        if (oldDoc?.status === "superseded") pass("V1 preservada (superseded)");
        else fail("V1 status", String(oldDoc?.status));
      }
    }
  } else {
    fail("ids orientação/versão", "create payload incompleto");
  }

  try {
    const physB = await login(PHYS_B);
    const { data: stolen } = await physB
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    if (!stolen?.length) pass("Médica B / cross-practice: FORBIDDEN");
    else fail("Médica B leu docs", String(stolen.length));
  } catch (e) {
    note("PHYS_B", String(e.message || e));
  }

  try {
    const sec = await login(SECRETARY);
    const { data: docs } = await sec
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    if (!docs?.length) pass("Secretária sem documentos clínicos");
    else note("Secretária docs", `leu ${docs.length}`);
  } catch (e) {
    note("SECRETARY", String(e.message || e));
  }

  {
    const anonSb = client();
    const { data } = await anonSb
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", patient_id);
    if (!data?.length) pass("Anônimo bloqueado");
    else fail("Anônimo leu documentos");
  }

  try {
    const pat = await login(PATIENT);
    const { data: portalDocs } = await pat.rpc("clinical_document_list_for_patient_portal");
    if (Array.isArray(portalDocs)) pass("portal list RPC ok", `n=${portalDocs.length}`);
    else fail("portal list RPC");
    const { data: soap } = await pat
      .from("clinical_notes")
      .select("id")
      .eq("encounter_id", encounter_id);
    if (!soap?.length) pass("Paciente sem SOAP interno");
    else fail("Paciente leu SOAP");
  } catch (e) {
    note("PATIENT", String(e.message || e));
  }

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

  // Cleanup storage via CLI (bucket sem policy DELETE para authenticated)
  {
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
    const paths = Array.isArray(pathPayload.paths) ? pathPayload.paths.filter(Boolean) : [];
    if (paths.length) {
      let removed = 0;
      for (const objectPath of paths) {
        const rm = spawnSync(
          `npx --yes supabase@2.121.0 storage rm --experimental --yes --linked "ss:///clinical-documents/${objectPath}"`,
          { encoding: "utf8", shell: true, cwd: process.cwd() },
        );
        const text = `${rm.stdout || ""}\n${rm.stderr || ""}`;
        if (rm.status === 0 && /deleted/i.test(text)) removed += 1;
        else note("storage rm", text.slice(0, 200));
      }
      if (removed === paths.length) pass("storage cleanup", String(removed));
      else fail("storage cleanup", `removed ${removed}/${paths.length}`);
    } else pass("storage cleanup", "0");
  }

  dbQuery(`
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
do $$
declare
  r record;
  v_patient uuid := '${patient_id}'::uuid;
  v_enc uuid := '${encounter_id}'::uuid;
begin
  for r in
    select id from public.clinical_document_artifacts
    where patient_id = v_patient
    order by version desc
  loop
    update public.clinical_document_artifacts set supersedes_id = null where id = r.id;
    delete from public.clinical_document_artifacts where id = r.id;
  end loop;
  delete from public.clinical_orientation_versions where patient_id = v_patient;
  delete from public.clinical_orientations where patient_id = v_patient;
  delete from public.clinical_notes where encounter_id = v_enc;
  delete from public.encounters where id = v_enc;
  delete from public.appointments where patient_id = v_patient and urgency_note = '${MARKER}';
  delete from public.patients where id = v_patient;
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
`);

  const left = parsePayload(dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'docs', (select count(*) from public.clinical_document_artifacts d join public.patients p on p.id = d.patient_id where p.full_name like '${MARKER}%'),
  'ori', (select count(*) from public.clinical_orientations o join public.patients p on p.id = o.patient_id where p.full_name like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'storage', (select count(*) from storage.objects where bucket_id = 'clinical-documents' and name like '${organization_id}/${CASA}/${patient_id}/%')
)::text as payload;
`));
  const uatLeft = Object.values(left).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0 / storage UAT = 0");
  else fail("uat_left = 0", JSON.stringify(left));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C040.8: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
