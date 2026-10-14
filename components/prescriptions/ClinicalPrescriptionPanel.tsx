"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addPrescriptionItem,
  createPrescriptionDraft,
  deletePrescriptionItem,
  listPrescriptionItems,
  listPrescriptionsForPatient,
  publishPrescriptionToPatient,
  type PrescriptionItemRow,
  type PrescriptionRow,
} from "@/lib/prescriptions/directory";
import { issuePrescriptionDocumentWithPdf } from "@/lib/documents/issue";
import {
  applyPrescriptionTemplate,
  listPrescriptionTemplates,
  upsertPrescriptionTemplate,
  type PrescriptionTemplateRow,
} from "@/lib/attendance/clinical-support-directory";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export function ClinicalPrescriptionPanel({
  supabase,
  organizationId,
  practiceId,
  patientId,
  professionalId,
  encounterId,
  canManage,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  encounterId?: string | null;
  canManage: boolean;
}) {
  const [rows, setRows] = useState<PrescriptionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<PrescriptionItemRow[]>([]);
  const [templates, setTemplates] = useState<PrescriptionTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await listPrescriptionsForPatient(supabase, patientId);
    setRows(list);
    if (activeId) {
      setItems(await listPrescriptionItems(supabase, activeId));
    }
    const tpl = await listPrescriptionTemplates(supabase, practiceId, true);
    setTemplates(tpl);
  }, [activeId, patientId, practiceId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createPrescriptionDraft(supabase, {
        organizationId,
        practiceId,
        patientId,
        professionalId,
        encounterId,
      });
      if (result.error || !result.prescription) {
        setError(result.error ?? "Não foi possível criar a receita.");
        return;
      }
      setActiveId(result.prescription.id);
      setNotice("Receita em rascunho.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onAddItem() {
    if (!activeId || !medicationName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addPrescriptionItem(supabase, {
        prescriptionId: activeId,
        medicationName: medicationName.trim(),
        dosage: dosage.trim() || undefined,
        frequency: frequency.trim() || undefined,
        duration: duration.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMedicationName("");
      setDosage("");
      setFrequency("");
      setDuration("");
      setItems(await listPrescriptionItems(supabase, activeId));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!activeId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publishPrescriptionToPatient(supabase, activeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Receita publicada para a paciente.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onIssueDocument() {
    if (!activeId || !canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await issuePrescriptionDocumentWithPdf(supabase, {
        prescriptionId: activeId,
        shareWithPatient: true,
      });
      if (result.error && !result.row) {
        setError(result.error);
        return;
      }
      if (result.error) setNotice(result.error);
      else {
        setNotice(
          "Documento de receita emitido com validação interna do sistema (não é assinatura digital ICP-Brasil). PDF gerado.",
        );
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onUseTemplate() {
    if (!canManage || !encounterId || !templateId) {
      setError("Selecione um modelo para copiar para a receita atual.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await applyPrescriptionTemplate(supabase, templateId, encounterId);
      if (result.error || !result.prescriptionId) {
        setError(result.error ?? "Não foi possível aplicar o modelo.");
        return;
      }
      setActiveId(result.prescriptionId);
      setNotice("Modelo copiado para nova receita em rascunho. Revise antes de publicar.");
      await reload();
      setItems(await listPrescriptionItems(supabase, result.prescriptionId));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAsTemplate() {
    if (!canManage || !templateName.trim() || items.length === 0) {
      setError("Informe o nome do modelo e tenha ao menos um medicamento na receita aberta.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await upsertPrescriptionTemplate(supabase, {
        practiceId,
        name: templateName.trim(),
        items: items.map((item) => ({
          medication_name: item.medicationName,
          presentation: item.presentation ?? undefined,
          dosage: item.dosage ?? undefined,
          route: item.route ?? undefined,
          frequency: item.frequency ?? undefined,
          duration: item.duration ?? undefined,
          quantity: item.quantity ?? undefined,
          observations: item.instructions ?? undefined,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setTemplateName("");
      setNotice("Modelo de receita salvo (atalho). Receitas antigas não são alteradas.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Receita</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Elabore e publique no mesmo fluxo clínico. Modelos são atalhos — a IA não prescrita.
          </p>
        </div>
        {canManage ? (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreate()}>
            Nova receita
          </button>
        ) : null}
      </div>
      <StatusMessage error={error} notice={notice} />

      {canManage && encounterId ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-lotus-100 p-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-lotus-800">
            Usar modelo
            <select
              className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">Selecione…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.items.length} itens)
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={ghostButtonClass} disabled={busy || !templateId} onClick={() => void onUseTemplate()}>
            Copiar modelo para receita
          </button>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2 text-sm">
        {rows.length === 0 ? (
          <li className="text-lotus-600">Nenhuma receita neste contexto.</li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="rounded-md border border-lotus-100 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {formatDateTime(row.createdAt)} · {row.status}
                  {row.publishedToPatientAt ? " · publicada" : ""}
                </p>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => {
                    setActiveId(row.id);
                    void listPrescriptionItems(supabase, row.id).then(setItems);
                  }}
                >
                  Abrir
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      {activeId && canManage ? (
        <div className="mt-4 space-y-3 border-t border-lotus-100 pt-4">
          <p className="text-sm font-semibold text-lotus-800">Itens da receita</p>
          <ul className="space-y-1 text-sm text-lotus-700">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {item.medicationName}
                  {item.dosage ? ` · ${item.dosage}` : ""}
                  {item.frequency ? ` · ${item.frequency}` : ""}
                  {item.duration ? ` · ${item.duration}` : ""}
                </span>
                <button
                  type="button"
                  className={ghostButtonClass}
                  disabled={busy || rows.find((r) => r.id === activeId)?.status !== "draft"}
                  onClick={() =>
                    void deletePrescriptionItem(supabase, item.id).then(() =>
                      listPrescriptionItems(supabase, activeId).then(setItems),
                    )
                  }
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          {rows.find((r) => r.id === activeId)?.status === "draft" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="rounded-md border border-lotus-200 px-3 py-2 text-sm"
                  placeholder="Medicamento"
                  value={medicationName}
                  onChange={(event) => setMedicationName(event.target.value)}
                />
                <input
                  className="rounded-md border border-lotus-200 px-3 py-2 text-sm"
                  placeholder="Dose"
                  value={dosage}
                  onChange={(event) => setDosage(event.target.value)}
                />
                <input
                  className="rounded-md border border-lotus-200 px-3 py-2 text-sm"
                  placeholder="Frequência"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                />
                <input
                  className="rounded-md border border-lotus-200 px-3 py-2 text-sm"
                  placeholder="Duração"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onAddItem()}>
                  Adicionar medicamento
                </button>
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void onIssueDocument()}>
                  Emitir documento (PDF)
                </button>
                <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onPublish()}>
                  Publicar sem PDF (legado)
                </button>
              </div>
              <p className="text-xs text-lotus-500">
                Emitir documento congela a receita, gera PDF e registra validação interna (não é ICP-Brasil).
              </p>
              <div className="flex flex-col gap-2 border-t border-lotus-100 pt-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-medium text-lotus-800">
                  Salvar receita aberta como modelo
                  <input
                    className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="Nome do modelo"
                  />
                </label>
                <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onSaveAsTemplate()}>
                  Salvar modelo
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
