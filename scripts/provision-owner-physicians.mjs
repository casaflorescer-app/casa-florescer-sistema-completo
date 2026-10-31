/**
 * C073 — provisionamento idempotente das médicas (modelo B: 2 practices).
 *
 * Isolamento clínico/agenda: cada médica recebe owner+physician SOMENTE
 * na sua practice_unit. NÃO coloca owner na practice da outra (isso abriria agenda).
 * Gestão de casa (salas/pessoas) via is_house_staff com owner em qualquer practice house.
 *
 * Uso (NÃO grava senhas no repo; NÃO imprime senhas):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=…
 *   SUPABASE_SERVICE_ROLE_KEY=…   # ou mapear a partir de SERVICE_ROLE_KEY na VPS
 *   CF_ORG_ID=…                   # organizations.id
 *   CF_PRACTICE_ID_SAMARA=…       # practice_units.id (house) da Samara
 *   CF_PRACTICE_ID_THAIS=…        # practice_units.id (house) da Thais — DISTINTO
 *   CF_PHYSICIAN_1_PASSWORD=…     # Samara (só no create; REUSE não altera)
 *   CF_PHYSICIAN_2_PASSWORD=…     # Thais
 *   CF_PHYSICIAN_1_CRM=…          # opcional; senão placeholder CF-OWNER-SAMARA
 *   CF_PHYSICIAN_2_CRM=…          # opcional; senão placeholder CF-OWNER-THAIS
 *
 *   node scripts/provision-owner-physicians.mjs           # dry-run
 *   node scripts/provision-owner-physicians.mjs --apply   # escreve (só com autorização)
 *
 * Compat: CF_PRACTICE_ID legado é RECUSADO (força modelo B).
 *
 * NÃO concede SYSTEM_ADMIN.
 * NÃO executar --apply em produção sem autorização explícita + IDs confirmados na VPS.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const PHYSICIANS = [
  {
    key: "samara",
    fullName: "Dra. Samara Moreno Ribeiro Romão",
    email: "saribeiroromao@gmail.com",
    passwordEnv: "CF_PHYSICIAN_1_PASSWORD",
    councilEnv: "CF_PHYSICIAN_1_CRM",
    councilType: "CRM",
    councilNumberFallback: "CF-OWNER-SAMARA",
    practiceEnv: "CF_PRACTICE_ID_SAMARA",
    specialties: [
      { slug: "ginecologia", name: "Ginecologia" },
      { slug: "obstetricia", name: "Obstetrícia" },
    ],
  },
  {
    key: "thais",
    fullName: "Dra. Thais Molina",
    email: "thaissmolina@hotmail.com",
    passwordEnv: "CF_PHYSICIAN_2_PASSWORD",
    councilEnv: "CF_PHYSICIAN_2_CRM",
    councilType: "CRM",
    councilNumberFallback: "CF-OWNER-THAIS",
    practiceEnv: "CF_PRACTICE_ID_THAIS",
    specialties: [
      { slug: "ginecologia", name: "Ginecologia" },
      { slug: "obstetricia", name: "Obstetrícia" },
    ],
  },
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`FAIL — missing env ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function findUserByEmail(users, email) {
  const needle = email.trim().toLowerCase();
  return users.find((u) => (u.email ?? "").toLowerCase() === needle) ?? null;
}

async function listAllUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const list = await supabase.auth.admin.listUsers({ page, perPage });
    if (list.error) throw list.error;
    const batch = list.data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) {
      throw new Error("listUsers exceeded safety page limit (50)");
    }
  }
  return users;
}

async function ensureAuthUser(supabase, { email, fullName, passwordEnv }) {
  const users = await listAllUsers(supabase);
  const existing = findUserByEmail(users, email);
  if (existing) {
    console.log(`  auth REUSE ${email}`);
    return { id: existing.id, created: false };
  }
  if (!APPLY) {
    console.log(`  auth WOULD_CREATE ${email} (dry-run)`);
    return { id: null, created: false };
  }
  const password = process.env[passwordEnv]?.trim();
  if (!password) {
    throw new Error(`Missing ${passwordEnv} for new user ${email}`);
  }
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error) throw created.error;
  console.log(`  auth CREATE ${email}`);
  return { id: created.data.user.id, created: true };
}

async function ensureProfile(supabase, { userId, email, fullName, orgId }) {
  if (!userId) {
    console.log(`  profile SKIP (dry-run, sem user id)`);
    return;
  }
  const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) {
    if (APPLY) {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          organization_id: orgId,
          email,
          is_active: true,
        })
        .eq("id", userId);
      if (error) throw error;
    }
    console.log(`  profile REUSE/UPDATE ${fullName}`);
    return;
  }
  if (!APPLY) {
    console.log(`  profile WOULD_CREATE ${fullName}`);
    return;
  }
  const { error } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName,
    organization_id: orgId,
    email,
    is_active: true,
  });
  if (error) throw error;
  console.log(`  profile CREATE ${fullName}`);
}

async function ensureRole(supabase, { userId, practiceId, role }) {
  if (!userId) {
    console.log(`  role WOULD_${role} (dry-run)`);
    return;
  }
  const { data: existing } = await supabase
    .from("user_practice_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .eq("role", role)
    .maybeSingle();
  if (existing) {
    console.log(`  role REUSE ${role}`);
    return;
  }
  if (!APPLY) {
    console.log(`  role WOULD_CREATE ${role}`);
    return;
  }
  const { error } = await supabase.from("user_practice_roles").insert({
    user_id: userId,
    practice_id: practiceId,
    role,
  });
  if (error) throw error;
  console.log(`  role CREATE ${role}`);
}

async function ensureSpecialty(supabase, { orgId, slug, name }) {
  const { data: bySlug } = await supabase
    .from("clinic_specialties")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", slug)
    .maybeSingle();
  if (bySlug?.id) {
    console.log(`  specialty REUSE ${slug}`);
    return bySlug.id;
  }
  const { data: byName } = await supabase
    .from("clinic_specialties")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", name)
    .maybeSingle();
  if (byName?.id) {
    console.log(`  specialty REUSE-BY-NAME ${name}`);
    return byName.id;
  }
  if (!APPLY) {
    console.log(`  specialty WOULD_CREATE ${slug}`);
    return null;
  }
  const { data, error } = await supabase
    .from("clinic_specialties")
    .insert({
      organization_id: orgId,
      name,
      slug,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  specialty CREATE ${slug}`);
  return data.id;
}

async function ensureProfessional(supabase, { userId, orgId, practiceId, councilType, councilNumber }) {
  if (!userId) {
    console.log(`  professional WOULD_CREATE (dry-run)`);
    return null;
  }
  const { data: existing } = await supabase
    .from("professionals")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (existing?.id) {
    console.log(`  professional REUSE`);
    return existing.id;
  }
  if (!APPLY) {
    console.log(`  professional WOULD_CREATE`);
    return null;
  }
  const { data, error } = await supabase
    .from("professionals")
    .insert({
      profile_id: userId,
      practice_id: practiceId,
      organization_id: orgId,
      council_type: councilType,
      council_number: councilNumber,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  professional CREATE`);
  return data.id;
}

async function ensureSpecialtyLink(supabase, { orgId, professionalId, specialtyId, isPrimary }) {
  if (!professionalId || !specialtyId) {
    console.log(`  specialty-link SKIP`);
    return;
  }
  const { data: link } = await supabase
    .from("professional_specialties")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("specialty_id", specialtyId)
    .maybeSingle();
  if (link) {
    console.log(`  specialty-link REUSE`);
    return;
  }
  if (!APPLY) {
    console.log(`  specialty-link WOULD_CREATE`);
    return;
  }
  const { error } = await supabase.from("professional_specialties").insert({
    organization_id: orgId,
    professional_id: professionalId,
    specialty_id: specialtyId,
    is_primary: isPrimary,
  });
  if (error) throw error;
  console.log(`  specialty-link CREATE`);
}

async function assertPractice(supabase, { orgId, practiceId, label }) {
  const { data, error } = await supabase
    .from("practice_units")
    .select("id, organization_id, kind, code, name, is_active")
    .eq("id", practiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`Practice ${label} não encontrada: ${practiceId}`);
  }
  if (data.organization_id !== orgId) {
    throw new Error(`Practice ${label} não pertence a CF_ORG_ID`);
  }
  if (data.kind !== "house") {
    throw new Error(`Practice ${label} deve ser kind=house (recebido: ${data.kind})`);
  }
  if (data.is_active === false) {
    throw new Error(`Practice ${label} está inativa`);
  }
  console.log(`  practice OK ${label}: ${data.code} · ${data.name}`);
  return data;
}

async function provisionOne(supabase, ctx, doctor) {
  console.log(`\n== ${doctor.key} (${doctor.email}) ==`);
  console.log(`  practice: ${doctor.practiceEnv}`);
  const councilNumber =
    optionalEnv(doctor.councilEnv) ?? doctor.councilNumberFallback;
  if (councilNumber === doctor.councilNumberFallback) {
    console.log(`  WARN — CRM placeholder (${doctor.councilEnv} não definido)`);
  }

  const auth = await ensureAuthUser(supabase, {
    email: doctor.email,
    fullName: doctor.fullName,
    passwordEnv: doctor.passwordEnv,
  });
  await ensureProfile(supabase, {
    userId: auth.id,
    email: doctor.email,
    fullName: doctor.fullName,
    orgId: ctx.orgId,
  });
  // Modelo B: roles SOMENTE na própria practice (não na da outra sócia).
  await ensureRole(supabase, { userId: auth.id, practiceId: doctor.practiceId, role: "owner" });
  await ensureRole(supabase, { userId: auth.id, practiceId: doctor.practiceId, role: "physician" });
  const professionalId = await ensureProfessional(supabase, {
    userId: auth.id,
    orgId: ctx.orgId,
    practiceId: doctor.practiceId,
    councilType: doctor.councilType,
    councilNumber,
  });
  for (let i = 0; i < doctor.specialties.length; i++) {
    const spec = doctor.specialties[i];
    const specialtyId = await ensureSpecialty(supabase, {
      orgId: ctx.orgId,
      slug: spec.slug,
      name: spec.name,
    });
    await ensureSpecialtyLink(supabase, {
      orgId: ctx.orgId,
      professionalId,
      specialtyId,
      isPrimary: i === 0,
    });
  }
  console.log(`  SYSTEM_ADMIN: não concedido (intencional)`);
  console.log(`  isolamento: owner+physician apenas em ${doctor.practiceEnv}`);
}

console.log("C073 provision owner-physicians (modelo B) — modo:", APPLY ? "APPLY" : "DRY-RUN");
console.log("Alvos:", PHYSICIANS.map((p) => p.email).join(", "));
console.log("Requer: CF_ORG_ID + CF_PRACTICE_ID_SAMARA + CF_PRACTICE_ID_THAIS (distintos)");

if (optionalEnv("CF_PRACTICE_ID") && !optionalEnv("CF_PRACTICE_ID_SAMARA")) {
  console.error(
    "FAIL — CF_PRACTICE_ID legado não é mais aceito. Use CF_PRACTICE_ID_SAMARA e CF_PRACTICE_ID_THAIS (modelo B).",
  );
  process.exit(1);
}

if (!APPLY) {
  console.log("\nDry-run: nenhuma escrita. Use --apply com env completo para gravar.");
  console.log("Senhas: CF_PHYSICIAN_1_PASSWORD / CF_PHYSICIAN_2_PASSWORD (nunca logadas).");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("OK — dry-run estrutural (env Auth não informado).");
    console.log("Antes do apply: confirmar na VPS as duas practice_units house da Casa Florescer.");
    process.exit(0);
  }
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const orgId = requireEnv("CF_ORG_ID");
const practiceSamara = requireEnv("CF_PRACTICE_ID_SAMARA");
const practiceThais = requireEnv("CF_PRACTICE_ID_THAIS");

if (practiceSamara === practiceThais) {
  console.error("FAIL — CF_PRACTICE_ID_SAMARA e CF_PRACTICE_ID_THAIS devem ser distintos (modelo B).");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const doctors = PHYSICIANS.map((p) => ({
  ...p,
  practiceId: p.key === "samara" ? practiceSamara : practiceThais,
}));

try {
  console.log("\n== validação das practices ==");
  await assertPractice(supabase, { orgId, practiceId: practiceSamara, label: "SAMARA" });
  await assertPractice(supabase, { orgId, practiceId: practiceThais, label: "THAIS" });

  for (const doctor of doctors) {
    await provisionOne(supabase, { orgId }, doctor);
  }
  console.log("\nOK — provisionamento", APPLY ? "aplicado." : "simulado (dry-run).");
  if (!APPLY) {
    console.log("Para gravar: autorizar e rodar com --apply + senhas + CRM reais.");
  }
} catch (err) {
  console.error("FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
}
