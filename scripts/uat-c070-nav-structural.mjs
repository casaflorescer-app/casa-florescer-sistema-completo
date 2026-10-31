/**
 * C070 B1 — UAT estrutural navegação enxuta.
 * Marcador: UAT_C070_NAV_
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

const nav = read("lib/auth/app-nav.ts");
const admin = read("app/(shell)/app/admin/page.tsx");
const rooms = read("components/clinic/RoomsBoard.tsx");
const rentals = read("components/rentals/RentalsModule.tsx");
const subnav = read("components/clinic/LocacoesSubnav.tsx");
const relationshipPage = read("app/(shell)/app/relationship/page.tsx");
const relationship = read("components/relationship/RelationshipCenter.tsx");

ok("Nav: Central de Relacionamentos", nav.includes("Central de Relacionamentos"));
ok(
  "Nav: sem segundo item Relacionamentos (?tab=contact)",
  !nav.includes("/app/relationship?tab=contact") && !nav.includes('id: "relationship-contact"'),
);
ok("Nav: Salas e Locações único", /label:\s*"Salas e [Ll]ocações"/.test(nav));
ok("Nav: sem item Aluguéis flat", !/id:\s*"rentals"/.test(nav));
ok("Nav: Administração hub", nav.includes('label: "Administração"') && nav.includes('href: "/app/admin"'));
ok("Nav: hub Pessoas", nav.includes('href: "/app/people"') && nav.includes('label: "Pessoas"'));
ok(
  "Nav: sem profissionais/especialidades/workforce flat",
  !nav.includes('id: "professionals"') &&
    !nav.includes('id: "specialties"') &&
    !nav.includes('id: "workforce"'),
);
ok("Nav: Contratos clínicos distinto", nav.includes("Contratos clínicos"));
ok(
  "Nav: sem Usuários/Organização/Permissões/Auditoria flat na gestão",
  !nav.includes('href: "/app/admin/users"') &&
    !nav.includes('href: "/app/admin/organization"') &&
    !nav.includes('href: "/app/admin/permissions"') &&
    !nav.includes('href: "/app/admin/audit"') &&
    !nav.includes('href: "/app/care-policies"'),
);
ok("Nav: Plataforma único (sem orgs/users/audit flat)",
  nav.includes('href: "/app/system"') &&
    !nav.includes('id: "system-orgs"') &&
    !nav.includes('id: "system-users"') &&
    !nav.includes('id: "system-audit"'));
ok(
  "Relationship page preserva deep-link ?tab=",
  relationshipPage.includes("useSearchParams") && relationshipPage.includes("initialTab"),
);

ok("Admin hub com cards Usuários", admin.includes("/app/admin/users") && admin.includes("Usuários"));
ok("Admin hub com Permissões", admin.includes("/app/admin/permissions"));
ok("Admin hub com Política", admin.includes("/app/care-policies"));

ok("LocacoesSubnav existe", subnav.includes("Salas") && subnav.includes("Aluguéis"));
ok("LocacoesSubnav contratos de locação", subnav.includes("Contratos de locação"));
ok("RoomsBoard usa LocacoesSubnav", rooms.includes("LocacoesSubnav") && rooms.includes('active="salas"'));
ok("RentalsModule usa LocacoesSubnav", rentals.includes("LocacoesSubnav"));
ok("RelationshipCenter aceita initialTab", relationship.includes("initialTab"));

const gestaoItems = [...nav.matchAll(/id:\s*"(rooms|clinical-contracts|people|professionals|specialties|workforce|inventory|reports|clinic-admin|rentals|care-policies|users)"/g)].map(
  (m) => m[1],
);
ok(
  "Gestão ~6 itens hub (rooms, contracts, people, inventory, reports, admin)",
  gestaoItems.length >= 5 &&
    gestaoItems.length <= 7 &&
    gestaoItems.includes("rooms") &&
    gestaoItems.includes("people") &&
    gestaoItems.includes("clinic-admin") &&
    !gestaoItems.includes("rentals") &&
    !gestaoItems.includes("professionals"),
);

console.log(`\nUAT_C070_NAV_ estrutural: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C070 nav estrutural.");
  process.exit(1);
}
console.log("OK — UAT_C070_NAV_ navegação enxuta.");
