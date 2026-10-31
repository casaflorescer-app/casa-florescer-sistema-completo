/**
 * C068 — UAT estrutural (fechamento V1 apresentação).
 * Marcador: UAT_C068_
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

const dash = read("components/dashboard/RoleDashboard.tsx");
const physician = read("components/dashboard/PhysicianPanel.tsx");
const relationship = read("components/relationship/RelationshipCenter.tsx");
const exams = read("components/exams/ExamsModule.tsx");
const professionals = read("components/clinic/ProfessionalsBoard.tsx");
const wa = read("lib/whatsapp/url.ts");

ok("Dashboard gestão sem SYSTEM_ADMIN", !dash.includes("SYSTEM_ADMIN"));
ok("Dashboard gestão sem dump Práticas:", !dash.includes("Práticas:"));
ok("Dashboard gestão título Gestão da clínica", dash.includes("Gestão da clínica"));
ok("Dashboard secretaria título Secretaria", dash.includes(">Secretaria<") || dash.includes("Secretaria"));
ok("Dashboard gestão atalho Central de Relacionamentos", dash.includes("/app/relationship") && dash.includes("Central de Relacionamentos"));
ok(
  "Dashboard gestão Salas e Locações único (sem card Aluguéis separado)",
  dash.includes("/app/rooms") &&
    dash.includes("Salas e Locações") &&
    !dash.includes("Aluguéis e contratos"),
);
ok(
  "Dashboard gestão Pessoas hub (sem Profissionais/Funcionários flat)",
  dash.includes("/app/people") &&
    dash.includes('title="Pessoas"') &&
    !dash.includes('title="Profissionais"') &&
    !dash.includes('title="Funcionários"'),
);

ok(
  "PhysicianPanel mensagem amigável sem vínculo",
  physician.includes("perfil profissional ainda não está configurado"),
);
ok(
  "PhysicianPanel sem jargão vínculo técnico",
  !physician.includes("Vínculo profissional não encontrado"),
);

ok("Exames: orientação Agenda/prontuário", exams.includes("Ir à Agenda") && exams.includes("Abrir prontuário"));
ok(
  "Exames: mensagem clara encounter",
  exams.includes("atendimento em andamento") || exams.includes("abra primeiro o atendimento"),
);
ok("Exames: sem jargão RPC na página principal", !exams.includes("RPC C040.9"));

ok("Campanhas fora das abas V1", !/\["campaigns", "Campanhas"\]/.test(relationship));
ok("Central WhatsApp Web", /WhatsApp Web/i.test(relationship));
ok(
  "Central sem SENT/DELIVERED/READ como status operacional",
  !relationship.includes("status SENT") && !relationship.includes("Mensagens com status SENT"),
);
ok("Stub campanhas se acessado", relationship.includes("não fazem parte da V1"));

ok("Profissionais somente leitura", /somente leitura/i.test(professionals));
ok("wa.me preservado", wa.includes("wa.me"));

console.log(`\nUAT_C068_ estrutural: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAIL — C068 estrutural.");
  process.exit(1);
}
console.log("OK — UAT_C068_ fechamento V1.");
