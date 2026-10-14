"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  auditDocumentDownload,
  createSignedDocumentUrl,
  listDocumentsForPatientPortal,
  markDocumentViewed,
} from "@/lib/documents/directory";
import {
  DOCUMENT_KIND_LABEL,
  SIGNATURE_KIND_LABEL,
  type ClinicalDocumentRow,
} from "@/lib/documents/types";
import { formatDateTime } from "@/lib/platform/format";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";

export function PortalClinicalDocuments({ supabase }: { supabase: SupabaseClient }) {
  const [rows, setRows] = useState<ClinicalDocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listDocumentsForPatientPortal(supabase);
    if (result.error) setError(result.error);
    else setError(null);
    setRows(result.rows);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onOpen(doc: ClinicalDocumentRow) {
    if (!doc.pdfStoragePath) {
      setError("Documento ainda sem PDF disponível.");
      return;
    }
    setBusyId(doc.id);
    setError(null);
    try {
      await markDocumentViewed(supabase, doc.id);
      await auditDocumentDownload(supabase, doc.id);
      const signed = await createSignedDocumentUrl(supabase, doc.pdfStoragePath, 120);
      if (signed.error || !signed.url) {
        setError(signed.error ?? "Não foi possível abrir o documento.");
        return;
      }
      window.open(signed.url, "_blank", "noopener,noreferrer");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card mt-4">
      <h2 className="text-base font-semibold text-lotus-900">Meus documentos</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Somente documentos disponibilizados pela sua médica. Conteúdo interno do prontuário não
        aparece aqui.
      </p>
      <div className="mt-3">
        <StatusMessage error={error} />
      </div>
      <button type="button" className={`${ghostButtonClass} mt-2`} onClick={() => void load()}>
        Atualizar
      </button>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-lotus-600">Nenhum documento disponível no momento.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lotus-100 px-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-lotus-950">
                  {DOCUMENT_KIND_LABEL[doc.documentKind]}
                </p>
                <p className="text-xs text-lotus-600">{formatDateTime(doc.issuedAt)}</p>
                <p className="mt-1 text-[11px] text-lotus-500">
                  {SIGNATURE_KIND_LABEL[doc.signatureKind]}
                </p>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={busyId === doc.id || !doc.pdfStoragePath}
                onClick={() => void onOpen(doc)}
              >
                Abrir / baixar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
