"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSignedExamUrl,
  listExamOrdersForPatient,
  listUploadsForOrder,
  markExamAnalyzed,
  markExamInAnalysis,
  submitExamWithFile,
} from "@/lib/exams/directory";
import {
  EXAM_CLINICAL_STATUS_LABEL,
  type ExamOrderRow,
  type ExamSource,
  type ExamUploadRow,
} from "@/lib/exams/types";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export function ClinicalExamsPanel({
  supabase,
  organizationId,
  practiceId,
  patientId,
  encounterId,
  canAnalyze,
  canAttach,
  attachSource = "secretaria",
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId?: string | null;
  canAnalyze: boolean;
  canAttach: boolean;
  attachSource?: ExamSource;
}) {
  const [orders, setOrders] = useState<ExamOrderRow[]>([]);
  const [uploadsByOrder, setUploadsByOrder] = useState<Record<string, ExamUploadRow[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [observation, setObservation] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysisNotes, setAnalysisNotes] = useState<Record<string, string>>({});
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await listExamOrdersForPatient(supabase, patientId);
    setOrders(list);
    const map: Record<string, ExamUploadRow[]> = {};
    await Promise.all(
      list.map(async (order) => {
        map[order.id] = await listUploadsForOrder(supabase, order.id);
      }),
    );
    setUploadsByOrder(map);
  }, [patientId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onAttach() {
    if (!canAttach || !file || !title.trim()) {
      setError("Informe o tipo do exame e selecione o arquivo.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await submitExamWithFile(supabase, {
        organizationId,
        practiceId,
        patientId,
        title: title.trim(),
        source: attachSource,
        observation: observation.trim() || undefined,
        documentDate: documentDate || undefined,
        encounterId,
        file,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setObservation("");
      setDocumentDate("");
      setFile(null);
      setNotice("Exame anexado e disponível para análise.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onView(order: ExamOrderRow) {
    setError(null);
    if (canAnalyze) {
      await markExamInAnalysis(supabase, order.id);
      await reload();
    }
    const uploads = uploadsByOrder[order.id] ?? [];
    if (!uploads[0]) {
      setError("Arquivo do exame não encontrado.");
      return;
    }
    const url = await createSignedExamUrl(supabase, uploads[0].storagePath);
    if (!url) {
      setError("Não foi possível abrir o arquivo.");
      return;
    }
    setViewerUrl(url);
  }

  async function onAnalyze(orderId: string) {
    if (!canAnalyze) return;
    setBusy(true);
    setError(null);
    try {
      const result = await markExamAnalyzed(supabase, orderId, analysisNotes[orderId]);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Exame marcado como analisado.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-6">
      <h2 className="text-base font-semibold text-lotus-900">Exames e documentos</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Anexos da paciente no contexto clínico. Sem sair do prontuário.
      </p>
      <StatusMessage error={error} notice={notice} />

      {canAttach ? (
        <div className="mt-4 space-y-2 rounded-md border border-lotus-100 p-3">
          <p className="text-sm font-semibold text-lotus-800">Anexar exame</p>
          <input
            className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
            placeholder="Tipo do exame (ex.: Hemograma)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            type="date"
            className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
            value={documentDate}
            onChange={(event) => setDocumentDate(event.target.value)}
          />
          <textarea
            className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
            rows={2}
            placeholder="Observação opcional"
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
          />
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onAttach()}>
            Anexar exame
          </button>
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {orders.length === 0 ? (
          <li className="text-sm text-lotus-600">Nenhum exame anexado.</li>
        ) : (
          orders.map((order) => (
            <li key={order.id} className="rounded-md border border-lotus-100 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-lotus-900">{order.title}</p>
                  <p className="text-lotus-600">
                    {order.documentDate || (order.receivedAt ? formatDateTime(order.receivedAt) : "—")}
                    {" · "}
                    Origem: {order.source === "paciente" ? "Paciente" : "Secretaria"}
                    {" · "}
                    {EXAM_CLINICAL_STATUS_LABEL[order.clinicalStatus]}
                  </p>
                  {order.observation ? (
                    <p className="mt-1 text-lotus-700">{order.observation}</p>
                  ) : null}
                </div>
                <button type="button" className={ghostButtonClass} onClick={() => void onView(order)}>
                  Visualizar
                </button>
              </div>
              {canAnalyze &&
              (order.clinicalStatus === "DISPONIVEL_PARA_ANALISE" ||
                order.clinicalStatus === "EM_ANALISE") ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-lotus-500">
                    Análise médica (interna)
                  </label>
                  <textarea
                    className="w-full rounded-md border border-lotus-200 px-3 py-2"
                    rows={3}
                    value={analysisNotes[order.id] ?? order.analysisNotes ?? ""}
                    onChange={(event) =>
                      setAnalysisNotes((current) => ({ ...current, [order.id]: event.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void onAnalyze(order.id)}
                  >
                    Marcar como analisado
                  </button>
                </div>
              ) : null}
              {order.analyzedAt && order.analysisNotes ? (
                <p className="mt-2 text-xs text-lotus-600">
                  Analisado em {formatDateTime(order.analyzedAt)}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {viewerUrl ? (
        <div className="mt-4 rounded-md border border-lotus-200 p-3">
          <div className="mb-2 flex justify-between gap-2">
            <p className="text-sm font-semibold text-lotus-800">Visualização</p>
            <button type="button" className={ghostButtonClass} onClick={() => setViewerUrl(null)}>
              Fechar
            </button>
          </div>
          <iframe title="Exame" src={viewerUrl} className="h-[70vh] w-full rounded border border-lotus-100" />
        </div>
      ) : null}
    </section>
  );
}
