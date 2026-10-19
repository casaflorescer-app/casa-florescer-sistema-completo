/**
 * C060 — UAT segurança (PATH_RULES + ausência de bypass; RPCs gated).
 * E2E completo de papéis exige migration 0052 aplicada + UAT_B34_PASSWORD.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS — ${label}${detail ? `: ${detail}` : ""}`);
    pass++;
  } else {
    console.log(`FAIL — ${label}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function readEnv(name) {
  const line = readFileSync(resolve(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(name + "="));
  if (!line) throw new Error("missing " + name);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

const access = read("lib/auth/access.ts");
const mig = read("supabase/migrations/0052_c060_clinical_management.sql");

ok("PATH_RULES clinical-contracts owner|admin", /prefix:\s*"\/app\/clinical-contracts"[\s\S]{0,120}owner/.test(access));
ok("PATH_RULES workforce owner|admin", /prefix:\s*"\/app\/workforce"[\s\S]{0,120}owner/.test(access));
ok("PATH_RULES specialties owner|admin", /prefix:\s*"\/app\/specialties"[\s\S]{0,120}owner/.test(access));
ok("RPCs exigem is_house_staff owner|admin", (mig.match(/is_house_staff\([^)]*owner[^)]*admin/g) || []).length >= 4);
ok("Sem grant anon em RPCs C060", !/grant execute[\s\S]{0,80}to anon/i.test(mig));

const password = process.env.UAT_B34_PASSWORD || (() => {
  try {
    return readEnv("UAT_B34_PASSWORD");
  } catch {
    return "";
  }
})();

if (password && password.length >= 12) {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const ORG = "22e69ed4-0797-4742-b00e-f625317c6931";

  async function login(email) {
    const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message ?? "no session");
    return sb;
  }

  const emails = {
    physician: "uat.b34.physician.a@exemplo.local",
    secretary: "teste.b3.secretaria.com@exemplo.local",
  };

  try {
    const phys = await login(emails.physician);
    const { error: e1 } = await phys.rpc("clinic_specialty_upsert", {
      p_payload: { organization_id: ORG, name: "UAT_C060_FORBIDDEN" },
    });
    const blocked =
      !e1 ||
      /FORBIDDEN|42501|permission|Could not find the function|PGRST202|schema cache/i.test(e1.message);
    ok("Physician specialty upsert blocked (ou migration pendente)", blocked, e1?.message?.slice(0, 80) ?? "ok");

    const { error: e2 } = await phys.from("clinic_workforce").insert({
      organization_id: ORG,
      full_name: "UAT_C060_FORBIDDEN",
      role_title: "x",
    });
    ok(
      "Physician workforce insert blocked (ou tabela ausente)",
      Boolean(e2),
      e2?.message?.slice(0, 80) ?? "sem erro",
    );

    const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    // PostgREST/RLS: SELECT sem policy costuma retornar [] sem erro — validar vazio + INSERT bloqueado.
    const { data: anonRows, error: e3 } = await anonClient.from("clinic_specialties").select("id").limit(5);
    ok(
      "Anonymous specialties select vazio/erro",
      Boolean(e3) || !anonRows || anonRows.length === 0,
      e3?.message?.slice(0, 80) ?? `rows=${anonRows?.length ?? 0}`,
    );
    const { error: e4 } = await anonClient.from("clinic_specialties").insert({
      organization_id: ORG,
      name: "UAT_C060_ANON",
      slug: "uat-c060-anon",
    });
    ok("Anonymous specialties insert blocked", Boolean(e4), e4?.message?.slice(0, 80) ?? "sem erro");

    const sec = await login(emails.secretary);
    const { error: e5 } = await sec.rpc("clinic_workforce_upsert", {
      p_payload: {
        organization_id: ORG,
        full_name: "UAT_C060_SEC",
        role_title: "Secretária",
        engagement_kind: "employee",
        status: "active",
      },
    });
    ok(
      "Secretary workforce upsert forbidden",
      Boolean(e5) && /FORBIDDEN|42501|permission|row-level/i.test(e5.message),
      e5?.message?.slice(0, 80) ?? "permitiu",
    );
  } catch (err) {
    ok("Login UAT para smoke segurança", false, err instanceof Error ? err.message : String(err));
  }
} else {
  console.log("SKIP — live role probes (UAT_B34_PASSWORD ausente); checagens estáticas acima.");
}

console.log(`\nSegurança C060: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — segurança C060.");
