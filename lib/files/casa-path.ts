const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const PHOTO_LIMIT = 2 * 1024 * 1024;
const DOCUMENT_LIMIT = 15 * 1024 * 1024;

export function safeRelativePath(value: string) {
  if (!value || value.includes("\0") || value.split(/[\\/]/).includes("..")) {
    return null;
  }
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return null;
  return value;
}

export function clinicalDownloadAllowed(input: {
  requested: string;
  stored: string | null;
  canRead: boolean;
}) {
  const safe = safeRelativePath(input.requested);
  if (!safe || !input.stored || safe !== input.stored || !input.canRead) return false;
  return true;
}

export function acceptCasaUpload(input: { kind: "photo" | "document"; type: string; size: number }) {
  if (input.kind === "photo") {
    if (!PHOTO_TYPES.has(input.type) || input.size <= 0 || input.size > PHOTO_LIMIT) return false;
    return true;
  }
  if (!DOCUMENT_TYPES.has(input.type) || input.size <= 0 || input.size > DOCUMENT_LIMIT) return false;
  return true;
}
