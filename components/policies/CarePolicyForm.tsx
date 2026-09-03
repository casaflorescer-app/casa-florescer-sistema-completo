"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { listProfessionalLabels, type ProfessionalLabel } from "@/lib/pregnancies/directory";
import {
  emptyCarePolicyForm,
  publishCarePolicyVersion,
  selectableProfessionals,
  versionToForm,
  type CarePolicyFormInput,
  type CarePolicyVersionRow,
} from "@/lib/policies/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

const labelClass = "text-sm font-medium text-lotus-800";

export function CarePolicyForm({
  current,
  lockIdentity = false,
}: {
  current?: CarePolicyVersionRow | null;
  lockIdentity?: boolean;
}) {
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const [form, setForm] = useState<CarePolicyFormInput>(
    current ? versionToForm(current) : emptyCarePolicyForm(),
  );
  const [professionals, setProfessionals] = useState<ProfessionalLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isNewVersion = Boolean(current);

  useEffect(() => {
    if (current) setForm(versionToForm(current));
  }, [current]);

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    void listProfessionalLabels(client)
      .then((labels) => {
        setProfessionals(labels);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar as profissionais.");
        setLoading(false);
      });
  }, []);

  const options = useMemo(() => {
    if (!authorization) return [];
    return selectableProfessionals(authorization, professionals);
  }, [authorization, professionals]);

  useEffect(() => {
    if (current || form.professionalId) return;
    if (options.length === 1) {
      const only = options[0];
      setForm((currentForm) => ({
        ...currentForm,
        professionalId: only.id,
        practiceId: only.practiceId,
      }));
    }
  }, [options, current, form.professionalId]);

  function setProfessional(professionalId: string) {
    const selected = options.find((item) => item.id === professionalId);
    setForm((currentForm) => ({
      ...currentForm,
      professionalId,
      practiceId: selected?.practiceId ?? "",
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const client = createClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await publishCarePolicyVersion(client, {
        ...form,
        allowsPrenatalException:
          form.requiresAvailabilityForPrenatal === "yes" ? form.allowsPrenatalException : "no",
      });
      if (current) {
        router.push(`/app/care-policies/${current.policyId}?atualizado=1`);
        router.refresh();
        return;
      }
      router.push("/app/care-policies");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível publicar a política.");
      setBusy(false);
    }
  }

  if (authorizationLoading || loading) {
    return <p className="text-sm text-lotus-600">Carregando…</p>;
  }

  if (options.length === 0 && !current) {
    return (
      <p className="text-sm text-lotus-700">
        Não há profissional que você possa configurar nesta prática.
      </p>
    );
  }

  const identityLocked = lockIdentity || isNewVersion;
  const exceptionDisabled = form.requiresAvailabilityForPrenatal !== "yes";
  const selected = options.find((item) => item.id === form.professionalId);
  const practiceName =
    current?.practiceName ||
    authorization?.memberships.find((item) => item.practiceId === form.practiceId)?.practice?.name ||
    (selected ? "Prática vinculada ao profissional" : "");

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-4">
      <StatusMessage error={error} />
      {isNewVersion ? (
        <p className="rounded-xl border border-lotus-100 bg-white px-4 py-3 text-sm text-lotus-800">
          A versão vigente será encerrada e uma nova versão será criada. O histórico não é alterado.
        </p>
      ) : null}
      <label className="block">
        <span className={labelClass}>Profissional</span>
        <select
          className={fieldClass}
          value={form.professionalId}
          disabled={identityLocked}
          onChange={(event) => setProfessional(event.target.value)}
          required
        >
          <option value="">Selecione</option>
          {(identityLocked && current
            ? [
                {
                  id: current.professionalId,
                  fullName: current.professionalName ?? "Profissional",
                  practiceId: current.practiceId,
                },
              ]
            : options
          ).map((item) => (
            <option key={item.id} value={item.id}>
              {item.fullName}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Prática</span>
        <input className={fieldClass} value={practiceName} readOnly />
        <span className="mt-1 block text-xs text-lotus-600">
          Vinculada ao cadastro do profissional. Não é possível criar política em outra prática.
        </span>
      </label>
      <label className="block">
        <span className={labelClass}>Valor padrão parto normal (R$)</span>
        <input
          className={fieldClass}
          inputMode="decimal"
          placeholder="8.000,00"
          value={form.normalBirthReais}
          onChange={(event) => setForm((currentForm) => ({ ...currentForm, normalBirthReais: event.target.value }))}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Valor padrão cesariana (R$)</span>
        <input
          className={fieldClass}
          inputMode="decimal"
          placeholder="10.000,00"
          value={form.cesareanReais}
          onChange={(event) => setForm((currentForm) => ({ ...currentForm, cesareanReais: event.target.value }))}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Exige contratação de disponibilidade para parto para realizar pré-natal?</span>
        <select
          className={fieldClass}
          value={form.requiresAvailabilityForPrenatal}
          onChange={(event) =>
            setForm((currentForm) => ({
              ...currentForm,
              requiresAvailabilityForPrenatal: event.target.value as CarePolicyFormInput["requiresAvailabilityForPrenatal"],
              allowsPrenatalException:
                event.target.value === "yes" ? currentForm.allowsPrenatalException : "no",
            }))
          }
          required
        >
          <option value="">Selecione</option>
          <option value="yes">Sim</option>
          <option value="no">Não</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Permite exceção para pré-natal sem disponibilidade?</span>
        <select
          className={fieldClass}
          value={form.allowsPrenatalException}
          disabled={exceptionDisabled}
          onChange={(event) =>
            setForm((currentForm) => ({
              ...currentForm,
              allowsPrenatalException: event.target.value as CarePolicyFormInput["allowsPrenatalException"],
            }))
          }
          required
        >
          <option value="no">Não</option>
          <option value="yes">Sim</option>
        </select>
        {exceptionDisabled ? (
          <span className="mt-1 block text-xs text-lotus-600">
            A exceção só se aplica quando a disponibilidade é exigida. O registro da exceção individual
            será a Fase B2.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className={labelClass}>Início da vigência</span>
        <input
          className={fieldClass}
          type="date"
          value={form.effectiveFrom}
          onChange={(event) => setForm((currentForm) => ({ ...currentForm, effectiveFrom: event.target.value }))}
          required
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Publicando…" : isNewVersion ? "Publicar nova versão" : "Criar política"}
        </button>
        <Link href={current ? `/app/care-policies/${current.policyId}` : "/app/care-policies"} className={ghostButtonClass}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
