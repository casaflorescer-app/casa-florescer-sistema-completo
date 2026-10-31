/**
 * C070-C3 — busca inteligente / EntityCombobox async / helpers de search.
 * Marcador: UAT_C070_C3_
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

const combobox = read("components/ui/EntityCombobox.tsx");
const searchLib = read("lib/search/entity-search.ts");
const apptForm = read("components/attendance/AppointmentForm.tsx");
const editForm = read("components/attendance/EditAppointmentForm.tsx");
const filters = read("components/attendance/AgendaFilters.tsx");
const agenda = read("components/attendance/AgendaPage.tsx");
const inventory = read("components/inventory/InventoryModule.tsx");
const invDir = read("lib/inventory/directory.ts");
const contracts = read("components/clinic-mgmt/ClinicalContractsModule.tsx");
const rentals = read("components/rentals/RentalsModule.tsx");
const workforce = read("components/clinic-mgmt/WorkforceModule.tsx");
const workforceLib = read("lib/clinic-mgmt/workforce.ts");
const rooms = read("components/clinic/RoomsBoard.tsx");
const rx = read("components/prescriptions/ClinicalPrescriptionPanel.tsx");
const patientsDir = read("lib/patients/directory.ts");
const apptTypes = read("lib/attendance/types.ts");
const apptDir = read("lib/attendance/directory.ts");

ok("EntityCombobox exportado", combobox.includes("export function EntityCombobox"));
ok("EntityCombobox onSearch remoto", combobox.includes("onSearch"));
ok("EntityCombobox debounce", combobox.includes("debounceMs"));
ok("EntityCombobox minChars", combobox.includes("minChars"));
ok("EntityCombobox estados (buscando / vazio / erro)", 
  (combobox.includes("Buscando") || combobox.includes("Pesquisando")) &&
    combobox.includes("emptyLabel") &&
    combobox.includes("errorLabel"));
ok("EntityCombobox teclado Arrow/Enter/Escape",
  combobox.includes("ArrowDown") &&
    combobox.includes("ArrowUp") &&
    combobox.includes('Enter') &&
    combobox.includes("Escape"));
ok("EntityCombobox role=combobox/listbox",
  combobox.includes('role="combobox"') && combobox.includes('role="listbox"'));

ok("searchPatientOptions", searchLib.includes("export async function searchPatientOptions"));
ok("searchProfessionalOptions", searchLib.includes("export async function searchProfessionalOptions"));
ok("searchRoomOptions", searchLib.includes("export async function searchRoomOptions"));
ok("searchProcedureOptions", searchLib.includes("export async function searchProcedureOptions"));
ok("searchInventoryItemOptions", searchLib.includes("export async function searchInventoryItemOptions"));
ok("searchLotOptions", searchLib.includes("export async function searchLotOptions"));
ok("searchWorkforceOptions", searchLib.includes("export async function searchWorkforceOptions"));
ok("searchRentalContractOptions", searchLib.includes("export async function searchRentalContractOptions"));
ok("searchPregnancyOptions", searchLib.includes("export async function searchPregnancyOptions"));
ok("paciente mascara CPF em opção", searchLib.includes("maskCpf"));

ok("searchPatients min 2 chars", patientsDir.includes("if (query.length < 2) return []"));

ok("AppointmentForm busca paciente remota", apptForm.includes("searchPatientOptions") && apptForm.includes("onSearch={searchPatients}"));
ok("AppointmentForm profissional remoto", apptForm.includes("searchProfessionalOptions"));
ok("AppointmentForm sala remota", apptForm.includes("searchRoomOptions"));
ok("AppointmentForm procedimento só se kind procedure",
  apptForm.includes('kind === "procedure"') && apptForm.includes("searchProcedureOptions"));
ok("AppointmentForm consulta sem procedimento UI", apptForm.includes("Consulta não exige procedimento"));
ok("EditAppointmentForm busca remota",
  editForm.includes("searchPatientOptions") && editForm.includes("searchProfessionalOptions"));

ok("AgendaFilters paciente+profissional+sala",
  filters.includes("Paciente") &&
    filters.includes("searchPatientOptions") &&
    filters.includes("searchProfessionalOptions") &&
    filters.includes("searchRoomOptions"));
ok("AgendaFilters presets período",
  filters.includes("Hoje") && filters.includes("7 dias") && filters.includes("14 dias") && filters.includes("Esta semana"));
ok("AgendaFilters tipo+status", filters.includes("Tipo") && filters.includes("Status"));

ok("AgendaPage sem listPatients full preload", !agenda.includes("listPatients("));
ok("AgendaPage resolve nomes por IDs do período", agenda.includes('.from("patients")') && agenda.includes(".in(\"id\", patientIds)"));
ok("listAppointments filtra patientId/roomId/kind",
  apptTypes.includes("patientId?: string") &&
    apptTypes.includes("roomId?: string") &&
    apptTypes.includes("kind?: AppointmentKind") &&
    apptDir.includes('query.eq("patient_id"') &&
    apptDir.includes('query.eq("room_id"') &&
    apptDir.includes('query.eq("kind"'));

ok("Estoque listItems ilike no SQL", invDir.includes("name.ilike.") && invDir.includes("sku.ilike."));
ok("Estoque movimentação EntityCombobox item", inventory.includes("searchItemsCb") && inventory.includes("EntityCombobox"));
ok("Estoque lote EntityCombobox", inventory.includes("searchLotsCb"));
ok("Estoque debounce busca lista", inventory.includes("debouncedSearch"));

ok("Contratos EntityCombobox paciente/profissional",
  contracts.includes("searchPatientOptions") && contracts.includes("searchProfessionalOptions"));
ok("Contratos procedimento autocomplete", contracts.includes("searchProcedureOptions"));

ok("Locações profissional remoto", rentals.includes("searchProfessionalOptions") && rentals.includes("EntityCombobox"));
ok("Locações sala combobox", rentals.includes("Sala (sublet)") && rentals.includes("EntityCombobox"));

ok("Workforce debounce", workforce.includes("debouncedQ") && workforce.includes("280"));
ok("Workforce busca função/email/telefone", workforceLib.includes("role_title.ilike"));

ok("RoomsBoard pesquisa nome/código/tipo", rooms.includes("roomSearch") && rooms.includes("Pesquisar salas"));

ok("Receita busca medicamento estoque",
  rx.includes("searchInventoryItemOptions") &&
    rx.includes("clinical_lot_controlled") &&
    rx.includes("EntityCombobox"));

ok("sem migration neste ciclo (helpers só ilike)",
  !searchLib.includes("create table") && !searchLib.includes("alter table"));

console.log(`\nUAT_C070_C3_ search: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070-C3 search.");
  process.exit(1);
}
console.log("OK — UAT_C070_C3_ busca inteligente estrutural.");
