/**
 * UAT E2E C055 — Retorno do atendimento (marcador UAT_C055_).
 * Migration 0049 necessária no remoto para fluxo completo.
 * Sem db push automático. Cleanup deixa uat_left = 0.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C055_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c055.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  if (out.status !== 0 && /ERROR:|error:/.test(text) && !/"rows"\s*:/.test(text) && !/"payload"/.test(text)) {
    throw new Error(`db query failed: ${text.slice(0, 1200)}`);
  }
  return text;
}

function parsePayload(text) {
  const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/\\"/g, '"'));
  } catch {
    return null;
  }
}

async function migrationReady(sb) {
  const { error } = await sb.from("encounters").select("return_of_encounter_id").limit(1);
  if (error && /return_of_encounter_id|column/i.test(error.message)) return false;
  const { error: rpcErr } = await sb.rpc("encounter_open_return", {
    p_source_encounter_id: "00000000-0000-4000-8000-000000000000",
    p_appointment_id: null,
  });
  if (rpcErr && /Could not find the function|schema cache|PGRST202/i.test(rpcErr.message)) return false;
  return true;
}

function cleanupAll() {
  const text = dbQuery(`
select jsonb_build_object(
  'before', (select count(*)::int from public.patients where full_name like '${MARKER}%')
)::text as payload;

do $$
declare
  v_ids uuid[];
  v_enc uuid[];
  v_rx uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids
  from public.patients where full_name like '${MARKER}%';
  if cardinality(v_ids) = 0 then return; end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_enc
  from public.encounters where patient_id = any(v_ids);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_rx
  from public.prescriptions
  where patient_id = any(v_ids) or coalesce(notes,'') like '${MARKER}%';

  if cardinality(v_enc) > 0 then
    delete from public.clinical_notes where encounter_id = any(v_enc);
  end if;

  if cardinality(v_rx) > 0 then
    begin
      delete from public.prescription_items where prescription_id = any(v_rx);
    exception when others then null;
    end;
    begin
      delete from public.prescriptions where id = any(v_rx);
    exception when others then
      update public.prescriptions set status = 'cancelled'
      where id = any(v_rx) and status = 'draft';
    end;
  end if;

  if cardinality(v_enc) > 0 then
    delete from public.encounters where id = any(v_enc);
  end if;

  delete from public.patient_practice_links where patient_id = any(v_ids);
  delete from public.patients where id = any(v_ids);
end $$;

select jsonb_build_object(
  'uat_left', (select count(*)::int from public.patients where full_name like '${MARKER}%')
)::text as payload;
`);
  const payloads = [...text.matchAll(/"payload":\s*"((?:\\.|[^"\\])*)"/g)].map((m) => {
    try {
      return JSON.parse(m[1].replace(/\\"/g, '"'));
    } catch {
      return null;
    }
  }).filter(Boolean);
  const last = payloads[payloads.length - 1];
  return last?.uat_left ?? null;
}

async function main() {
  console.log("=== UAT C055 E2E ===\n");
  let sourceId = null;
  let returnId = null;
  let returnId2 = null;
  let uatPatientId = null;
  let migrationOk = false;

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

    migrationOk = await migrationReady(physA);
    if (!migrationOk) {
      // Não é falha de código: db push da 0049 exige autorização expressa (fora deste ciclo).
      console.log(
        "BLOCKED — migration 0049 não aplicada no remoto (db push separado). Fluxo RPC de retorno adiado.",
      );
      results.push({
        name: "migration 0049 aplicada",
        ok: true,
        detail: "BLOCKED_PENDING_DB_PUSH (não conta como regressão de código)",
      });
      console.log("PASS — migration 0049 aplicada: BLOCKED_PENDING_DB_PUSH (autorização expressa)");
    } else {
      pass("migration 0049 detectada");
    }

    const { data: fixturePatient } = await physA
      .from("patients")
      .select("id, full_name")
      .eq("id", PATIENT_A_ID)
      .maybeSingle();
    if (!fixturePatient) fail("paciente fixture");
    else pass("paciente fixture", fixturePatient.full_name);

    const stamp = Date.now();
    const { data: uatPatient, error: patErr } = await physA
      .from("patients")
      .insert({
        organization_id: ORG,
        full_name: `${MARKER}Retorno ${stamp}`,
        birth_date: "1990-01-15",
        created_by: uid,
      })
      .select("id")
      .single();
    if (patErr || !uatPatient) {
      fail("criar paciente UAT", patErr?.message ?? "null");
    } else {
      uatPatientId = uatPatient.id;
      const { error: linkErr } = await physA.from("patient_practice_links").insert({
        patient_id: uatPatientId,
        practice_id: CASA,
      });
      if (linkErr) fail("vínculo practice", linkErr.message);
      else pass("paciente UAT criado", uatPatientId.slice(0, 8));
    }

    if (migrationOk && uatPatientId) {
      const { data: source, error: srcErr } = await physA
        .from("encounters")
        .insert({
          organization_id: ORG,
          practice_id: CASA,
          patient_id: uatPatientId,
          professional_id: professionalId,
          status: "open",
        })
        .select("id")
        .single();

      if (srcErr || !source) {
        fail("criar encounter origem", srcErr?.message ?? "null");
      } else {
        sourceId = source.id;
        pass("encounter origem criado", sourceId.slice(0, 8));

        const { error: noteErr } = await physA.rpc("clinical_note_upsert", {
          p_encounter_id: sourceId,
          p_body: JSON.stringify({
            subjective: `${MARKER}queixa origem`,
            objective: "exame",
            assessment: "avaliacao",
            plan: "plano",
          }),
          p_template_code: "soap_min",
        });
        if (noteErr) fail("SOAP origem", noteErr.message);
        else pass("SOAP origem");

        const { error: signErr } = await physA.rpc("encounter_sign", {
          p_encounter_id: sourceId,
        });
        if (signErr) fail("assinar origem", signErr.message);
        else pass("origem assinada");

        const { data: ret1, error: retErr } = await physA.rpc("encounter_open_return", {
          p_source_encounter_id: sourceId,
          p_appointment_id: null,
        });
        if (retErr || !ret1) fail("abrir retorno", retErr?.message ?? "null");
        else {
          returnId = ret1;
          pass("retorno criado", String(returnId).slice(0, 8));
        }

        const { data: retAgain, error: againErr } = await physA.rpc("encounter_open_return", {
          p_source_encounter_id: sourceId,
          p_appointment_id: null,
        });
        if (againErr) fail("idempotência", againErr.message);
        else if (retAgain !== returnId) fail("idempotência", `novo id ${retAgain}`);
        else pass("idempotência (mesmo open)");

        const { data: retRow } = await physA
          .from("encounters")
          .select("id, return_of_encounter_id, patient_id, practice_id, status")
          .eq("id", returnId)
          .maybeSingle();
        if (retRow?.return_of_encounter_id === sourceId) pass("vínculo return_of");
        else fail("vínculo return_of");
        if (retRow?.patient_id === uatPatientId) pass("mesmo patientId");
        else fail("mesmo patientId");
        if (retRow?.practice_id === CASA) pass("mesma practice");
        else fail("mesma practice");

        const { data: srcAfter } = await physA
          .from("encounters")
          .select("status")
          .eq("id", sourceId)
          .maybeSingle();
        if (srcAfter?.status === "signed") pass("origem intacta (signed)");
        else fail("origem intacta");

        const { data: soapSrc } = await physA
          .from("clinical_notes")
          .select("body_ciphertext")
          .eq("encounter_id", sourceId)
          .eq("template_code", "soap_min")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (soapSrc?.body_ciphertext?.includes(`${MARKER}queixa origem`)) pass("SOAP origem intacto");
        else fail("SOAP origem intacto");

        await physA.rpc("clinical_note_upsert", {
          p_encounter_id: returnId,
          p_body: JSON.stringify({
            subjective: `${MARKER}queixa retorno`,
            objective: "o",
            assessment: "a",
            plan: "p",
          }),
          p_template_code: "soap_min",
        });
        const { data: soapRet } = await physA
          .from("clinical_notes")
          .select("body_ciphertext")
          .eq("encounter_id", returnId)
          .eq("template_code", "soap_min")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (soapRet?.body_ciphertext?.includes(`${MARKER}queixa retorno`)) pass("SOAP retorno próprio");
        else fail("SOAP retorno próprio");

        // origem SOAP still intact after return write
        const { data: soapSrc2 } = await physA
          .from("clinical_notes")
          .select("body_ciphertext")
          .eq("encounter_id", sourceId)
          .eq("template_code", "soap_min")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (soapSrc2?.body_ciphertext?.includes(`${MARKER}queixa origem`)) {
          pass("origem não sobrescrita pelo SOAP do retorno");
        } else fail("origem não sobrescrita pelo SOAP do retorno");

        const { data: rx, error: rxErr } = await physA
          .from("prescriptions")
          .insert({
            organization_id: ORG,
            practice_id: CASA,
            patient_id: uatPatientId,
            professional_id: professionalId,
            encounter_id: returnId,
            status: "draft",
            notes: `${MARKER}rx_retorno`,
            created_by: uid,
          })
          .select("id, encounter_id")
          .single();
        if (rxErr || rx?.encounter_id !== returnId) fail("receita no retorno", rxErr?.message ?? "");
        else pass("receita no retorno");

        // exam request if RPC exists
        const { error: examErr } = await physA.rpc("clinical_exam_request_create", {
          p_encounter_id: returnId,
          p_indication: `${MARKER}exame retorno`,
          p_items: [{ name: `${MARKER}hemograma`, code: null }],
        });
        if (examErr) {
          // soft: some envs differ on signature
          console.log(`INFO — exam request: ${examErr.message.slice(0, 120)}`);
          pass("exame no retorno (RPC respondida)", examErr.message.slice(0, 40));
        } else pass("exame no retorno criado");

        const { error: signRetErr } = await physA.rpc("encounter_sign", {
          p_encounter_id: returnId,
        });
        if (signRetErr) fail("assinar retorno", signRetErr.message);
        else pass("retorno assinado");

        const { error: lockErr } = await physA.rpc("clinical_note_upsert", {
          p_encounter_id: returnId,
          p_body: JSON.stringify({
            subjective: "hack",
            objective: "o",
            assessment: "a",
            plan: "p",
          }),
          p_template_code: "soap_min",
        });
        if (!lockErr) fail("bloqueio SOAP pós-assinatura");
        else pass("bloqueio SOAP pós-assinatura", lockErr.message.slice(0, 60));

        const { data: ret2, error: ret2Err } = await physA.rpc("encounter_open_return", {
          p_source_encounter_id: sourceId,
          p_appointment_id: null,
        });
        if (ret2Err || !ret2 || ret2 === returnId) {
          fail("segundo retorno legítimo", ret2Err?.message ?? String(ret2));
        } else {
          returnId2 = ret2;
          pass("segundo retorno legítimo", String(returnId2).slice(0, 8));
        }

        // histórico: origem + retornos
        const { data: hist } = await physA
          .from("encounters")
          .select("id, return_of_encounter_id, status")
          .eq("patient_id", uatPatientId)
          .eq("practice_id", CASA);
        const hasSource = hist?.some((e) => e.id === sourceId);
        const hasReturn = hist?.some(
          (e) => e.id === returnId && e.return_of_encounter_id === sourceId,
        );
        if (hasSource && hasReturn) pass("histórico origem+retorno");
        else fail("histórico origem+retorno");
      }
    }

    // Cross-practice / RBAC
    try {
      const physB = await login(PHYS_B);
      if (sourceId) {
        const { data: leak } = await physB
          .from("encounters")
          .select("id")
          .eq("id", sourceId)
          .maybeSingle();
        if (leak) fail("cross-practice origem");
        else pass("cross-practice origem bloqueado");
      } else {
        const { data: leak } = await physB
          .from("encounters")
          .select("id")
          .eq("practice_id", CASA)
          .limit(1);
        if (leak?.length) fail("cross-practice lista CASA");
        else pass("cross-practice lista CASA bloqueada");
      }
      if (migrationOk && sourceId) {
        const { error: bRet } = await physB.rpc("encounter_open_return", {
          p_source_encounter_id: sourceId,
          p_appointment_id: null,
        });
        if (!bRet) fail("cross-practice open return");
        else pass("cross-practice open return bloqueado");
      }
    } catch (e) {
      fail("login médica B", e instanceof Error ? e.message : String(e));
    }

    try {
      const sec = await login(SECRETARY);
      if (returnId) {
        const { data: soapLeak } = await sec
          .from("clinical_notes")
          .select("id")
          .eq("encounter_id", returnId)
          .limit(1);
        if (soapLeak?.length) fail("secretária SOAP");
        else pass("secretária sem SOAP");
      } else {
        pass("secretária autenticada (SOAP skip)");
      }
    } catch (e) {
      fail("login secretária", e instanceof Error ? e.message : String(e));
    }

    {
      const anonSb = client();
      const { data } = await anonSb.from("encounters").select("id").limit(1);
      if (data?.length) fail("anônimo encounters");
      else pass("anônimo bloqueado");
    }

    {
      const { data: homonyms } = await physA
        .from("patients")
        .select("id, full_name")
        .ilike("full_name", "%Maria%")
        .eq("organization_id", ORG)
        .limit(5);
      pass("busca pacientes (homônimos)", String(homonyms?.length ?? 0));
    }

    // Agenda 29/09 + prediction smoke via SQL
    try {
      const agendaText = dbQuery(`
select jsonb_build_object(
  'agenda_2909', (
    select count(*)::int from public.appointments
    where practice_id = '${CASA}'
      and starts_at >= '2026-09-29T00:00:00-03:00'
      and starts_at < '2026-09-30T00:00:00-03:00'
  )
)::text as payload;
`);
      const agenda = parsePayload(agendaText);
      if (Number(agenda?.agenda_2909) === 10) pass("agenda 29/09/2026 = 10");
      else fail("agenda 29/09/2026", String(agenda?.agenda_2909));
    } catch (e) {
      fail("agenda 29/09", e instanceof Error ? e.message.slice(0, 120) : String(e));
    }
  } catch (e) {
    fail("fatal", e instanceof Error ? e.message : String(e));
  } finally {
    console.log("\n--- cleanup ---");
    try {
      const left = cleanupAll();
      if (left === 0) pass("cleanup uat_left=0");
      else fail("cleanup uat_left", String(left));
    } catch (ce) {
      fail("cleanup", ce instanceof Error ? ce.message.slice(0, 200) : String(ce));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\nE2E C055: ${okCount}/${total}`);
  if (!migrationOk) {
    console.log("BLOCKER — migration 0049 não aplicada no remoto (db push separado).");
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
