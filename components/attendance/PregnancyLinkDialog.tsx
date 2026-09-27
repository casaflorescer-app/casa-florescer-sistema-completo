"use client";

import { useEffect, useId, useState } from "react";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export type PregnancyLinkChoice = {
  id: string;
  dum: string;
  dpp: string;
  status: string;
  risk: string;
  primaryName: string;
};

export function PregnancyLinkDialog({
  mode,
  choices,
  loading,
  busy,
  error,
  onClose,
  onLink,
  onUnlink,
}: {
  mode: "link" | "unlink";
  choices: PregnancyLinkChoice[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onLink: (pregnancyId: string) => void;
  onUnlink: () => void;
}) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    setSelectedId("");
  }, [mode]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const linking = mode === "link";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(32rem,100%)] w-full max-w-lg overflow-y-auto rounded-2xl border border-lotus-100 bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id={titleId} className="text-base font-semibold text-lotus-900">
          {linking ? "Vincular gestação" : "Desvincular gestação"}
        </h2>
        {linking ? (
          <p className="mt-1 text-sm text-lotus-700">
            Escolha a gestação deste atendimento. A autorização é confirmada ao vincular.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-lotus-900">
              Desvincular a gestação deste atendimento?
            </p>
            <p className="mt-1 text-sm text-lotus-700">
              O atendimento permanecerá aberto e poderá ser tratado como consulta sem vínculo obstétrico.
            </p>
          </>
        )}

        {linking ? (
          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-lotus-600">Carregando gestações…</p>
            ) : choices.length === 0 ? (
              <p className="text-sm text-lotus-700">Nenhuma gestação disponível para este atendimento.</p>
            ) : (
              <ul className="space-y-2">
                {choices.map((choice) => (
                  <li key={choice.id}>
                    <label className="flex cursor-pointer gap-3 rounded-xl border border-lotus-100 px-3 py-2 text-sm text-lotus-900 hover:bg-lotus-50">
                      <input
                        type="radio"
                        name="pregnancy-link"
                        className="mt-1"
                        value={choice.id}
                        checked={selectedId === choice.id}
                        disabled={busy}
                        onChange={() => setSelectedId(choice.id)}
                      />
                      <span>
                        <span className="block font-medium">
                          DUM {choice.dum} · DPP {choice.dpp}
                        </span>
                        <span className="mt-0.5 block text-lotus-700">
                          {choice.status} · {choice.risk}
                        </span>
                        <span className="mt-0.5 block text-lotus-700">
                          Médica responsável · {choice.primaryName}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {linking ? (
            <button
              type="button"
              className={buttonClass}
              disabled={busy || loading || !selectedId}
              onClick={() => onLink(selectedId)}
            >
              {busy ? "Vinculando…" : "Vincular gestação"}
            </button>
          ) : (
            <button type="button" className={buttonClass} disabled={busy} onClick={onUnlink}>
              {busy ? "Desvinculando…" : "Desvincular gestação"}
            </button>
          )}
          <button type="button" className={ghostButtonClass} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
