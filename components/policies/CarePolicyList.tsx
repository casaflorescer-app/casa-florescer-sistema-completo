"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatPolicyVigencia,
  listCurrentCarePolicies,
  type CarePolicyVersionRow,
} from "@/lib/policies/directory";
import { formatCentsBRL } from "@/lib/policies/money";
import { useAuth } from "@/components/auth/AuthProvider";
import { canManageCarePolicies } from "@/lib/auth/access";
import { StatusMessage, buttonClass } from "@/components/platform/Ui";

export function CarePolicyList() {
  const { authorization } = useAuth();
  const canCreate = authorization ? canManageCarePolicies(authorization) : false;
  const [rows, setRows] = useState<CarePolicyVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    void listCurrentCarePolicies(client)
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar as políticas.");
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Gestão comercial
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Política de atendimento</h1>
          <p className="page-sub mt-2">
            Valores padrão e regras de pré-natal por profissional e prática. Cada alteração cria uma
            nova versão. A secretária comum, mesmo com permissão de consulta, não altera esta
            política.
          </p>
        </div>
        {canCreate ? (
          <Link href="/app/care-policies/new" className={buttonClass}>
            Nova política
          </Link>
        ) : null}
      </div>
      <StatusMessage error={error} />
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando…</p> : null}
      {!loading && rows.length === 0 && !error ? (
        <p className="mt-6 text-sm text-lotus-700">Nenhuma política vigente cadastrada.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
              <tr>
                <th className="px-4 py-3">Profissional</th>
                <th className="px-4 py-3">Prática</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Versão</th>
                <th className="px-4 py-3">Parto normal</th>
                <th className="px-4 py-3">Cesariana</th>
                <th className="px-4 py-3">Exige disponibilidade</th>
                <th className="px-4 py-3">Permite exceção</th>
                <th className="px-4 py-3">Vigência</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.policyId} className="border-b border-lotus-50">
                  <td className="px-4 py-3 font-medium text-lotus-900">
                    <Link className="hover:underline" href={`/app/care-policies/${row.policyId}`}>
                      {row.professionalName ?? "Profissional"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.practiceName ?? "—"}</td>
                  <td className="px-4 py-3">Vigente</td>
                  <td className="px-4 py-3">v{row.versionNumber}</td>
                  <td className="px-4 py-3">{formatCentsBRL(row.normalBirthCents)}</td>
                  <td className="px-4 py-3">{formatCentsBRL(row.cesareanCents)}</td>
                  <td className="px-4 py-3">{row.requiresAvailabilityForPrenatal ? "Sim" : "Não"}</td>
                  <td className="px-4 py-3">{row.allowsPrenatalException ? "Sim" : "Não"}</td>
                  <td className="px-4 py-3">{formatPolicyVigencia(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
