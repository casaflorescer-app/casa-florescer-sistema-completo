"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicalNoteUpsert } from "@/lib/attendance/directory";
import {
  VISIT_MOTIVE_LABEL,
  VISIT_MOTIVES,
  chiefComplaintHasContent,
  sameChiefComplaint,
  serializeChiefComplaint,
  type ChiefComplaintForm,
  type VisitMotive,
  TEMPLATE_CHIEF_COMPLAINT,
} from "@/lib/attendance/clinical-forms";
import { SaveStatus } from "@/components/attendance/SaveStatus";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

const inputClass =
  "mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2 text-sm text-lotus-950 outline-none focus:border-lotus-400 focus:ring-2 focus:ring-lotus-200";
const labelClass = "block text-sm font-medium text-lotus-800";

export function ChiefComplaintPanel({
  supabase,
  encounterId,
  locked,
  initial,
  canEdit,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  locked: boolean;
  initial: ChiefComplaintForm;
  canEdit: boolean;
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

  const dirty = !sameChiefComplaint(form, saved) && canEdit && !locked;

  const persist = useCallback(
    async (next: ChiefComplaintForm) => {
      if (locked || !canEdit) return;
      if (!chiefComplaintHasContent(next)) {
        setError(null);
        setSaved(next);
        return;
      }
      setSaving(true);
      setError(null);
      const result = await clinicalNoteUpsert(supabase, {
        encounterId,
        body: serializeChiefComplaint(next),
        templateCode: TEMPLATE_CHIEF_COMPLAINT,
      });
      setSaving(false);
      if (result.error || !result.noteId) {
        setError(result.error ?? "Não foi possível salvar a queixa.");
        return;
      }
      setSaved(next);
      setSavedAt(new Date().toISOString());
    },
    [canEdit, encounterId, locked, supabase],
  );

  function scheduleSave(next: ChiefComplaintForm) {
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

  function toggleMotive(motive: VisitMotive) {
    const exists = form.motives.includes(motive);
    const motives = exists
      ? form.motives.filter((item) => item !== motive)
      : [...form.motives, motive];
    scheduleSave({ ...form, motives });
  }

  return (
    <section id="queixa" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Queixa / motivo da consulta</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Rascunho do atendimento atual (autosave sobrescreve o rascunho; não gera histórico
            linha a linha). Não substitui a anamnese histórica da paciente.
          </p>
        </div>
        <SaveStatus dirty={dirty} saving={saving} savedAt={savedAt} error={error} />
      </div>

      <div className="mt-4 space-y-4">
        <label className={labelClass}>
          Queixa principal
          <textarea
            className={inputClass}
            rows={2}
            disabled={locked || !canEdit}
            value={form.chiefComplaint}
            onChange={(event) =>
              scheduleSave({ ...form, chiefComplaint: event.target.value })
            }
            placeholder="Descreva a queixa relatada"
          />
        </label>

        <fieldset disabled={locked || !canEdit}>
          <legend className="text-sm font-medium text-lotus-800">Motivo</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {VISIT_MOTIVES.map((motive) => {
              const active = form.motives.includes(motive);
              return (
                <button
                  key={motive}
                  type="button"
                  className={active ? buttonClass : ghostButtonClass}
                  onClick={() => toggleMotive(motive)}
                >
                  {VISIT_MOTIVE_LABEL[motive]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {form.motives.includes("other") ? (
          <label className={labelClass}>
            Outro motivo
            <input
              className={inputClass}
              disabled={locked || !canEdit}
              value={form.otherMotive}
              onChange={(event) => scheduleSave({ ...form, otherMotive: event.target.value })}
            />
          </label>
        ) : null}

        <label className={labelClass}>
          História da condição atual
          <textarea
            className={inputClass}
            rows={4}
            disabled={locked || !canEdit}
            value={form.historyOfPresentIllness}
            onChange={(event) =>
              scheduleSave({ ...form, historyOfPresentIllness: event.target.value })
            }
            placeholder="Evolução, fatores associados, relatos relevantes de hoje"
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
            Salvar rascunho da queixa
          </button>
        </div>
      ) : null}
    </section>
  );
}
