"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEncounterPatientFeedback,
  upsertEncounterPatientFeedback,
  type EncounterPatientFeedback,
} from "@/lib/attendance/encounter-feedback";
import { buttonClass, fieldClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export function EncounterPatientFeedbackPanel({
  supabase,
  encounterId,
  locked,
  canEditClinical,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  locked: boolean;
  canEditClinical: boolean;
}) {
  const [feedback, setFeedback] = useState<EncounterPatientFeedback | null>(null);
  const [score, setScore] = useState<number | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await getEncounterPatientFeedback(supabase, encounterId);
    if (result.error && !/não encontrada|null/i.test(result.error)) {
      // sem linha ainda não é erro
      if (!/Sem permissão|FORBIDDEN/i.test(result.error)) {
        setError(null);
      }
    }
    setFeedback(result.feedback);
    if (result.feedback) {
      setScore(result.feedback.satisfactionScore ?? "");
      setComment(result.feedback.experienceComment ?? "");
    }
  }, [encounterId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onSave() {
    if (!canEditClinical) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await upsertEncounterPatientFeedback(supabase, {
      encounterId,
      satisfactionScore: score === "" ? null : Number(score),
      experienceComment: comment.trim() || undefined,
      source: "clinical",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFeedback(result.feedback);
    setNotice("Feedback registrado. Não altera o prontuário clínico.");
  }

  return (
    <section id="feedback" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <h2 className="text-base font-semibold text-lotus-900">Feedback da paciente</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Experiência do atendimento — separado da avaliação clínica SOAP. Não altera anamnese, exames,
        receita ou evolução.
      </p>

      <StatusMessage error={error} notice={notice} />

      {feedback ? (
        <p className="mt-3 text-xs text-lotus-500">
          Último registro: {formatDateTime(feedback.updatedAt)} · origem {feedback.source}
        </p>
      ) : (
        <p className="mt-3 text-sm text-lotus-500">Nenhum feedback neste atendimento.</p>
      )}

      {canEditClinical ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-medium text-lotus-800">
            Satisfação (1–5)
            <select
              className={fieldClass}
              value={score === "" ? "" : String(score)}
              onChange={(event) =>
                setScore(event.target.value ? Number(event.target.value) : "")
              }
              disabled={busy}
            >
              <option value="">Sem nota</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-lotus-800">
            Comentário da experiência
            <textarea
              className={fieldClass}
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={busy}
              placeholder="Percepção da paciente sobre o atendimento (não é avaliação clínica)."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onSave()}>
              {busy ? "Salvando…" : locked ? "Registrar / atualizar feedback" : "Registrar feedback"}
            </button>
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void reload()}>
              Atualizar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-lotus-700">
          {feedback?.satisfactionScore != null ? <p>Nota: {feedback.satisfactionScore}/5</p> : null}
          {feedback?.experienceComment ? (
            <p className="mt-1 whitespace-pre-wrap">{feedback.experienceComment}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
