"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  auditDocumentDownload,
  createSignedDocumentUrl,
  listDocumentsForEncounter,
} from "@/lib/documents/directory";
import {
  DOCUMENT_KIND_LABEL,
  DOCUMENT_STATUS_LABEL,
  SIGNATURE_KIND_LABEL,
  type ClinicalDocumentRow,
} from "@/lib/documents/types";
import { formatDateTime } from "@/lib/platform/format";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";

export function EncounterDocumentsPanel({
  supabase,
  encounterId,
  locked,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  locked: boolean;
}) {
  const [rows, setRows] = useState<ClinicalDocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listDocumentsForEncounter(supabase, encounterId);
    if (result.error) setError(result.error);
    else setError(null);
    setRows(result.rows);
  }, [encounterId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onOpen(doc: ClinicalDocumentRow) {
    if (!doc.pdfStoragePath) {
      setError("PDF ainda não anexado a este documento.");
      return;
    }
    setBusyId(doc.id);
    setError(null);
    setNotice(null);
    try {
      await auditDocumentDownload(supabase, doc.id);
      const signed = await createSignedDocumentUrl(supabase, doc.pdfStoragePath, 120);
      if (signed.error || !signed.url) {
        setError(signed.error ?? "Falha ao abrir documento.");
        return;
      }
      window.open(signed.url, "_blank", "noopener,noreferrer");
      setNotice("URL assinada gerada (expira em ~2 minutos).");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="documentos" className="card mt-4 overflow-x-hidden">
      <h2 className="text-base font-semibold text-lotus-900">Documentos</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Documentos médicos emitidos a partir deste atendimento. Após finalização são imutáveis.
        A validação registrada é <strong>interna do sistema</strong> — não é assinatura digital
        ICP-Brasil.
      </p>
      {locked ? (
        <p className="mt-2 text-xs text-lotus-500">Atendimento assinado — área somente leitura.</p>
      ) : null}
      <div className="mt-3">
        <StatusMessage error={error} notice={notice} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={ghostButtonClass} onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-lotus-600">
          Nenhum documento emitido. Use Receita, Exames ou Orientação para emitir.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((doc) => (
            <li
              key={doc.id}
              className="rounded-xl border border-lotus-100 bg-white px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-lotus-950">
                    {DOCUMENT_KIND_LABEL[doc.documentKind]} · v{doc.version}
                  </p>
                  <p className="text-xs text-lotus-600">
                    {formatDateTime(doc.issuedAt)} · {DOCUMENT_STATUS_LABEL[doc.status]}
                    {doc.availableToPatient ? " · disponível à paciente" : " · interno"}
                  </p>
                  <p className="mt-1 text-[11px] text-lotus-500">
                    {SIGNATURE_KIND_LABEL[doc.signatureKind]}
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-lotus-400">
                    SHA-256: {doc.contentSha256}
                  </p>
                  {doc.correctionReason ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Correção: {doc.correctionReason}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busyId === doc.id || !doc.pdfStoragePath}
                  onClick={() => void onOpen(doc)}
                >
                  {doc.pdfStoragePath ? "Abrir PDF" : "Sem PDF"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
