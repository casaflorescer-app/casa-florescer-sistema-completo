"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listAuditEvents, type AuditFilters } from "@/lib/platform/audit";
import { AUDIT_ACTIONS, type AuditEventRecord } from "@/lib/platform/types";
import { formatDateTime } from "@/lib/platform/format";
import {
  PlatformBanner,
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";

const emptyFilters: AuditFilters = {
  from: "",
  to: "",
  action: "",
  actorId: "",
  entity: "",
};

export function AuditPanel({ variant = "platform" }: { variant?: "platform" | "clinic" }) {
  const [rows, setRows] = useState<AuditEventRecord[]>([]);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload(next = filters) {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const data = await listAuditEvents(supabase, {
      from: next.from ? new Date(next.from).toISOString() : undefined,
      to: next.to ? new Date(next.to).toISOString() : undefined,
      action: next.action || undefined,
      actorId: next.actorId?.trim() || undefined,
      entity: next.entity || undefined,
    });
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a auditoria.");
      setLoading(false);
    });
    // carga inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = rows.find((item) => item.id === selectedId) ?? null;

  return (
    <div>
      <PlatformBanner
        area={variant === "clinic" ? "clinica" : "plataforma"}
        title={variant === "clinic" ? "Auditoria da clínica" : "Auditoria técnica"}
        description={
          variant === "clinic"
            ? "Leitura dos eventos visíveis à proprietária da casa. Sem edição ou exclusão."
            : "Somente leitura de public.audit_events. Eventos não podem ser editados nem excluídos."
        }
      />
      <StatusMessage error={error} />

      <form
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          void reload(filters).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Não foi possível filtrar.");
            setLoading(false);
          });
        }}
      >
        <label className="text-sm">
          De
          <input
            type="datetime-local"
            className={fieldClass}
            value={filters.from ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Até
          <input
            type="datetime-local"
            className={fieldClass}
            value={filters.to ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Ação
          <select
            className={fieldClass}
            value={filters.action ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                action: event.target.value as AuditFilters["action"],
              }))
            }
          >
            <option value="">Todas</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ator (uuid)
          <input
            className={fieldClass}
            value={filters.actorId ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, actorId: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Entidade
          <input
            className={fieldClass}
            value={filters.entity ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, entity: event.target.value }))}
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" className={buttonClass}>
            Filtrar
          </button>
          <button
            type="button"
            className={ghostButtonClass}
            onClick={() => {
              setFilters(emptyFilters);
              void reload(emptyFilters);
            }}
          >
            Limpar
          </button>
        </div>
      </form>

      <p className="mb-3 text-xs text-lotus-600">Mostrando até 200 eventos mais recentes do filtro.</p>
      {loading ? <p className="text-sm text-lotus-600">Carregando auditoria…</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ator</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Entidade</th>
              <th className="px-4 py-3">Objeto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-lotus-50 hover:bg-lotus-50 ${
                  selectedId === item.id ? "bg-lotus-50" : ""
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <td className="px-4 py-3">{formatDateTime(item.occurredAt)}</td>
                <td className="px-4 py-3">{item.actorName ?? "—"}</td>
                <td className="px-4 py-3">{item.action}</td>
                <td className="px-4 py-3">{item.entityTable}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.entityId ?? "—"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-lotus-600" colSpan={5}>
                  Nenhum evento encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <section className="card mt-4 space-y-2 text-sm text-lotus-800">
          <h2 className="font-semibold text-lotus-900">Detalhes</h2>
          <p>Ação: {selected.action}</p>
          <p>Entidade: {selected.entityTable}</p>
          <p>Objeto: {selected.entityId ?? "—"}</p>
          <pre className="overflow-x-auto rounded-xl bg-lotus-50 p-3 text-xs">
            {JSON.stringify(selected.metadata, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
