"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCpf, formatPhone } from "@/lib/patients/format";
import {
  getPatient,
  updatePatient,
  validatePatientCreateInput,
  type PatientUpdateInput,
} from "@/lib/patients/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

const emptyForm: PatientUpdateInput = {
  fullName: "",
  socialName: "",
  cpf: "",
  birthDate: "",
  phone: "",
  email: "",
};

export function PatientEditForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<PatientUpdateInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const maxBirthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
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
        setForm({
          fullName: row.fullName,
          socialName: row.socialName ?? "",
          cpf: row.cpf ? formatCpf(row.cpf) : "",
          birthDate: row.birthDate ?? "",
          phone: row.phone ? formatPhone(row.phone) : "",
          email: row.email ?? "",
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

    const validation = validatePatientCreateInput(form);
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
      await updatePatient(supabase, patientId, form);
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
          className="card mt-6 max-w-xl space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
          aria-busy={busy}
        >
          <div>
            <label htmlFor="edit-patient-full-name" className="text-sm font-medium text-lotus-800">
              Nome completo
            </label>
            <input
              id="edit-patient-full-name"
              className={fieldClass}
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              autoComplete="name"
              required
              minLength={3}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="edit-patient-social-name" className="text-sm font-medium text-lotus-800">
              Nome social
            </label>
            <input
              id="edit-patient-social-name"
              className={fieldClass}
              value={form.socialName}
              onChange={(event) => setForm((current) => ({ ...current, socialName: event.target.value }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="edit-patient-cpf" className="text-sm font-medium text-lotus-800">
              CPF
            </label>
            <input
              id="edit-patient-cpf"
              className={fieldClass}
              inputMode="numeric"
              value={form.cpf}
              onChange={(event) => setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="edit-patient-birth-date" className="text-sm font-medium text-lotus-800">
              Data de nascimento
            </label>
            <input
              id="edit-patient-birth-date"
              type="date"
              className={fieldClass}
              value={form.birthDate}
              onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
              max={maxBirthDate}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="edit-patient-phone" className="text-sm font-medium text-lotus-800">
              Telefone
            </label>
            <input
              id="edit-patient-phone"
              className={fieldClass}
              inputMode="tel"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: formatPhone(event.target.value) }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="edit-patient-email" className="text-sm font-medium text-lotus-800">
              E-mail
            </label>
            <input
              id="edit-patient-email"
              type="email"
              className={fieldClass}
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              autoComplete="email"
              disabled={busy}
            />
          </div>

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
