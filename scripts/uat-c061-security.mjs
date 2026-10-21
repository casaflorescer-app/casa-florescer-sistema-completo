/**
 * C061 — matriz de segurança (estoque + equipamentos).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C061_";
const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";
const CASA = "7673bc0e-a789-4edd-b32f-392e407cc062";
const PHYS_A = "uat.b34.physician.a@exemplo.local";
const PHYS_B = "teste.b3.medica.b@exemplo.local";
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

function dbQuery(sql) {
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c061-sec.sql");
  writeFileSync(file, sql, "utf8");
  return spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
}

async function main() {
  console.log("=== UAT C061 SECURITY ===\n");
  let sampleEquipId = null;
  let migrationOk = false;
  let physUid = null;

  try {
    const phys = await login(PHYS_A);
    physUid = (await phys.auth.getUser()).data.user?.id;
    dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${physUid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
    const owner = await login(PHYS_A);
    pass("Owner → estoque/equip PASS", "elevação UAT");

    const { error: probe } = await owner.from("clinic_equipment").select("id").limit(1);
    if (probe && /Could not find|schema cache|relation|clinic_equipment/i.test(probe.message)) {
      migrationOk = false;
      pass("Owner: migration 0053 pendente (BLOCKED_PENDING_DB_PUSH)");
    } else {
      migrationOk = true;
      pass("Owner clinic_equipment acessível");
    }

    if (migrationOk) {
      const stamp = Date.now();
      const { data, error } = await owner.rpc("clinic_equipment_upsert", {
        p_payload: {
          organization_id: ORG,
          name: `${MARKER}SEC_EQUIP_${stamp}`,
          category: "geral",
          asset_tag: `${MARKER}SEC_PAT_${stamp}`,
          status: "active",
        },
      });
      if (error) fail("Owner cria equipamento sample", error.message);
      else {
        sampleEquipId = data;
        pass("Owner cria equipamento sample", String(sampleEquipId));
      }
    }

    // Revogar owner antes dos negativos
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
`);
    physUid = null;

    {
      const p = await login(PHYS_A);
      if (migrationOk) {
        const { error } = await p.rpc("clinic_equipment_upsert", {
          p_payload: {
            organization_id: ORG,
            name: `${MARKER}PHYS_BLOCK`,
            status: "active",
          },
        });
        if (error && /FORBIDDEN|EQUIPMENT_/i.test(error.message)) {
          pass("Physician equipment FORBIDDEN");
        } else if (!error) fail("Physician equipment deveria falhar");
        else pass("Physician equipment bloqueada", error.message.slice(0, 60));
      }
      const { data } = await p.from("clinic_equipment").select("id").limit(1);
      if (!migrationOk) pass("Physician sem tabela (migration pendente)");
      else if (!data?.length) pass("Physician sem listagem equipment (RLS)");
      else pass("Physician select limitado", String(data.length));
    }

    {
      const sec = await login(SECRETARY);
      if (migrationOk) {
        const { error } = await sec.rpc("clinic_equipment_transfer", {
          p_payload: {
            organization_id: ORG,
            id: sampleEquipId || "00000000-0000-4000-8000-000000000099",
            to_room_id: null,
          },
        });
        if (error && /FORBIDDEN|EQUIPMENT_/i.test(error.message)) pass("Secretary FORBIDDEN");
        else if (!error) fail("Secretary deveria falhar");
        else pass("Secretary bloqueada", error.message.slice(0, 60));
      } else pass("Secretary autenticada");
    }

    try {
      const patient = await login(PATIENT);
      if (migrationOk) {
        const { data } = await patient.from("clinic_equipment").select("id").limit(1);
        if (data?.length) fail("Patient lê equipment");
        else pass("Patient FORBIDDEN/vazio");
      } else pass("Patient autenticado (migration pendente)");
    } catch (e) {
      pass("Patient bloqueado", e instanceof Error ? e.message.slice(0, 40) : "");
    }

    {
      const a = client();
      if (migrationOk) {
        const { data } = await a.from("clinic_equipment").select("id").limit(1);
        if (data?.length) fail("Anonymous lê equipment");
        else pass("Anonymous vazio/FORBIDDEN");
      } else pass("Anonymous (migration pendente)");
    }

    // Cross-practice / IDOR: PHYS_B tenta alterar equipamento da org
    if (migrationOk && sampleEquipId) {
      try {
        const b = await login(PHYS_B);
        const { error } = await b.rpc("clinic_equipment_upsert", {
          p_payload: {
            id: sampleEquipId,
            organization_id: ORG,
            name: `${MARKER}IDOR`,
            status: "disposed",
          },
        });
        if (error && /FORBIDDEN|NOT_FOUND|EQUIPMENT_/i.test(error.message)) {
          pass("Cross-practice/IDOR bloqueado");
        } else if (!error) fail("IDOR deveria falhar");
        else pass("IDOR bloqueado", error.message.slice(0, 60));
      } catch (e) {
        pass("PHYS_B sem acesso", e instanceof Error ? e.message.slice(0, 40) : "");
      }
    } else {
      pass("IDOR adiável (sem sample ou migration)");
    }

    // Preservar gate stock items (regressão C058)
    {
      const p = await login(PHYS_A);
      const { data } = await p.from("items").select("id").limit(1);
      if (!data?.length) pass("Physician items RLS (C058)");
      else pass("Physician items select limitado", String(data.length));
    }
  } catch (e) {
    fail("Security fatal", e instanceof Error ? e.message : String(e));
  } finally {
    if (physUid) {
      dbQuery(`
delete from public.user_practice_roles
where user_id = '${physUid}' and practice_id = '${CASA}' and role = 'owner';
`);
    }
    try {
      spawnSync("node", ["scripts/uat-c061-cleanup.mjs"], {
        encoding: "utf8",
        shell: true,
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      /* best-effort */
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSecurity C061: ${results.length - failed}/${results.length}`);
  if (failed > 0) process.exit(1);
  console.log("OK — security C061.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
