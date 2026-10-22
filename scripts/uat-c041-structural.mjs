/**
 * UAT estrutural C041 — menu médico + gestão clínica (sem migration).
 * Marcador E2E (quando houver): UAT_C041_
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
};
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

const nav = read("lib/auth/app-nav.ts");
ok("seção Painel", nav.includes('id: "painel"') && nav.includes("Visão geral"));
ok("seção Médico", nav.includes('id: "medico"') && nav.includes('label: "Agenda"'));
ok(
  "ordem Médico Agenda→Pacientes→Prontuário→Exames→Receitas",
  /Agenda[\s\S]*Pacientes[\s\S]*Prontuário[\s\S]*Exames[\s\S]*Receitas/.test(nav),
);
ok("seção Central de Relacionamentos", nav.includes('id: "relacionamentos"'));
ok(
  "Central visível também a physician",
  /relacionamentos[\s\S]*physician/.test(nav) || nav.includes('hasStaffRole(auth, "physician")'),
);
ok("Médico sem Obstetrícia no grupo (lista exata C041)", !/Receitas[\s\S]*obstetrics[\s\S]*relacionamentos/.test(nav));
ok("seção Gestão Clínica", nav.includes('id: "gestao_clinica"') && nav.includes('href: "/app/rooms"'));
ok("Gestão usa canAccessClinicManagement", nav.includes("canAccessClinicManagement"));
ok("sem email hardcode no nav", !/samara@|thais@|===.*email/i.test(nav));

const access = read("lib/auth/access.ts");
ok("canAccessClinicManagement definido", access.includes("function canAccessClinicManagement"));
ok(
  "canAccessClinicManagement = owner|admin",
  /canAccessClinicManagement[\s\S]*owner[\s\S]*admin/.test(access),
);
ok("rooms path restringido a gestão", /prefix: "\/app\/rooms"[\s\S]*owner[\s\S]*admin/.test(access));
ok(
  "professionals path restringido a gestão",
  /prefix: "\/app\/professionals"[\s\S]*owner[\s\S]*admin/.test(access),
);

ok("PhysicianPanel existe", existsSync(resolve(root, "components/dashboard/PhysicianPanel.tsx")));
const panel = read("components/dashboard/PhysicianPanel.tsx");
ok("painel atendimentos de hoje", /Atendimentos de hoje/i.test(panel));
ok("painel próximos", /Próximos atendimentos/i.test(panel));
ok("painel em andamento", /Atendimentos em andamento/i.test(panel));
ok("painel Abrir prontuário (C040.10)", panel.includes("patientChartHref"));

const list = read("components/patients/PatientList.tsx");
ok("filtro Ginecológico", list.includes("Ginecológico"));
ok("filtro Obstétrico", list.includes("Obstétrico"));
ok("filtro Todas", list.includes('"Todas"') || list.includes("Todas"));
ok("lista Abrir prontuário C040.10", list.includes("patientChartHref"));

ok(
  "classificador assistencial",
  existsSync(resolve(root, "lib/attendance/assistential-classify.ts")),
);

const failed = results.filter((r) => !r.ok);
console.log(`\nEstrutural C041: ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.name}`);
  process.exitCode = 1;
} else {
  console.log("OK — sem migration; sem commit/push/deploy nesta etapa.");
}
