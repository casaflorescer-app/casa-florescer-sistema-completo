"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicalAiPayload } from "@/lib/ai/clinical-assistance-provider";
import {
  listAiAssistance,
  reviewAiAssistance,
  type AiAssistanceResultRow,
} from "@/lib/attendance/clinical-support-directory";
import type { SoapNote } from "@/components/attendance/soap";
import { buttonClass, ghostButtonClass, StatusMessage, fieldClass } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

const SUGGESTION_OPTIONS = [
  { value: "summary", label: "Resumo da consulta" },
  { value: "anamnesis_organize", label: "Organizar anamnese" },
  { value: "soap", label: "Sugestão SOAP" },
  { value: "missing_info", label: "Informações ausentes" },
  { value: "followup_questions", label: "Perguntas complementares" },
  { value: "exam_suggestion", label: "Sugestão de exames (revisão)" },
  { value: "treatment_hint", label: "Sugestão de tratamento (revisão)" },
] as const;

export function AiAssistancePanel({
  supabase,
  organizationId,
  practiceId,
  patientId,
  encounterId,
  locked,
  canEdit,
  context,
  onApplySoap,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  patientId: string;
  encounterId: string;
  locked: boolean;
  canEdit: boolean;
  context: {
    chiefComplaint: string;
    anamnesis: string;
    physicalExam: string;
    soapDraft: string;
    transcriptionExcerpt?: string;
  };
  onApplySoap: (soap: SoapNote) => void;
}) {
  const [suggestionType, setSuggestionType] =
    useState<(typeof SUGGESTION_OPTIONS)[number]["value"]>("soap");
  const [results, setResults] = useState<AiAssistanceResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editJson, setEditJson] = useState<string>("");
  const [activeResultId, setActiveResultId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await listAiAssistance(supabase, encounterId);
    if (data.error && !data.error.includes("Could not find") && !data.error.includes("does not exist")) {
      setError(data.error);
    }
    setResults(data.results);
    if (data.results[0] && !activeResultId) {
      setActiveResultId(data.results[0].id);
      setEditJson(JSON.stringify(data.results[0].payload, null, 2));
    }
  }, [activeResultId, encounterId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = results.find((item) => item.id === activeResultId) ?? results[0] ?? null;

  async function onRequest() {
    if (!canEdit || locked) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/encounters/clinical-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encounterId,
          organizationId,
          practiceId,
          patientId,
          suggestionType,
          chiefComplaint: context.chiefComplaint,
          anamnesis: context.anamnesis,
          physicalExam: context.physicalExam,
          soapDraft: context.soapDraft,
          transcriptionExcerpt: context.transcriptionExcerpt ?? "",
        }),
      });
      const json = (await response.json()) as {
        status?: string;
        error?: string;
        label?: string;
        isSimulation?: boolean;
      };
      if (!response.ok || json.status === "failed") {
        setError(json.error ?? "Falha ao solicitar auxílio de IA.");
        await reload();
        return;
      }
      if (json.status === "unavailable") {
        setError("Auxílio de IA indisponível.");
        await reload();
        return;
      }
      setNotice(
        json.isSimulation
          ? "SIMULAÇÃO — sugestão gerada por IA disponível para revisão."
          : "Sugestão gerada por IA disponível para revisão.",
      );
      await reload();
    } catch {
      setError("Não foi possível contactar o auxílio de IA.");
    } finally {
      setBusy(false);
    }
  }

  async function onReview(action: "accept" | "reject" | "edit_accept") {
    if (!active || !canEdit || locked) return;
    setBusy(true);
    setError(null);
    try {
      let reviewed: ClinicalAiPayload | undefined;
      if (action === "edit_accept") {
        try {
          reviewed = JSON.parse(editJson) as ClinicalAiPayload;
        } catch {
          setError("JSON editado inválido.");
          return;
        }
      }
      const result = await reviewAiAssistance(supabase, active.id, action, reviewed);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (action === "accept" || action === "edit_accept") {
        const payload = action === "edit_accept" && reviewed ? reviewed : active.payload;
        if (payload.soap_suggestion) {
          onApplySoap({
            subjective: payload.soap_suggestion.subjective ?? "",
            objective: payload.soap_suggestion.objective ?? "",
            assessment: payload.soap_suggestion.assessment ?? "",
            plan: payload.soap_suggestion.plan ?? "",
          });
        }
        setNotice(
          action === "accept"
            ? "Sugestão aceita. Conteúdo aplicado ao rascunho SOAP — salve o prontuário para gravar."
            : "Sugestão editada e aceita. Conteúdo aplicado ao rascunho — salve o prontuário.",
        );
      } else {
        setNotice("Sugestão rejeitada. Nada foi alterado no prontuário.");
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="auxilio-ia" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <h2 className="text-base font-semibold text-lotus-900">Auxílio da IA</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Apoio à revisão médica. A IA não diagnostica, não prescreve e não altera o prontuário
        sem ação explícita sua.
      </p>

      {locked ? (
        <p className="mt-3 text-sm text-lotus-600">Atendimento assinado — auxílio somente para consulta.</p>
      ) : !canEdit ? (
        <p className="mt-3 text-sm text-lotus-600">Somente a profissional do atendimento pode solicitar sugestões.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-lotus-800">
            Tipo de sugestão
            <select
              className={fieldClass}
              value={suggestionType}
              onChange={(event) =>
                setSuggestionType(event.target.value as (typeof SUGGESTION_OPTIONS)[number]["value"])
              }
            >
              {SUGGESTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onRequest()}>
            {busy ? "Gerando…" : "Solicitar sugestão"}
          </button>
        </div>
      )}

      <div className="mt-3">
        <StatusMessage error={error} notice={notice} />
      </div>

      {active ? (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {active.isSimulation ? "SIMULAÇÃO — Sugestão gerada por IA" : "Sugestão gerada por IA"}
            </span>
            <span className="text-xs text-lotus-600">
              v{active.version} · {formatDateTime(active.createdAt)} · {active.reviewStatus}
            </span>
          </div>

          {active.payload.summary ? (
            <p className="text-sm text-lotus-800">
              <strong className="font-semibold">Resumo:</strong> {active.payload.summary}
            </p>
          ) : null}

          {active.payload.soap_suggestion ? (
            <div className="grid gap-2 text-sm text-lotus-800 sm:grid-cols-2">
              <p>
                <strong>S:</strong> {active.payload.soap_suggestion.subjective || "—"}
              </p>
              <p>
                <strong>O:</strong> {active.payload.soap_suggestion.objective || "—"}
              </p>
              <p>
                <strong>A:</strong> {active.payload.soap_suggestion.assessment || "—"}
              </p>
              <p>
                <strong>P:</strong> {active.payload.soap_suggestion.plan || "—"}
              </p>
            </div>
          ) : null}

          {active.payload.missing_information?.length ? (
            <ul className="list-disc pl-5 text-sm text-lotus-700">
              {active.payload.missing_information.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          {active.payload.warnings?.length ? (
            <ul className="list-disc pl-5 text-xs text-amber-900">
              {active.payload.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          {!locked && canEdit && active.reviewStatus === "pending" ? (
            <>
              <label className="block text-sm font-medium text-lotus-800">
                Editar sugestão (JSON)
                <textarea
                  className={fieldClass}
                  rows={6}
                  value={editJson}
                  onChange={(event) => setEditJson(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void onReview("accept")}>
                  Aceitar e aplicar ao SOAP
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={() => void onReview("edit_accept")}
                >
                  Aceitar edição
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={() => void onReview("reject")}
                >
                  Rejeitar
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-lotus-500">Nenhuma sugestão neste atendimento.</p>
      )}

      {results.length > 1 ? (
        <ul className="mt-3 space-y-1 text-xs text-lotus-600">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setActiveResultId(item.id);
                  setEditJson(JSON.stringify(item.payload, null, 2));
                }}
              >
                v{item.version} · {item.reviewStatus} · {formatDateTime(item.createdAt)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
