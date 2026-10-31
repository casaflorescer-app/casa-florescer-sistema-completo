/**
 * C066 — UAT estrutural (polish V1 apresentação).
 * Marcador: UAT_C066_
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

const landing = read("app/(shell)/page.tsx");
const nav = read("lib/auth/app-nav.ts");
const adminHome = read("app/(shell)/app/admin/page.tsx");
const systemHome = read("app/(shell)/app/system/page.tsx");
const adminSettings = read("app/(shell)/app/admin/settings/page.tsx");
const systemSettings = read("app/(shell)/app/system/settings/page.tsx");
const middleware = read("middleware.ts");
const paths = read("lib/auth/paths.ts");
const relationship = read("components/relationship/RelationshipCenter.tsx");
const waUrl = read("lib/whatsapp/url.ts");
const professionals = read("components/clinic/ProfessionalsBoard.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const rentals = read("components/rentals/RentalsModule.tsx");
const locacoesSubnav = read("components/clinic/LocacoesSubnav.tsx");
const c063 = read("docs/c063-final-homologation.md");

// Landing
ok("Landing sem entrada 5", !/entrada\s*5/i.test(landing));
ok("Landing sem marcador entrada N", !/entrada\s*[0-9]/i.test(landing));
ok("Landing mantém Casa Florescer + login", landing.includes("Casa Florescer") && landing.includes("/login"));

// Settings fora do menu / redirect
ok("Nav sem clinic-settings", !nav.includes("clinic-settings") && !nav.includes("/app/admin/settings"));
ok("Nav sem system-settings", !nav.includes("system-settings") && !nav.includes("/app/system/settings"));
ok("Admin home sem link Configurações", !adminHome.includes("/app/admin/settings"));
ok("System home sem link Configurações", !systemHome.includes("/app/system/settings"));
ok("Admin settings redireciona", adminSettings.includes('redirect("/app/admin")'));
ok("System settings redireciona", systemSettings.includes('redirect("/app/system")'));

// Menu salas/locações (C070: um item no nav + LocacoesSubnav nas páginas)
ok("Nav Salas e locações", nav.includes("Salas e locações") && nav.includes('href: "/app/rooms"'));
ok(
  "Nav Aluguéis unificado via subnav (C070)",
  !/id:\s*"rentals"/.test(nav) &&
    locacoesSubnav.includes("/app/rentals") &&
    locacoesSubnav.includes("Aluguéis"),
);
ok(
  "Nav sem item flat Contratos de locação",
  !/id:\s*"rental-contracts"/.test(nav) && !/label:\s*"Contratos de locação"/.test(nav),
);
ok("Contratos clínicos preservados", nav.includes("Contratos clínicos") && nav.includes("/app/clinical-contracts"));
ok(
  "Rooms cross-link aluguéis via LocacoesSubnav",
  rooms.includes("LocacoesSubnav") && rooms.includes("Salas e locações"),
);
ok(
  "Rentals cross-link salas via LocacoesSubnav",
  rentals.includes("LocacoesSubnav") && locacoesSubnav.includes("/app/rooms"),
);

// Profissionais somente leitura explícito
ok("Profissionais declara somente leitura", /somente leitura/i.test(professionals));
ok("Profissionais sem botão Editar falso", !/Editar|Salvar|Novo profissional/i.test(professionals));

// Legado
ok("Middleware redireciona legado autenticado", middleware.includes("isLegacyPortalPath") && middleware.includes("AUTHENTICATED_HOME"));
ok("LEGACY_PORTAL_PREFIXES completos", ["/medica", "/secretaria", "/gestao", "/paciente"].every((p) => paths.includes(p)));
ok("resolveAuthenticatedPath evita legado", paths.includes("isLegacyPortalPath(path)") && paths.includes("AUTHENTICATED_HOME"));

// WhatsApp / Central
ok("wa.me URL builder", waUrl.includes("wa.me"));
ok("Central declara WhatsApp Web", /WhatsApp Web/i.test(relationship));
ok(
  "Central sem status de entrega falso na UI V1",
  !/SENT|DELIVERED|READ/.test(relationship) ||
    /não há confirmação de enviado|não fazem parte da V1/i.test(relationship),
);
// C068 ocultou campanhas da navegação V1; aceitar ocultas OU marcadas simulação.
ok(
  "Campanhas não aparentam envio real na V1",
  !/\["campaigns", "Campanhas"\]/.test(relationship) ||
    /simulação|SIMULAÇÃO|NÃO ENVIADO|não fazem parte da V1/i.test(relationship),
);

// Docs produção
ok("C063 docs aponta thvp oficial", c063.includes("sistema.thvp.cloud") && /legado|paralelo/i.test(c063));

console.log(`\nUAT_C066_ estrutural: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C066 estrutural.");
  process.exit(1);
}
console.log("OK — UAT_C066_ polish V1.");
