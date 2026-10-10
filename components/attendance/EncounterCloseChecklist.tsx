"use client";

import { useState } from "react";

export type CloseChecklistState = {
  complaint: boolean;
  anamnesis: boolean;
  physicalExam: boolean;
  soap: boolean;
  exams: boolean;
  prescription: boolean;
  orientations: boolean;
  feedback: boolean;
};

const ITEMS: Array<{
  key: keyof CloseChecklistState;
  label: string;
  hint: string;
}> = [
  { key: "complaint", label: "Queixa registrada", hint: "Quando houver motivo/queixa neste atendimento." },
  { key: "anamnesis", label: "Anamnese conferida", hint: "Inicial ou atualização desde a última consulta." },
  {
    key: "physicalExam",
    label: "Exame físico registrado, quando aplicável",
    hint: "Não obrigatório se não pertinente.",
  },
  { key: "soap", label: "SOAP/evolução revisado", hint: "Conteúdo clínico revisado antes de assinar." },
  { key: "exams", label: "Exames conferidos", hint: "Pedido e/ou anexos, se houver." },
  { key: "prescription", label: "Receita conferida", hint: "Se houver prescrição neste atendimento." },
  { key: "orientations", label: "Orientações conferidas", hint: "Se houver orientação registrada." },
  {
    key: "feedback",
    label: "Feedback, quando aplicável",
    hint: "Feedback da paciente não altera o prontuário automaticamente.",
  },
];

export function EncounterCloseChecklist({
  hints,
  onReadyChange,
}: {
  hints: Partial<Record<keyof CloseChecklistState, boolean>>;
  onReadyChange?: (checked: CloseChecklistState) => void;
}) {
  const [checked, setChecked] = useState<CloseChecklistState>({
    complaint: false,
    anamnesis: false,
    physicalExam: false,
    soap: false,
    exams: false,
    prescription: false,
    orientations: false,
    feedback: false,
  });

  function toggle(key: keyof CloseChecklistState) {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      onReadyChange?.(next);
      return next;
    });
  }

  return (
    <section className="card mt-4 overflow-x-hidden" aria-labelledby="close-checklist-title">
      <h2 id="close-checklist-title" className="text-base font-semibold text-lotus-900">
        Checklist de encerramento
      </h2>
      <p className="mt-1 text-sm text-lotus-600">
        Conferência assistencial antes de assinar ou encerrar. Itens não pertinentes podem permanecer
        desmarcados.
      </p>
      <ul className="mt-3 space-y-2">
        {ITEMS.map((item) => {
          const suggested = hints[item.key];
          return (
            <li key={item.key}>
              <label className="flex items-start gap-2 text-sm text-lotus-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked[item.key]}
                  onChange={() => toggle(item.key)}
                />
                <span>
                  <span className="font-medium">{item.label}</span>
                  <span className="block text-xs text-lotus-500">
                    {item.hint}
                    {suggested ? " · Conteúdo detectado neste atendimento." : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-lotus-500" role="status">
        Salvar rascunho ≠ Assinar ≠ Encerrar atendimento.
      </p>
    </section>
  );
}
