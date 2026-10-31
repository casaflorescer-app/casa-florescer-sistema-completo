import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { casaFilesRoot } from "@/lib/files/casa-volume";
import { acceptCasaUpload, safeRelativePath } from "@/lib/files/casa-path";

export { acceptCasaUpload, clinicalDownloadAllowed, safeRelativePath } from "@/lib/files/casa-path";

function resolveInsideRoot(relative: string) {
  const safe = safeRelativePath(relative);
  if (!safe) return null;
  const root = path.resolve(casaFilesRoot());
  const target = path.resolve(root, safe);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return { root, target, safe };
}

export async function writePrivateFile(relative: string, bytes: Buffer) {
  const located = resolveInsideRoot(relative);
  if (!located) throw new Error("Caminho recusado.");
  await mkdir(path.dirname(located.target), { recursive: true, mode: 0o750 });
  try {
    await writeFile(located.target, bytes, { mode: 0o640 });
  } catch (error) {
    await rm(located.target, { force: true });
    throw error;
  }
  return {
    path: located.safe,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readPrivateFile(relative: string) {
  const located = resolveInsideRoot(relative);
  if (!located) return null;
  try {
    return await readFile(located.target);
  } catch {
    return null;
  }
}

export async function removePrivateFile(relative: string) {
  const located = resolveInsideRoot(relative);
  if (!located) return;
  await rm(located.target, { force: true });
}
