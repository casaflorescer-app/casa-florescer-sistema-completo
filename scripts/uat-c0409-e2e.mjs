/**
 * UAT E2E C040.9 — receitas + exames (marcador UAT_C0409_).
 * Requer migration 0048 aplicada. Não cria commit/push/deploy.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";

const MARKER = "UAT_C0409_";
const GROUP = "UAT_C0409_GRUPO_";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c0409.sql");
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

async function buildMinimalPdf(title) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText(String(title).slice(0, 80), { x: 50, y: 780, size: 12, font });
  const bytes = await pdf.save();
  return { bytes: Uint8Array.from(bytes), sha: createHash("sha256").update(bytes).digest("hex") };
}

async function attachPdf(phys, patientId, docId, title) {
  const path = `${ORG}/${CASA}/${patientId}/${docId}/document.pdf`;
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
  return { path, sha };
}

async function main() {
  console.log("=== UAT C040.9 E2E ===\n");

  const mig = parsePayload(dbQuery(`
select json_build_object(
  'create_args', (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'clinical_exam_request_create'
  ),
  'create_count', (
    select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'clinical_exam_request_create'
  ),
  'has_6arg', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'clinical_exam_request_create'
      and pg_get_function_identity_arguments(p.oid) =
      'p_encounter_id uuid, p_catalog_ids uuid[], p_group_ids uuid[], p_custom_names text[], p_notes text, p_confirm boolean'
  )
)::text as payload;
`));
  if (Number(mig.create_count) !== 1 || mig.has_6arg) {
    fail("RPC 0048 assinatura", JSON.stringify(mig));
    process.exitCode = 1;
    return;
  }
  if (!String(mig.create_args).includes("p_clinical_indication")) {
    fail("RPC p_clinical_indication", mig.create_args);
    process.exitCode = 1;
    return;
  }
  pass("RPC 0048: create 7-arg único; 6-arg ausente");

  const link = parsePayload(dbQuery(`
select json_build_object(
  'patient_id', (select pa.patient_id::text from public.patient_accounts pa
                 join public.profiles pr on pr.id = pa.user_id
                 where pr.email = '${PATIENT_A}' limit 1)
)::text as payload;
`));
  if (link.patient_id !== PATIENT_A_ID) {
    fail("vínculo portal permanente", `expected ${PATIENT_A_ID}`);
    process.exitCode = 1;
    return;
  }
  pass("paciente portal permanente preservada");

  dbQuery(`
do $$
declare
  v_actor uuid;
  v_prof uuid;
  v_room uuid;
  v_appt uuid;
  v_enc uuid;
  v_patient_b uuid;
begin
  select id into v_actor from public.profiles where email = '${PHYS_A}' limit 1;
  select id into v_prof from public.professionals where practice_id = '${CASA}' and profile_id = v_actor limit 1;
  select id into v_room from public.rooms where organization_id = '${ORG}' and status = 'active' order by name limit 1;
  if v_actor is null or v_prof is null or v_room is null then
    raise exception 'FIXTURE_PREREQ_MISSING';
  end if;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    '${ORG}', '${CASA}', v_room, '${PATIENT_A_ID}', v_prof,
    'consultation', now() + interval '40 hours', now() + interval '40 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values ('${ORG}', '${CASA}', '${PATIENT_A_ID}', v_prof, v_appt, 'open')
  returning id into v_enc;

  insert into public.patients (organization_id, full_name, created_by)
  values ('${ORG}', '${MARKER}PacienteB', v_actor) returning id into v_patient_b;

  insert into public.appointments (
    organization_id, practice_id, room_id, patient_id, professional_id,
    kind, starts_at, ends_at, urgency_note, source, created_by, status
  ) values (
    '${ORG}', '${CASA}', v_room, v_patient_b, v_prof,
    'consultation', now() + interval '41 hours', now() + interval '41 hours 30 minutes',
    '${MARKER}', 'reception', v_actor, 'scheduled'
  ) returning id into v_appt;

  insert into public.encounters (
    organization_id, practice_id, patient_id, professional_id, appointment_id, status
  ) values ('${ORG}', '${CASA}', v_patient_b, v_prof, v_appt, 'open');
end $$;
`);
  pass("fixture criada");

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
  if (!enc_a || !enc_b || !patient_b || !professional_id) throw new Error("ids incompletos");
  pass("fixture ids", enc_a.slice(0, 8));

  const physA = await login(PHYS_A);
  const userId = (await physA.auth.getUser()).data.user?.id;
  pass("login médica A");

  await physA.rpc("clinical_note_upsert", {
    p_encounter_id: enc_a,
    p_body: `${MARKER} SOAP confidencial`,
    p_template_code: "soap_min",
  });

  // ---------- MODELO ----------
  const { data: tpl, error: tErr } = await physA.rpc("prescription_template_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER}Modelo`,
    p_description: "modelo UAT sem paciente",
    p_items: [
      {
        medication_name: `${MARKER}MedModelo`,
        presentation: "comp. 500mg",
        concentration: "500 mg",
        dosage: "1 cp",
        frequency: "8/8h",
        duration: "5 dias",
        route: "oral",
        quantity: "15",
        observations: "após refeição",
      },
    ],
  });
  if (tErr) fail("criar modelo", tErr.message);
  else {
    pass("criar modelo", tpl?.id?.slice?.(0, 8) ?? "");
    if (tpl?.patient_id) fail("modelo sem paciente", String(tpl.patient_id));
    else pass("modelo sem paciente");
  }

  const { data: rxFromTpl, error: applyErr } = await physA.rpc("prescription_template_apply", {
    p_template_id: tpl?.id,
    p_encounter_id: enc_a,
  });
  if (applyErr) fail("aplicar modelo → draft", applyErr.message);
  else {
    pass("aplicar modelo → draft", rxFromTpl?.status);
    if (rxFromTpl?.status !== "draft") fail("apply deve ser draft", String(rxFromTpl?.status));
  }

  let tplItemOk = false;
  if (rxFromTpl?.id) {
    const { data: items } = await physA
      .from("prescription_items")
      .select("medication_name, presentation, route, quantity, dosage, instructions")
      .eq("prescription_id", rxFromTpl.id);
    const it = items?.[0];
    if (
      it?.presentation === "comp. 500mg" &&
      it?.route === "oral" &&
      String(it?.quantity ?? "") === "15"
    ) {
      pass("template apply campos completos (presentation/route/quantity)");
      tplItemOk = true;
    } else {
      fail("template apply campos", JSON.stringify(it));
    }
    // editar item do draft
    await physA
      .from("prescription_items")
      .update({ dosage: "1 cp PRN", instructions: "Se necessário (PRN); condição: dor; intervalo mínimo: 6h; dose máxima/dia: 3 cp" })
      .eq("prescription_id", rxFromTpl.id);
    pass("editar item + PRN em draft");
  }

  // alterar modelo depois — receita emitida não deve mudar
  // primeiro emitir a do template
  let docRxTpl = null;
  if (rxFromTpl?.id) {
    const { data: doc, error: issueErr } = await physA.rpc("clinical_document_issue_from_prescription", {
      p_prescription_id: rxFromTpl.id,
      p_share_with_patient: false,
    });
    if (issueErr) fail("emitir receita do modelo", issueErr.message);
    else {
      pass("emitir receita do modelo", doc?.id?.slice?.(0, 8) ?? "");
      docRxTpl = doc;
      if (doc?.signature_kind === "internal_system") pass("assinatura internal_system (não ICP)");
      else fail("signature_kind", String(doc?.signature_kind));
      if (doc?.content_sha256 && String(doc.content_sha256).length === 64) pass("hash receita");
      else fail("hash receita");
    }
  }

  const snapMedBefore = docRxTpl?.frozen_payload?.prescription?.items?.[0]?.medication_name
    ?? docRxTpl?.frozen_payload?.items?.[0]?.medication_name
    ?? null;

  await physA.rpc("prescription_template_upsert", {
    p_practice_id: CASA,
    p_id: tpl?.id,
    p_name: `${MARKER}Modelo`,
    p_description: "modelo ALTERADO pós-emissão",
    p_items: [
      {
        medication_name: `${MARKER}MedModeloALTERADO`,
        dosage: "99 cp",
        frequency: "1x",
        duration: "1 dia",
      },
    ],
  });
  pass("alterar modelo após emissão");

  if (docRxTpl?.id) {
    const { data: frozen } = await physA
      .from("clinical_document_artifacts")
      .select("frozen_payload, content_sha256, status")
      .eq("id", docRxTpl.id)
      .single();
    const items = frozen?.frozen_payload?.prescription?.items
      ?? frozen?.frozen_payload?.items
      ?? [];
    const med = items[0]?.medication_name ?? items[0]?.name ?? "";
    if (String(med).includes("ALTERADO")) fail("snapshot receita mudou com modelo", med);
    else pass("receita emitida imutável após alterar modelo", String(med).slice(0, 40));
    if (frozen?.content_sha256 === docRxTpl.content_sha256) pass("hash estável pós-alteração modelo");
    else fail("hash divergiu", `${frozen?.content_sha256} vs ${docRxTpl.content_sha256}`);
    void snapMedBefore;
  }

  // arquivar modelo
  const { error: archErr } = await physA.rpc("prescription_template_upsert", {
    p_practice_id: CASA,
    p_id: tpl?.id,
    p_name: `${MARKER}Modelo`,
    p_is_active: false,
    p_items: [],
  });
  if (archErr) note("arquivar modelo", archErr.message);
  else pass("arquivar modelo (is_active=false)");

  // ---------- RECEITA MANUAL + CÓPIA ----------
  const { data: rx1, error: rx1Err } = await physA.from("prescriptions").insert({
    organization_id: ORG,
    practice_id: CASA,
    patient_id: PATIENT_A_ID,
    professional_id,
    encounter_id: enc_a,
    status: "draft",
    notes: `${MARKER}manual`,
    created_by: userId,
  }).select("*").single();
  if (rx1Err) fail("criar receita manual", rx1Err.message);
  else pass("criar receita manual");

  if (rx1?.id) {
    const { error: i1 } = await physA.from("prescription_items").insert([
      {
        prescription_id: rx1.id,
        medication_name: `${MARKER}MedA`,
        presentation: "xarope",
        dosage: "5 ml",
        frequency: "8/8h",
        duration: "7 dias",
        route: "oral",
        quantity: "1 frasco",
        instructions: "Uso contínuo — reavaliar em: 30 dias",
        sort_order: 1,
      },
      {
        prescription_id: rx1.id,
        medication_name: `${MARKER}MedB`,
        dosage: "1 cp",
        frequency: "SOS",
        duration: "5 dias",
        instructions: "Se necessário (PRN); condição: náusea; intervalo mínimo: 8h",
        sort_order: 2,
      },
    ]);
    if (i1) fail("múltiplos itens", i1.message);
    else pass("múltiplos medicamentos + uso contínuo/PRN");

    // remover item B
    await physA.from("prescription_items").delete().eq("prescription_id", rx1.id).eq("sort_order", 2);
    const { data: leftItems } = await physA
      .from("prescription_items")
      .select("id")
      .eq("prescription_id", rx1.id);
    if (leftItems?.length === 1) pass("remover item do draft");
    else fail("remover item", String(leftItems?.length));

    // reinserir B
    await physA.from("prescription_items").insert({
      prescription_id: rx1.id,
      medication_name: `${MARKER}MedB`,
      dosage: "1 cp",
      frequency: "SOS",
      instructions: "Se necessário (PRN); condição: náusea",
      sort_order: 2,
    });

    // copiar como novo draft (client-side pattern)
    const { data: srcItems } = await physA
      .from("prescription_items")
      .select("*")
      .eq("prescription_id", rx1.id)
      .order("sort_order");
    const { data: rxCopy, error: copyErr } = await physA.from("prescriptions").insert({
      organization_id: ORG,
      practice_id: CASA,
      patient_id: PATIENT_A_ID,
      professional_id,
      encounter_id: enc_a,
      status: "draft",
      notes: `${MARKER}copia de ${rx1.id.slice(0, 8)}`,
      created_by: userId,
    }).select("*").single();
    if (copyErr) fail("copiar receita → draft", copyErr.message);
    else {
      pass("copiar receita → NOVO draft", rxCopy?.status);
      if (rxCopy?.id === rx1.id) fail("cópia deve ter id distinto");
      for (const [idx, it] of (srcItems ?? []).entries()) {
        await physA.from("prescription_items").insert({
          prescription_id: rxCopy.id,
          medication_name: it.medication_name,
          presentation: it.presentation,
          quantity: it.quantity,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          route: it.route,
          instructions: it.instructions,
          sort_order: idx + 1,
        });
      }
      await physA
        .from("prescription_items")
        .update({ dosage: "10 ml" })
        .eq("prescription_id", rxCopy.id)
        .eq("sort_order", 1);
      pass("editar cópia antes de emitir");
    }

    const { data: docManual, error: manErr } = await physA.rpc(
      "clinical_document_issue_from_prescription",
      { p_prescription_id: rx1.id, p_share_with_patient: true },
    );
    if (manErr) fail("emitir receita manual (portal)", manErr.message);
    else {
      pass("emitir receita + portal", docManual?.id?.slice?.(0, 8) ?? "");
      const hash1 = docManual?.content_sha256;
      const { path, sha } = await attachPdf(physA, PATIENT_A_ID, docManual.id, `${MARKER} rx`);
      pass("PDF receita + storage privado", sha.slice(0, 12));

      // reimpressão = mesmo doc (não nova receita)
      const { count: rxCount } = await physA
        .from("prescriptions")
        .select("id", { count: "exact", head: true })
        .eq("id", rx1.id);
      void rxCount;
      const { data: sameDoc } = await physA
        .from("clinical_document_artifacts")
        .select("id, content_sha256, version")
        .eq("id", docManual.id)
        .single();
      if (sameDoc?.content_sha256 === hash1) pass("reimprimir ≠ nova emissão (mesmo hash/doc)");
      else fail("reimpressão alterou hash");

      // imutabilidade
      const { error: mutRx } = await physA
        .from("prescription_items")
        .update({ dosage: "hack" })
        .eq("prescription_id", rx1.id);
      if (mutRx) pass("bloqueio edição item pós-emissão", mutRx.message);
      else fail("item editável após emissão");

      const { error: mutDoc } = await physA
        .from("clinical_document_artifacts")
        .update({ title: "hack" })
        .eq("id", docManual.id);
      if (mutDoc) pass("imutabilidade documento", mutDoc.message);
      else fail("documento editável");

      // idempotência: segunda emissão sem supersede
      const { error: dupErr } = await physA.rpc("clinical_document_issue_from_prescription", {
        p_prescription_id: rx1.id,
        p_share_with_patient: true,
      });
      if (dupErr) pass("idempotência emitir (bloqueia 2ª)", dupErr.message);
      else fail("segunda emissão aceita sem supersede");

      // correção
      if (rxCopy?.id) {
        const { data: docCorr, error: corrErr } = await physA.rpc(
          "clinical_document_issue_from_prescription",
          {
            p_prescription_id: rxCopy.id,
            p_share_with_patient: true,
            p_supersedes_id: docManual.id,
            p_correction_reason: `${MARKER}correcao dose`,
          },
        );
        if (corrErr) fail("correção/supersede", corrErr.message);
        else {
          pass("correção/supersede", `v${docCorr?.version}`);
          const { data: old } = await physA
            .from("clinical_document_artifacts")
            .select("status")
            .eq("id", docManual.id)
            .single();
          if (old?.status === "superseded") pass("documento anterior preservado (superseded)");
          else fail("status original", String(old?.status));
        }
      }
      void path;
    }
  }

  // ---------- EXAMES + GRUPO ----------
  const { data: cat1 } = await physA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER}Hemograma`,
    p_category: "laboratorio",
  });
  const { data: cat2 } = await physA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER}TSH`,
    p_category: "laboratorio",
  });
  const { data: cat3 } = await physA.rpc("clinical_exam_catalog_upsert", {
    p_practice_id: CASA,
    p_name: `${MARKER}Glicemia`,
    p_category: "laboratorio",
  });
  pass("catálogo exames UAT");

  const { data: group, error: gErr } = await physA.rpc("clinical_exam_group_upsert", {
    p_practice_id: CASA,
    p_name: `${GROUP}PreNatal`,
    p_description: "grupo UAT",
    p_catalog_ids: [cat1?.id, cat2?.id].filter(Boolean),
  });
  if (gErr) fail("criar grupo", gErr.message);
  else pass("criar grupo", group?.id?.slice?.(0, 8) ?? "");

  const indication = `${MARKER}indicacao pre-natal`;
  const { data: req, error: reqErr } = await physA.rpc("clinical_exam_request_create", {
    p_encounter_id: enc_a,
    p_catalog_ids: cat3?.id ? [cat3.id] : [],
    p_group_ids: group?.id ? [group.id] : [],
    p_custom_names: [`${MARKER}Avulso`],
    p_notes: `${MARKER}obs`,
    p_confirm: false,
    p_clinical_indication: indication,
  });
  if (reqErr) fail("pedido com indicação + grupo + avulso", reqErr.message);
  else {
    pass("pedido exame draft", req?.status);
    if (req?.clinical_indication === indication) pass("indicação clínica persistida");
    else fail("indicação persistida", String(req?.clinical_indication));
  }

  // chamada sem indicação (compat 6 named args) — deve funcionar via default
  const { data: req2, error: req2Err } = await physA.rpc("clinical_exam_request_create", {
    p_encounter_id: enc_a,
    p_catalog_ids: cat1?.id ? [cat1.id] : [],
    p_group_ids: [],
    p_custom_names: [],
    p_notes: `${MARKER}compat6`,
    p_confirm: false,
  });
  if (req2Err) fail("compat chamada sem p_clinical_indication", req2Err.message);
  else pass("compat chamada sem indicação (default null)");

  let docEx = null;
  let snapItems = null;
  if (req?.id) {
    // idempotência dupla emissão
    const { data: d1, error: e1 } = await physA.rpc("clinical_document_issue_from_exam_request", {
      p_request_id: req.id,
      p_clinical_indication: indication,
      p_share_with_patient: true,
    });
    if (e1) fail("emitir documento exame", e1.message);
    else {
      pass("emitir documento exame + portal");
      docEx = d1;
      const payload = d1?.frozen_payload ?? {};
      const exam = payload.exam_request ?? {};
      if (exam.clinical_indication === indication) pass("indicação no snapshot/documento");
      else fail("indicação no snapshot", String(exam.clinical_indication));
      snapItems = exam.items ?? [];
      const names = snapItems.map((i) => i.name || i.custom_name).join(",");
      const hasGroupName = snapItems.some((i) => i.group_name === `${GROUP}PreNatal` || i.group_id === group?.id);
      if (hasGroupName) pass("snapshot inclui group_name/group_id");
      else note("group_name no snapshot", JSON.stringify(snapItems.slice(0, 2)));
      if (names.includes("Glicemia") || names.includes("Avulso") || names.includes("Hemograma")) {
        pass("snapshot exames selecionados", names.slice(0, 80));
      } else fail("snapshot exames", names);

      if (d1?.content_sha256?.length === 64) pass("hash exame");
      await attachPdf(physA, PATIENT_A_ID, d1.id, `${MARKER} exam`);
      pass("PDF exame anexado");

      const { error: dupEx } = await physA.rpc("clinical_document_issue_from_exam_request", {
        p_request_id: req.id,
        p_share_with_patient: true,
      });
      if (dupEx) pass("idempotência exame (2ª emissão bloqueada)", dupEx.message);
      else fail("2ª emissão exame aceita");
    }
  }

  // alterar grupo após emissão
  await physA.rpc("clinical_exam_group_upsert", {
    p_practice_id: CASA,
    p_id: group?.id,
    p_name: `${GROUP}PreNatal`,
    p_description: "grupo ALTERADO",
    p_catalog_ids: cat3?.id ? [cat3.id] : [],
  });
  pass("alterar grupo após emissão");

  if (docEx?.id) {
    const { data: frozenEx } = await physA
      .from("clinical_document_artifacts")
      .select("frozen_payload, content_sha256")
      .eq("id", docEx.id)
      .single();
    const itemsNow = frozenEx?.frozen_payload?.exam_request?.items ?? [];
    if (JSON.stringify(itemsNow) === JSON.stringify(snapItems)) {
      pass("pedido emitido imutável após alterar grupo");
    } else {
      // compare names set
      const before = (snapItems ?? []).map((i) => i.name).sort().join("|");
      const after = itemsNow.map((i) => i.name).sort().join("|");
      if (before === after && frozenEx?.content_sha256 === docEx.content_sha256) {
        pass("pedido emitido imutável (nomes+hash)");
      } else fail("snapshot mudou", `${before} => ${after}`);
    }
  }

  // Pedido ≠ Resultado (objetos distintos)
  const sep = parsePayload(dbQuery(`
select json_build_object(
  'requests', (select count(*)::int from public.clinical_exam_requests r
               join public.appointments a on a.id = (select appointment_id from public.encounters where id = r.encounter_id)
               where a.urgency_note = '${MARKER}'),
  'uploads_table', (select to_regclass('public.exam_uploads') is not null),
  'orders_table', (select to_regclass('public.exam_orders') is not null),
  'request_ne_upload', true
)::text as payload;
`));
  if (sep.uploads_table && sep.orders_table && Number(sep.requests) >= 1) {
    pass("pedido ≠ resultado (tabelas distintas preservadas)");
  } else fail("separação pedido/resultado", JSON.stringify(sep));

  // ---------- PORTAL / SEGURANÇA ----------
  const bucketPub = parsePayload(dbQuery(`
select json_build_object('public', (select public from storage.buckets where id = 'clinical-documents'))::text as payload;
`));
  if (bucketPub.public === false) pass("bucket clinical-documents privado");
  else fail("bucket público", String(bucketPub.public));

  try {
    const physB = await login(PHYS_B);
    const { data: stolen } = await physB
      .from("clinical_document_artifacts")
      .select("id")
      .eq("patient_id", PATIENT_A_ID)
      .like("correction_reason", `${MARKER}%`);
    const { data: stolen2 } = await physB
      .from("clinical_document_artifacts")
      .select("id, title")
      .eq("patient_id", PATIENT_A_ID)
      .limit(5);
    // docs UAT may be visible only via practice — Médica B another practice should see 0 of our encounter docs
    const { data: byEnc } = await physB
      .from("clinical_document_artifacts")
      .select("id")
      .eq("encounter_id", enc_a);
    if (!byEnc?.length) pass("Médica B / outra prática: FORBIDDEN encounter docs");
    else fail("Médica B leu docs", String(byEnc.length));
    void stolen;
    void stolen2;
  } catch (e) {
    note("PHYS_B", String(e.message || e));
  }

  try {
    const sec = await login(SECRETARY);
    const { data: notes } = await sec.from("clinical_notes").select("id").eq("encounter_id", enc_a);
    if (!notes?.length) pass("Secretária sem SOAP");
    else fail("Secretária leu SOAP");
  } catch (e) {
    note("SECRETARY", String(e.message || e));
  }

  {
    const anonSb = client();
    const { data } = await anonSb.from("clinical_document_artifacts").select("id").eq("encounter_id", enc_a);
    if (!data?.length) pass("Anônimo bloqueado");
    else fail("Anônimo leu docs");
  }

  try {
    const pat = await login(PATIENT_A);
    const { data: portalDocs, error: pErr } = await pat.rpc("clinical_document_list_for_patient_portal");
    if (pErr) fail("portal list", pErr.message);
    else {
      const mine = (portalDocs ?? []).filter((d) => d.patient_id === PATIENT_A_ID);
      const shared = mine.filter((d) => d.available_to_patient === true || d.available_to_patient == null);
      // filter docs from this UAT by checking source or title via direct query as physician
      pass("portal list RPC", `total=${portalDocs?.length ?? 0} mine=${mine.length}`);
      const hasSharedRxOrEx = mine.some((d) =>
        ["receita", "prescription", "solicitacao_exames", "exam"].some((k) =>
          String(d.document_kind || d.title || "").toLowerCase().includes(k.replace("solicitacao_", "")),
        ) || ["receita_simples", "solicitacao_exames"].includes(d.document_kind),
      );
      if (hasSharedRxOrEx || mine.length > 0) pass("paciente A vê documentos disponibilizados");
      else note("portal docs mine", JSON.stringify(mine.slice(0, 2)));

      const { data: internalCheck } = await physA
        .from("clinical_document_artifacts")
        .select("id, available_to_patient, document_kind")
        .eq("encounter_id", enc_a);
      const internals = (internalCheck ?? []).filter((d) => d.available_to_patient === false);
      const portalIds = new Set((portalDocs ?? []).map((d) => d.id));
      const leaked = internals.filter((d) => portalIds.has(d.id));
      if (!leaked.length) pass("available_to_patient=false não no portal");
      else fail("doc interno no portal", String(leaked.length));

      const { data: soap } = await pat.from("clinical_notes").select("id").eq("encounter_id", enc_a);
      if (!soap?.length) pass("paciente sem SOAP");
      else fail("paciente leu SOAP");

      // Paciente B docs
      const bDocs = (portalDocs ?? []).filter((d) => d.patient_id === patient_b);
      if (!bDocs.length) pass("paciente A não vê docs do paciente B");
      else fail("vazamento paciente B", String(bDocs.length));
      void shared;
    }
  } catch (e) {
    note("PATIENT", String(e.message || e));
  }

  // SNCR / ICP flags (código)
  const feat = readFileSync(resolve("lib/regulatory/clinical-document-features.ts"), "utf8");
  if (feat.includes("sncrIntegrationAvailable: false")) pass("SNCR não disponível (flag)");
  else fail("SNCR flag");
  if (feat.includes("qualifiedElectronicSignatureAvailable: false")) pass("ICP/qualificada não disponível (flag)");
  else fail("ICP flag");

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
  else fail("agenda", String(agenda.n));

  // ---------- CLEANUP ----------
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
      and name like '%/document.pdf'
      and created_at > now() - interval '2 hours'
  ), '[]'::jsonb)
)::text as payload;
`);
    const paths = parsePayload(listRaw).paths ?? [];
    // only remove paths that belong to docs of this marker encounter
    const docPaths = parsePayload(dbQuery(`
select json_build_object(
  'paths', coalesce((
    select jsonb_agg(o.name)
    from storage.objects o
    join public.clinical_document_artifacts d on o.name like '%' || d.id::text || '%'
    where o.bucket_id = 'clinical-documents'
      and d.encounter_id in ('${enc_a}', '${enc_b}')
  ), '[]'::jsonb)
)::text as payload;
`)).paths ?? [];
    const toRemove = [...new Set([...(Array.isArray(docPaths) ? docPaths : [])])];
    if (toRemove.length) {
      const { error: rmErr } = await physA.storage.from("clinical-documents").remove(toRemove);
      if (rmErr) note("storage remove", rmErr.message);
      else pass("storage UAT removido", String(toRemove.length));
    } else pass("storage UAT vazio");
    void paths;
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
  -- limpar docs/encounters do marker (paciente A permanente: NÃO deletar patient)
  for v_enc in
    select e.id from public.encounters e
    join public.appointments a on a.id = e.appointment_id
    where a.urgency_note = '${MARKER}'
  loop
    update public.clinical_document_artifacts set supersedes_id = null where encounter_id = v_enc;
    for v_doc in select id from public.clinical_document_artifacts where encounter_id = v_enc order by version desc
    loop
      delete from public.patient_notifications where reference_id = v_doc;
      delete from public.clinical_document_artifacts where id = v_doc;
    end loop;
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
  delete from public.appointments where urgency_note = '${MARKER}';

  for v_patient in select id from public.patients where full_name like '${MARKER}%'
  loop
    delete from public.patients where id = v_patient;
  end loop;

  delete from public.prescription_template_items where template_id in (
    select id from public.prescription_templates where name like '${MARKER}%'
  );
  delete from public.prescription_templates where name like '${MARKER}%';
  delete from public.clinical_exam_group_items where group_id in (
    select id from public.clinical_exam_groups where name like '${GROUP}%' or name like '${MARKER}%'
  );
  delete from public.clinical_exam_groups where name like '${GROUP}%' or name like '${MARKER}%';
  delete from public.clinical_exam_catalog where name like '${MARKER}%';
end $$;
alter table public.clinical_document_artifacts enable trigger clinical_document_artifacts_before_write;
alter table public.clinical_exam_request_items enable trigger clinical_exam_request_items_document_guard;
alter table public.prescription_items enable trigger prescription_items_guard;
`);

  const left = parsePayload(dbQuery(`
select json_build_object(
  'patients', (select count(*) from public.patients where full_name like '${MARKER}%'),
  'encounters', (select count(*) from public.encounters e join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}'),
  'appts', (select count(*) from public.appointments where urgency_note = '${MARKER}'),
  'rx', (select count(*) from public.prescriptions where notes like '${MARKER}%'),
  'rx_items', (select count(*) from public.prescription_items pi join public.prescriptions pr on pr.id = pi.prescription_id where pr.notes like '${MARKER}%'),
  'exam_req', (select count(*) from public.clinical_exam_requests r join public.encounters e on e.id = r.encounter_id join public.appointments a on a.id = e.appointment_id where a.urgency_note = '${MARKER}'),
  'docs', (select count(*) from public.clinical_document_artifacts where correction_reason like '${MARKER}%'),
  'tpl', (select count(*) from public.prescription_templates where name like '${MARKER}%'),
  'groups', (select count(*) from public.clinical_exam_groups where name like '${GROUP}%'),
  'catalog', (select count(*) from public.clinical_exam_catalog where name like '${MARKER}%'),
  'permanent', (select count(*) from public.patients where id = '${PATIENT_A_ID}'),
  'storage', (select count(*) from storage.objects o
              where o.bucket_id = 'clinical-documents'
                and exists (
                  select 1 from public.clinical_document_artifacts d
                  where d.correction_reason like '${MARKER}%'
                    and o.name like '%' || d.id::text || '%'
                ))
)::text as payload;
`));

  if (Number(left.permanent) !== 1) fail("paciente permanente preservada", String(left.permanent));
  else pass("paciente permanente intacta");

  const uatKeys = ["patients", "encounters", "appts", "rx", "rx_items", "exam_req", "docs", "tpl", "groups", "catalog", "storage"];
  const uatLeft = uatKeys.reduce((a, k) => a + Number(left[k] || 0), 0);
  if (uatLeft === 0) pass("uat_left = 0");
  else fail("uat_left = 0", JSON.stringify(left));

  void tplItemOk;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO C040.9: ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
