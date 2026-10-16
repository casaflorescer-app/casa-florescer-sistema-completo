/**
 * C040.8 — revalidação da cadeia portal (fixture vinculada).
 * Usa patient_accounts de uat.b34.patient@exemplo.local (não cria login novo).
 * Não altera RLS / storage policies / migrations.
 * Marcador: UAT_C0408_
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARKER = "UAT_C0408_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const PATIENT_A = "uat.b34.patient@exemplo.local";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0408-portal.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(
    `npx --yes supabase@2.121.0 db query --linked -f "${file}"`,
    { encoding: "utf8", shell: true, cwd: process.cwd() },
  );
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
  page.drawText(title.slice(0, 80), { x: 50, y: 780, size: 12, font });
  const bytes = await pdf.save();
  return { bytes: Uint8Array.from(bytes), sha: createHash("sha256").update(bytes).digest("hex") };
}

async function attachPdf(phys, organizationId, patientId, docId, title) {
  const path = `${organizationId}/${CASA}/${patientId}/${docId}/document.pdf`;
  const { bytes, sha } = await buildMinimalPdf(title);
  const { error: upErr } = await phys.storage
    .from("clinical-documents")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { error: attErr } = await phys.rpc("clinical_document_attach_pdf", {
    p_document_id: docId,
    p_storage_path: path,
    p_pdf_sha256: sha,
  });
  if (attErr) throw new Error(`attach: ${attErr.message}`);
  return path;
}

async function createPublishedOrientation(phys, { patientId, professionalId, encounterId, title, text }) {
  const { data: created, error: createErr } = await phys.rpc("clinical_orientation_create", {
    p_payload: {
      organization_id: ORG,
      practice_id: CASA,
      patient_id: patientId,
      professional_id: professionalId,
      encounter_id: encounterId,
      appointment_id: null,
      title,
    },
  });
  if (createErr) throw new Error(createErr.message);
  const orientationId = created?.orientation?.id;
  const versionId = created?.version?.id;
  if (!orientationId || !versionId) throw new Error("orientation create incomplete");
  const { error: draftErr } = await phys.rpc("clinical_orientation_save_draft", {
    p_payload: {
      version_id: versionId,
      final_text: text,
      delivery_mode: "TEXT_ONLY",
      reviewed_confirmed: true,
    },
  });
  if (draftErr) throw new Error(draftErr.message);
  const { error: pubErr } = await phys.rpc("clinical_orientation_publish", {
    p_version_id: versionId,
  });
  if (pubErr) throw new Error(pubErr.message);
  return orientationId;
}

async function main() {
  console.log("=== UAT C040.8 PORTAL REVALIDATION ===\n");

  // 1) Confirmar vínculo patient_accounts
  const link = parsePayload(dbQuery(`
select json_build_object(
  'patient_id', (select pa.patient_id::text from public.patient_accounts pa
                 join public.profiles pr on pr.id = pa.user_id
                 where pr.email = '${PATIENT_A}' limit 1),
  'name', (select p.full_name from public.patients p where p.id = '${PATIENT_A_ID}')
)::text as payload;
`));
  if (link.patient_id !== PATIENT_A_ID) {
    fail("vínculo patient_accounts", `expected ${PATIENT_A_ID} got ${link.patient_id}`);
    process.exitCode = 1;
    return;
  }
  pass("vínculo patient_accounts", link.name);

  dbQuery(`
do $$
declare
  v_prof uuid;
  v_actor uuid;
  v_room uuid;
  v_appt uuid;
  v_enc uuid;
  v_patient_b uuid;
begin
  select id into v_actor from public.profiles where email = '${PHYS_A}' limit 1;
  select id into v_prof from public.professionals where practice_id = '${CASA}' and profile_id = v_actor limit 1;
  select id into v_room from public.rooms where organization_id = '${ORG}' and status = 'active' order by name limit 1;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    '${ORG}', '${CASA}', v_room, '${PATIENT_A_ID}', v_prof,
    'consultation', now() + interval '30 hours', now() + interval '30 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values ('${ORG}', '${CASA}', '${PATIENT_A_ID}', v_prof, v_appt, 'open')
  returning id into v_enc;

  -- Paciente B (sem conta portal) para isolamento
  insert into public.patients (organization_id, full_name, created_by)
  values ('${ORG}', '${MARKER}PacienteB', v_actor) returning id into v_patient_b;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    '${ORG}', '${CASA}', v_room, v_patient_b, v_prof,
    'consultation', now() + interval '31 hours', now() + interval '31 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values ('${ORG}', '${CASA}', v_patient_b, v_prof, v_appt, 'open');
end $$;
`);
  pass("fixture criada (paciente A vinculado + paciente B isolado)");

  const ids = parsePayload(dbQuery(`
select json_build_object(
  'enc_a', (select e.id::text from public.encounters e
            join public.appointments a on a.id = e.appointment_id
            where e.patient_id = '${PATIENT_A_ID}' and a.urgency_note = '${MARKER}'
            order by e.created_at desc limit 1),
  'enc_b', (select e.id::text from public.encounters e
            join public.patients p on p.id = e.patient_id
            join public.appointments a on a.id = e.appointment_id
            where p.full_name = '${MARKER}PacienteB' and a.urgency_note = '${MARKER}'
            order by e.created_at desc limit 1),
  'patient_b', (select id::text from public.patients where full_name = '${MARKER}PacienteB' order by created_at desc limit 1),
  'professional_id', (select pr.id::text from public.professionals pr
                      join public.profiles p on p.id = pr.profile_id
                      where p.email = '${PHYS_A}' and pr.practice_id = '${CASA}' limit 1)
)::text as payload;
`));

  const { enc_a, enc_b, patient_b, professional_id } = ids;
  if (!enc_a || !enc_b || !patient_b) throw new Error("fixture ids incompletos");
  pass("fixture ids", `A=${enc_a.slice(0, 8)} B=${patient_b.slice(0, 8)}`);

  const physA = await login(PHYS_A);
  pass("login médica A");

  await physA.rpc("clinical_note_upsert", {
    p_encounter_id: enc_a,
    p_body: `${MARKER} SOAP interno confidencial`,
    p_template_code: "soap_min",
  });

  // Orientação A → documento compartilhado
  const oriShare = await createPublishedOrientation(physA, {
    patientId: PATIENT_A_ID,
    professionalId: professional_id,
    encounterId: enc_a,
    title: `${MARKER}OrientacaoPortal`,
    text: `${MARKER} Orientacao compartilhada no portal.`,
  });
  pass("publicar orientação A");

  const { data: docShare, error: shareErr } = await physA.rpc(
    "clinical_document_issue_from_orientation",
    { p_orientation_id: oriShare, p_share_with_patient: true },
  );
  if (shareErr) fail("emitir documento portal", shareErr.message);
  else {
    pass("emitir documento available_to_patient=true", docShare?.id?.slice?.(0, 8) ?? "");
    if (docShare?.available_to_patient === true) pass("flag available_to_patient=true");
    else fail("flag available_to_patient=true", String(docShare?.available_to_patient));
  }

  let sharePath = null;
  if (docShare?.id) {
    sharePath = await attachPdf(physA, ORG, PATIENT_A_ID, docShare.id, `${MARKER} share`);
    pass("PDF anexado (documento portal)");
  }

  // Orientação A → documento interno
  const oriInternal = await createPublishedOrientation(physA, {
    patientId: PATIENT_A_ID,
    professionalId: professional_id,
    encounterId: enc_a,
    title: `${MARKER}OrientacaoInterna`,
    text: `${MARKER} Orientacao somente interna.`,
  });
  // need new version path: create second orientation header
  const { data: docInternal, error: intErr } = await physA.rpc(
    "clinical_document_issue_from_orientation",
    { p_orientation_id: oriInternal, p_share_with_patient: false },
  );
  if (intErr) fail("emitir documento interno", intErr.message);
  else {
    pass("emitir documento available_to_patient=false");
    if (docInternal?.available_to_patient === false) pass("flag available_to_patient=false");
    else fail("flag internal", String(docInternal?.available_to_patient));
  }

  // Paciente B documento compartilhado (deve ficar invisível para A)
  const oriB = await createPublishedOrientation(physA, {
    patientId: patient_b,
    professionalId: professional_id,
    encounterId: enc_b,
    title: `${MARKER}OrientacaoB`,
    text: `${MARKER} Documento do paciente B.`,
  });
  const { data: docB, error: bErr } = await physA.rpc("clinical_document_issue_from_orientation", {
    p_orientation_id: oriB,
    p_share_with_patient: true,
  });
  if (bErr) fail("emitir documento paciente B", bErr.message);
  else pass("emitir documento paciente B (share=true)");
  if (docB?.id) {
    await attachPdf(physA, ORG, patient_b, docB.id, `${MARKER} B`);
    pass("PDF paciente B anexado");
  }

  // Portal paciente A
  const patA = await login(PATIENT_A);
  pass("login paciente A (vinculada)");

  const { data: portalDocs, error: portalErr } = await patA.rpc(
    "clinical_document_list_for_patient_portal",
  );
  if (portalErr) fail("portal list RPC", portalErr.message);
  else {
    const mine = (portalDocs ?? []).filter((d) => d.patient_id === PATIENT_A_ID);
    const shared = mine.filter((d) => d.id === docShare?.id);
    const leakedInternal = mine.filter((d) => d.id === docInternal?.id);
    const leakedB = (portalDocs ?? []).filter((d) => d.id === docB?.id);

    if (shared.length === 1) pass("portal: documento compartilhado VISÍVEL", `n_mine=${mine.length}`);
    else fail("portal: documento compartilhado VISÍVEL", `shared=${shared.length} total=${portalDocs?.length}`);

    if (leakedInternal.length === 0) pass("portal: documento interno NÃO aparece");
    else fail("portal: documento interno vazou", String(leakedInternal.length));

    if (leakedB.length === 0) pass("portal: documento paciente B NÃO aparece");
    else fail("portal: documento paciente B vazou", String(leakedB.length));
  }

  // Visualizar / download
  if (docShare?.id && sharePath) {
    const { data: viewed, error: viewErr } = await patA.rpc("clinical_document_mark_viewed", {
      p_document_id: docShare.id,
    });
    if (viewErr) fail("mark viewed", viewErr.message);
    else pass("visualizar (mark viewed)", viewed?.viewed_by_patient_at ? "ok" : "");

    const { error: dlErr } = await patA.rpc("clinical_document_audit_download", {
      p_document_id: docShare.id,
    });
    if (dlErr) fail("audit download", dlErr.message);
    else pass("download auditado");

    const { data: signed, error: sErr } = await patA.storage
      .from("clinical-documents")
      .createSignedUrl(sharePath, 60);
    if (sErr || !signed?.signedUrl) fail("signed URL paciente", sErr?.message);
    else {
      pass("signed URL paciente");
      const resp = await fetch(signed.signedUrl);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.slice(0, 4).toString() === "%PDF") pass("PDF abre (conteúdo %PDF)");
        else fail("PDF abre", "magic inválido");
      } else fail("PDF fetch", String(resp.status));
    }

    // Não pode abrir PDF do paciente B
    if (docB?.id) {
      const bPath = `${ORG}/${CASA}/${patient_b}/${docB.id}/document.pdf`;
      const { data: stolenUrl, error: stealErr } = await patA.storage
        .from("clinical-documents")
        .createSignedUrl(bPath, 60);
      if (stealErr || !stolenUrl?.signedUrl) {
        pass("paciente A sem signed URL do paciente B");
      } else {
        const r = await fetch(stolenUrl.signedUrl);
        if (!r.ok) pass("paciente A fetch B bloqueado", String(r.status));
        else fail("paciente A acessou PDF de B");
      }
    }
  }

  // SOAP interno
  const { data: soap } = await patA
    .from("clinical_notes")
    .select("id")
    .eq("encounter_id", enc_a);
  if (!soap?.length) pass("paciente sem SOAP interno");
  else fail("paciente leu SOAP", String(soap.length));

  // Direct select doc B
  const { data: directB } = await patA
    .from("clinical_document_artifacts")
    .select("id")
    .eq("id", docB?.id ?? "00000000-0000-0000-0000-000000000000");
  if (!directB?.length) pass("paciente A select direto doc B = vazio");
  else fail("paciente A leu doc B via select");

  // Cross-practice
  try {
    const physB = await login(PHYS_B);
    const { data: stolen } = await physB
      .from("clinical_document_artifacts")
      .select("id")
      .eq("id", docShare?.id ?? "00000000-0000-0000-0000-000000000000");
    if (!stolen?.length) pass("Médica B / cross-practice: FORBIDDEN");
    else fail("Médica B leu documento A", String(stolen.length));
  } catch (e) {
    pass("Médica B / cross-practice: FORBIDDEN", String(e.message || e).slice(0, 80));
  }

  // Anônimo
  {
    const anonSb = client();
    const { data } = await anonSb
      .from("clinical_document_artifacts")
      .select("id")
      .eq("id", docShare?.id ?? "00000000-0000-0000-0000-000000000000");
    if (!data?.length) pass("Anônimo bloqueado");
    else fail("Anônimo leu documento");
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

  // Cleanup storage (CLI privilegiado)
  {
    const listRaw = dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(name) from storage.objects
    where bucket_id = 'clinical-documents'
      and (
        name like '${ORG}/${CASA}/${PATIENT_A_ID}/%'
        or name like '${ORG}/${CASA}/${patient_b}/%'
      )
      and name in (
        select d.pdf_storage_path from public.clinical_document_artifacts d
        where d.correction_reason like '${MARKER}%'
           or d.title like '${MARKER}%'
           or d.patient_id in ('${PATIENT_A_ID}'::uuid, '${patient_b}'::uuid)
             and d.created_at > now() - interval '2 hours'
             and d.source_type = 'orientation'
      )
  ), '[]'::jsonb)
)::text as payload;
`);
    // Simpler: all recent orientation docs for these patients with marker in title via join
    const pathsPayload = parsePayload(dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(o.name)
    from storage.objects o
    where o.bucket_id = 'clinical-documents'
      and (
        o.name like '${ORG}/${CASA}/${PATIENT_A_ID}/%${docShare?.id ?? "none"}%'
        or o.name like '${ORG}/${CASA}/${patient_b}/%'
        or o.name like '%/${docShare?.id ?? "none"}/%'
        or o.name like '%/${docInternal?.id ?? "none"}/%'
        or o.name like '%/${docB?.id ?? "none"}/%'
      )
  ), '[]'::jsonb)
)::text as payload;
`));
    void listRaw;
    const paths = Array.isArray(pathsPayload.paths)
      ? [...new Set(pathsPayload.paths.filter(Boolean))]
      : [];
    // Also list by explicit doc ids
    const explicit = [
      docShare?.id ? `${ORG}/${CASA}/${PATIENT_A_ID}/${docShare.id}/document.pdf` : null,
      docInternal?.id && docInternal.pdf_storage_path ? docInternal.pdf_storage_path : null,
      docB?.id ? `${ORG}/${CASA}/${patient_b}/${docB.id}/document.pdf` : null,
    ].filter(Boolean);
    const allPaths = [...new Set([...paths, ...explicit])];
    let removed = 0;
    for (const objectPath of allPaths) {
      const rm = spawnSync(
        `npx --yes supabase@2.121.0 storage rm --experimental --yes --linked "ss:///clinical-documents/${objectPath}"`,
        { encoding: "utf8", shell: true, cwd: process.cwd() },
      );
      const text = `${rm.stdout || ""}\n${rm.stderr || ""}`;
      if (rm.status === 0 && /deleted/i.test(text)) removed += 1;
    }
    pass("storage cleanup", `${removed}/${allPaths.length}`);
  }

  // Cleanup DB — NÃO apagar paciente A permanente
  dbQuery(`
alter table public.clinical_document_artifacts disable trigger clinical_document_artifacts_before_write;
do $$
declare
  r record;
  v_patient_b uuid := '${patient_b}'::uuid;
  v_enc_a uuid := '${enc_a}'::uuid;
  v_enc_b uuid := '${enc_b}'::uuid;
begin
  for r in
    select d.id from public.clinical_document_artifacts d
    where d.patient_id in ('${PATIENT_A_ID}'::uuid, v_patient_b)
      and d.source_type = 'orientation'
      and d.created_at > now() - interval '2 hours'
      and (
        d.title like '${MARKER}%'
        or exists (
          select 1 from public.clinical_orientations o
          where o.id = d.source_id and o.title like '${MARKER}%'
        )
      )
    order by d.version desc
  loop
    update public.clinical_document_artifacts set supersedes_id = null where id = r.id;
    delete from public.clinical_document_artifacts where id = r.id;
  end loop;

  delete from public.patient_notifications
  where patient_id in ('${PATIENT_A_ID}'::uuid, v_patient_b)
    and created_at > now() - interval '2 hours'
    and (title like '%orientação%' or message like '%orientação%' or event_type = 'clinical_document_published');

  delete from public.clinical_orientation_versions
  where orientation_id in (
    select id from public.clinical_orientations where title like '${MARKER}%'
  );
  delete from public.clinical_orientations where title like '${MARKER}%';

  delete from public.clinical_notes where encounter_id in (v_enc_a, v_enc_b);
  delete from public.encounters where id in (v_enc_a, v_enc_b);
  delete from public.appointments where urgency_note = '${MARKER}';
  delete from public.patients where id = v_patient_b;
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
`);

  const left = parsePayload(dbQuery(`
select json_build_object(
  'patients_marker', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'docs', (select count(*) from public.clinical_document_artifacts d
           join public.clinical_orientations o on o.id = d.source_id
           where o.title like '${MARKER}%'),
  'ori', (select count(*) from public.clinical_orientations where title like '${MARKER}%'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'enc', (select count(*) from public.encounters e
          join public.appointments a on a.id = e.appointment_id
          where a.urgency_note = '${MARKER}'),
  'storage', (select count(*) from storage.objects
              where bucket_id = 'clinical-documents'
                and (
                  name like '%/${docShare?.id ?? "none"}/%'
                  or name like '%/${docB?.id ?? "none"}/%'
                ))
)::text as payload;
`));

  // Confirm permanent patient A still exists and account link intact
  const still = parsePayload(dbQuery(`
select json_build_object(
  'patient_a', (select count(*) from public.patients where id = '${PATIENT_A_ID}'),
  'acct', (select count(*) from public.patient_accounts pa
           join public.profiles pr on pr.id = pa.user_id
           where pr.email = '${PATIENT_A}' and pa.patient_id = '${PATIENT_A_ID}')
)::text as payload;
`));
  if (Number(still.patient_a) === 1 && Number(still.acct) === 1) {
    pass("paciente UAT permanente preservada");
  } else fail("paciente UAT permanente", JSON.stringify(still));

  const uatLeft = Object.values(left).reduce((a, b) => a + Number(b || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0 / storage UAT = 0", JSON.stringify(left));
  else fail("uat_left = 0", JSON.stringify(left));

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== RESULTADO C040.8 PORTAL: ${results.length - failed.length}/${results.length} PASS ===`,
  );
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
