import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skip = new Set([
  "app",
  "public",
  "node_modules",
  ".next",
  "vercel.json",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "next.config.js",
  "server.js",
  "jsconfig.json",
  "tsconfig.json",
]);

export function copyPwaToPublic(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (skip.has(name)) continue;
    const from = join(srcDir, name);
    const to = join(destDir, name);
    if (statSync(from).isDirectory()) copyPwaToPublic(from, to);
    else copyFileSync(from, to);
  }
}

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
