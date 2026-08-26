"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadPlatformStats } from "@/lib/platform/stats";
import type { PlatformStats } from "@/lib/platform/types";

function StatCard({
  title,
  value,
  href,
  note,
}: {
  title: string;
  value: number | null | undefined;
  href: string;
  note?: string;
}) {
  const display =
    value === undefined ? "…" : value === null ? "Indisponível" : String(value);
  return (
    <Link href={href} className="card block transition-colors hover:border-lotus-200">
      <h3 className="font-semibold text-lotus-900">{title}</h3>
      <p className="mt-2 text-2xl font-semibold text-lotus-900">{display}</p>
      {note ? <p className="mt-1 text-sm text-lotus-700">{note}</p> : null}
    </Link>
  );
}

export function PlatformStatsCards() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setStats({ organizations: null, users: null, systemAdmins: null, auditEvents: null });
      return;
    }
    void loadPlatformStats(supabase)
      .then(setStats)
      .catch(() => {
        setError("Não foi possível carregar os indicadores.");
        setStats({ organizations: null, users: null, systemAdmins: null, auditEvents: null });
      });
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
        Administração da plataforma
      </h2>
      {error ? <p className="text-sm text-rose-800">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          title="Organizações"
          value={stats?.organizations}
          href="/app/system/organizations"
        />
        <StatCard title="Usuários" value={stats?.users} href="/app/system/users" />
        <StatCard
          title="SYSTEM_ADMINs"
          value={stats?.systemAdmins}
          href="/app/system/users"
          note="Registros ativos (revoked_at nulo)."
        />
        <StatCard
          title="Eventos de auditoria"
          value={stats?.auditEvents}
          href="/app/system/audit"
        />
        <article className="card">
          <h3 className="font-semibold text-lotus-900">Status da plataforma</h3>
          <p className="mt-2 text-lg font-semibold text-lotus-900">
            {stats == null ? "…" : error ? "Indisponível" : "Operacional"}
          </p>
          <p className="mt-1 text-sm text-lotus-700">
            Indicador baseado na leitura autenticada das tabelas técnicas.
          </p>
        </article>
      </div>
    </section>
  );
}
