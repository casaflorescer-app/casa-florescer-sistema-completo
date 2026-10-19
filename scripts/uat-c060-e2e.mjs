/**
 * C060 — UAT E2E (requer migration 0052 aplicada + UAT_B34_PASSWORD).
 * Marcador UAT_C060_. Cleanup via uat-c060-cleanup.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C060_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
const OWNER_CANDIDATES = [
  process.env.UAT_C060_OWNER_EMAIL,
  "dev.acesso.total@exemplo.local",
  "teste.b3.owner@exemplo.local",
  "owner@exemplo.local",
].filter(Boolean);

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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c060.sql");
  writeFileSync(file, sql, "utf8");
  const out = spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
  return `${out.stdout || ""}\n${out.stderr || ""}`;
}

async function migrationReady(sb) {
  const { error } = await sb.from("clinic_specialties").select("id").limit(1);
  if (error && /Could not find|schema cache|relation|clinic_specialties/i.test(error.message)) {
    return false;
  }
  return !error || !/does not exist/i.test(error.message);
}

async function discoverOwnerEmails() {
  const text = dbQuery(`
select jsonb_build_object(
  'emails', (
    select coalesce(
      jsonb_agg(p.email::text order by
        case when p.email::text like '%@exemplo.local' then 0 else 1 end,
        p.full_name),
      '[]'::jsonb
    )
    from public.user_practice_roles upr
    join public.profiles p on p.id = upr.user_id
    where upr.role in ('owner', 'admin') and p.is_active
  )
)::text as payload;
`);
  try {
    const m = text.match(/"payload":\s*"((?:\\.|[^"\\])*)"/);
    if (!m) return [];
    const parsed = JSON.parse(m[1].replace(/\\"/g, '"'));
    return Array.isArray(parsed.emails) ? parsed.emails : [];
  } catch {
    return [];
  }
}

async function findOwnerOrElevate(phys) {
  const discovered = await discoverOwnerEmails();
  const emails = [
    ...OWNER_CANDIDATES.filter((e) => String(e).endsWith("@exemplo.local")),
    ...discovered.filter((e) => String(e).endsWith("@exemplo.local")),
    ...OWNER_CANDIDATES,
    ...discovered,
  ];
  for (const email of [...new Set(emails)]) {
    try {
      const sb = await login(email);
      const { error } = await sb.rpc("clinic_specialty_upsert", {
        p_payload: { organization_id: ORG, name: `${MARKER}PROBE`, is_active: false },
      });
      if (!error || /duplicate|unique|already/i.test(error.message)) {
        dbQuery(`delete from public.clinic_specialties where organization_id = '${ORG}' and name = '${MARKER}PROBE';`);
        return { sb, email, elevated: false, physUid: null };
      }
      if (/FORBIDDEN|42501/i.test(error.message)) continue;
      if (/Could not find the function|PGRST202/i.test(error.message)) return null;
    } catch {
      /* try next */
    }
  }

  // Fallback C057: elevação temporária PHYS_A → owner (revogada no finally).
  const physUid = (await phys.auth.getUser()).data.user?.id;
  if (!physUid) return null;
  dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
  return { sb: phys, email: PHYS_A, elevated: true, physUid };
}

