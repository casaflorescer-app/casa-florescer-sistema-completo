"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addPrescriptionItem,
  applyTemplateItemsAsDraft,
  buildStructuredInstructions,
  copyPrescriptionAsDraft,
  createPrescriptionDraft,
  deletePrescriptionItem,
  listPrescriptionItems,
  listPrescriptionsForPatient,
  type PrescriptionItemRow,
  type PrescriptionRow,
} from "@/lib/prescriptions/directory";
import { issuePrescriptionDocumentWithPdf } from "@/lib/documents/issue";
import {
  createSignedDocumentUrl,
  listDocumentsForEncounter,
  listDocumentsForPatient,
} from "@/lib/documents/directory";
import type { ClinicalDocumentRow } from "@/lib/documents/types";
import {
  applyPrescriptionTemplate,
  listPrescriptionTemplates,
  upsertPrescriptionTemplate,
  type PrescriptionTemplateRow,
} from "@/lib/attendance/clinical-support-directory";
import { buttonClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";
import { CLINICAL_DOCUMENT_FEATURES } from "@/lib/regulatory/clinical-document-features";

const STATUS_LABEL: Record<PrescriptionRow["status"], string> = {
  draft: "Rascunho",
  signed: "Assinada (legado)",
  dispatched: "Emitida/despachada",
  cancelled: "Cancelada",
};

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
  const [templateQuery, setTemplateQuery] = useState("");
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);
  const [copyFromId, setCopyFromId] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [presentation, setPresentation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [route, setRoute] = useState("");
  const [instructions, setInstructions] = useState("");
  const [prn, setPrn] = useState(false);
  const [prnCondition, setPrnCondition] = useState("");
  const [prnMinInterval, setPrnMinInterval] = useState("");
  const [prnMaxDaily, setPrnMaxDaily] = useState("");
  const [continuous, setContinuous] = useState(false);
  const [reevaluateAt, setReevaluateAt] = useState("");
  const [shareWithPatient, setShareWithPatient] = useState(true);
  const [correctionReason, setCorrectionReason] = useState("");
  const [issuedDocs, setIssuedDocs] = useState<ClinicalDocumentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = rows.find((r) => r.id === activeId) ?? null;
  const isDraft = active?.status === "draft";

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (!showArchivedTemplates && !t.isActive) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
    });
  }, [showArchivedTemplates, templateQuery, templates]);

  const finalizedDoc = useMemo(
    () =>
      issuedDocs.find(
        (d) =>
          d.sourceType === "prescription" &&
          d.sourceId === activeId &&
          d.status === "finalized",
      ) ?? null,
    [activeId, issuedDocs],
  );

  const reload = useCallback(async () => {
    const list = await listPrescriptionsForPatient(supabase, patientId);
    setRows(list);
    if (activeId) setItems(await listPrescriptionItems(supabase, activeId));
    setTemplates(await listPrescriptionTemplates(supabase, practiceId, false));
    if (encounterId) {
      const docs = await listDocumentsForEncounter(supabase, encounterId);
      setIssuedDocs(docs.rows.filter((d) => d.sourceType === "prescription"));
    } else {
      const docs = await listDocumentsForPatient(supabase, patientId, "prescription");
      setIssuedDocs(docs.rows);
    }
  }, [activeId, encounterId, patientId, practiceId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function clearItemForm() {
    setMedicationName("");
    setPresentation("");
    setQuantity("");
    setDosage("");
    setFrequency("");
    setDuration("");
    setRoute("");
    setInstructions("");
    setPrn(false);
    setPrnCondition("");
    setPrnMinInterval("");
    setPrnMaxDaily("");
    setContinuous(false);
    setReevaluateAt("");
  }

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

  async function onCopyPrevious() {
    if (!canManage || !copyFromId) {
      setError("Selecione uma receita anterior para copiar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await copyPrescriptionAsDraft(supabase, {
        sourcePrescriptionId: copyFromId,
        organizationId,
        practiceId,
        patientId,
        professionalId,
        encounterId,
      });
      if (result.error || !result.prescription) {
        setError(result.error ?? "Não foi possível copiar a receita.");
        return;
      }
      setActiveId(result.prescription.id);
      setNotice("Cópia criada como NOVO rascunho. Revise antes de emitir.");
      await reload();
      setItems(await listPrescriptionItems(supabase, result.prescription.id));
    } finally {
      setBusy(false);
    }
  }

  async function onAddItem() {
    if (!activeId || !medicationName.trim() || !isDraft) return;
    if (prn && !prnCondition.trim()) {
      setError("Para 'se necessário', informe a condição de uso.");
      return;
    }
    if (continuous && !reevaluateAt.trim() && !duration.trim()) {
      setError("Para uso contínuo, informe duração ou data/prazo de reavaliação.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const structured = buildStructuredInstructions({
        base: instructions,
        prn,
        prnCondition,
        prnMinInterval,
        prnMaxDaily,
        continuous,
        reevaluateAt,
      });
      const result = await addPrescriptionItem(supabase, {
        prescriptionId: activeId,
        medicationName: medicationName.trim(),
        presentation: presentation.trim() || undefined,
        quantity: quantity.trim() || undefined,
        dosage: dosage.trim() || undefined,
        frequency: frequency.trim() || undefined,
        duration: continuous && !duration.trim()
          ? `uso contínuo${reevaluateAt.trim() ? ` — reavaliar: ${reevaluateAt.trim()}` : ""}`
          : duration.trim() || undefined,
        route: route.trim() || undefined,
        instructions: structured,
        sortOrder: items.length + 1,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      clearItemForm();
      setItems(await listPrescriptionItems(supabase, activeId));
    } finally {
      setBusy(false);
    }
  }

  async function onIssueDocument() {
    if (!activeId || !canManage) return;
    if (finalizedDoc && !correctionReason.trim()) {
      setError("Já existe documento finalizado. Informe o motivo da correção para nova versão.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await issuePrescriptionDocumentWithPdf(supabase, {
        prescriptionId: activeId,
        shareWithPatient,
        supersedesId: finalizedDoc?.id ?? null,
        correctionReason: finalizedDoc ? correctionReason.trim() : null,
      });
      if (result.error && !result.row) {
        setError(result.error);
        return;
      }
      setCorrectionReason("");
      setNotice(
        result.error
          ? result.error
          : "Documento emitido com validação interna (internal_system — não é ICP-Brasil). PDF gerado.",
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onUseTemplate() {
    if (!canManage || !templateId) {
      setError("Selecione um modelo ativo para copiar.");
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template?.isActive) {
      setError("Selecione um modelo ativo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (encounterId) {
        const result = await applyPrescriptionTemplate(supabase, templateId, encounterId);
        if (result.error || !result.prescriptionId) {
          setError(result.error ?? "Não foi possível aplicar o modelo.");
          return;
        }
        setActiveId(result.prescriptionId);
        setNotice("Modelo copiado para NOVO rascunho. Revise antes de emitir.");
        await reload();
        setItems(await listPrescriptionItems(supabase, result.prescriptionId));
        return;
      }
      const result = await applyTemplateItemsAsDraft(supabase, {
        organizationId,
        practiceId,
        patientId,
        professionalId,
        encounterId,
        templateName: template.name,
        items: template.items,
      });
      if (result.error || !result.prescription) {
        setError(result.error ?? "Não foi possível aplicar o modelo.");
        return;
      }
      setActiveId(result.prescription.id);
      setNotice("Modelo copiado para NOVO rascunho. Revise antes de emitir.");
      await reload();
      setItems(await listPrescriptionItems(supabase, result.prescription.id));
    } finally {
      setBusy(false);
    }
  }

  async function onViewPdf(doc: ClinicalDocumentRow) {
    if (!doc.pdfStoragePath) {
      setError("PDF ainda não anexado a este documento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const signed = await createSignedDocumentUrl(supabase, doc.pdfStoragePath);
      if (signed.error || !signed.url) {
        setError(signed.error ?? "Não foi possível abrir o PDF.");
        return;
      }
      window.open(signed.url, "_blank", "noopener,noreferrer");
      setNotice("PDF aberto (URL assinada — bucket privado). Reimpressão não cria nova versão.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAsTemplate() {
    if (!canManage || !templateName.trim() || items.length === 0) {
      setError("Informe o nome do modelo e tenha ao menos um medicamento.");
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
      setNotice("Modelo salvo. Não altera receitas já emitidas.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveTemplate(template: PrescriptionTemplateRow, active: boolean) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const result = await upsertPrescriptionTemplate(supabase, {
        id: template.id,
        practiceId,
        name: template.name,
        description: template.description ?? undefined,
        isActive: active,
        items: template.items.map((item) => ({
          medication_name: item.medicationName,
          presentation: item.presentation ?? undefined,
          concentration: item.concentration ?? undefined,
          dosage: item.dosage ?? undefined,
          route: item.route ?? undefined,
          frequency: item.frequency ?? undefined,
          duration: item.duration ?? undefined,
          quantity: item.quantity ?? undefined,
          observations: item.observations ?? undefined,
        })),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(active ? "Modelo reativado." : "Modelo arquivado (não aparece como padrão).");
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
            Rascunho → revisão → emitir documento. Modelos e cópias geram novo rascunho — não
            alteram documentos emitidos. Validação = interna (não ICP-Brasil).
          </p>
          {!CLINICAL_DOCUMENT_FEATURES.sncrIntegrationAvailable ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
              {CLINICAL_DOCUMENT_FEATURES.sncrTransitionNote} Não há numeração fictícia nem QR Code
              simulado.
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreate()}>
            Nova receita
          </button>
        ) : null}
      </div>
      <StatusMessage error={error} notice={notice} />

      {canManage ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-lotus-100 p-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-lotus-900">Modelos</p>
            <input
              className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
              placeholder="Buscar modelo…"
              value={templateQuery}
              onChange={(e) => setTemplateQuery(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-lotus-700">
              <input
                type="checkbox"
                checked={showArchivedTemplates}
                onChange={(e) => setShowArchivedTemplates(e.target.checked)}
              />
              Mostrar arquivados
            </label>
            <select
              className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Selecione modelo…</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.items.length}){t.isActive ? "" : " · arquivado"}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButtonClass}
                disabled={busy || !templateId}
                onClick={() => void onUseTemplate()}
              >
                Usar modelo
              </button>
              {templateId
                ? (() => {
                    const t = templates.find((x) => x.id === templateId);
                    if (!t) return null;
                    return (
                      <button
                        type="button"
                        className={ghostButtonClass}
                        disabled={busy}
                        onClick={() => void onArchiveTemplate(t, !t.isActive)}
                      >
                        {t.isActive ? "Arquivar" : "Reativar"}
                      </button>
                    );
                  })()
                : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-lotus-900">Copiar receita anterior</p>
            <select
              className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {rows
                .filter((r) => r.status !== "draft")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatDateTime(r.createdAt)} · {STATUS_LABEL[r.status]}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy || !copyFromId}
              onClick={() => void onCopyPrevious()}
            >
              Copiar como novo rascunho
            </button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2 text-sm">
        {rows.length === 0 ? (
          <li className="text-lotus-600">Nenhuma receita neste paciente.</li>
        ) : (
          rows.map((row) => {
            const doc = issuedDocs.find(
              (d) => d.sourceId === row.id && d.status === "finalized",
            );
            return (
              <li key={row.id} className="rounded-md border border-lotus-100 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    {formatDateTime(row.createdAt)} · {STATUS_LABEL[row.status]}
                    {doc ? ` · documento v${doc.version}${doc.availableToPatient ? " (portal)" : ""}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ghostButtonClass}
                      onClick={() => {
                        setActiveId(row.id);
                        void listPrescriptionItems(supabase, row.id).then(setItems);
                      }}
                    >
                      Visualizar
                    </button>
                    {doc?.pdfStoragePath ? (
                      <button
                        type="button"
                        className={ghostButtonClass}
                        disabled={busy}
                        onClick={() => void onViewPdf(doc)}
                      >
                        PDF
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {activeId && canManage ? (
        <div className="mt-4 space-y-3 border-t border-lotus-100 pt-4">
          <p className="text-sm font-semibold text-lotus-800">
            Itens {isDraft ? "(rascunho editável)" : "(somente leitura — emitida)"}
          </p>
          <ul className="space-y-2 text-sm text-lotus-700">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border border-lotus-50 px-2 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-lotus-900">{item.medicationName}</p>
                    <p className="text-xs text-lotus-600">
                      {[item.presentation, item.dosage, item.route, item.frequency, item.duration, item.quantity]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {item.instructions ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-lotus-700">{item.instructions}</p>
                    ) : null}
                  </div>
                  {isDraft ? (
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() =>
                        void deletePrescriptionItem(supabase, item.id).then(() =>
                          listPrescriptionItems(supabase, activeId).then(setItems),
                        )
                      }
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {isDraft ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Medicamento *" value={medicationName} onChange={(e) => setMedicationName(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Apresentação / concentração" value={presentation} onChange={(e) => setPresentation(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Dose" value={dosage} onChange={(e) => setDosage(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Via" value={route} onChange={(e) => setRoute(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Frequência" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Duração / prazo" value={duration} onChange={(e) => setDuration(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Quantidade total" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Instruções ao paciente" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
              <div className="grid gap-2 rounded-md border border-lotus-100 bg-lotus-50/40 p-3 text-sm sm:grid-cols-2">
                <label className="flex items-start gap-2 sm:col-span-2">
                  <input type="checkbox" className="mt-1" checked={prn} onChange={(e) => setPrn(e.target.checked)} />
                  Se necessário (PRN)
                </label>
                {prn ? (
                  <>
                    <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm sm:col-span-2" placeholder="Condição de uso *" value={prnCondition} onChange={(e) => setPrnCondition(e.target.value)} />
                    <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Intervalo mínimo" value={prnMinInterval} onChange={(e) => setPrnMinInterval(e.target.value)} />
                    <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm" placeholder="Dose máxima / dia" value={prnMaxDaily} onChange={(e) => setPrnMaxDaily(e.target.value)} />
                  </>
                ) : null}
                <label className="flex items-start gap-2 sm:col-span-2">
                  <input type="checkbox" className="mt-1" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
                  Uso contínuo (exige reavaliação/prazo)
                </label>
                {continuous ? (
                  <input className="rounded-md border border-lotus-200 px-3 py-2 text-sm sm:col-span-2" placeholder="Reavaliar em (ex.: 90 dias / data)" value={reevaluateAt} onChange={(e) => setReevaluateAt(e.target.value)} />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onAddItem()}>
                  Adicionar medicamento
                </button>
              </div>
              <div className="space-y-2 rounded-md border border-lotus-100 p-3 text-sm">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={shareWithPatient} onChange={(e) => setShareWithPatient(e.target.checked)} />
                  Disponibilizar PDF à paciente no portal
                </label>
                {finalizedDoc ? (
                  <input
                    className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
                    placeholder="Motivo da correção (obrigatório)"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                  />
                ) : null}
                <button type="button" className={buttonClass} disabled={busy || items.length === 0} onClick={() => void onIssueDocument()}>
                  {finalizedDoc ? "Emitir correção (PDF)" : "Emitir documento (PDF)"}
                </button>
                <p className="text-xs text-lotus-500">
                  Congela snapshot + hash. Reimpressão usa o mesmo documento (não gera nova receita).
                </p>
              </div>
              <div className="flex flex-col gap-2 border-t border-lotus-100 pt-3 sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-medium text-lotus-800">
                  Salvar como modelo
                  <input
                    className="mt-1 w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Nome do modelo (sem dados da paciente)"
                  />
                </label>
                <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onSaveAsTemplate()}>
                  Salvar modelo
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-lotus-600">Receita não editável após emissão. Para corrigir, abra um novo rascunho ou use correção documental.</p>
              {finalizedDoc ? (
                <p className="text-xs text-lotus-500">
                  Documento v{finalizedDoc.version} · SHA {finalizedDoc.contentSha256.slice(0, 16)}…
                </p>
              ) : null}
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void onIssueDocument()}
              >
                {finalizedDoc ? "Emitir correção a partir desta origem" : "Emitir documento (PDF)"}
              </button>
              {finalizedDoc ? (
                <input
                  className="w-full rounded-md border border-lotus-200 px-3 py-2 text-sm"
                  placeholder="Motivo da correção"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
