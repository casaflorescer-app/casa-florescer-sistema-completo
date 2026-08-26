"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createOrganization,
  listOrganizations,
  updateOrganization,
  type OrganizationInput,
} from "@/lib/platform/organizations";
import type { OrganizationRecord } from "@/lib/platform/types";
import { formatCnpj, formatDateTime } from "@/lib/platform/format";
import {
  PlatformBanner,
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";

const emptyForm: OrganizationInput = { legalName: "", tradeName: "", cnpj: "" };

export function OrganizationsPanel() {
  const [rows, setRows] = useState<OrganizationRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<OrganizationInput>(emptyForm);
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    setError(null);
    const data = await listOrganizations(supabase);
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as organizações.");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      [item.legalName, item.tradeName, item.cnpj, formatCnpj(item.cnpj)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const selected = rows.find((item) => item.id === selectedId) ?? null;

  function startCreate() {
    setMode("create");
    setSelectedId(null);
    setForm(emptyForm);
    setNotice(null);
  }

  function startEdit(item: OrganizationRecord) {
    setMode("edit");
    setSelectedId(item.id);
    setForm({
      legalName: item.legalName,
      tradeName: item.tradeName,
      cnpj: formatCnpj(item.cnpj),
    });
    setNotice(null);
  }

  async function save() {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await createOrganization(supabase, form);
        setRows((current) =>
          [...current, created].sort((a, b) => a.tradeName.localeCompare(b.tradeName, "pt-BR")),
        );
        setSelectedId(created.id);
        setMode("idle");
        setNotice("Organização criada.");
      } else if (mode === "edit" && selectedId) {
        const updated = await updateOrganization(supabase, selectedId, form);
        setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMode("idle");
        setNotice("Dados cadastrais atualizados.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gravar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PlatformBanner
        title="Organizações"
        description="Cadastro técnico das organizações da plataforma. Não há exclusão física nesta fase."
      />
      <StatusMessage error={error} notice={notice} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className={`${fieldClass} max-w-sm`}
          placeholder="Pesquisar por nome ou CNPJ"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className={buttonClass} onClick={startCreate}>
          Nova organização
        </button>
      </div>

      {loading ? <p className="text-sm text-lotus-600">Carregando organizações…</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
            <tr>
              <th className="px-4 py-3">Nome fantasia</th>
              <th className="px-4 py-3">Razão social</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-lotus-50 hover:bg-lotus-50 ${
                  selectedId === item.id ? "bg-lotus-50" : ""
                }`}
                onClick={() => {
                  setSelectedId(item.id);
                  setMode("idle");
                }}
              >
                <td className="px-4 py-3 font-medium text-lotus-900">{item.tradeName}</td>
                <td className="px-4 py-3 text-lotus-700">{item.legalName}</td>
                <td className="px-4 py-3">{formatCnpj(item.cnpj)}</td>
                <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-lotus-600" colSpan={4}>
                  Nenhuma organização encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected && mode === "idle" ? (
        <section className="card mt-4 space-y-2 text-sm text-lotus-800">
          <h2 className="font-semibold text-lotus-900">Detalhes</h2>
          <p>ID: {selected.id}</p>
          <p>Razão social: {selected.legalName}</p>
          <p>Nome fantasia: {selected.tradeName}</p>
          <p>CNPJ: {formatCnpj(selected.cnpj)}</p>
          <p>Criada em: {formatDateTime(selected.createdAt)}</p>
          <button type="button" className={`${ghostButtonClass} mt-2`} onClick={() => startEdit(selected)}>
            Editar dados cadastrais
          </button>
        </section>
      ) : null}

      {mode !== "idle" ? (
        <form
          className="card mt-4 max-w-xl space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-semibold text-lotus-900">
            {mode === "create" ? "Nova organização" : "Editar organização"}
          </h2>
          <label className="block text-sm">
            Razão social
            <input
              className={fieldClass}
              required
              value={form.legalName}
              onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
            />
          </label>
          <label className="block text-sm">
            Nome fantasia
            <input
              className={fieldClass}
              required
              value={form.tradeName}
              onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))}
            />
          </label>
          <label className="block text-sm">
            CNPJ
            <input
              className={fieldClass}
              required
              inputMode="numeric"
              value={form.cnpj}
              onChange={(event) => setForm((current) => ({ ...current, cnpj: event.target.value }))}
            />
            <span className="mt-1 block text-xs text-lotus-600">
              A interface aceita pontuação; o banco guarda apenas os 14 dígitos.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass} disabled={busy}>
              Salvar
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => setMode("idle")}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
