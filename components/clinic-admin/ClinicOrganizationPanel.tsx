"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatCnpj, formatDateTime, mapDbError } from "@/lib/platform/format";
import { fieldClass } from "@/components/platform/Ui";

type OrgRow = {
  id: string;
  legal_name: string;
  trade_name: string;
  cnpj: string;
  created_at: string;
};

export function ClinicOrganizationPanel() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId;
  const [row, setRow] = useState<OrgRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      return;
    }
    void supabase
      .from("organizations")
      .select("id, legal_name, trade_name, cnpj, created_at")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(mapDbError(queryError));
          return;
        }
        setRow((data as OrgRow | null) ?? null);
      });
  }, [orgId]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Organização</h1>
      <p className="page-sub mt-2">
        Dados cadastrais da organização vinculada ao profile. A alteração de CNPJ e razão social
        é feita na Administração da plataforma.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      <section className="card mt-6 max-w-xl space-y-3 text-sm text-lotus-800">
        <label className="block">
          Razão social
          <input className={fieldClass} readOnly value={row?.legal_name ?? ""} />
        </label>
        <label className="block">
          Nome fantasia
          <input className={fieldClass} readOnly value={row?.trade_name ?? ""} />
        </label>
        <label className="block">
          CNPJ
          <input className={fieldClass} readOnly value={row ? formatCnpj(row.cnpj) : ""} />
        </label>
        <p>Criada em: {row ? formatDateTime(row.created_at) : "—"}</p>
      </section>
    </div>
  );
}
