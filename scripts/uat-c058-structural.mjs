/**
 * C058 — UAT estrutural (Estoque e Materiais).
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
const detail = read("app/app/inventory/[id]/page.tsx");
const mod = read("components/inventory/InventoryModule.tsx");
const dir = read("lib/inventory/directory.ts");
const types = read("lib/inventory/types.ts");
const access = read("lib/auth/access.ts");
const nav = read("lib/auth/app-nav.ts");
const docs = read("docs/c058-inventory.md");
const migrations = readdirSync(resolve(root, "supabase/migrations")).sort();
const mig = migrations.find((f) => f.startsWith("0051"));
const migration = mig ? read(`supabase/migrations/${mig}`) : "";

ok("Placeholder removido", !page.includes("ModulePlaceholder"));
ok("InventoryModule na página", page.includes("InventoryModule"));
ok("Rota detalhe [id]", detail.includes("focusItemId"));
ok("UI dashboard/materiais/movimentar/inventário", mod.includes("Painel") && mod.includes("Materiais") && mod.includes("Movimentar") && mod.includes("Inventário"));
ok("UI sem ComingSoon", !mod.includes("ComingSoon") && !mod.includes("Em breve"));
ok("directory: listItems/warehouses", dir.includes("listItems") && dir.includes("listWarehouses"));
ok("directory: receipt/exit/transfer/adjust/inventory", dir.includes("stock_movement_receipt") && dir.includes("stock_movement_exit") && dir.includes("stock_movement_transfer") && dir.includes("stock_inventory_confirm"));
ok("directory: saldo insuficiente mapeado", dir.includes("STOCK_INSUFFICIENT"));
ok("types: min/ideal/FEFO days", types.includes("minQty") && types.includes("idealQty") && types.includes("STOCK_EXPIRING_SOON_DAYS"));
ok("PATH_RULES inventory owner|admin|canManageStock", access.includes('prefix: "/app/inventory"') && access.includes("canManageStock"));
ok("Nav Estoques", nav.includes("Estoques") && nav.includes("/app/inventory"));
ok("Migration 0051 presente", Boolean(mig));
ok("Migration: stock_apply_qty_delta", migration.includes("stock_apply_qty_delta"));
ok("Migration: RPCs receipt/transfer/inventory", migration.includes("stock_movement_receipt") && migration.includes("stock_movement_transfer") && migration.includes("stock_inventory_confirm"));
ok("Migration: FOR UPDATE / STOCK_INSUFFICIENT", migration.includes("for update") && migration.includes("STOCK_INSUFFICIENT"));
ok("Migration: write_audit", migration.includes("write_audit"));
ok("Migration: SECURITY DEFINER + search_path", migration.includes("security definer") && migration.includes("search_path = public"));
ok("Migration: ideal_qty", migration.includes("ideal_qty"));
ok("Docs C058", docs.includes("C058") && docs.includes("stock_movements") && docs.includes("RBAC"));
ok("Sem mock operacional", !mod.includes("STOCK_PREVIEW") && !mod.toLowerCase().includes("mock") && !dir.includes("fake"));
ok("Reusa items/warehouses (sem materials paralelo)", dir.includes('from("items")') && dir.includes('from("warehouses")') && !dir.includes('from("materials")'));

console.log(`\nEstrutural C058: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C058.");
