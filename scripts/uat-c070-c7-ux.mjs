/**
 * C070-C7 — asserts estruturais UX/UI + painel + provision script.
 * Marcador: UAT_C070_C7_
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

const overflow = read("components/ui/OverflowMenu.tsx");
const rowActions = read("components/ui/RowActions.tsx");
const tableCell = read("components/ui/TableActionsCell.tsx");
const primaryCreate = read("components/ui/PrimaryCreateButton.tsx");
const pageHeader = read("components/ui/PageHeader.tsx");
const roleDash = read("components/dashboard/RoleDashboard.tsx");
const cardGrid = read("components/dashboard/DashboardCardGrid.tsx");
const prefs = read("lib/dashboard/panel-preferences.ts");
const locacoes = read("components/clinic/LocacoesSubnav.tsx");
const patientList = read("components/patients/PatientList.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const agenda = read("components/attendance/AgendaPage.tsx");
const provision = read("scripts/provision-owner-physicians.mjs");
const access = read("lib/auth/access.ts");

ok("OverflowMenu trigger + Ações", overflow.includes(">Ações<") && overflow.includes("Plus"));
ok("OverflowMenu variant icon opcional", overflow.includes('variant === "icon"') || overflow.includes('variant = "labeled"'));
ok("RowActions data-row-actions", rowActions.includes('data-row-actions="true"'));
ok("TableActionsCell existe", tableCell.includes("data-table-actions-cell"));
ok("PrimaryCreateButton + label", primaryCreate.includes("data-primary-create") && primaryCreate.includes("Plus"));
ok("PageHeader actions slot", pageHeader.includes("actions"));

ok("PatientList PrimaryCreateButton Nova paciente", patientList.includes("PrimaryCreateButton") && patientList.includes("Nova paciente"));
ok("PatientList TableActionsCell", patientList.includes("TableActionsCell"));
ok("RoomsBoard PageHeader Nova sala", rooms.includes("PageHeader") && rooms.includes("Nova sala"));
ok("Agenda PageHeader Novo atendimento", agenda.includes("PageHeader") && agenda.includes("Novo atendimento"));

ok("RoleDashboard sem PlatformStatsCards", !roleDash.includes("PlatformStatsCards"));
ok("RoleDashboard DashboardCardGrid", roleDash.includes("DashboardCardGrid"));
ok("DashboardCardGrid Organizar painel", cardGrid.includes("Organizar painel") && cardGrid.includes("Restaurar padrão"));
ok("panel-preferences localStorage", prefs.includes("cf.panel.prefs.v1:") && prefs.includes("localStorage"));

ok("LocacoesSubnav Locações", locacoes.includes('label: "Locações"'));
ok("LocacoesSubnav Contratos", locacoes.includes('label: "Contratos"') && !locacoes.includes("Contratos de locação"));

ok("Provision script existe", provision.includes("provision-owner-physicians") || provision.includes("C070-C7"));
ok("Provision Samara email", provision.includes("saribeiroromao@gmail.com"));
ok("Provision Thais email", provision.includes("thaissmolina@hotmail.com"));
ok("Provision owner+physician", provision.includes('"owner"') && provision.includes('"physician"'));
ok("Provision sem SYSTEM_ADMIN grant", provision.includes("não concedido") || provision.includes("NÃO concede SYSTEM_ADMIN"));
ok(
  "Provision sem senha hardcoded",
  !provision.includes("password:") &&
    provision.includes("CF_PHYSICIAN_1_PASSWORD") &&
    !/CF_PHYSICIAN_1_PASSWORD\s*=\s*['\"][^'\"]+['\"]/.test(provision),
);

ok("PATH records physician preservado", access.includes('prefix: "/app/records"') && access.includes('hasStaffRole(auth, "physician")'));

console.log(`\nUAT_C070_C7_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
