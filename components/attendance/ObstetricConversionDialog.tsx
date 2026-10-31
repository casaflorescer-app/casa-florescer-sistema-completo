"use client";

import { useEffect, useId, useState } from "react";
import { buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import type { ConversionPregnancyChoice } from "@/lib/attendance/obstetric-conversion";
import { PREGNANCY_RISK_LABEL, PREGNANCY_STATUS_LABEL } from "@/lib/pregnancies/directory";
import type { PregnancyRisk, PregnancyStatus } from "@/lib/types/database";

export type ConversionDialogStep = "confirm" | "pick" | "create";

const labelClass = "text-sm font-medium text-lotus-800";

function statusLabel(status: string): string {
  if (status in PREGNANCY_STATUS_LABEL) {
    return PREGNANCY_STATUS_LABEL[status as PregnancyStatus];
  }
  return status;
}

function riskLabel(risk: string): string {
  if (risk in PREGNANCY_RISK_LABEL) {
    return PREGNANCY_RISK_LABEL[risk as PregnancyRisk];
  }
  return risk === "—" ? "—" : risk;
}

export function ObstetricConversionDialog({
  step,
  choices,
  allowCreateFromPick,
  busy,
  error,
  defaultProfessionalId,
  onCancel,
  onConfirmContinue,
  onLink,
  onOpenCreate,
  onCreate,
}: {
  step: ConversionDialogStep;
  choices: ConversionPregnancyChoice[];
  allowCreateFromPick: boolean;
  busy: boolean;
  error: string | null;
  defaultProfessionalId: string;
  onCancel: () => void;
  onConfirmContinue: () => void;
  onLink: (pregnancyId: string) => void;
  onOpenCreate: () => void;
  onCreate: (input: { lmpDate: string; clinicalEdd: string; careStartedOn: string }) => void;
}) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState("");
  const [lmpDate, setLmpDate] = useState("");
  const [clinicalEdd, setClinicalEdd] = useState("");
  const [careStartedOn, setCareStartedOn] = useState(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  });

  useEffect(() => {
    setSelectedId("");
  }, [step, choices]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const title =
    step === "confirm"
      ? "Alterar para atendimento obstétrico"
      : step === "pick"
        ? "Selecione a gestação deste atendimento"
        : "Criar acompanhamento obstétrico";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-lotus-100 bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id={titleId} className="text-base font-semibold text-lotus-900">
          {title}
        </h2>

        {step === "confirm" ? (
          <>
            <p className="mt-2 text-sm text-lotus-800">
              A profissional confirma que este atendimento deve prosseguir no contexto obstétrico?
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-lotus-700">
              <li>O agendamento original será preservado.</li>
              <li>Não será criada uma nova paciente.</li>
              <li>O atendimento continua no mesmo prontuário e o histórico permanece.</li>
            </ul>
            <p className="mt-3 text-xs text-lotus-500" title="Conversão explícita pela profissional">
              Esta alteração só ocorre após a sua confirmação.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={onConfirmContinue}
              >
                Continuar como obstétrico
              </button>
              <button type="button" className={ghostButtonClass} disabled={busy} onClick={onCancel}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}

        {step === "pick" ? (
          <>
            <p className="mt-1 text-sm text-lotus-700">
              Escolha a gestação vinculada a este atendimento.
            </p>
            <ul className="mt-4 space-y-2">
              {choices.map((choice) => (
                <li key={choice.id}>
                  <label className="flex cursor-pointer gap-3 rounded-xl border border-lotus-100 px-3 py-2 text-sm text-lotus-900 hover:bg-lotus-50">
                    <input
                      type="radio"
                      name="obstetric-conversion-pregnancy"
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
                        {statusLabel(choice.status)} · Risco {riskLabel(choice.risk)}
                      </span>
                      <span className="mt-0.5 block text-lotus-700">
                        Responsável · {choice.primaryName}
                      </span>
                      <span className="mt-0.5 block text-xs text-lotus-500">
                        Registro · {choice.createdAt}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error ? (
              <p className="mt-3 text-sm text-rose-800" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !selectedId}
                onClick={() => onLink(selectedId)}
              >
                {busy ? "Vinculando…" : "Vincular gestação"}
              </button>
              {allowCreateFromPick ? (
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy}
                  onClick={onOpenCreate}
                >
                  Criar acompanhamento obstétrico
                </button>
              ) : null}
              <button type="button" className={ghostButtonClass} disabled={busy} onClick={onCancel}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}

        {step === "create" ? (
          <>
            <p className="mt-1 text-sm text-lotus-700">
              Informe os dados mínimos para iniciar o acompanhamento. Você permanece neste
              atendimento — o agendamento original não muda.
            </p>
            <p className="mt-2 text-xs text-lotus-500">
              Médica responsável pré-selecionada: a profissional deste atendimento
              {defaultProfessionalId ? "" : " (defina na ficha se necessário)"}.
            </p>
            <div className="mt-4 grid gap-3">
              <label className={labelClass}>
                DUM (data da última menstruação)
                <input
                  type="date"
                  className={fieldClass}
                  value={lmpDate}
                  onChange={(event) => setLmpDate(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={labelClass}>
                DPP ajustada (opcional)
                <input
                  type="date"
                  className={fieldClass}
                  value={clinicalEdd}
                  onChange={(event) => setClinicalEdd(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className={labelClass}>
                Início do acompanhamento
                <input
                  type="date"
                  className={fieldClass}
                  value={careStartedOn}
                  onChange={(event) => setCareStartedOn(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-rose-800" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  onCreate({
                    lmpDate,
                    clinicalEdd,
                    careStartedOn,
                  })
                }
              >
                {busy ? "Salvando…" : "Salvar e continuar no atendimento"}
              </button>
              <button type="button" className={ghostButtonClass} disabled={busy} onClick={onCancel}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
