"use client";

import { useState } from "react";
import { formatIsoDateBr } from "@/lib/patients/format";
import {
  formatSummaryWhen,
  type PatientClinicalSummaryData,
} from "@/lib/attendance/patient-summary";
import type { PregnancyContext } from "@/lib/attendance/directory";
import { ghostButtonClass } from "@/components/platform/Ui";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-lotus-50/80 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lotus-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-lotus-950 break-words">{value || "—"}</p>
    </div>
  );
}

function ListBlock({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; primary: string; secondary: string }[];
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-lotus-600">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-sm text-lotus-900">
              <span className="font-medium">{item.primary}</span>
              <span className="text-lotus-600"> · {item.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PatientClinicalSummary({
  summary,
  pregnancy,
  loading,
}: {
  summary: PatientClinicalSummaryData | null;
  pregnancy: PregnancyContext | null;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (loading) {
    return (
      <section id="resumo" className="card mt-4 scroll-mt-16">
        <p className="text-sm text-lotus-600">Carregando resumo da paciente…</p>
      </section>
    );
  }

  if (!summary) {
    return (
      <section id="resumo" className="card mt-4 scroll-mt-16">
        <h2 className="text-base font-semibold text-lotus-900">Resumo da paciente</h2>
        <p className="mt-1 text-sm text-lotus-600">Resumo indisponível neste momento.</p>
      </section>
    );
  }

  const identity = [
    summary.ageYears != null ? `${summary.ageYears} anos` : null,
    summary.birthDate ? `nasc. ${formatIsoDateBr(summary.birthDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section id="resumo" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
            Resumo da paciente
          </p>
          <h2 className="mt-1 text-lg font-semibold text-lotus-950">{summary.fullName}</h2>
          {identity ? <p className="mt-0.5 text-sm text-lotus-700">{identity}</p> : null}
        </div>
        <button type="button" className={ghostButtonClass} onClick={() => setOpen((v) => !v)}>
          {open ? "Recolher" : "Expandir"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Alergias" value={summary.allergies?.trim() || "Não informado"} />
            <Field
              label="Medicamentos atuais"
              value={summary.continuousMedications?.trim() || "Não informado"}
            />
            <Field
              label="Antecedentes / comorbidades"
              value={summary.comorbidities?.trim() || "Não informado"}
            />
            {summary.gpa ? (
              <Field
                label="GPA"
                value={`G${summary.gpa.pregnancies} P${summary.gpa.births} A${summary.gpa.abortions}`}
              />
            ) : null}
            {pregnancy || summary.edd || summary.lmpDate ? (
              <Field
                label="Contexto obstétrico"
                value={[
                  summary.lmpDate ? `DUM ${formatIsoDateBr(summary.lmpDate)}` : null,
                  summary.edd ? `DPP ${formatIsoDateBr(summary.edd)}` : null,
                  pregnancy ? "Gestação vinculada ao atendimento" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
            {summary.lastEncounter ? (
              <Field
                label="Último atendimento"
                value={`${formatSummaryWhen(summary.lastEncounter.createdAt)} · ${summary.lastEncounter.statusLabel}`}
              />
            ) : (
              <Field label="Último atendimento" value="Sem registros anteriores nesta prática" />
            )}
          </div>

          <div className="grid gap-4 border-t border-lotus-100 pt-4 lg:grid-cols-3">
            <ListBlock
              title="Últimos exames"
              empty="Nenhum exame listado"
              items={summary.recentExams.map((item) => ({
                id: item.id,
                primary: item.title,
                secondary: formatSummaryWhen(item.when),
              }))}
            />
            <ListBlock
              title="Últimas receitas"
              empty="Nenhuma receita listada"
              items={summary.recentPrescriptions.map((item) => ({
                id: item.id,
                primary: item.status,
                secondary: formatSummaryWhen(item.when),
              }))}
            />
            <ListBlock
              title="Últimas orientações"
              empty="Nenhuma orientação listada"
              items={summary.recentOrientations.map((item) => ({
                id: item.id,
                primary: item.title,
                secondary: formatSummaryWhen(item.when),
              }))}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
