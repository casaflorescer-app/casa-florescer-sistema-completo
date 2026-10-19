"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { listClinicSpecialties, upsertClinicSpecialty } from "@/lib/clinic-mgmt/specialties";
import type { ClinicSpecialty } from "@/lib/clinic-mgmt/types";

export function SpecialtiesModule() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;
  const [rows, setRows] = useState<ClinicSpecialty[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClinicSpecialty | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listClinicSpecialties(orgId, { q }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar especialidades.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setNotice(null);
  }

  function startEdit(row: ClinicSpecialty) {
    setEditing(row);
    setName(row.name);
    setDescription(row.description ?? "");
    setIsActive(row.isActive);
    setNotice(null);
  }

  async function onSave() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await upsertClinicSpecialty({
        organizationId: orgId,
        id: editing?.id,
        name,
        description,
        isActive,
      });
      setNotice(editing ? "Especialidade atualizada." : "Especialidade cadastrada.");
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
      <h1 className="page-title mt-1">Especialidades</h1>
      <p className="page-sub mt-2">
        Catálogo administrativo de especialidades. Distinto de cargo/função de funcionários e do vínculo
        locatário–sala.
      </p>
      <StatusMessage error={error} notice={notice} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <input
              className={fieldClass}
              placeholder="Pesquisar especialidade"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Pesquisar especialidade"
            />
            <button type="button" className={ghostButtonClass} onClick={() => void reload()} disabled={loading}>
              Atualizar
            </button>
          </div>
          {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="card mt-4 text-sm text-lotus-700">Nenhuma especialidade cadastrada.</p>
          ) : null}
          <ul className="mt-4 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="card">
                  <p className="font-semibold text-lotus-900">{row.name}</p>
                  <p className="mt-1 text-sm text-lotus-600">
                    {row.isActive ? "Ativa" : "Inativa"} · {row.professionalCount ?? 0} profissional(is)
                  </p>
                  <button type="button" className={`${ghostButtonClass} mt-3`} onClick={() => startEdit(row)}>
                    Editar
                  </button>
                </article>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-lotus-100 bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Profissionais</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50">
                    <td className="px-4 py-3 font-medium text-lotus-900">{row.name}</td>
                    <td className="px-4 py-3">{row.isActive ? "Ativa" : "Inativa"}</td>
                    <td className="px-4 py-3">{row.professionalCount ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className={ghostButtonClass} onClick={() => startEdit(row)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="card h-fit">
          <h2 className="text-base font-semibold text-lotus-900">
            {editing ? "Editar especialidade" : "Nova especialidade"}
          </h2>
          <label className="mt-4 block text-sm text-lotus-800">
            Nome
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm text-lotus-800">
            Descrição
            <textarea
              className={fieldClass}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-lotus-800">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Ativa
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy || !name.trim()} onClick={() => void onSave()}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {editing ? (
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
