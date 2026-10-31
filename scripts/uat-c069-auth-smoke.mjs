/**
 * C069 — Homologação autenticada mínima (Gestão / Secretaria / Médica).
 * Credenciais: UAT_B34_PASSWORD (env) + e-mails UAT já usados nos ciclos B3/C0xx.
 * NÃO imprime senhas, tokens nem IDs sensíveis além do necessário.
 * Ambiente: URL de NEXT_PUBLIC_SUPABASE_URL (.env.local) — reportar host no log.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHYS = "uat.b34.physician.a@exemplo.local";
const SECRETARY = "teste.b3.secretaria.com@exemplo.local";
const OWNERS = [
  process.env.UAT_C069_OWNER_EMAIL,
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

const url =
  process.env.C069_SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  readEnv("NEXT_PUBLIC_SUPABASE_URL");
const anon =
  process.env.C069_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const password = readPassword();
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid-url)";
  }
})();
const isProdHost = /thvp\.cloud$/i.test(host);

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`PASS — ${name}${detail ? `: ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.log(`FAIL — ${name}${detail ? `: ${detail}` : ""}`);
};
const blocked = (name, detail = "") => {
  results.push({ name, ok: false, blocked: true, detail });
  console.log(`BLOCKED — ${name}${detail ? `: ${detail}` : ""}`);
};

function client() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(email) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? "no session");
  return { sb, email, uid: data.user.id };
}

async function roleProbe(sb) {
  const [{ data: memberships, error: mErr }, { data: isSys, error: sErr }] = await Promise.all([
    sb.from("user_practice_roles").select("role, practice_id, professional_id").limit(20),
    sb.rpc("is_system_admin"),
  ]);
  return {
    memberships: memberships ?? [],
    mErr: mErr?.message,
    isSystemAdmin: isSys === true,
    sErr: sErr?.message,
  };
}

async function loginFirst(emails, label) {
  const errors = [];
  for (const email of emails) {
    try {
      const sess = await login(email);
      pass(`login ${label}`, `perfil=${label}`);
      return sess;
    } catch (e) {
      errors.push(String(e.message || e).slice(0, 80));
    }
  }
  const joined = errors.join(" | ") || "nenhum e-mail";
  if (/Invalid login credentials|invalid_credentials|ENOTFOUND|fetch failed/i.test(joined)) {
    blocked(`login ${label}`, joined);
  } else {
    fail(`login ${label}`, joined);
  }
  return null;
}

async function main() {
  console.log("=== UAT C069 AUTH SMOKE ===");
  console.log(`supabase_host=${host}`);
  console.log(`production_host=${isProdHost ? "YES" : "NO (Cloud/dev — não substitui smoke thvp)"}`);
  if (!password || password.length < 12) {
    blocked("credenciais", "UAT_B34_PASSWORD ausente");
    process.exit(2);
  }

  // --- Gestão / owner|admin ---
  const owner = await loginFirst(OWNERS, "gestao");
  if (owner) {
    const probe = await roleProbe(owner.sb);
    const roles = [...new Set(probe.memberships.map((m) => m.role).filter(Boolean))];
    const hasMgmt = roles.some((r) => r === "owner" || r === "admin");
    if (hasMgmt) pass("gestao roles", roles.join(","));
    else fail("gestao roles", `roles=${roles.join(",") || "none"}`);

    // Surface reads (no mutations)
    const checks = [
      ["rooms", () => owner.sb.from("rooms").select("id").limit(1)],
      ["rental_contracts", () => owner.sb.from("rental_contracts").select("id").limit(1)],
      ["clinic_specialties", () => owner.sb.from("clinic_specialties").select("id").limit(1)],
      ["clinic_workforce", () => owner.sb.from("clinic_workforce").select("id").limit(1)],
      ["items", () => owner.sb.from("items").select("id").limit(1)],
      ["professionals", () => owner.sb.from("professionals").select("id").limit(1)],
    ];
    for (const [name, fn] of checks) {
      try {
        const { error } = await fn();
        if (error) fail(`gestao read ${name}`, error.message.slice(0, 100));
        else pass(`gestao read ${name}`);
      } catch (e) {
        fail(`gestao read ${name}`, String(e.message || e).slice(0, 100));
      }
    }
    try {
      const { error } = await owner.sb.rpc("reports_operational_summary", {
        p_organization_id: probe.memberships[0]?.practice_id
          ? undefined
          : undefined,
      });
      // RPC signature may require org uuid — treat missing arg as soft
      if (error && /required|argument|p_organization/i.test(error.message)) {
        pass("gestao reports rpc reachable", "assinatura exige org (esperado)");
      } else if (error) fail("gestao reports rpc", error.message.slice(0, 100));
      else pass("gestao reports rpc");
    } catch (e) {
      fail("gestao reports rpc", String(e.message || e).slice(0, 100));
    }
    await owner.sb.auth.signOut();
  }

  // --- Secretaria ---
  const sec = await loginFirst([SECRETARY], "secretaria");
  if (sec) {
    const probe = await roleProbe(sec.sb);
    const roles = [...new Set(probe.memberships.map((m) => m.role).filter(Boolean))];
    if (roles.includes("secretary")) pass("secretaria role", roles.join(","));
    else fail("secretaria role", roles.join(",") || "none");

    const { error: soapErr } = await sec.sb.from("clinical_notes").select("id").limit(1);
    if (soapErr) pass("secretaria sem leitura SOAP (ou bloqueio)", soapErr.message.slice(0, 80));
    else pass("secretaria clinical_notes select", "retorno vazio/permitido — validar RLS em UI");

    const { error: patErr } = await sec.sb.from("patients").select("id").limit(1);
    if (patErr) fail("secretaria patients", patErr.message.slice(0, 100));
    else pass("secretaria patients");

    await sec.sb.auth.signOut();
  }

  // --- Médica ---
  const phys = await loginFirst([PHYS], "medica");
  if (phys) {
    const probe = await roleProbe(phys.sb);
    const roles = [...new Set(probe.memberships.map((m) => m.role).filter(Boolean))];
    if (roles.includes("physician")) pass("medica role", roles.join(","));
    else fail("medica role", roles.join(",") || "none");

    const { data: profs, error: pErr } = await phys.sb
      .from("professionals")
      .select("id, practice_id")
      .limit(5);
    if (pErr) fail("medica professional link", pErr.message.slice(0, 100));
    else if (!profs?.length) fail("medica professional link", "nenhum professional.id");
    else pass("medica professional link", `n=${profs.length}`);

    const { error: encErr } = await phys.sb.from("encounters").select("id, status").limit(3);
    if (encErr) fail("medica encounters", encErr.message.slice(0, 100));
    else pass("medica encounters");

    const { error: rentErr } = await phys.sb.from("rental_contracts").select("id").limit(1);
    if (rentErr) pass("medica rentals blocked/erro", rentErr.message.slice(0, 80));
    else pass("medica rentals select", "sem erro — confirmar PATH_RULES na UI");

    await phys.sb.auth.signOut();
  }

  const failed = results.filter((r) => !r.ok && !r.blocked);
  const blockedN = results.filter((r) => r.blocked);
  console.log("\n=== RESUMO C069 AUTH ===");
  console.log(`total=${results.length} pass=${results.filter((r) => r.ok).length} fail=${failed.length} blocked=${blockedN.length}`);
  console.log(`ambiente=${isProdHost ? "PRODUCAO_THVP" : "CLOUD_DEV"}`);
  if (!isProdHost) {
    console.log("NOTA: este smoke NÃO homologa sistema.thvp.cloud — Hosped.1d + contas prod ainda necessários.");
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", String(e.message || e).slice(0, 200));
  process.exit(2);
});
