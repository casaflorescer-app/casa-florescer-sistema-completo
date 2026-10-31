/**
 * C070-C8 — atalhos externos Chatwoot + Evolution Manager.
 * Marcador: UAT_C070_C8_
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

const services = read("lib/integrations/external-services.ts");
const externalLink = read("components/ui/ExternalServiceLink.tsx");
const nav = read("lib/auth/app-nav.ts");
const navItem = read("components/layout/NavItem.tsx");
const sidebar = read("components/layout/AppSidebar.tsx");
const central = read("components/relationship/RelationshipCenter.tsx");
const adminHub = read("app/(shell)/app/admin/page.tsx");
const adminInteg = read("app/(shell)/app/admin/integrations/page.tsx");
const adminSub = read("components/clinic-admin/AdminSubnav.tsx");
const access = read("lib/auth/access.ts");
const envExample = read(".env.example");

const CHATWOOT =
  "https://cap-romao-chatwoot.cr49ek.easypanel.host?utm_source=chatgpt.com";
const EVOLUTION =
  "https://cap-romao-evolution-api.cr49ek.easypanel.host/manager?utm_source=chatgpt.com";

ok("external-services Chatwoot fallback", services.includes(CHATWOOT));
ok("external-services Evolution fallback", services.includes(EVOLUTION));
ok("external-services lê NEXT_PUBLIC_CHATWOOT_URL", services.includes("NEXT_PUBLIC_CHATWOOT_URL"));
ok(
  "external-services lê NEXT_PUBLIC_EVOLUTION_MANAGER_URL",
  services.includes("NEXT_PUBLIC_EVOLUTION_MANAGER_URL"),
);
ok("env.example documenta URLs externas", envExample.includes("NEXT_PUBLIC_CHATWOOT_URL"));

ok("ExternalServiceLink target blank", externalLink.includes('target="_blank"'));
ok("ExternalServiceLink noopener", externalLink.includes("noopener noreferrer"));
ok("ExternalServiceLink sem iframe", !externalLink.includes("<iframe"));

ok("Nav Chatwoot external", nav.includes('id: "relationship-chatwoot"') && nav.includes("external: true"));
ok("Nav mantém Central", nav.includes("Central de Relacionamentos"));
ok("Nav sem relationship-contact", !nav.includes('id: "relationship-contact"'));
ok("Nav usa getChatwootUrl", nav.includes("getChatwootUrl"));
ok("NavItem suporte external", navItem.includes("external") && navItem.includes('target="_blank"'));
ok("Sidebar não marca external active", sidebar.includes("isExternal") && sidebar.includes("? false"));

ok("Central ExternalServiceLink Chatwoot", central.includes("ExternalServiceLink") && central.includes("Abrir Chatwoot"));
ok("Central getChatwootUrl", central.includes("getChatwootUrl"));

ok("Admin hub card Integrações", adminHub.includes("/app/admin/integrations"));
ok("Admin Integrações page", adminInteg.includes("Integrações") && adminInteg.includes("getEvolutionManagerUrl"));
ok("Admin Integrações Chatwoot + Manager", adminInteg.includes("Abrir Chatwoot") && adminInteg.includes("Abrir WhatsApp Manager"));
ok("AdminSubnav Integrações", adminSub.includes('id: "integrations"'));

ok("Evolution NÃO na sidebar operacional", !nav.includes("getEvolutionManagerUrl") && !nav.includes("Evolution"));
ok("PATH /app/admin owner|admin preservado", /prefix:\s*"\/app\/admin"[\s\S]{0,120}owner[\s\S]{0,80}admin/.test(access));
ok(
  "Sem credenciais no código C8",
  !services.includes("password") &&
    !services.includes("api_key") &&
    !adminInteg.includes("API_KEY") &&
    !externalLink.includes("token"),
);

console.log(`\nUAT_C070_C8_RESULT pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
