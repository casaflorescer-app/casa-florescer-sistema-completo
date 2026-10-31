import assert from "node:assert/strict";
import test from "node:test";
import { acceptCasaUpload, clinicalDownloadAllowed, safeRelativePath } from "../lib/files/casa-path.ts";

test("caminho com subida de diretório é recusado", () => {
  assert.equal(safeRelativePath("../segredo"), null);
  assert.equal(safeRelativePath("/etc/passwd"), null);
  assert.equal(safeRelativePath("org/paciente/photo"), "org/paciente/photo");
});

test("download só ocorre com o caminho gravado e permissão", () => {
  assert.equal(
    clinicalDownloadAllowed({
      requested: "org/pratica/paciente/doc/document.pdf",
      stored: "org/pratica/paciente/doc/document.pdf",
      canRead: true,
    }),
    true,
  );
  assert.equal(
    clinicalDownloadAllowed({
      requested: "org/pratica/paciente/doc/document.pdf",
      stored: "org/outra/paciente/doc/document.pdf",
      canRead: true,
    }),
    false,
  );
  assert.equal(
    clinicalDownloadAllowed({
      requested: "org/pratica/paciente/doc/document.pdf",
      stored: "org/pratica/paciente/doc/document.pdf",
      canRead: false,
    }),
    false,
  );
  assert.equal(
    clinicalDownloadAllowed({
      requested: "../document.pdf",
      stored: "../document.pdf",
      canRead: true,
    }),
    false,
  );
});

test("tipo e tamanho fora da lista não entram", () => {
  assert.equal(acceptCasaUpload({ kind: "photo", type: "image/gif", size: 1000 }), false);
  assert.equal(acceptCasaUpload({ kind: "photo", type: "image/jpeg", size: 3 * 1024 * 1024 }), false);
  assert.equal(acceptCasaUpload({ kind: "photo", type: "image/png", size: 1000 }), true);
  assert.equal(acceptCasaUpload({ kind: "document", type: "text/html", size: 100 }), false);
  assert.equal(acceptCasaUpload({ kind: "document", type: "application/pdf", size: 1000 }), true);
});
