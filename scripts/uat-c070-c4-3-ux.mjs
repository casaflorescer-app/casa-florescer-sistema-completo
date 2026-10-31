/**
 * C070-C4.3 — UX/UI global: ações, RowActions, autocomplete, empty/loading, agenda.
 * Marcador: UAT_C070_C43_
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

const rowActions = read("components/ui/RowActions.tsx");
const overflow = read("components/ui/OverflowMenu.tsx");
const combobox = read("components/ui/EntityCombobox.tsx");
const confirm = read("components/ui/ConfirmDialog.tsx");
const formActions = read("components/ui/FormActions.tsx");
const actionBar = read("components/ui/ActionLinkBar.tsx");
const searchField = read("components/ui/SearchField.tsx");
const empty = read("components/ui/EmptyState.tsx");
const friendly = read("lib/ui/friendly-error.ts");
const buttons = read("components/ui/buttonStyles.ts");

const filters = read("components/attendance/AgendaFilters.tsx");
const agenda = read("components/attendance/AgendaPage.tsx");
const apptCard = read("components/attendance/AppointmentCard.tsx");
const apptForm = read("components/attendance/AppointmentForm.tsx");
const editForm = read("components/attendance/EditAppointmentForm.tsx");
const patients = read("components/patients/PatientList.tsx");
const patientDetail = read("components/patients/PatientDetail.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const inventory = read("components/inventory/InventoryModule.tsx");
const rentals = read("components/rentals/RentalsModule.tsx");
const central = read("components/relationship/RelationshipCenter.tsx");
const apptTypes = read("lib/attendance/types.ts");
const apptDir = read("lib/attendance/directory.ts");
const searchLib = read("lib/search/entity-search.ts");

// --- Shared components ---
ok("RowActions exportado (primary + secondary)", rowActions.includes("export function RowActions") && rowActions.includes("data-row-actions"));
ok("OverflowMenu título/tooltip Mais ações", overflow.includes('title={label}') && overflow.includes("Mais ações"));
ok("EntityCombobox data-entity-combobox + Buscando", combobox.includes("data-entity-combobox") && combobox.includes("Buscando"));
ok("EntityCombobox ícone Search + emptyAction", combobox.includes("Search") && combobox.includes("emptyAction"));
ok("ConfirmDialog compartilhado", confirm.includes("export function ConfirmDialog") && confirm.includes("alertdialog"));
ok("FormActions desktop horizontal", formActions.includes("data-form-actions") && formActions.includes("sm:flex-row"));
ok("ActionLinkBar contextual", actionBar.includes("export function ActionLinkBar") && actionBar.includes("data-action-link-bar"));
ok("SearchField busca livre", searchField.includes("data-search-field") && searchField.includes("type=\"search\""));
ok("EmptyState padrão", empty.includes("data-empty-state"));
ok("friendlyError sem PostgREST cru", friendly.includes("postgrest") && friendly.includes("foreign key"));
ok("buttonStyles variants", buttons.includes("primary") && buttons.includes("danger") && buttons.includes("ghost"));

// --- Agenda ---
ok("AgendaFilters card + presets", filters.includes("data-agenda-filters") && filters.includes("Hoje") && filters.includes("7 dias"));
ok("AgendaFilters Limpar filtros", filters.includes("Limpar filtros"));
ok("AgendaFilters procedimento EntityCombobox", filters.includes("Procedimento") && filters.includes("searchProcedureOptions"));
ok("AgendaPage procedureFilter + clear", agenda.includes("procedureFilterId") && agenda.includes("onClearFilters"));
ok("listAppointments filtra procedureId", apptTypes.includes("procedureId?: string") && apptDir.includes('query.eq("procedure_id"'));
ok("Agenda hierarquia Novo atendimento + Plus", agenda.includes("Novo atendimento") && agenda.includes("Plus") && agenda.includes("ghostButtonClass"));
ok(
  "Agenda período De/Até preservado",
  filters.includes("De") &&
    (filters.includes("Até") || filters.includes("Ate")) &&
    filters.includes('type="date"'),
);

// --- Pacientes ---
ok("PatientList SearchField", patients.includes("SearchField"));
ok("PatientList RowActions + Agendar", patients.includes("RowActions") && patients.includes("Agendar"));
ok("PatientList EmptyState amigável", patients.includes("Ainda não há pacientes cadastradas"));
ok("PatientList Nova paciente com Plus", patients.includes("Plus") && patients.includes("Nova paciente"));
ok("PatientDetail ActionLinkBar", patientDetail.includes("ActionLinkBar") && patientDetail.includes("Prontuário"));

// --- Ações / confirms ---
ok("AppointmentCard ConfirmDialog (sem window.confirm)", apptCard.includes("ConfirmDialog") && !apptCard.includes("window.confirm"));
ok("EditAppointmentForm ConfirmDialog + FormActions", editForm.includes("ConfirmDialog") && editForm.includes("FormActions") && !editForm.includes("window.confirm"));
ok("AppointmentForm FormActions", apptForm.includes("FormActions") && apptForm.includes("friendlyError"));

// --- Salas / Estoque / Contratos / Central ---
ok("RoomsBoard RowActions Aluguéis/Contratos", rooms.includes("Aluguéis") && rooms.includes("Contratos") && rooms.includes("EmptyState"));
ok("RoomsBoard SearchField + FormActions", rooms.includes("SearchField") && rooms.includes("FormActions"));
ok("Inventory RowActions Entrada/Saída/Transferir", inventory.includes("Entrada") && inventory.includes("Saída") && inventory.includes("Transferir"));
ok("Inventory SearchField + EmptyState + friendlyError", inventory.includes("SearchField") && inventory.includes("EmptyState") && inventory.includes("friendlyError"));
ok("Rentals RowActions Encerrar/Cancelar no menu", rentals.includes("RowActions") && rentals.includes("Encerrar") && rentals.includes("Cancelar contrato"));
ok("Rentals EmptyState contratos", rentals.includes("Ainda não há contratos de locação"));
ok("Central EmptyState fila", central.includes("EmptyState") && central.includes("Ainda não há pacientes nesta fila"));
ok("Central sem window.confirm", !central.includes("window.confirm"));

// --- Autocomplete / segurança estrutural ---
ok("search helpers org-scoped rooms/items", searchLib.includes("organization_id") && searchLib.includes("searchRoomOptions") && searchLib.includes("searchInventoryItemOptions"));
ok("EntityCombobox debounce + minChars", combobox.includes("debounceMs") && combobox.includes("minChars"));

// --- Regressão C4.2 hubs (estrutural leve) ---
const nav = read("lib/auth/app-nav.ts");
ok("Regressão C4.2: hub Pessoas", nav.includes('href: "/app/people"') && nav.includes('title: "Pessoas"') || nav.includes("Pessoas"));
ok("Regressão C4.2: Administração hub", nav.includes('href: "/app/admin"'));
ok("Regressão C4.2: Plataforma único", nav.includes('href: "/app/system"') && !nav.includes('id: "system-users"'));

// --- Responsividade estrutural ---
ok("FormActions mobile col-reverse", formActions.includes("flex-col-reverse"));
ok("PatientList mobile cards + desktop table", patients.includes("md:hidden") && patients.includes("md:block"));
ok("Inventory mobile + desktop", inventory.includes("md:hidden") && inventory.includes("md:block"));
ok("ConfirmDialog sm:items-center", confirm.includes("sm:items-center"));

console.log(`\nUAT_C070_C43_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
