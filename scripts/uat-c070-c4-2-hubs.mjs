/**
 * C070-C4.2 — hubs Pessoas + Administração + Plataforma.
 * Marcador: UAT_C070_C42_
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

const nav = read("lib/auth/app-nav.ts");
const access = read("lib/auth/access.ts");
const peoplePage = read("app/(shell)/app/people/page.tsx");
const peopleHub = read("components/clinic/PeopleHub.tsx");
const peopleSub = read("components/clinic/PeopleSubnav.tsx");
const adminPage = read("app/(shell)/app/admin/page.tsx");
const adminSub = read("components/clinic-admin/AdminSubnav.tsx");
const systemPage = read("app/(shell)/app/system/page.tsx");
const systemSub = read("components/platform/SystemSubnav.tsx");
const dash = read("components/dashboard/RoleDashboard.tsx");
const prosPage = read("app/(shell)/app/professionals/page.tsx");
const specsPage = read("app/(shell)/app/specialties/page.tsx");
const workPage = read("app/(shell)/app/workforce/page.tsx");

ok("Nav: seção Clínico", nav.includes('title: "Clínico"'));
ok("Nav: seção Gestão", nav.includes('title: "Gestão"'));
ok("Nav: hub Pessoas", nav.includes('id: "people"') && nav.includes('href: "/app/people"'));
ok("Nav: sem Profissionais flat", !nav.includes('id: "professionals"'));
ok("Nav: sem Especialidades flat", !nav.includes('id: "specialties"'));
ok("Nav: sem Funcionários flat", !nav.includes('id: "workforce"'));
ok("Nav: Administração hub", nav.includes('label: "Administração"') && nav.includes('href: "/app/admin"'));
ok("Nav: Plataforma único item", nav.includes('id: "system-home"') && !nav.includes('id: "system-orgs"'));
ok("Nav: sem Usuários da plataforma flat", !nav.includes('id: "system-users"'));
ok("Nav: sem Auditoria técnica flat", !nav.includes('id: "system-audit"'));
ok("Nav: Central de Relacionamentos único", nav.includes("Central de Relacionamentos") && !nav.includes('id: "relationship-contact"'));
ok("Nav: Salas e Locações", /Salas e [Ll]ocações/.test(nav));
ok("Nav: Contratos clínicos", nav.includes("Contratos clínicos"));
ok("Nav: Programação obstétrica", nav.includes("Programação obstétrica"));

ok("PATH: /app/people owner|admin", access.includes('prefix: "/app/people"') && /prefix:\s*"\/app\/people"[\s\S]{0,120}owner[\s\S]{0,80}admin/.test(access));
ok("PATH: professionals preservado", access.includes('prefix: "/app/professionals"'));
ok("PATH: specialties preservado", access.includes('prefix: "/app/specialties"'));
ok("PATH: workforce preservado", access.includes('prefix: "/app/workforce"'));
ok("PATH: system SYSTEM_ADMIN", access.includes('prefix: "/app/system"') && access.includes("isSystemAdmin"));

ok("People hub page", peoplePage.includes("PeopleHub"));
ok("People hub cards profissionais/especialidades/funcionários",
  peopleHub.includes("/app/professionals") &&
    peopleHub.includes("/app/specialties") &&
    peopleHub.includes("/app/workforce"));
ok("People hub distinção assistencial", peopleHub.includes("Não são profissionais de saúde") || peopleHub.includes("Distintos de funcionários"));
ok("PeopleSubnav existe", peopleSub.includes("Profissionais") && peopleSub.includes("Funcionários"));
ok("Subpáginas Pessoas com voltar + subnav",
  prosPage.includes("PeopleSubnav") &&
    specsPage.includes("PeopleSubnav") &&
    workPage.includes("PeopleSubnav") &&
    prosPage.includes("Voltar para Pessoas"));

ok("Admin hub cards", adminPage.includes("/app/admin/users") && adminPage.includes("/app/care-policies") && adminPage.includes("AdminSubnav"));
ok("AdminSubnav política", adminSub.includes("/app/care-policies"));
ok("System hub cards", systemPage.includes("/app/system/organizations") && systemPage.includes("Auditoria técnica") && systemPage.includes("SystemSubnav"));
ok("SystemSubnav organizações/usuários/audit",
  systemSub.includes("/app/system/organizations") &&
    systemSub.includes("/app/system/users") &&
    systemSub.includes("/app/system/audit"));

ok(
  "Dashboard Pessoas único",
  (dash.includes('title="Pessoas"') || dash.includes('title: "Pessoas"')) && dash.includes("/app/people"),
);
ok(
  "Dashboard sem card Profissionais flat",
  !dash.includes('title="Profissionais"') && !dash.includes('title: "Profissionais"'),
);
ok(
  "Dashboard sem card Funcionários flat",
  !dash.includes('title="Funcionários"') && !dash.includes('title: "Funcionários"'),
);
ok(
  "Dashboard Plataforma hub",
  (dash.includes('title="Plataforma"') || dash.includes('title: "Plataforma"')) &&
    (dash.includes('href="/app/system"') || dash.includes('href: "/app/system"')),
);
ok("Dashboard Salas e Locações único", dash.includes("Salas e Locações") && !dash.includes("Aluguéis e contratos"));

ok("Rotas filhas preservadas (professionals page)", prosPage.includes("ProfessionalsBoard"));
ok("Rotas filhas preservadas (specialties page)", specsPage.includes("SpecialtiesModule"));
ok("Rotas filhas preservadas (workforce page)", workPage.includes("WorkforceModule"));

console.log(`\nUAT_C070_C42_ hubs: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070-C4.2 hubs.");
  process.exit(1);
}
console.log("OK — UAT_C070_C42_ Pessoas/Admin/Plataforma.");
