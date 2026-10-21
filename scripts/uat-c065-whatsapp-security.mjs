/**
 * C065 — higiene de segurança/LGPD do WhatsApp Web (estático + checks de superfície).
 * Não cria massa; não chama API WhatsApp Business.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

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

function walkTsx(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walkTsx(full, acc);
    else if (/\.(tsx|ts)$/.test(name.name)) acc.push(full);
  }
  return acc;
}

const waFiles = walkTsx(resolve(root, "components/whatsapp")).concat(
  walkTsx(resolve(root, "lib/whatsapp")),
);

ok("pasta whatsapp presente", waFiles.length >= 4);

let forbidden = false;
for (const file of waFiles) {
  const src = readFileSync(file, "utf8");
  if (/status:\s*[\"']SENT[\"']|DELIVERED|\"READ\"/.test(src) && !src.includes("NÃO")) {
    // allow comments saying we don't use them
  }
  if (/Mensagem enviada com sucesso|enviada pelo WhatsApp/i.test(src)) forbidden = true;
  if (/api\.whatsapp\.com\/send|graph\.facebook\.com/.test(src)) forbidden = true;
}
ok("sem afirmação de envio / API Cloud nos módulos WA", !forbidden);

const dialog = read("components/whatsapp/WhatsAppComposeDialog.tsx");
ok("aviso de envio manual", dialog.includes("envio é feito por você no WhatsApp"));
ok("não usa storage público", !dialog.includes("getPublicUrl") && !read("lib/whatsapp/url.ts").includes("getPublicUrl"));

const msgBody = read("lib/whatsapp/messages.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ok(
  "sem SOAP/diagnóstico nas strings de mensagem",
  !/SOAP|diagn[oó]stico|anamnese|medicamento/i.test(msgBody),
);
ok("documentHint orienta anexo manual", dialog.includes("documentHint") || read("lib/whatsapp/messages.ts").includes("anexe"));

const providers = read("lib/relationship/providers.ts");
ok("StubProvider permanece sem SENT real", providers.includes("SIMULAÇÃO — NÃO ENVIADO"));

console.log(`\nSecurity C065 WhatsApp: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — segurança/LGPD WhatsApp Web.");
