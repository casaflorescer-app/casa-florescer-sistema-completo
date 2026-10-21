/**
 * C061 — UAT estrutural (classificação + equipamentos).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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

const page = read("app/app/inventory/page.tsx");
const mod = read("components/inventory/InventoryModule.tsx");
const equipUi = read("components/inventory/EquipmentPanel.tsx");
const dir = read("lib/inventory/directory.ts");
const equipLib = read("lib/inventory/equipment.ts");
const types = read("lib/inventory/types.ts");
const access = read("lib/auth/access.ts");
const docs = read("docs/c061-stock-equipment.md");
const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig51 = migrations.find((f) => f.startsWith("0051"));
const mig53 = migrations.find((f) => f.startsWith("0053"));
const migration53 = mig53 ? read(`supabase/migrations/${mig53}`) : "";

ok("Página inventory preservada", page.includes("InventoryModule"));
ok("Aba Equipamentos na UI", mod.includes('"equipment"') && mod.includes("Equipamentos"));
ok("EquipmentPanel montado", mod.includes("EquipmentPanel") && equipUi.includes("Novo equipamento"));
ok("Separação consumível ≠ patrimônio", equipUi.includes("patrimoniais") || equipUi.includes("Patrimônio") || equipLib.includes("clinic_equipment"));
ok("Lib aponta clinic_equipment", equipLib.includes('from("clinic_equipment")'));
ok("Classes C061: surgical + procedure", types.includes("surgical_consumable") && types.includes("procedure_consumable"));
ok("Labels: Medicamento / alimentício / cirúrgico", types.includes("Medicamento") && types.includes("Gênero alimentício") && types.includes("Material cirúrgico"));
ok("Labels: procedimento / gerais", types.includes("Material de procedimento") && types.includes("Material geral"));
ok("Equipment statuses", types.includes("maintenance") && types.includes("disposed") && types.includes("EQUIPMENT_STATUS_LABEL"));
ok("directory reusa stock_* (sem módulo paralelo)", dir.includes("stock_movement_receipt") && dir.includes('from("items")') && !dir.includes('from("materials")'));
ok("directory dashboard equipamentos", dir.includes("equipmentTotal") && dir.includes("countEquipmentStats"));
ok("equipment lib: upsert/transfer", equipLib.includes("clinic_equipment_upsert") && equipLib.includes("clinic_equipment_transfer"));
ok("Warehouse room_id na UI", mod.includes("room_id") || mod.includes("roomId"));
ok("PATH_RULES inventory inalterado", access.includes('prefix: "/app/inventory"') && access.includes("canManageStock"));
ok("Migration 0051 preservada", Boolean(mig51));
ok("Migration 0053 presente", Boolean(mig53));
ok("0053: clinic_equipment + events", migration53.includes("clinic_equipment") && migration53.includes("clinic_equipment_events"));
ok("0053: enum surgical/procedure", migration53.includes("surgical_consumable") && migration53.includes("procedure_consumable"));
ok("0053: RLS can_access_stock", migration53.includes("can_access_stock"));
ok("0053: write_audit + SECURITY DEFINER", migration53.includes("write_audit") && migration53.includes("security definer") && migration53.includes("search_path = public"));
ok("0053: room_id FK rooms", migration53.includes("references public.rooms"));
ok("0053: transfer RPC", migration53.includes("clinic_equipment_transfer"));
ok("Docs C061", docs.includes("C061") && docs.includes("clinic_equipment") && docs.includes("RBAC"));
ok("Sem mock operacional", !mod.toLowerCase().includes("mock") && !equipUi.includes("fakeEquipment") && !equipLib.includes("MOCK_"));
ok("Sem integração receita/procedimento automática", !dir.includes("prescription") && !equipLib.includes("procedure_consume"));
ok("C058 ops preservadas na UI", mod.includes("Movimentar") && mod.includes("Inventário") && mod.includes("Estoque mínimo"));

console.log(`\nEstrutural C061: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C061.");
