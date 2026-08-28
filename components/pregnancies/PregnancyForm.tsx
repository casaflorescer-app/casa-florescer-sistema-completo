"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { formatGestationalAge, formatIsoDateBr } from "@/lib/patients/format";
import {
  calculatedEddPreview,
  createPregnancy,
  emptyPregnancyForm,
  getPregnancy,
  listProfessionalLabels,
  pregnancyToForm,
  suggestPregnancyNumber,
  updatePregnancy,
  validatePregnancyForm,
  type PregnancyFormInput,
  type ProfessionalLabel,
} from "@/lib/pregnancies/directory";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

const labelClass = "text-sm font-medium text-lotus-800";

type PracticeOption = {
  id: string;
  name: string;
};

function writablePractices(
  memberships: Array<{
    practiceId: string;
    role: string;
    practice: { name: string } | null;
  }>,
): PracticeOption[] {
  const allowed = new Set(["owner", "admin", "secretary", "physician"]);
  const map = new Map<string, string>();
  for (const item of memberships) {
    if (!allowed.has(item.role)) continue;
    map.set(item.practiceId, item.practice?.name ?? "Prática");
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export function PregnancyForm({
  patientId,
  pregnancyId,
}: {
  patientId: string;
  pregnancyId?: string;
}) {
  const router = useRouter();
  const { authorization, authorizationLoading } = useAuth();
  const organizationId = authorization?.profile?.organizationId ?? "";
  const practices = useMemo(
    () => writablePractices(authorization?.memberships ?? []),
    [authorization?.memberships],
  );

  const [form, setForm] = useState<PregnancyFormInput>(emptyPregnancyForm());
  const [professionals, setProfessionals] = useState<ProfessionalLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(pregnancyId);
  const detailHref = pregnancyId
    ? `/app/patients/${patientId}/pregnancies/${pregnancyId}`
    : `/app/patients/${patientId}`;

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    setLoading(true);

    async function load(db: NonNullable<ReturnType<typeof createClient>>) {
      const labels = await listProfessionalLabels(db);
      setProfessionals(labels);

      if (pregnancyId) {
        const row = await getPregnancy(db, pregnancyId);
        if (!row || row.patientId !== patientId) {
          setLoadFailed(true);
          setError("Gestação não encontrada ou sem permissão para visualização.");
          return;
        }
        if (row.status !== "in_care") {
          setLoadFailed(true);
          setError("Gestação encerrada não pode ser editada.");
          return;
        }
        setForm(pregnancyToForm(row));
        return;
      }

      const suggested = await suggestPregnancyNumber(db, patientId);
      const defaultPractice = practices[0]?.id ?? "";
      const defaultPrimary =
        labels.find((item) => item.practiceId === defaultPractice)?.id ??
        authorization?.memberships.find((item) => item.professional)?.professional?.id ??
        "";
      setForm(
        emptyPregnancyForm({
          practiceId: defaultPractice,
          primaryProfessionalId: defaultPrimary,
          pregnancyNumber: String(suggested),
        }),
      );
    }

    void load(client)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar o formulário.");
      })
      .finally(() => setLoading(false));
  }, [authorization?.memberships, patientId, practices, pregnancyId]);

  const principals = professionals.filter((item) => item.practiceId === form.practiceId);
  const backups = professionals.filter((item) => item.id !== form.primaryProfessionalId);
  const calculatedEdd = calculatedEddPreview(form.lmpDate);
  const gestationalAge = form.lmpDate ? formatGestationalAge(form.lmpDate) : "—";

  function patch(partial: Partial<PregnancyFormInput>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function handlePracticeChange(practiceId: string) {
    const principalStillValid = professionals.some(
      (item) => item.id === form.primaryProfessionalId && item.practiceId === practiceId,
    );
    const nextPrincipal =
      (principalStillValid
        ? form.primaryProfessionalId
        : professionals.find((item) => item.practiceId === practiceId)?.id) ?? "";
    patch({
      practiceId,
      primaryProfessionalId: nextPrincipal,
      backupProfessionalId: form.backupProfessionalId === nextPrincipal ? "" : form.backupProfessionalId,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validation = validatePregnancyForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    if (!organizationId) {
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
      const context = { patientId, organizationId };
      if (pregnancyId) {
        await updatePregnancy(supabase, pregnancyId, form, context);
        router.push(`${detailHref}?atualizado=1`);
      } else {
        const created = await createPregnancy(supabase, form, context);
        router.push(`/app/patients/${patientId}/pregnancies/${created.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a gestação.");
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">{isEdit ? "Editar gestação" : "Nova gestação"}</h1>
      <p className="page-sub mt-2">
        Dados obstétricos são opcionais. A DPP calculada não é apagada se houver ajuste manual.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={detailHref} className={`${ghostButtonClass} inline-flex items-center`}>
          Voltar
        </Link>
      </div>

      <StatusMessage error={error} />

      {authorizationLoading || loading ? (
        <p className="mt-6 text-sm text-lotus-600">Carregando…</p>
      ) : loadFailed ? null : (
        <form className="mt-6 grid max-w-xl gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <section className="card space-y-4" aria-labelledby="pregnancy-responsibility-title">
            <h2 id="pregnancy-responsibility-title" className="font-semibold text-lotus-900">
              Responsabilidade
            </h2>
            <div>
              <label htmlFor="pregnancy-practice" className={labelClass}>
                Prática
              </label>
              <select
                id="pregnancy-practice"
                className={fieldClass}
                value={form.practiceId}
                onChange={(event) => handlePracticeChange(event.target.value)}
                disabled={busy}
                required
              >
                <option value="">Selecione</option>
                {practices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pregnancy-primary" className={labelClass}>
                Médica principal
              </label>
              <select
                id="pregnancy-primary"
                className={fieldClass}
                value={form.primaryProfessionalId}
                onChange={(event) =>
                  patch({
                    primaryProfessionalId: event.target.value,
                    backupProfessionalId:
                      event.target.value === form.backupProfessionalId ? "" : form.backupProfessionalId,
                  })
                }
                disabled={busy || !form.practiceId}
                required
              >
                <option value="">Selecione</option>
                {principals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pregnancy-backup" className={labelClass}>
                Médica de retaguarda
              </label>
              <select
                id="pregnancy-backup"
                className={fieldClass}
                value={form.backupProfessionalId}
                onChange={(event) => patch({ backupProfessionalId: event.target.value })}
                disabled={busy}
              >
                <option value="">Não definida</option>
                {backups.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-lotus-500">
                Indicada para imprevistos. Não assume o acompanhamento e não recebe acesso automático.
                A médica principal autoriza o compartilhamento na tela da gestação.
              </p>
            </div>
          </section>

          <section className="card space-y-4" aria-labelledby="pregnancy-obstetric-title">
            <h2 id="pregnancy-obstetric-title" className="font-semibold text-lotus-900">
              Dados obstétricos
            </h2>
            <p className="text-sm text-lotus-600">Todos os campos abaixo são opcionais.</p>
            <div>
              <label htmlFor="pregnancy-number" className={labelClass}>
                Número da gestação
              </label>
              <input
                id="pregnancy-number"
                className={fieldClass}
                inputMode="numeric"
                value={form.pregnancyNumber}
                onChange={(event) => patch({ pregnancyNumber: event.target.value })}
                disabled={busy}
                placeholder="Ex.: 3"
              />
              <p className="mt-1 text-xs text-lotus-500">
                Sugestão com base nos registros do sistema. Corrija se a paciente já teve gestações anteriores.
              </p>
            </div>
            <div>
              <label htmlFor="pregnancy-lmp" className={labelClass}>
                DUM
              </label>
              <input
                id="pregnancy-lmp"
                type="date"
                className={fieldClass}
                value={form.lmpDate}
                onChange={(event) => patch({ lmpDate: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="rounded-xl border border-lotus-100 bg-lotus-50/60 px-3 py-3 text-sm text-lotus-800">
              <p className="text-xs uppercase tracking-wide text-lotus-500">DPP calculada</p>
              <p className="mt-1 font-medium">
                {calculatedEdd ? formatIsoDateBr(calculatedEdd) : "Informe a DUM para calcular (Naegele)."}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wide text-lotus-500">Idade gestacional</p>
              <p className="mt-1">{gestationalAge}</p>
            </div>
            <div>
              <label htmlFor="pregnancy-clinical-edd" className={labelClass}>
                DPP ajustada / informada
              </label>
              <input
                id="pregnancy-clinical-edd"
                type="date"
                className={fieldClass}
                value={form.clinicalEdd}
                onChange={(event) => patch({ clinicalEdd: event.target.value })}
                disabled={busy}
              />
              {calculatedEdd ? (
                <button
                  type="button"
                  className="mt-2 text-sm text-lotus-700 underline"
                  disabled={busy}
                  onClick={() => patch({ clinicalEdd: calculatedEdd })}
                >
                  Usar DPP calculada
                </button>
              ) : null}
            </div>
            <div>
              <label htmlFor="pregnancy-risk" className={labelClass}>
                Classificação de risco
              </label>
              <select
                id="pregnancy-risk"
                className={fieldClass}
                value={form.risk}
                onChange={(event) => patch({ risk: event.target.value as PregnancyFormInput["risk"] })}
                disabled={busy}
              >
                <option value="">Não definido</option>
                <option value="habitual">Risco habitual</option>
                <option value="high">Alto risco</option>
              </select>
            </div>
            <div>
              <label htmlFor="pregnancy-started" className={labelClass}>
                Início do acompanhamento
              </label>
              <input
                id="pregnancy-started"
                type="date"
                className={fieldClass}
                value={form.careStartedOn}
                onChange={(event) => patch({ careStartedOn: event.target.value })}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-lotus-500">
                Sugerida a data de hoje. Pode ser diferente da data de cadastro.
              </p>
            </div>
            <div>
              <label htmlFor="pregnancy-notes" className={labelClass}>
                Observações administrativas
              </label>
              <textarea
                id="pregnancy-notes"
                className={fieldClass}
                rows={3}
                value={form.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-lotus-500">
                Contexto operacional da gestação. Não use como prontuário clínico.
              </p>
            </div>
            {isEdit ? (
              <div>
                <label htmlFor="pregnancy-change-reason" className={labelClass}>
                  Motivo da alteração (se houver troca de responsável ou prática)
                </label>
                <input
                  id="pregnancy-change-reason"
                  className={fieldClass}
                  value={form.changeReason}
                  onChange={(event) => patch({ changeReason: event.target.value })}
                  disabled={busy}
                />
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className={buttonClass} disabled={busy}>
              {busy ? "Salvando…" : "Salvar gestação"}
            </button>
            <Link href={detailHref} className={`${ghostButtonClass} inline-flex items-center`}>
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
