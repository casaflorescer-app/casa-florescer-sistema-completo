"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import {
  ENGAGEMENT_LABEL,
  WORKFORCE_STATUS_LABEL,
  type ClinicWorkforceMember,
  type WorkforceEngagement,
  type WorkforceStatus,
} from "@/lib/clinic-mgmt/types";
import { listClinicWorkforce, upsertClinicWorkforce, workforceDashboard } from "@/lib/clinic-mgmt/workforce";

const EMPTY = {
  fullName: "",
  roleTitle: "",
  engagementKind: "employee" as WorkforceEngagement,
  status: "active" as WorkforceStatus,
  phone: "",
  email: "",
  documentCpf: "",
  notes: "",
};

export function WorkforceModule() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;
  const [rows, setRows] = useState<ClinicWorkforceMember[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const stats = useMemo(() => workforceDashboard(rows), [rows]);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listClinicWorkforce(orgId, { q }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar funcionários.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function startEdit(row: ClinicWorkforceMember) {
    setEditingId(row.id);
    setForm({
      fullName: row.fullName,
      roleTitle: row.roleTitle,
      engagementKind: row.engagementKind,
      status: row.status,
      phone: row.phone ?? "",
      email: row.email ?? "",
      documentCpf: row.documentCpf ?? "",
      notes: row.notes ?? "",
    });
  }

  async function onSave() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await upsertClinicWorkforce({
        organizationId: orgId,
        id: editingId ?? undefined,
        ...form,
      });
      setNotice(editingId ? "Cadastro atualizado." : "Cadastro criado.");
      startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Gestão Clínica</p>
      <h1 className="page-title mt-1">Funcionários e prestadores</h1>
      <p className="page-sub mt-2">
        Pessoas que trabalham ou prestam serviço à clínica. Médicos locatários permanecem em{" "}
        <strong>Profissionais</strong> + contrato de locação — não são funcionários.
      </p>
      <StatusMessage error={error} notice={notice} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Total", stats.total],
          ["Ativos", stats.active],
          ["Inativos", stats.inactive],
          ["Funcionários", stats.employees],
          ["Prestadores", stats.contractors],
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <p className="text-xs uppercase tracking-wide text-lotus-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-lotus-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="flex flex-wrap gap-2">
            <input
              className={fieldClass}
              placeholder="Pesquisar por nome"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Pesquisar funcionário"
            />
            <button type="button" className={ghostButtonClass} onClick={() => void reload()}>
              Atualizar
            </button>
          </div>
          {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="card mt-4 text-sm text-lotus-700">Nenhum funcionário/prestador cadastrado.</p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="card flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-lotus-900">{row.fullName}</p>
                    <p className="mt-1 text-sm text-lotus-700">
                      {row.roleTitle} · {ENGAGEMENT_LABEL[row.engagementKind]} ·{" "}
                      {WORKFORCE_STATUS_LABEL[row.status]}
                    </p>
                  </div>
                  <button type="button" className={ghostButtonClass} onClick={() => startEdit(row)}>
                    Editar
                  </button>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <aside className="card h-fit">
          <h2 className="text-base font-semibold text-lotus-900">
            {editingId ? "Editar cadastro" : "Novo cadastro"}
          </h2>
          <label className="mt-3 block text-sm">
            Nome
            <input
              className={fieldClass}
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </label>
          <label className="mt-3 block text-sm">
            Função
            <input
              className={fieldClass}
              value={form.roleTitle}
              onChange={(e) => setForm((f) => ({ ...f, roleTitle: e.target.value }))}
              placeholder="Ex.: Secretária, Copeira, Eletricista"
            />
          </label>
          <label className="mt-3 block text-sm">
            Tipo de vínculo
            <select
              className={fieldClass}
              value={form.engagementKind}
              onChange={(e) =>
                setForm((f) => ({ ...f, engagementKind: e.target.value as WorkforceEngagement }))
              }
            >
              <option value="employee">Funcionário</option>
              <option value="contractor">Prestador</option>
              <option value="other">Outro</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Situação
            <select
              className={fieldClass}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as WorkforceStatus }))}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Telefone
            <input
              className={fieldClass}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          <label className="mt-3 block text-sm">
            E-mail
            <input
              className={fieldClass}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </label>
          <label className="mt-3 block text-sm">
            Observações
            <textarea
              className={fieldClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !form.fullName.trim() || !form.roleTitle.trim()}
              onClick={() => void onSave()}
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {editingId ? (
              <button type="button" className={ghostButtonClass} onClick={startCreate}>
                Cancelar
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
