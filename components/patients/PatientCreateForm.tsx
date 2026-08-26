"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { formatCpf, formatPhone } from "@/lib/patients/format";
import {
  createPatient,
  validatePatientCreateInput,
  type PatientCreateInput,
} from "@/lib/patients/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

const emptyForm: PatientCreateInput = {
  fullName: "",
  socialName: "",
  cpf: "",
  birthDate: "",
  phone: "",
  email: "",
};

export function PatientCreateForm() {
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const [form, setForm] = useState<PatientCreateInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const organizationId = authorization?.profile?.organizationId ?? "";
  const createdBy = authorization?.user.id ?? "";
  const sessionReady = Boolean(organizationId && createdBy);
  const today = new Date();
  const maxBirthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const validation = validatePatientCreateInput(form);
    if (validation) {
      setError(validation);
      return;
    }
    if (!sessionReady) {
      setError("Não foi possível identificar o vínculo da sessão atual.");
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
      const created = await createPatient(supabase, form, { organizationId, createdBy });
      router.replace(`/app/patients/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar a paciente. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Clínica
      </p>
      <h1 className="page-title mt-1">Nova paciente</h1>
      <p className="page-sub mt-2">Cadastro administrativo mínimo. Sem dados clínicos nesta etapa.</p>

      <StatusMessage
        error={
          error ??
          (!authorizationLoading && !sessionReady
            ? "Não foi possível identificar o vínculo da sessão atual."
            : null)
        }
      />

      {authorizationLoading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando sessão…</p>
      ) : (
        <form
          className="card mt-6 max-w-xl space-y-4"
          onSubmit={(event) => void handleSubmit(event)}
          aria-busy={busy}
        >
          <div>
            <label htmlFor="patient-full-name" className="text-sm font-medium text-lotus-800">
              Nome completo
            </label>
            <input
              id="patient-full-name"
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
            <label htmlFor="patient-social-name" className="text-sm font-medium text-lotus-800">
              Nome social
            </label>
            <input
              id="patient-social-name"
              className={fieldClass}
              value={form.socialName}
              onChange={(event) => setForm((current) => ({ ...current, socialName: event.target.value }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="patient-cpf" className="text-sm font-medium text-lotus-800">
              CPF
            </label>
            <input
              id="patient-cpf"
              className={fieldClass}
              inputMode="numeric"
              value={form.cpf}
              onChange={(event) => setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="patient-birth-date" className="text-sm font-medium text-lotus-800">
              Data de nascimento
            </label>
            <input
              id="patient-birth-date"
              type="date"
              className={fieldClass}
              value={form.birthDate}
              onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
              max={maxBirthDate}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="patient-phone" className="text-sm font-medium text-lotus-800">
              Telefone
            </label>
            <input
              id="patient-phone"
              className={fieldClass}
              inputMode="tel"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: formatPhone(event.target.value) }))}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="patient-email" className="text-sm font-medium text-lotus-800">
              E-mail
            </label>
            <input
              id="patient-email"
              type="email"
              className={fieldClass}
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              autoComplete="email"
              disabled={busy}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={buttonClass} disabled={busy || !sessionReady} aria-disabled={busy || !sessionReady}>
              {busy ? "Salvando…" : "Cadastrar paciente"}
            </button>
            <Link href="/app/patients" className={`${ghostButtonClass} inline-flex items-center`}>
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
