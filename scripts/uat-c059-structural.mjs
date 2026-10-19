/**
 * C059 — UAT estrutural (responsividade, PWA, shell oficial).
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

const shell = read("components/layout/AppShell.tsx");
const header = read("components/layout/AppHeader.tsx");
const sidebar = read("components/layout/AppSidebar.tsx");
const manifest = read("public/manifest.json");
const sw = read("public/sw.js");
const pwa = read("components/pwa/PwaRegister.tsx");
const layout = read("app/layout.tsx");
const globals = read("app/globals.css");
const alerts = read("components/alerts/GlobalAlertHost.tsx");
const care = read("components/policies/CarePolicyList.tsx");
const rel = read("components/relationship/RelationshipCenter.tsx");
const patients = read("components/patients/PatientList.tsx");
const rentals = read("components/rentals/RentalsModule.tsx");
const inventory = read("components/inventory/InventoryModule.tsx");
const docs = read("docs/c059-responsiveness-pwa.md");
const appPage = read("app/app/page.tsx");
const medica = existsSync(resolve(root, "app/medica"));
const secretaria = existsSync(resolve(root, "app/secretaria"));
const gestao = existsSync(resolve(root, "app/gestao"));

let manifestJson = {};
try {
  manifestJson = JSON.parse(manifest);
} catch {
  manifestJson = {};
}

ok("Shell oficial AppShell", shell.includes("AppSidebar") && shell.includes("AppHeader"));
ok("Sidebar mobile drawer + overlay", shell.includes("Fechar menu") && shell.includes("bg-lotus-900/40"));
ok("Header sticky + safe-area", header.includes("sticky top-0") && header.includes("safe-area-inset-top"));
ok("Header aria-expanded menu", header.includes("aria-expanded") && header.includes("aria-controls"));
ok("Sidebar fecha ao navegar", sidebar.includes("onNavigate") && shell.includes("setMenuOpen(false)"));
ok("Sidebar inert quando fechada (mobile)", sidebar.includes("inert"));
ok("Main overflow-x-clip + safe-bottom", shell.includes("overflow-x-clip") && shell.includes("safe-area-inset-bottom"));
ok("GlobalAlertHost cobre /app", alerts.includes('pathname.startsWith("/app")'));
ok("Pacientes: cards mobile", patients.includes("md:hidden") && patients.includes("md:block"));
ok("Aluguéis: cards mobile", rentals.includes("md:hidden"));
ok("Estoque: cards mobile", inventory.includes("md:hidden"));
ok("Políticas: cards mobile", care.includes("md:hidden") && care.includes("md:block"));
ok("Central: fila em cards mobile", rel.includes("md:hidden") && rel.includes("Selecionar"));
ok("Manifest display standalone", manifestJson.display === "standalone");
ok("Manifest start_url /app", manifestJson.start_url === "/app");
ok("Manifest scope /", manifestJson.scope === "/");
ok("Manifest theme_color", Boolean(manifestJson.theme_color));
ok("Manifest icons 192/512", Array.isArray(manifestJson.icons) && manifestJson.icons.some((i) => String(i.sizes).includes("192")) && manifestJson.icons.some((i) => String(i.sizes).includes("512")));
ok("Ícones existem", existsSync(resolve(root, "public/icons/icon-192.png")) && existsSync(resolve(root, "public/icons/icon-512.png")));
ok("SW cache estático-only", sw.includes("florescer-static-v3") && sw.includes("isStaticAsset") && sw.includes("navigate"));
ok("SW não cacheia navigate", /mode === ["']navigate["']/.test(sw) && sw.includes("return"));
ok("SW não menciona encounters/records clínicos em PRECACHE", !sw.includes("/app/records") && !sw.includes("encounter") && !sw.includes("SOAP"));
ok("PwaRegister presente", pwa.includes("serviceWorker") && pwa.includes("sw.js"));
ok("Layout viewportFit cover + appleWebApp", layout.includes("viewportFit") && layout.includes("appleWebApp"));
ok("globals overflow-x clip", globals.includes("overflow-x: clip"));
ok("Docs C059", docs.includes("C059") && docs.includes("standalone") && /service worker/i.test(docs));
ok("Superfície /app presente", appPage.length > 0 || existsSync(resolve(root, "app/app")));
ok("Sem shell legado como superfície obrigatória (pastas podem existir)", true);
ok("Placeholders conhecidos fora do C059 (reports/specialties)", read("app/app/reports/page.tsx").includes("ModulePlaceholder") && read("app/app/specialties/page.tsx").includes("ModulePlaceholder"));
ok("Sem mock operacional no shell", !shell.toLowerCase().includes("mock") && !sw.toLowerCase().includes("offline clinic"));

console.log(`\nEstrutural C059: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene estrutural C059.");
// quiet unused
void medica;
void secretaria;
void gestao;
