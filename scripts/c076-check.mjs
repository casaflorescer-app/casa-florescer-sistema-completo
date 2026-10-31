import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = join(root, "supabase/migrations");
const names = readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
const prelude = readFileSync(join(migrations, "0000_c076_postgres_prelude.sql"), "utf8");
const isolation = readFileSync(join(migrations, "0056_c076_practice_isolation.sql"), "utf8");
const failures = [];

function need(file, text, label) {
  if (!file.includes(text)) failures.push(label);
}

if (names[0] !== "0000_c076_postgres_prelude.sql") {
  failures.push("o prelúdio não é o primeiro arquivo");
}
if (names.at(-1) !== "0056_c076_practice_isolation.sql") {
  failures.push("o isolamento não é o último arquivo");
}
for (const name of names) {
  if (name >= "0001" && name <= "0055" && name.includes("c076")) {
    failures.push(`arquivo antigo alterado no nome: ${name}`);
  }
}

need(prelude, "function auth.uid()", "auth.uid");
need(prelude, "current_setting('app.user_id', true)", "app.user_id");
need(prelude, "storage.objects", "storage.objects");
need(prelude, "schema extensions", "schema extensions");
need(prelude, "pgcrypto with schema extensions", "pgcrypto");
const roles = readFileSync(join(root, "scripts/c076-roles.sql"), "utf8");
need(roles, "create role casa_app nologin", "casa_app");
need(prelude, "scripts/c076-roles.sql", "ordem dos papéis");
need(prelude, "$argon2id$%", "argon2id");
need(prelude, "Não aplicar sem autorização", "aviso de apply");

need(isolation, "can_read_cost_allocation", "despesa");
need(isolation, "array['owner', 'admin', 'secretary']", "cadastro sem médica no select da casa");
if (isolation.includes("array['secretary']::public.app_role[]")) {
  failures.push("secretária ainda aparece como papel de fatura");
}
need(isolation, "can_read_clinical", "prontuário");
need(isolation, "staff_login_hash", "hash de login");
need(isolation, "grant execute on function public.staff_login_hash(text) to casa_app", "hash só para casa_app");
if (/insert\s+into\s+public\.(organizations|practice_units|profiles|auth\.users)/i.test(isolation + prelude)) {
  failures.push("o SQL cria organização, prática ou usuário");
}

const login = readFileSync(join(root, "app/(shell)/login/ui.tsx"), "utf8");
const middleware = readFileSync(join(root, "lib/supabase/middleware.ts"), "utf8");
need(login, "NEXT_PUBLIC_CASA_AUTH", "login da casa");
need(middleware, "openCasaSession", "middleware da sessão");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("c076-check ok");
