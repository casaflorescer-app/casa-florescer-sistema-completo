"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clinicalNoteUpsert } from "@/lib/attendance/directory";
import {
  TEMPLATE_ANAMNESIS_ENCOUNTER,
  anamnesisHasContent,
  sameAnamnesis,
  serializeAnamnesis,
  type AnamnesisEncounterForm,
} from "@/lib/attendance/clinical-forms";
import {
  getPatientClinicalCadastro,
  upsertPatientClinicalCadastro,
  type PatientClinicalCadastro,
} from "@/lib/attendance/patient-clinical";
import type { PriorAnamnesisRef } from "@/lib/attendance/prior-clinical";
import { formatDateTime } from "@/lib/platform/format";
import { SaveStatus } from "@/components/attendance/SaveStatus";
import { buttonClass, ghostButtonClass } from "@/components/platform/Ui";

const inputClass =
  "mt-1 w-full rounded-xl border border-lotus-200 bg-white px-3 py-2 text-sm text-lotus-950 outline-none focus:border-lotus-400 focus:ring-2 focus:ring-lotus-200";
const labelClass = "block text-sm font-medium text-lotus-800";

export function AnamnesisPanel({
  supabase,
  encounterId,
  patientId,
  organizationId,
  actorUserId,
  locked,
  canEdit,
  initial,
  prior,
  pregnancyHint,
}: {
  supabase: SupabaseClient;
  encounterId: string;
  patientId: string;
  organizationId: string;
  actorUserId: string | null;
  locked: boolean;
  canEdit: boolean;
  initial: AnamnesisEncounterForm;
  prior: PriorAnamnesisRef | null;
  pregnancyHint: string | null;
}) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [cadastro, setCadastro] = useState<PatientClinicalCadastro | null>(null);
  const [showPrior, setShowPrior] = useState(Boolean(prior));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadastroNotice, setCadastroNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    setForm(initial);
    setSaved(initial);
  }, [initial]);

  useEffect(() => {
    void getPatientClinicalCadastro(supabase, patientId).then(setCadastro);
  }, [patientId, supabase]);

  const dirty = !sameAnamnesis(form, saved) && canEdit && !locked;
  const isFirstVisit = !prior;

  const persist = useCallback(
    async (next: AnamnesisEncounterForm) => {
      if (locked || !canEdit) return;
      if (!anamnesisHasContent(next)) {
        setError(null);
        setSaved(next);
        return;
      }
      setSaving(true);
      setError(null);
      const result = await clinicalNoteUpsert(supabase, {
        encounterId,
        body: serializeAnamnesis(next),
        templateCode: TEMPLATE_ANAMNESIS_ENCOUNTER,
      });
      setSaving(false);
      if (result.error || !result.noteId) {
        setError(result.error ?? "Não foi possível salvar a anamnese.");
        return;
      }
      setSaved(next);
      setSavedAt(new Date().toISOString());
    },
    [canEdit, encounterId, locked, supabase],
  );

  function scheduleSave(next: AnamnesisEncounterForm) {
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

  function applyPriorToVisit() {
    if (!prior) return;
    scheduleSave({
      ...form,
      personalHistoryNotes: prior.form.personalHistoryNotes || form.personalHistoryNotes,
      familyHistoryNotes: prior.form.familyHistoryNotes || form.familyHistoryNotes,
      habitsNotes: prior.form.habitsNotes || form.habitsNotes,
      surgicalHistoryNotes: prior.form.surgicalHistoryNotes || form.surgicalHistoryNotes,
      gynecologicNotes: prior.form.gynecologicNotes || form.gynecologicNotes,
      obstetricNotes: prior.form.obstetricNotes || form.obstetricNotes,
      reviewedAllergies:
        prior.form.reviewedAllergies ||
        cadastro?.allergies ||
        form.reviewedAllergies,
      reviewedMedications:
        prior.form.reviewedMedications ||
        cadastro?.continuousMedications ||
        form.reviewedMedications,
      reviewedComorbidities:
        prior.form.reviewedComorbidities ||
        cadastro?.comorbidities ||
        form.reviewedComorbidities,
      noRelevantChanges: true,
      changesSinceLastVisit: form.changesSinceLastVisit,
    });
  }

  async function publishCadastroUpdates() {
    if (!canEdit || locked || !actorUserId) return;
    setCadastroNotice(null);
    const result = await upsertPatientClinicalCadastro(supabase, {
      patientId,
      organizationId,
      allergies: form.reviewedAllergies.trim() || null,
      continuousMedications: form.reviewedMedications.trim() || null,
      comorbidities: form.reviewedComorbidities.trim() || null,
      updatedBy: actorUserId,
    });
    if (!result.ok) {
      setCadastroNotice(result.error ?? "Falha ao atualizar cadastro clínico.");
      return;
    }
    setCadastroNotice(
      "Cadastro clínico histórico atualizado (alergias/medicações/comorbidades). A anamnese deste atendimento permanece separada.",
    );
    const refreshed = await getPatientClinicalCadastro(supabase, patientId);
    setCadastro(refreshed);
    await persist(form);
  }

  return (
    <section id="anamnese" className="card mt-4 scroll-mt-16 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Anamnese</h2>
          <p className="mt-1 text-sm text-lotus-600">
            {isFirstVisit
              ? "Primeira consulta nesta prática — preencha a anamnese de referência do atendimento."
              : "Consulta subsequente — revise o histórico e registre apenas o que mudou hoje."}
          </p>
          <p className="mt-1 text-xs text-lotus-500">
            Autosave atualiza o rascunho deste atendimento (conteúdo anterior do mesmo
            atendimento não fica recuperável). O histórico entre consultas permanece nas
            notas de cada encounter. O cadastro histórico só muda pelo botão explícito.
          </p>
        </div>
        <SaveStatus dirty={dirty} saving={saving} savedAt={savedAt} error={error} />
      </div>

      <div className="mt-4 rounded-xl border border-lotus-100 bg-lotus-50/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
          Histórico da paciente (cadastro)
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3 text-sm text-lotus-900">
          <div>
            <dt className="text-xs text-lotus-500">Alergias</dt>
            <dd>{cadastro?.allergies?.trim() || "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-xs text-lotus-500">Medicamentos contínuos</dt>
            <dd>{cadastro?.continuousMedications?.trim() || "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-xs text-lotus-500">Comorbidades</dt>
            <dd>{cadastro?.comorbidities?.trim() || "Não informado"}</dd>
          </div>
        </dl>
        {cadastro?.pregnancies != null ? (
          <p className="mt-2 text-xs text-lotus-600">
            GPA cadastro: G{cadastro.pregnancies} P{cadastro.births} A{cadastro.abortions}
            {pregnancyHint ? ` · ${pregnancyHint}` : ""}
          </p>
        ) : null}
      </div>

      {prior ? (
        <div className="mt-4 rounded-xl border border-[#F0D5C8] bg-[#FFF8F5] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-lotus-950">Anamnese anterior</p>
              <p className="text-xs text-lotus-600">
                Atendimento de {formatDateTime(prior.encounter.createdAt)}
                {prior.encounter.status === "signed" ? " · assinado" : ""}
                {" · "}
                rascunho com {prior.note.version}{" "}
                {prior.note.version === 1 ? "gravação" : "gravações"} (último estado daquele
                atendimento)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => setShowPrior((value) => !value)}
              >
                {showPrior ? "Ocultar" : "Visualizar"}
              </button>
              {canEdit && !locked ? (
                <button type="button" className={buttonClass} onClick={applyPriorToVisit}>
                  Manter / copiar para hoje
                </button>
              ) : null}
            </div>
          </div>
          {showPrior ? (
            <div className="mt-3 space-y-2 text-sm text-lotus-800">
              {prior.form.changesSinceLastVisit ? (
                <p>
                  <span className="font-medium">Mudanças: </span>
                  {prior.form.changesSinceLastVisit}
                </p>
              ) : null}
              {prior.form.personalHistoryNotes ? (
                <p>
                  <span className="font-medium">Antecedentes pessoais: </span>
                  {prior.form.personalHistoryNotes}
                </p>
              ) : null}
              {prior.form.familyHistoryNotes ? (
                <p>
                  <span className="font-medium">Familiares: </span>
                  {prior.form.familyHistoryNotes}
                </p>
              ) : null}
              {prior.form.reviewNotes ? (
                <p>
                  <span className="font-medium">Observações: </span>
                  {prior.form.reviewNotes}
                </p>
              ) : null}
              {!prior.form.personalHistoryNotes &&
              !prior.form.familyHistoryNotes &&
              !prior.form.reviewNotes &&
              !prior.form.changesSinceLastVisit ? (
                <p className="text-lotus-600">Sem texto detalhado na anamnese anterior.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
          Atendimento atual
        </p>

        <label className="flex items-center gap-2 text-sm text-lotus-800">
          <input
            type="checkbox"
            disabled={locked || !canEdit}
            checked={form.noRelevantChanges}
            onChange={(event) =>
              scheduleSave({ ...form, noRelevantChanges: event.target.checked })
            }
          />
          Sem alterações relevantes desde a última consulta
        </label>

        <label className={labelClass}>
          Mudanças desde o último atendimento
          <textarea
            className={inputClass}
            rows={2}
            disabled={locked || !canEdit}
            value={form.changesSinceLastVisit}
            onChange={(event) =>
              scheduleSave({ ...form, changesSinceLastVisit: event.target.value })
            }
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className={labelClass}>
            Alergias (revisão neste atendimento)
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.reviewedAllergies}
              onChange={(event) =>
                scheduleSave({ ...form, reviewedAllergies: event.target.value })
              }
              placeholder={cadastro?.allergies ?? ""}
            />
          </label>
          <label className={labelClass}>
            Medicamentos em uso (revisão)
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.reviewedMedications}
              onChange={(event) =>
                scheduleSave({ ...form, reviewedMedications: event.target.value })
              }
              placeholder={cadastro?.continuousMedications ?? ""}
            />
          </label>
          <label className={labelClass}>
            Antecedentes / comorbidades (revisão)
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.reviewedComorbidities}
              onChange={(event) =>
                scheduleSave({ ...form, reviewedComorbidities: event.target.value })
              }
              placeholder={cadastro?.comorbidities ?? ""}
            />
          </label>
          <label className={labelClass}>
            Antecedentes pessoais
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.personalHistoryNotes}
              onChange={(event) =>
                scheduleSave({ ...form, personalHistoryNotes: event.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Antecedentes familiares
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.familyHistoryNotes}
              onChange={(event) =>
                scheduleSave({ ...form, familyHistoryNotes: event.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Hábitos e aspectos relevantes
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.habitsNotes}
              onChange={(event) => scheduleSave({ ...form, habitsNotes: event.target.value })}
            />
          </label>
          <label className={labelClass}>
            Cirurgias / procedimentos
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.surgicalHistoryNotes}
              onChange={(event) =>
                scheduleSave({ ...form, surgicalHistoryNotes: event.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Histórico ginecológico
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.gynecologicNotes}
              onChange={(event) =>
                scheduleSave({ ...form, gynecologicNotes: event.target.value })
              }
            />
          </label>
          <label className={labelClass}>
            Histórico obstétrico (complemento — não substitui o módulo)
            <textarea
              className={inputClass}
              rows={2}
              disabled={locked || !canEdit}
              value={form.obstetricNotes}
              onChange={(event) =>
                scheduleSave({ ...form, obstetricNotes: event.target.value })
              }
              placeholder={pregnancyHint ?? ""}
            />
          </label>
        </div>

        <label className={labelClass}>
          Observações da revisão
          <textarea
            className={inputClass}
            rows={3}
            disabled={locked || !canEdit}
            value={form.reviewNotes}
            onChange={(event) => scheduleSave({ ...form, reviewNotes: event.target.value })}
          />
        </label>
      </div>

      {canEdit && !locked ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={saving || !dirty}
            onClick={() => void persist(form)}
          >
            Salvar rascunho da anamnese
          </button>
          <button
            type="button"
            className={ghostButtonClass}
            disabled={saving || !actorUserId}
            onClick={() => void publishCadastroUpdates()}
          >
            Atualizar cadastro histórico
          </button>
        </div>
      ) : null}
      {cadastroNotice ? (
        <p className="mt-2 text-xs text-lotus-700">{cadastroNotice}</p>
      ) : null}
    </section>
  );
}
