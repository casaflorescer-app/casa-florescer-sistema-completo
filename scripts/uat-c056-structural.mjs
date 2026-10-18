/**
 * C056 — UAT estrutural (higiene, PATH_RULES, shells, APIs, flags).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond) {
  if (cond) {
    console.log(`PASS — ${label}`);
    pass++;
  } else {
    console.log(`FAIL — ${label}`);
    fail++;
  }
}

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

const nextConfig = read("next.config.mjs");
const access = read("lib/auth/access.ts");
const paths = read("lib/auth/paths.ts");
const mwRoot = read("middleware.ts");
const clinica = read("lib/auth/access.ts");
const flags = read("lib/regulatory/clinical-document-features.ts");
const renderPdf = read("app/api/documents/render-pdf/route.ts");
const clinicalAi = read("app/api/encounters/clinical-ai/route.ts");
const transcribe = read("app/api/encounters/transcribe/route.ts");
const returnPanel = read("components/attendance/ClinicalReturnPanel.tsx");
const workspace = read("components/attendance/EncounterWorkspace.tsx");
const medicaHome = read("app/medica/page.tsx");
const medicaAgenda = read("app/medica/agenda/page.tsx");

ok("ignoreBuildErrors false", /ignoreBuildErrors:\s*false/.test(nextConfig));
ok("PATH_RULES records=physician", access.includes('prefix: "/app/records"') && access.includes('hasStaffRole(auth, "physician")'));
ok("PATH_RULES portal=patient", access.includes('prefix: "/app/portal"') && access.includes("isPatientPortalUser"));
ok("PATH_RULES admin/owner gestão", access.includes('prefix: "/app/rooms"') && access.includes('hasStaffRole(auth, "owner")'));
ok("canAccessClinicManagement owner|admin", clinica.includes("canAccessClinicManagement") && clinica.includes('hasStaffRole(auth, "owner")') && clinica.includes('hasStaffRole(auth, "admin")'));
ok("LEGACY_PORTAL_PREFIXES inclui medica/secretaria/gestao", paths.includes('"/medica"') && paths.includes('"/secretaria"') && paths.includes('"/gestao"'));
ok("middleware redireciona legado autenticado", mwRoot.includes("isLegacyPortalPath") && mwRoot.includes("AUTHENTICATED_HOME"));
ok("middleware exige login", mwRoot.includes('pathname = "/login"'));
ok("API render-pdf usa createServerSupabase", renderPdf.includes("createServerSupabase"));
ok("API clinical-ai autenticada", clinicalAi.includes("createServerSupabase") || clinicalAi.includes("getUser") || clinicalAi.includes("auth"));
ok("API transcribe autenticada", transcribe.includes("createServerSupabase") || transcribe.includes("getUser") || transcribe.includes("auth"));
ok("SNCR flag false", flags.includes("sncrIntegrationAvailable: false"));
ok("ICP flag false", flags.includes("qualifiedElectronicSignatureAvailable: false"));
ok("Retorno C055 sem ComingSoon no Workspace", workspace.includes("ClinicalReturnPanel") && !workspace.includes("WorkspaceComingSoon"));
ok("Retorno painel operacional", returnPanel.includes("Iniciar retorno agora"));
ok("Shell /medica ainda tem fixture preview (legado)", medicaHome.includes("obstetricBoard") || medicaHome.includes("fixtures"));
ok("Shell /medica/agenda tem slots estáticos (legado)", medicaAgenda.includes("Helena Dias") || medicaAgenda.includes("slots"));
ok("Legado bloqueado por middleware (não é superfície oficial)", mwRoot.includes('"/medica"') || paths.includes('"/medica"'));

console.log(`\nEstrutural C056: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C056.");
