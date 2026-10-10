import { fieldClass } from "@/components/platform/Ui";
import type { SoapNote } from "@/components/attendance/soap";

const labelClass = "text-sm font-medium text-lotus-800";

const FIELDS: { key: keyof SoapNote; label: string }[] = [
  { key: "subjective", label: "Subjetivo" },
  { key: "objective", label: "Objetivo" },
  { key: "assessment", label: "Avaliação" },
  { key: "plan", label: "Plano" },
];

export function ClinicalNoteEditor({
  value,
  locked,
  onChange,
  fromAiSuggestion = false,
}: {
  value: SoapNote;
  locked: boolean;
  onChange: (next: SoapNote) => void;
  fromAiSuggestion?: boolean;
}) {
  return (
    <section className="card mt-4">
      <h2 className="text-base font-semibold text-lotus-900">Evolução SOAP</h2>
      <p className="mt-1 text-sm text-lotus-600">
        {locked
          ? "Atendimento assinado. A evolução fica somente para leitura."
          : "Registro clínico elaborado pela médica. Transcrição ≠ SOAP. Salve antes de assinar."}
      </p>
      {fromAiSuggestion && !locked ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Conteúdo inclui sugestão de IA — revise e salve o rascunho para integrar ao prontuário.
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className={labelClass}>
            {field.label}
            <textarea
              className={fieldClass}
              rows={3}
              value={value[field.key]}
              disabled={locked}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
