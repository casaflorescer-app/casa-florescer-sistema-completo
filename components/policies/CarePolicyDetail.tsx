"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { canManageProfessionalPolicy } from "@/lib/auth/access";
import {
  formatPolicyVigencia,
  getCarePolicyById,
  type CarePolicyVersionRow,
} from "@/lib/policies/directory";
import { formatCentsBRL } from "@/lib/policies/money";
import { CarePolicyForm } from "@/components/policies/CarePolicyForm";
import { StatusMessage, ghostButtonClass } from "@/components/platform/Ui";

function VersionCard({
  row,
  current,
}: {
  row: CarePolicyVersionRow;
  current: boolean;
}) {
  return (
    <article className="rounded-2xl border border-lotus-100 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-lotus-900">
          Política v{row.versionNumber}
          {current ? " — vigente" : ""}
        </h3>
        <p className="text-sm text-lotus-600">{formatPolicyVigencia(row)}</p>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-lotus-800 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-lotus-500">Parto normal</dt>
          <dd>{formatCentsBRL(row.normalBirthCents)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-lotus-500">Cesariana</dt>
          <dd>{formatCentsBRL(row.cesareanCents)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-lotus-500">Exige disponibilidade</dt>
          <dd>{row.requiresAvailabilityForPrenatal ? "Sim" : "Não"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-lotus-500">Permite exceção</dt>
          <dd>{row.allowsPrenatalException ? "Sim" : "Não"}</dd>
        </div>
      </dl>
      {!current ? (
        <p className="mt-3 text-xs text-lotus-600">Esta versão não pode ser alterada.</p>
      ) : null}
    </article>
  );
}

export function CarePolicyDetail({
  policyId,
  updated = false,
}: {
  policyId: string;
  updated?: boolean;
}) {
  const { authorization } = useAuth();
  const [current, setCurrent] = useState<CarePolicyVersionRow | null>(null);
  const [versions, setVersions] = useState<CarePolicyVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    void getCarePolicyById(client, policyId)
      .then(({ current: nextCurrent, versions: nextVersions }) => {
        setCurrent(nextCurrent);
        setVersions(nextVersions);
        if (!nextCurrent && nextVersions.length === 0) {
          setError("Política não encontrada ou sem permissão para visualização.");
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar a política.");
        setLoading(false);
      });
  }, [policyId]);

  const canEdit =
    Boolean(authorization && current) &&
    canManageProfessionalPolicy(authorization!, current!.practiceId, current!.professionalId);
  const history = versions.filter((item) => item.id !== current?.id);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Gestão comercial
      </p>
      <h1 className="page-title mt-1">
        {current?.professionalName ?? "Política de atendimento"}
      </h1>
      <p className="page-sub mt-2">
        {current?.practiceName ?? "Prática"} · versão vigente e histórico. Alterar cria uma nova
        versão.
      </p>
      <div className="mt-4">
        <Link href="/app/care-policies" className={ghostButtonClass}>
          Voltar à lista
        </Link>
      </div>
      <StatusMessage error={error} notice={updated ? "Nova versão publicada." : null} />
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando…</p> : null}
      {current ? (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-lotus-500">
            Versão vigente
          </h2>
          <VersionCard row={current} current />
        </section>
      ) : null}
      {history.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-lotus-500">
            Histórico de versões
          </h2>
          {history.map((row) => (
            <VersionCard key={row.id} row={row} current={false} />
          ))}
        </section>
      ) : null}
      {canEdit && current ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-lotus-500">
            Publicar nova versão
          </h2>
          <CarePolicyForm current={current} lockIdentity />
        </section>
      ) : null}
    </div>
  );
}
