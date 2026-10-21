#!/usr/bin/env node
/**
 * Gera segredos do self-host e grava em deploy/.env.
 * Não imprime ANON_KEY nem SERVICE_ROLE_KEY.
 *
 *   node deploy/generate-keys.mjs
 *   node deploy/generate-keys.mjs --force
 *   node deploy/generate-keys.mjs --sync-public
 *   node deploy/generate-keys.mjs --self-test
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_ANON_FRAGMENT = "InJvbGUiOiAiYW5vbiI";

const SECRET_KEYS = [
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "DASHBOARD_PASSWORD",
  "SECRET_KEY_BASE",
  "REALTIME_DB_ENC_KEY",
  "VAULT_ENC_KEY",
  "PG_META_CRYPTO_KEY",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "LOGFLARE_PUBLIC_ACCESS_TOKEN",
  "LOGFLARE_PRIVATE_ACCESS_TOKEN",
  "MINIO_ROOT_PASSWORD",
];

function parseArgs(argv) {
  const args = { env: join(ROOT, "deploy", ".env"), force: false, syncPublic: false, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") args.force = true;
    else if (arg === "--sync-public") args.syncPublic = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--env") {
      args.env = resolve(argv[i + 1] ?? "");
      i += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  return args;
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/'\\''/g, "'");
  }
  return value;
}

function formatValue(value) {
  if (/^[A-Za-z0-9_@.:/+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], unquote(match[2]));
  }
  return values;
}

function upsert(text, key, value) {
  const line = `${key}=${formatValue(value)}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  const suffix = text.endsWith("\n") || text.length === 0 ? "" : "\n";
  return `${text}${suffix}${line}\n`;
}

function hex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function decodePayload(token) {
  const part = token.split(".")[1];
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export function createSecrets() {
  const now = Math.floor(Date.now() / 1000);
  const jwtSecret = randomBytes(48).toString("base64url");
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const base = { iss: "supabase", iat: now, exp };
  return {
    POSTGRES_PASSWORD: hex(24),
    JWT_SECRET: jwtSecret,
    ANON_KEY: signJwt({ ...base, role: "anon" }, jwtSecret),
    SERVICE_ROLE_KEY: signJwt({ ...base, role: "service_role" }, jwtSecret),
    DASHBOARD_PASSWORD: hex(24),
    SECRET_KEY_BASE: randomBytes(48).toString("base64url"),
    REALTIME_DB_ENC_KEY: hex(8),
    VAULT_ENC_KEY: hex(16),
    PG_META_CRYPTO_KEY: randomBytes(24).toString("base64url"),
    S3_PROTOCOL_ACCESS_KEY_ID: hex(16),
    S3_PROTOCOL_ACCESS_KEY_SECRET: hex(32),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: randomBytes(24).toString("base64url"),
    LOGFLARE_PRIVATE_ACCESS_TOKEN: randomBytes(24).toString("base64url"),
    MINIO_ROOT_PASSWORD: hex(16),
  };
}

function needsGeneration(values) {
  return SECRET_KEYS.some((key) => {
    const value = values.get(key) ?? "";
    return value.length === 0 || value.startsWith("CHANGE_ME") || value.includes(DEMO_ANON_FRAGMENT);
  });
}

function assertSafeSecrets(secrets) {
  if (secrets.ANON_KEY === secrets.SERVICE_ROLE_KEY) {
    throw new Error("ANON_KEY e SERVICE_ROLE_KEY coincidiram.");
  }
  if (decodePayload(secrets.ANON_KEY).role !== "anon") {
    throw new Error("ANON_KEY sem papel anon.");
  }
  if (decodePayload(secrets.SERVICE_ROLE_KEY).role !== "service_role") {
    throw new Error("SERVICE_ROLE_KEY sem papel service_role.");
  }
  if (secrets.JWT_SECRET.length < 32) throw new Error("JWT_SECRET curto.");
  if (secrets.REALTIME_DB_ENC_KEY.length !== 16) throw new Error("REALTIME_DB_ENC_KEY deve ter 16 caracteres.");
  if (secrets.VAULT_ENC_KEY.length !== 32) throw new Error("VAULT_ENC_KEY deve ter 32 caracteres.");
  if (secrets.SECRET_KEY_BASE.length < 64) throw new Error("SECRET_KEY_BASE curto.");
  if (secrets.ANON_KEY.includes(DEMO_ANON_FRAGMENT)) throw new Error("Chave de demonstração.");
}

function writeSecrets(envPath, secrets) {
  let text = readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(secrets)) {
    text = upsert(text, key, value);
  }
  text = upsert(text, "NEXT_PUBLIC_SUPABASE_ANON_KEY", secrets.ANON_KEY);
  writeFileSync(envPath, text, { mode: 0o600 });
}

export function syncPublicUrls(envPath) {
  let text = readFileSync(envPath, "utf8");
  const values = parseEnv(text);
  const appHost = (values.get("APP_HOST") ?? "").trim();
  const apiHost = (values.get("API_HOST") ?? "").trim();
  if (!appHost || !apiHost) {
    throw new Error("Preencha APP_HOST e API_HOST em deploy/.env antes de sincronizar as URLs.");
  }
  if (appHost.includes("://") || apiHost.includes("://") || appHost.includes("/") || apiHost.includes("/")) {
    throw new Error("APP_HOST e API_HOST são só o domínio, sem https:// e sem caminho.");
  }
  const anon = values.get("ANON_KEY") ?? "";
  if (!anon || anon.startsWith("CHANGE_ME")) {
    throw new Error("Gere as chaves antes de sincronizar as URLs.");
  }
  const pairs = {
    SITE_URL: `https://${appHost}`,
    SUPABASE_PUBLIC_URL: `https://${apiHost}`,
    API_EXTERNAL_URL: `https://${apiHost}/auth/v1`,
    ADDITIONAL_REDIRECT_URLS: [
      `https://${appHost}`,
      `https://${appHost}/**`,
      `https://${appHost}/auth/callback`,
      `https://${appHost}/auth/reset-password`,
    ].join(","),
    NEXT_PUBLIC_SUPABASE_URL: `https://${apiHost}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  };
  for (const [key, value] of Object.entries(pairs)) {
    text = upsert(text, key, value);
  }
  writeFileSync(envPath, text, { mode: 0o600 });
}

function generate(envPath, force) {
  const text = readFileSync(envPath, "utf8");
  const values = parseEnv(text);
  if (!force && !needsGeneration(values)) {
    process.stdout.write("Segredos já existem. Use --force para rotacionar (exige rebuild e reinício).\n");
    return;
  }
  const secrets = createSecrets();
  assertSafeSecrets(secrets);
  writeSecrets(envPath, secrets);
  process.stdout.write("Segredos gravados. A chave service_role não foi impressa.\n");
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "casa-keys-"));
  const envPath = join(dir, ".env");
  const logs = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    logs.push(String(chunk));
    return original(chunk, ...rest);
  };
  try {
    writeFileSync(envPath, readFileSync(join(ROOT, "deploy", ".env.example"), "utf8"), { mode: 0o600 });
    generate(envPath, false);
    const values = parseEnv(readFileSync(envPath, "utf8"));
    const secrets = Object.fromEntries(SECRET_KEYS.map((key) => [key, values.get(key)]));
    assertSafeSecrets(secrets);
    if (values.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") !== secrets.ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY divergiu da ANON_KEY.");
    }
    const leaked = logs.join("").includes("eyJ");
    if (leaked) throw new Error("O comando imprimiu um JWT.");
    writeFileSync(envPath, upsert(readFileSync(envPath, "utf8"), "APP_HOST", "sistema.exemplo.com"));
    writeFileSync(envPath, upsert(readFileSync(envPath, "utf8"), "API_HOST", "api.exemplo.com"));
    syncPublicUrls(envPath);
    const synced = parseEnv(readFileSync(envPath, "utf8"));
    if (synced.get("NEXT_PUBLIC_SUPABASE_URL") !== "https://api.exemplo.com") {
      throw new Error("URL pública não sincronizada.");
    }
    if (synced.get("API_EXTERNAL_URL") !== "https://api.exemplo.com/auth/v1") {
      throw new Error("API_EXTERNAL_URL incorreta.");
    }
  } finally {
    process.stdout.write = original;
    rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write("self-test ok\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  selfTest();
} else if (args.syncPublic) {
  syncPublicUrls(args.env);
  process.stdout.write("URLs públicas gravadas.\n");
} else {
  generate(args.env, args.force);
}
