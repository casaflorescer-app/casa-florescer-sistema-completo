/**
 * C070 B3 — Agenda com período.
 * Marcador: UAT_C070_AGENDA_
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

const filters = read("components/attendance/AgendaFilters.tsx");
const page = read("components/attendance/AgendaPage.tsx");
const display = read("components/attendance/agenda-display.ts");
const board = read("components/attendance/AgendaDayBoard.tsx");

ok("dateRangeBoundsIso existe", display.includes("export function dateRangeBoundsIso"));
ok(
  "AgendaFilters De/Até",
  filters.includes("dateFrom") &&
    filters.includes("dateTo") &&
    filters.includes("onDateFromChange") &&
    filters.includes("onDateToChange") &&
    filters.includes("onRangeChange"),
);
ok("AgendaFilters presets", filters.includes("7 dias") && filters.includes("Hoje") && filters.includes("Esta semana"));
ok("AgendaPage usa dateFrom/dateTo", page.includes("dateFrom") && page.includes("dateTo") && page.includes("dateRangeBoundsIso"));
ok("AgendaPage sem dayBoundsIso de data única", !page.includes("dayBoundsIso("));
ok("AgendaDayBoard aceita dateTo", board.includes("dateTo"));

console.log(`\nUAT_C070_AGENDA_ range: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070 agenda range.");
  process.exit(1);
}
console.log("OK — UAT_C070_AGENDA_ período.");