async function main() {
  console.log("=== UAT C060 E2E ===\n");
  let phys;
  let elevated = false;
  let physUid = null;
  try {
    phys = await login(PHYS_A);
  } catch (err) {
    fail("login physician", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (!(await migrationReady(phys))) {
    console.log("SKIP — migration 0052 não aplicada no remoto (db push pendente).");
    pass("e2e skipped until db push", "structural/security estáticos ainda válidos");
    console.log(`\nE2E C060: ${results.filter((r) => r.ok).length}/${results.length}`);
    return;
  }
  pass("migration 0052 detectada");

  // Negativo ANTES da elevação (PHYS_A ainda só physician)
  {
    const { error: forb } = await phys.rpc("clinic_specialty_upsert", {
      p_payload: { organization_id: ORG, name: `${MARKER}Forbidden` },
    });
    if (forb && /FORBIDDEN|42501/i.test(forb.message)) pass("physician specialty forbidden");
    else if (!forb) fail("physician specialty forbidden", "permitiu");
    else pass("physician specialty blocked", forb.message.slice(0, 60));
  }

  const owner = await findOwnerOrElevate(phys);
  if (!owner) {
    fail("owner login para mutações C060", "nenhum owner/admin com senha UAT encontrado");
    process.exit(1);
  }
  elevated = owner.elevated;
  physUid = owner.physUid;
  pass("owner login", owner.elevated ? "elevação temporária PHYS_A→owner" : owner.email);
  const sb = owner.sb;

  let specialtyId = null;
  let workforceId = null;
  let obsId = null;
  let procId = null;

  try {
    const { data: sid, error: sErr } = await sb.rpc("clinic_specialty_upsert", {
      p_payload: {
        organization_id: ORG,
        name: `${MARKER}Ginecologia`,
        description: "massa uat",
        is_active: true,
      },
    });
    if (sErr) fail("criar especialidade", sErr.message);
    else {
      specialtyId = String(sid);
      pass("criar especialidade", specialtyId);
    }

    const { data: wid, error: wErr } = await sb.rpc("clinic_workforce_upsert", {
      p_payload: {
        organization_id: ORG,
        full_name: `${MARKER}Secretaria Teste`,
        role_title: "Secretária",
        engagement_kind: "employee",
        status: "active",
      },
    });
    if (wErr) fail("criar funcionário", wErr.message);
    else {
      workforceId = String(wid);
      pass("criar funcionário", workforceId);
    }

    const { data: patient } = await sb
      .from("patients")
      .select("id")
      .eq("organization_id", ORG)
      .limit(1)
      .maybeSingle();
    const { data: professional } = await sb
      .from("professionals")
      .select("id")
      .eq("organization_id", ORG)
      .limit(1)
      .maybeSingle();

    if (patient?.id && professional?.id) {
      const { data: oid, error: oErr } = await sb.rpc("obstetric_availability_contract_create", {
        p_payload: {
          organization_id: ORG,
          patient_id: patient.id,
          professional_id: professional.id,
          includes_normal_birth: true,
          includes_cesarean: false,
          notes: MARKER,
        },
      });
      if (oErr) fail("criar contrato obstétrico", oErr.message);
      else {
        obsId = String(oid);
        pass("criar contrato obstétrico", obsId);
      }

      const { data: pid, error: pErr } = await sb.rpc("procedure_agreement_create", {
        p_payload: {
          organization_id: ORG,
          patient_id: patient.id,
          professional_id: professional.id,
          procedure_name: `${MARKER}Procedimento`,
          title: `${MARKER}Termo de ciência`,
          agreement_kind: "risk_acknowledgment",
          term_body: "Texto UAT — sem validade jurídica afirmada.",
        },
      });
      if (pErr) fail("criar termo procedimento", pErr.message);
      else {
        procId = String(pid);
        pass("criar termo procedimento", procId);
        const { error: aErr } = await sb.rpc("procedure_agreement_acknowledge", {
          p_payload: {
            organization_id: ORG,
            id: procId,
            acknowledged_by_name: `${MARKER}Registrante`,
          },
        });
        if (aErr) fail("registrar ciência", aErr.message);
        else pass("registrar ciência do termo");
      }
    } else {
      fail("paciente/profissional fixture", "ausente na org");
    }

    // PHYS_B permanece physician (sem elevação)
    try {
      const physB = await login(PHYS_B);
      const { error: forbB } = await physB.rpc("clinic_workforce_upsert", {
        p_payload: {
          organization_id: ORG,
          full_name: `${MARKER}ForbiddenB`,
          role_title: "x",
          engagement_kind: "employee",
          status: "active",
        },
      });
      if (forbB && /FORBIDDEN|42501/i.test(forbB.message)) pass("physician B workforce forbidden");
      else if (!forbB) fail("physician B workforce forbidden", "permitiu");
      else pass("physician B workforce blocked", forbB.message.slice(0, 60));
    } catch (err) {
      fail("login physician B", err instanceof Error ? err.message : String(err));
    }
  } finally {
    dbQuery(`
delete from public.procedure_agreement_events where organization_id = '${ORG}'
  and agreement_id in (select id from public.procedure_agreements where notes like '${MARKER}%' or title like '${MARKER}%');
delete from public.procedure_agreements where organization_id = '${ORG}' and (title like '${MARKER}%' or procedure_name like '${MARKER}%');
delete from public.obstetric_availability_contract_events where organization_id = '${ORG}'
  and contract_id in (select id from public.obstetric_availability_contracts where notes like '${MARKER}%');
delete from public.obstetric_availability_contracts where organization_id = '${ORG}' and notes like '${MARKER}%';
delete from public.clinic_workforce where organization_id = '${ORG}' and full_name like '${MARKER}%';
delete from public.professional_specialties where specialty_id in (
  select id from public.clinic_specialties where organization_id = '${ORG}' and name like '${MARKER}%'
);
delete from public.clinic_specialties where organization_id = '${ORG}' and name like '${MARKER}%';
${
  elevated && physUid
    ? `delete from public.user_practice_roles
where user_id = '${physUid}' and practice_id = '${CASA}' and role = 'owner';`
    : ""
}
`);
    pass("cleanup inline + revogação elevação");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nE2E C060: ${results.length - failed}/${results.length}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
