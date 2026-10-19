/**
 * C059 — UAT PWA (manifest, icons, SW seguro, metadata).
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

const manifest = JSON.parse(read("public/manifest.json"));
const sw = read("public/sw.js");
const layout = read("app/layout.tsx");
const pwa = read("components/pwa/PwaRegister.tsx");

ok("name", Boolean(manifest.name));
ok("short_name", Boolean(manifest.short_name));
ok("description", Boolean(manifest.description));
ok("start_url=/app", manifest.start_url === "/app");
ok("scope=/", manifest.scope === "/");
ok("display=standalone", manifest.display === "standalone");
ok("theme_color", Boolean(manifest.theme_color));
ok("background_color", Boolean(manifest.background_color));
ok("orientation any (não força portrait)", manifest.orientation === "any" || !manifest.orientation);
ok("icons any 192", manifest.icons?.some((i) => i.sizes === "192x192" && String(i.purpose).includes("any")));
ok("icons any 512", manifest.icons?.some((i) => i.sizes === "512x512" && String(i.purpose).includes("any")));
ok("icons maskable presentes", manifest.icons?.some((i) => String(i.purpose).includes("maskable")));
ok("icon-192 file", existsSync(resolve(root, "public/icons/icon-192.png")));
ok("icon-512 file", existsSync(resolve(root, "public/icons/icon-512.png")));
ok("apple-touch-icon file", existsSync(resolve(root, "public/icons/apple-touch-icon.png")));
ok("favicon file", existsSync(resolve(root, "public/icons/favicon-32.png")));
ok("layout manifest link", layout.includes('manifest: "/manifest.json"') || layout.includes("manifest.json"));
ok("appleWebApp capable", layout.includes("appleWebApp") && layout.includes("capable: true"));
ok("themeColor metadata", layout.includes("themeColor") || layout.includes("theme-color"));
ok("viewportFit cover", layout.includes('viewportFit: "cover"') || layout.includes("viewportFit"));
ok("SW estático-only paths", sw.includes("/_next/static/") && sw.includes("/icons/"));
ok("SW ignora navigate", sw.includes('mode === "navigate"'));
ok("SW limpa caches antigos", sw.includes("caches.delete") && sw.includes("clients.claim"));
ok("SW skipWaiting (atualização)", sw.includes("skipWaiting"));
ok("SW sem IndexedDB clínico", !sw.toLowerCase().includes("indexeddb") && !sw.includes("localStorage"));
ok("SW sem precache de rotas /app clínicas", !/PRECACHE[\s\S]*\/app\//.test(sw));
ok("PwaRegister não em static hosting forçado errado", pwa.includes("isStaticHosting") && pwa.includes("register"));
ok("Sem promise falsa de instalado", !pwa.toLowerCase().includes("aplicativo instalado"));

console.log(`\nPWA C059: ${pass}/${pass + fail}`);
if (fail > 0) process.exit(1);
console.log("OK — PWA C059.");
