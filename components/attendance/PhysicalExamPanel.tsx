"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicalNoteUpsert } from "@/lib/attendance/directory";
import {
  TEMPLATE_PHYSICAL_EXAM,
  computeBmi,
  physicalExamHasContent,
  samePhysicalExam,
  serializePhysicalExam,
  validateVitals,
  type PhysicalExamForm,
} from "@/lib/attendance/clinical-forms";
import { SaveStatus } from "@/components/attendance/SaveStatus";
import { buttonClass } from "@/components/platform/Ui";

const inputClass =
  "mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2 text-sm text-lotus-950 outline-none focus:border-lotus-400 focus:ring-2 focus:ring-lotus-200";
const labelClass = "block text-sm font-medium text-lotus-800";

export function PhysicalExamPanel({
  supabase,
  encounterId,
  locked,
  canEdit,
  initial,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  locked: boolean;
  canEdit: boolean;
  initial: PhysicalExamForm;
}) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    setForm(initial);
    setSaved(initial);
  }, [initial]);

  const dirty = !samePhysicalExam(form, saved) && canEdit && !locked;
  const bmi = useMemo(
    () => computeBmi(form.vitals.weightKg, form.vitals.heightCm),
    [form.vitals.heightCm, form.vitals.weightKg],
  );
  const alerts = useMemo(() => validateVitals(form.vitals), [form.vitals]);

  const persist = useCallback(
    async (next: PhysicalExamForm) => {
      if (locked || !canEdit) return;
      if (!physicalExamHasContent(next)) {
        setError(null);
        setSaved(next);
        return;
      }
      setSaving(true);
      setError(null);
      const result = await clinicalNoteUpsert(supabase, {
        encounterId,
        body: serializePhysicalExam(next),
        templateCode: TEMPLATE_PHYSICAL_EXAM,
      });
      setSaving(false);
      if (result.error || !result.noteId) {
        setError(result.error ?? "Não foi possível salvar o exame físico.");
        return;
      }
      setSaved(next);
      setSavedAt(new Date().toISOString());
    },
    [canEdit, encounterId, locked, supabase],
  );

  function scheduleSave(next: PhysicalExamForm) {
    setForm(next);
    if (locked || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(formRef.current);
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function setVital(field: keyof PhysicalExamForm["vitals"], value: string) {
    scheduleSave({
      ...form,
      vitals: { ...form.vitals, [field]: value },
    });
  }

  return (
    <section id="exame-fisico" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Exame físico</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Registre apenas o que foi examinado. Campos vazios não são interpretados como
            ausência de achado clínico. Autosave atualiza o rascunho deste atendimento.
          </p>
        </div>
        <SaveStatus dirty={dirty} saving={saving} savedAt={savedAt} error={error} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-lotus-900">Sinais vitais</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            PA sistólica (mmHg)
            <input
              className={inputClass}
              inputMode="numeric"
              disabled={locked || !canEdit}
              value={form.vitals.systolicBp}
              onChange={(event) => setVital("systolicBp", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            PA diastólica (mmHg)
            <input
              className={inputClass}
              inputMode="numeric"
              disabled={locked || !canEdit}
              value={form.vitals.diastolicBp}
              onChange={(event) => setVital("diastolicBp", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            FC (bpm)
            <input
              className={inputClass}
              inputMode="numeric"
              disabled={locked || !canEdit}
              value={form.vitals.heartRate}
              onChange={(event) => setVital("heartRate", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            FR (irpm)
            <input
              className={inputClass}
              inputMode="numeric"
              disabled={locked || !canEdit}
              value={form.vitals.respiratoryRate}
              onChange={(event) => setVital("respiratoryRate", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Temperatura (°C)
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={locked || !canEdit}
              value={form.vitals.temperatureC}
              onChange={(event) => setVital("temperatureC", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            SpO₂ (%)
            <input
              className={inputClass}
              inputMode="numeric"
              disabled={locked || !canEdit}
              value={form.vitals.spo2}
              onChange={(event) => setVital("spo2", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Peso (kg)
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={locked || !canEdit}
              value={form.vitals.weightKg}
              onChange={(event) => setVital("weightKg", event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Altura (cm)
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={locked || !canEdit}
              value={form.vitals.heightCm}
              onChange={(event) => setVital("heightCm", event.target.value)}
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-lotus-800">
          IMC:{" "}
          <span className="font-semibold">
            {bmi != null ? bmi.toFixed(1) : "—"}
          </span>
          <span className="text-xs text-lotus-500"> (cálculo automático; sem interpretação clínica)</span>
        </p>
        {alerts.length ? (
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {alerts.map((item) => (
              <li key={item.field + item.message}>⚠ {item.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-lotus-800">
          <input
            type="checkbox"
            disabled={locked || !canEdit}
            checked={form.noRelevantFindings}
            onChange={(event) =>
              scheduleSave({ ...form, noRelevantFindings: event.target.checked })
            }
          />
          Sem alterações relevantes no exame físico
        </label>

        {(
          [
            ["general", "Geral"],
            ["cardiovascular", "Cardiovascular"],
            ["respiratory", "Respiratório"],
            ["abdominal", "Abdominal"],
            ["gynecologic", "Ginecológico"],
            ["obstetric", "Obstétrico"],
            ["otherSystems", "Outros sistemas"],
          ] as const
        ).map(([key, title]) => (
          <label key={key} className={labelClass}>
            {title}
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form[key]}
              onChange={(event) => scheduleSave({ ...form, [key]: event.target.value })}
            />
          </label>
        ))}

        <label className={labelClass}>
          Observações livres
          <textarea
            className={inputClass}
            rows={3}
            disabled={locked || !canEdit}
            value={form.freeText}
            onChange={(event) => scheduleSave({ ...form, freeText: event.target.value })}
          />
        </label>
      </div>

      {canEdit && !locked ? (
        <div className="mt-4">
          <button
            type="button"
            className={buttonClass}
            disabled={saving || !dirty}
            onClick={() => void persist(form)}
          >
            Salvar rascunho do exame físico
          </button>
        </div>
      ) : null}
    </section>
  );
}
