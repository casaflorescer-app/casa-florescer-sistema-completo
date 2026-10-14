"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SoapNote } from "@/components/attendance/soap";
import { EncounterCloseChecklist, type CloseChecklistState } from "@/components/attendance/EncounterCloseChecklist";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export type ReviewPendingItem = {
  id: string;
  label: string;
  href?: string;
  blocking?: boolean;
};

export type ReviewSummary = {
  motive: string;
  soap: SoapNote;
  examOrdersCount: number;
  examRequestsCount: number;
  prescriptionsCount: number;
  orientationsCount: number;
  hasRecording: boolean;
  hasTranscription: boolean;
  transcriptionStatus: string | null;
  aiPendingReview: boolean;
  soapDirty: boolean;
  durationLabel: string;
  documentaryStatus: string;
  operationalStatus: string;
  professionalName: string | null;
  signedAt: string | null;
  actualEndAt: string | null;
};

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "#queixa", label: "Queixa" },
  { href: "#anamnese", label: "Anamnese" },
  { href: "#exame-fisico", label: "Exame físico" },
  { href: "#soap", label: "SOAP" },
  { href: "#exames", label: "Exames" },
  { href: "#receita", label: "Receita" },
  { href: "#orientacao", label: "Orientações" },
  { href: "#gravacao", label: "Gravação/transcrição" },
  { href: "#auxilio-ia", label: "Auxílio IA" },
  { href: "#feedback", label: "Feedback" },
];

export function EncounterFinalReview({
  locked,
  attendanceEnded,
  summary,
  pendings,
  checklistHints,
  canSign,
  canEnd,
  busy,
  onReviewStarted,
  onSign,
  onEndAttendance,
}: {
  locked: boolean;
  attendanceEnded: boolean;
  summary: ReviewSummary;
  pendings: ReviewPendingItem[];
  checklistHints: Partial<Record<keyof CloseChecklistState, boolean>>;
  canSign: boolean;
  canEnd: boolean;
  busy: boolean;
  onReviewStarted?: () => void;
  onSign: () => void;
  onEndAttendance: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blocking = useMemo(() => pendings.filter((item) => item.blocking), [pendings]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    onReviewStarted?.();
  }, [onReviewStarted]);

  return (
    <section id="revisao-final" className="mt-4 scroll-mt-16 space-y-4 overflow-x-hidden">
      <div className="card overflow-x-hidden">
        <h2 className="text-base font-semibold text-lotus-900">Revisão final do atendimento</h2>
        <p className="mt-1 text-sm text-lotus-600">
          Rascunho → revisão → assinatura → encerramento. Itens não pertinentes não bloqueiam o fechamento.
        </p>

        <div className="mt-3 flex flex-wrap gap-2" aria-label="Ir para seções do atendimento">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`${ghostButtonClass} text-xs`}>
              {link.label}
            </a>
          ))}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Documental</dt>
            <dd className="mt-1 text-sm font-semibold text-lotus-950">{summary.documentaryStatus}</dd>
          </div>
          <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Operacional</dt>
            <dd className="mt-1 text-sm font-semibold text-lotus-950">{summary.operationalStatus}</dd>
          </div>
          <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Duração</dt>
            <dd className="mt-1 text-sm font-semibold text-lotus-950">{summary.durationLabel}</dd>
          </div>
          <div className="rounded-xl bg-lotus-50/80 px-3 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Médica</dt>
            <dd className="mt-1 text-sm font-semibold text-lotus-950">
              {summary.professionalName ?? "—"}
            </dd>
          </div>
        </dl>
      </div>

      {pendings.length > 0 ? (
        <div className="card overflow-x-hidden border-amber-200 bg-amber-50/50" role="status">
          <h3 className="text-sm font-semibold text-amber-950">Pontos a revisar</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
            {pendings.map((item) => (
              <li key={item.id}>
                {item.href ? (
                  <a href={item.href} className="underline underline-offset-2">
                    {item.label}
                  </a>
                ) : (
                  item.label
                )}
                {item.blocking ? " (salve antes de assinar)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card overflow-x-hidden" id="resumo-atendimento">
        <h3 className="text-base font-semibold text-lotus-900">Resumo do atendimento</h3>
        <p className="mt-1 text-sm text-lotus-600">
          Visão consolidada — não é um segundo registro clínico.
        </p>
        <dl className="mt-3 space-y-2 text-sm text-lotus-800">
          <div>
            <dt className="font-semibold text-lotus-900">Motivo</dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{summary.motive || "—"}</dd>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-lotus-900">S</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{summary.soap.subjective || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-lotus-900">O</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{summary.soap.objective || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-lotus-900">A</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{summary.soap.assessment || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-lotus-900">P</dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{summary.soap.plan || "—"}</dd>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-lotus-600">
            <span>Pedidos de exame: {summary.examRequestsCount}</span>
            <span>Anexos/resultados: {summary.examOrdersCount}</span>
            <span>Receitas: {summary.prescriptionsCount}</span>
            <span>Orientações: {summary.orientationsCount}</span>
            <span>
              Gravação: {summary.hasRecording ? "sim" : "não"}
              {summary.hasTranscription
                ? ` · transcrição ${summary.transcriptionStatus ?? "disponível"}`
                : ""}
            </span>
          </div>
        </dl>
      </div>

      <EncounterCloseChecklist hints={checklistHints} />

      {locked && attendanceEnded ? (
        <div className="card overflow-x-hidden border-emerald-200 bg-emerald-50/40" role="status">
          <h3 className="text-base font-semibold text-emerald-950">ATENDIMENTO ENCERRADO</h3>
          <ul className="mt-2 space-y-1 text-sm text-emerald-950">
            <li>Assinado: {summary.signedAt ? formatDateTime(summary.signedAt) : "—"}</li>
            <li>Término efetivo: {summary.actualEndAt ? formatDateTime(summary.actualEndAt) : "—"}</li>
            <li>Médica: {summary.professionalName ?? "—"}</li>
            <li>Duração: {summary.durationLabel}</li>
            <li>Situação documental: {summary.documentaryStatus}</li>
          </ul>
          <p className="mt-2 text-xs text-emerald-900">
            Conteúdo clínico, gravação e documentos deste encounter permanecem preservados em modo leitura.
          </p>
        </div>
      ) : null}

      <div className="card overflow-x-hidden">
        <h3 className="text-sm font-semibold text-lotus-900">Ações de fechamento</h3>
        <p className="mt-1 text-xs text-lotus-500">
          Assinar = conclusão documental. Encerrar = término operacional (`actual_end_at`).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!locked && canSign ? (
            <button
              type="button"
              className={buttonClass}
              disabled={busy || blocking.length > 0}
              onClick={() => setConfirmOpen(true)}
            >
              Assinar atendimento
            </button>
          ) : null}
          {canEnd && !attendanceEnded ? (
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={onEndAttendance}>
              Encerrar atendimento
            </button>
          ) : null}
        </div>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-confirm-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
            <h3 id="sign-confirm-title" className="text-base font-semibold text-lotus-900">
              Confirmar assinatura
            </h3>
            <p className="mt-2 text-sm text-lotus-700">
              Após a assinatura, os registros clínicos deste atendimento não poderão ser editados.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={ghostButtonClass} onClick={() => setConfirmOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false);
                  onSign();
                }}
              >
                Confirmar assinatura
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
