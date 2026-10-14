"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listPortalFeedbackTargets,
  upsertEncounterPatientFeedback,
  type PortalFeedbackTarget,
} from "@/lib/attendance/encounter-feedback";
import { buttonClass, fieldClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export function PortalEncounterFeedback({ supabase }: { supabase: SupabaseClient }) {
  const [targets, setTargets] = useState<PortalFeedbackTarget[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [score, setScore] = useState<number | "">("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await listPortalFeedbackTargets(supabase);
    if (result.error) {
      setError(result.error);
      return;
    }
    setTargets(result.targets);
    setError(null);
  }, [supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onSubmit() {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await upsertEncounterPatientFeedback(supabase, {
      encounterId: activeId,
      satisfactionScore: score === "" ? null : Number(score),
      experienceComment: comment.trim() || undefined,
      source: "portal",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice("Obrigada pelo feedback. Ele não altera seu prontuário clínico.");
    setActiveId(null);
    setScore("");
    setComment("");
    await reload();
  }

  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-base font-semibold text-lotus-900">Feedback do atendimento</h2>
      <p className="text-sm text-lotus-600">
        Avalie a experiência da consulta. Conteúdo clínico interno (SOAP, notas da médica, IA) não é
        exibido aqui.
      </p>
      <StatusMessage error={error} notice={notice} />

      {targets.length === 0 ? (
        <p className="text-sm text-lotus-600">Nenhum atendimento assinado disponível para feedback.</p>
      ) : (
        <ul className="space-y-2">
          {targets.map((item) => (
            <li key={item.encounterId} className="rounded-xl border border-lotus-100 bg-white px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-lotus-900">
                    Atendimento {formatDateTime(item.signedAt ?? item.createdAt)}
                  </p>
                  <p className="text-xs text-lotus-500">
                    {item.hasFeedback ? "Feedback já enviado" : "Aguardando sua avaliação"}
                  </p>
                </div>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    setActiveId(item.encounterId);
                    setNotice(null);
                  }}
                >
                  {item.hasFeedback ? "Atualizar" : "Avaliar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeId ? (
        <div className="rounded-2xl border border-lotus-200 bg-[#FFF8F5] p-4">
          <label className="block text-sm font-medium text-lotus-800">
            Satisfação (1–5)
            <select
              className={fieldClass}
              value={score === "" ? "" : String(score)}
              onChange={(event) => setScore(event.target.value ? Number(event.target.value) : "")}
            >
              <option value="">Escolha…</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium text-lotus-800">
            Comentário (opcional)
            <textarea
              className={fieldClass}
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onSubmit()}>
              Enviar feedback
            </button>
            <button type="button" className={ghostButtonClass} onClick={() => setActiveId(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
