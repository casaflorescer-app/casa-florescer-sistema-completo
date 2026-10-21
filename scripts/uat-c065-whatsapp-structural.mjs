/**
 * C065 — UAT estrutural WhatsApp Web + testes de normalização de telefone.
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

/** Espelho da lógica TS para UAT sem tsx. */
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhoneForWhatsApp(raw) {
  let e164 = digitsOnly(raw);
  if (!e164) return { ok: false, reason: "empty" };
  if (e164.startsWith("55") && (e164.length === 12 || e164.length === 13)) {
    // ok
  } else if (e164.length === 10 || e164.length === 11) {
    e164 = `55${e164}`;
  } else if (e164.startsWith("0") && (e164.length === 11 || e164.length === 12)) {
    e164 = `55${e164.replace(/^0+/, "")}`;
  } else {
    return { ok: false, reason: "invalid" };
  }
  if (e164.length !== 12 && e164.length !== 13) return { ok: false, reason: "invalid" };
  if (e164.slice(2, 4).startsWith("0")) return { ok: false, reason: "invalid" };
  return { ok: true, e164Digits: e164 };
}

function buildWhatsAppWebUrl(phone, message) {
  const n = normalizePhoneForWhatsApp(phone);
  if (!n.ok) return n;
  return {
    ok: true,
    url: `https://wa.me/${n.e164Digits}?text=${encodeURIComponent(message)}`,
  };
}

const files = [
  "lib/whatsapp/phone.ts",
  "lib/whatsapp/url.ts",
  "lib/whatsapp/messages.ts",
  "components/whatsapp/WhatsAppAction.tsx",
  "components/whatsapp/WhatsAppComposeDialog.tsx",
  "docs/c065-whatsapp-web.md",
];
for (const f of files) ok(`arquivo ${f}`, existsSync(resolve(root, f)));

const phoneSrc = read("lib/whatsapp/phone.ts");
const urlSrc = read("lib/whatsapp/url.ts");
const msgSrc = read("lib/whatsapp/messages.ts");
const actionSrc = read("components/whatsapp/WhatsAppAction.tsx");
const dialogSrc = read("components/whatsapp/WhatsAppComposeDialog.tsx");
const listSrc = read("components/patients/PatientList.tsx");
const chartSrc = read("components/attendance/PatientChart.tsx");
const cardSrc = read("components/attendance/AppointmentCard.tsx");
const relSrc = read("components/relationship/RelationshipCenter.tsx");
const rxSrc = read("components/prescriptions/PrescriptionsModule.tsx");
const examSrc = read("components/exams/ExamsModule.tsx");

ok("normalizePhoneForWhatsApp export", phoneSrc.includes("normalizePhoneForWhatsApp"));
ok("wa.me URL", urlSrc.includes("wa.me"));
ok("mensagens administrativas", msgSrc.includes("buildAppointmentConfirmationMessage"));
ok("feedback sem 'enviada'", dialogSrc.includes("WHATSAPP_FEEDBACK_OPENED") && !dialogSrc.includes("Mensagem enviada"));
ok("sem status SENT no componente WA", !actionSrc.includes("SENT") && !dialogSrc.includes("DELIVERED"));
ok("PatientList WhatsApp", listSrc.includes("WhatsAppComposeDialog") && listSrc.includes("whatsapp"));
ok("PatientChart WhatsAppAction", chartSrc.includes("WhatsAppAction"));
ok("Agenda WhatsApp", cardSrc.includes("WhatsAppComposeDialog") && cardSrc.includes("openWhatsAppCompose"));
ok("Central WhatsAppAction", relSrc.includes("WhatsAppAction"));
ok("Receitas documentHint", rxSrc.includes("documentHint"));
ok("Exames documentHint", examSrc.includes("documentHint"));
ok("docs limitação API", read("docs/c065-whatsapp-web.md").includes("NÃO é") && read("docs/c065-whatsapp-web.md").includes("wa.me"));

// Comportamento telefone
ok("máscara BR", normalizePhoneForWhatsApp("(18) 99999-9999").ok && normalizePhoneForWhatsApp("(18) 99999-9999").e164Digits === "5518999999999");
ok("sem máscara", normalizePhoneForWhatsApp("18999999999").e164Digits === "5518999999999");
ok("já com 55", normalizePhoneForWhatsApp("5518999999999").e164Digits === "5518999999999");
ok("vazio", normalizePhoneForWhatsApp("").reason === "empty");
ok("inválido curto", normalizePhoneForWhatsApp("123").reason === "invalid");
ok("acentos na URL", buildWhatsAppWebUrl("18999999999", "Olá, Maria.\nConfirmação").url.includes(encodeURIComponent("Olá")));
ok("quebra de linha na URL", buildWhatsAppWebUrl("18999999999", "A\nB").url.includes("%0A"));

console.log(`\nEstrutural C065 WhatsApp: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — higiene WhatsApp Web C065.");
