import type { ReactNode } from "react";
import {
  PREGNANCY_RISK_LABEL,
  PREGNANCY_STATUS_LABEL,
} from "@/lib/pregnancies/directory";
import type { PregnancyContext } from "@/lib/attendance/directory";
import { formatIsoDateBr, gestationalAgeFromLmp } from "@/lib/patients/format";

function formatClinicalDate(value: string | null): string {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const formatted = formatIsoDateBr(iso);
  return formatted === iso && !/^\d{4}-\d{2}-\d{2}$/.test(iso) ? "—" : formatted;
}

/** Idade gestacional local: DUM até a data do atendimento, ou hoje se ela faltar. */
function gestationalAgeLabel(lmpDate: string | null, encounterAt: string | null): string {
  if (!lmpDate) return "—";
  const parsed = encounterAt ? new Date(encounterAt) : new Date();
  const onDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const age = gestationalAgeFromLmp(lmpDate.slice(0, 10), onDate);
  if (!age) return "—";
  const weekLabel = age.weeks === 1 ? "semana" : "semanas";
  const dayLabel = age.days === 1 ? "dia" : "dias";
  return `${age.weeks} ${weekLabel} e ${age.days} ${dayLabel}`;
}

function dueDate(pregnancy: PregnancyContext): string | null {
  return pregnancy.clinicalDueDate ?? pregnancy.estimatedDueDate;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-lotus-900">{value}</dd>
    </div>
  );
}

export function ContextAssistencial({
  pregnancy,
  pregnancyLinked,
  encounterAt,
  primaryProfessionalName,
  actions,
}: {
  pregnancy: PregnancyContext | null;
  /** true quando encounters.pregnancy_id está preenchido. */
  pregnancyLinked: boolean;
  encounterAt: string | null;
  primaryProfessionalName: string | null;
  actions?: ReactNode;
}) {
  const prenatal = pregnancy != null;
  const restricted = !prenatal && pregnancyLinked;
  const badge = prenatal ? "Pré-natal" : restricted ? "Contexto restrito" : "Ginecologia";

  return (
    <section className="mt-4 rounded-xl border border-lotus-100 bg-lotus-50/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-lotus-900">Contexto assistencial</h2>
        <span className="inline-flex rounded-full border border-lotus-200 bg-white px-3 py-1 text-xs font-semibold text-lotus-800">
          {badge}
        </span>
      </div>
      {prenatal ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="DUM" value={formatClinicalDate(pregnancy.lmpDate)} />
          <Field label="DPP" value={formatClinicalDate(dueDate(pregnancy))} />
          <Field
            label="Idade gestacional"
            value={gestationalAgeLabel(pregnancy.lmpDate, encounterAt)}
          />
          <Field label="Status" value={PREGNANCY_STATUS_LABEL[pregnancy.status]} />
          <Field
            label="Risco"
            value={pregnancy.risk ? PREGNANCY_RISK_LABEL[pregnancy.risk] : "—"}
          />
          <Field label="Médica responsável" value={primaryProfessionalName ?? "—"} />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-lotus-800">
          {restricted ? "Acesso restrito ao contexto obstétrico." : "Consulta ginecológica"}
        </p>
      )}
      {actions ? <div className="mt-3">{actions}</div> : null}
    </section>
  );
}
