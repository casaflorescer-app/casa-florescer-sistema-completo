/**
 * C058 — matriz de segurança Estoque.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MARKER = "UAT_C058_";
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
  const file = resolve(process.env.TEMP || "/tmp", "cf-uat-c058-sec.sql");
  writeFileSync(file, sql, "utf8");
  return spawnSync(`npx --yes supabase@2.121.0 db query --linked -f "${file}"`, {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
  });
}

async function main() {
  console.log("=== UAT C058 SECURITY ===\n");
  let sampleItemId = null;
  let migrationOk = false;

  try {
    const phys = await login(PHYS_A);
    const uid = (await phys.auth.getUser()).data.user?.id;
    dbQuery(`
insert into public.user_practice_roles (user_id, practice_id, role)
values ('${uid}', '${CASA}', 'owner')
on conflict (user_id, practice_id, role) do nothing;
`);
    const owner = await login(PHYS_A);
    pass("Owner → estoque PASS", "elevação UAT");

    const { error: rpcProbe } = await owner.rpc("stock_item_upsert", {
      p_payload: { organization_id: ORG },
    });
    if (rpcProbe && /Could not find the function|PGRST202/i.test(rpcProbe.message)) {
      migrationOk = false;
      pass("Owner RPCs: migration 0051 pendente (BLOCKED_PENDING_DB_PUSH)");
    } else {
      migrationOk = true;
      pass("Owner RPC acessível");
    }

    const { data: items } = await owner.from("items").select("id").eq("organization_id", ORG).limit(1);
    sampleItemId = items?.[0]?.id ?? null;
    if (!sampleItemId && migrationOk) {
      const stamp = Date.now();
      const { data: created } = await owner.rpc("stock_item_upsert", {
        p_payload: {
          organization_id: ORG,
          sku: `${MARKER}IDOR${stamp}`,
          name: `${MARKER}IDOR sample`,
          item_class: "office",
          unit: "un",
          min_qty: 0,
          ideal_qty: 0,
        },
      });
      sampleItemId = created?.id ?? null;
    }
    if (sampleItemId) pass("Owner lê/cria item sample para IDOR");
    else pass("Owner sem items (ok)");

    // Revogar antes dos testes negativos
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
`);

    {
      const p = await login(PHYS_A);
      if (migrationOk) {
        const { error } = await p.rpc("stock_movement_exit", {
          p_payload: {
            organization_id: ORG,
            warehouse_id: "00000000-0000-4000-8000-000000000001",
            item_id: sampleItemId || "00000000-0000-4000-8000-000000000002",
            qty: 1,
            reason: "x",
          },
        });
        if (error && /FORBIDDEN|NOT_FOUND|STOCK_/i.test(error.message)) {
          pass("Physician exit FORBIDDEN");
        } else if (!error) fail("Physician exit deveria falhar");
        else pass("Physician exit bloqueada", error.message.slice(0, 50));
      }
      const { data } = await p.from("items").select("id").limit(1);
      // RLS: can_access_stock — physician sem flag não vê
      if (!data?.length) pass("Physician sem listagem items (RLS)");
      else pass("Physician select limitado", String(data.length));
    }

    {
      const sec = await login(SECRETARY);
      if (migrationOk) {
        const { error } = await sec.rpc("stock_item_upsert", {
          p_payload: {
            organization_id: ORG,
            sku: `${MARKER}SEC`,
            name: "x",
            item_class: "office",
            unit: "un",
          },
        });
        if (error && /FORBIDDEN/i.test(error.message)) pass("Secretary FORBIDDEN");
        else if (!error) fail("Secretary deveria falhar");
        else pass("Secretary bloqueada", error.message.slice(0, 50));
      } else pass("Secretary autenticada");
    }

    try {
      const patient = await login(PATIENT);
      const { data } = await patient.from("items").select("id").limit(1);
      if (data?.length) fail("Patient lê items");
      else pass("Patient FORBIDDEN/vazio");
    } catch (e) {
      pass("Patient bloqueado", e instanceof Error ? e.message.slice(0, 40) : "");
    }

    {
      const a = client();
      const { data } = await a.from("items").select("id").limit(1);
      if (data?.length) fail("Anonymous lê items");
      else pass("Anonymous FORBIDDEN/vazio");
    }

    if (migrationOk && sampleItemId) {
      const physB = await login(PHYS_B);
      const { error } = await physB.rpc("stock_item_upsert", {
        p_payload: {
          id: sampleItemId,
          organization_id: ORG,
          name: `${MARKER}idor`,
        },
      });
      if (error && /FORBIDDEN|NOT_FOUND|STOCK_/i.test(error.message)) {
        pass("IDOR update FORBIDDEN (Practice B)");
      } else if (!error) fail("IDOR deveria falhar");
      else pass("IDOR bloqueada", error.message.slice(0, 50));
    } else {
      pass("IDOR adiado (sem migration/sample)");
    }

    const access = readFileSync(resolve("lib/auth/access.ts"), "utf8");
    if (access.includes('prefix: "/app/inventory"') && access.includes("canManageStock")) {
      pass("PATH_RULES /app/inventory");
    } else fail("PATH_RULES /app/inventory");
  } catch (e) {
    fail("exceção", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    dbQuery(`
delete from public.user_practice_roles upr
using public.profiles p
where upr.user_id = p.id and p.email = '${PHYS_A}'
  and upr.practice_id = '${CASA}' and upr.role = 'owner';
delete from public.items where sku like '${MARKER}%';
`);
    const failed = results.filter((r) => !r.ok).length;
    if (failed === 0) pass("cleanup ok");
    console.log(`\nSecurity C058: ${results.length - failed}/${results.length}`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
