"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCep, formatCpf, formatPhone } from "@/lib/patients/format";
import {
  applyBillingModalityChange,
  emptyPatientForm,
  getPatient,
  patientDetailToForm,
  updatePatient,
  validatePatientCreateInput,
  type PatientUpdateInput,
} from "@/lib/patients/directory";
import { PatientMpiFields } from "@/components/patients/PatientMpiFields";
import { StatusMessage, buttonClass, ghostButtonClass } from "@/components/platform/Ui";

export function PatientEditForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<PatientUpdateInput>(emptyPatientForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const detailHref = `/app/patients/${patientId}`;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    void getPatient(supabase, patientId)
      .then((row) => {
        if (!row) {
          setLoaded(false);
          setError("Paciente não encontrada ou sem permissão para visualização.");
          return;
        }
        const mapped = applyBillingModalityChange(patientDetailToForm(row), row.billingModality ?? "");
        setForm({
          ...mapped,
          cpf: mapped.cpf ? formatCpf(mapped.cpf) : "",
          phone: mapped.phone ? formatPhone(mapped.phone) : "",
          addressCep: mapped.addressCep ? formatCep(mapped.addressCep) : "",
          addressState: mapped.addressState.toUpperCase(),
        });
        setLoaded(true);
        setError(null);
      })
      .catch((err: unknown) => {
        setLoaded(false);
        setError(err instanceof Error ? err.message : "Paciente não encontrada ou sem permissão para visualização.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [patientId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const payload = applyBillingModalityChange(form, form.billingModality);
    const validation = validatePatientCreateInput(payload);
    if (validation) {
      setError(validation);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await updatePatient(supabase, patientId, payload);
      router.replace(`${detailHref}?atualizado=1`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o cadastro da paciente. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">Editar cadastro</h1>
      <p className="page-sub mt-2">Alteração administrativa do cadastro. A fotografia permanece no detalhe da paciente.</p>

      <StatusMessage error={error} />

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando cadastro…</p> : null}

      {!loading && loaded ? (
        <form
          className="card mt-6 max-w-xl space-y-8"
          onSubmit={(event) => void handleSubmit(event)}
          aria-busy={busy}
        >
          <PatientMpiFields form={form} setForm={setForm} busy={busy} idPrefix="edit-patient" />

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={buttonClass} disabled={busy} aria-disabled={busy}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy}
              onClick={() => router.push(detailHref)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {!loading && !loaded ? (
        <div className="mt-6">
          <button type="button" className={ghostButtonClass} onClick={() => router.push("/app/patients")}>
            Voltar para pacientes
          </button>
        </div>
      ) : null}
    </div>
  );
}
