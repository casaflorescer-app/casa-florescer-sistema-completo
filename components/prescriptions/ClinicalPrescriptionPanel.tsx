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
  }, [activeId, patientId, supabase]);

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

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-lotus-900">Receita</h2>
          <p className="mt-1 text-sm text-lotus-600">
            Elabore e publique no mesmo fluxo clínico. Sem IA prescritora.
          </p>
        </div>
        {canManage ? (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreate()}>
            Criar receita
          </button>
        ) : null}
      </div>
      <StatusMessage error={error} notice={notice} />

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
                <button type="button" className={buttonClass} disabled={busy} onClick={() => void onPublish()}>
                  Revisar e publicar para paciente
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
