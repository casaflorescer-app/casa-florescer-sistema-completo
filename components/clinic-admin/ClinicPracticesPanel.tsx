"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusMessage, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryCreateButton } from "@/components/ui/PrimaryCreateButton";
import { CreateFormShell } from "@/components/ui/CreateFormShell";
import { FormActions } from "@/components/ui/FormActions";

type PracticeView = {
  id: string;
  organizationId: string;
  kind: string;
  code: string;
  name: string;
  specialty: string;
  isolationLabel: string;
  isActive: boolean;
  createdAt: string | null;
};

type FormState = {
  name: string;
  code: string;
  specialty: string;
  isolationLabel: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  specialty: "ginecologia",
  isolationLabel: "",
  isActive: true,
};

function suggestCode(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function suggestIsolation(code: string) {
  const slug = code.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `prontuario-${slug}` : "";
}

export function ClinicPracticesPanel() {
  const [practices, setPractices] = useState<PracticeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [isolationTouched, setIsolationTouched] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch("/api/admin/practices");
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      practices?: PracticeView[];
    };
    if (!response.ok) {
      throw new Error(payload.error || "Não foi possível carregar as práticas.");
    }
    setPractices(payload.practices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as práticas.");
      setLoading(false);
    });
  }, [reload]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCodeTouched(false);
    setIsolationTouched(false);
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function startEdit(item: PracticeView) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      code: item.code,
      specialty: item.specialty,
      isolationLabel: item.isolationLabel,
      isActive: item.isActive,
    });
    setCodeTouched(true);
    setIsolationTouched(true);
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (busy) return;
    const name = form.name.trim();
    const code = form.code.trim();
    if (!name || !code) {
      setError("Preencha nome e código.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        const response = await fetch(`/api/admin/practices/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            specialty: form.specialty.trim() || "ginecologia",
            isolationLabel:
              form.isolationLabel.trim() || suggestIsolation(code) || "prontuario-casa",
            isActive: form.isActive,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar.");
        setNotice("Prática atualizada.");
      } else {
        const response = await fetch("/api/admin/practices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code,
            specialty: form.specialty.trim() || "ginecologia",
            isolationLabel: form.isolationLabel.trim() || undefined,
            isActive: form.isActive,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          linkedOwner?: boolean;
        };
        if (!response.ok) throw new Error(payload.error || "Não foi possível criar.");
        setNotice(
          payload.linkedOwner
            ? "Prática criada e você foi vinculada como proprietária."
            : "Prática criada. Vincule usuárias em Administração → Usuários.",
        );
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar a prática.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: PracticeView) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/practices/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o status.");
      setNotice(item.isActive ? "Prática desativada." : "Prática ativada.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administração da clínica"
        title="Práticas"
        description="Cada médica da casa usa a própria prática house; depois vincule papéis em Usuários. Locatárias ficam fora desta tela."
        actions={<PrimaryCreateButton label="Nova prática" onClick={startCreate} />}
      />
      <StatusMessage error={error} notice={notice} />

      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando…</p> : null}
      {!loading && practices.length === 0 ? (
        <p className="card mt-4 text-sm text-lotus-700">
          Nenhuma prática house cadastrada. Crie a primeira para liberar o cadastro de usuários.
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Especialidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {practices.map((item) => (
              <tr key={item.id} className="border-b border-lotus-50">
                <td className="px-4 py-3 font-medium text-lotus-900">{item.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                <td className="px-4 py-3">{item.specialty}</td>
                <td className="px-4 py-3">{item.isActive ? "ativa" : "inativa"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() => startEdit(item)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={busy}
                      onClick={() => void toggleActive(item)}
                    >
                      {item.isActive ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateFormShell
        open={formOpen}
        title={editingId ? "Editar prática" : "Nova prática"}
        description="Prática house da organização. O código não muda depois de criado."
        size="md"
        busy={busy}
        onClose={closeForm}
        formId="clinic-practice-form"
      >
        <label className="block text-sm">
          Nome
          <input
            className={fieldClass}
            value={form.name}
            onChange={(event) => {
              const name = event.target.value;
              setForm((current) => {
                const nextCode = codeTouched ? current.code : suggestCode(name);
                return {
                  ...current,
                  name,
                  code: nextCode,
                  isolationLabel: isolationTouched
                    ? current.isolationLabel
                    : suggestIsolation(nextCode),
                };
              });
            }}
            required
          />
        </label>
        <label className="mt-3 block text-sm">
          Código
          <input
            className={fieldClass}
            value={form.code}
            disabled={Boolean(editingId)}
            onChange={(event) => {
              setCodeTouched(true);
              const code = event.target.value.toUpperCase();
              setForm((current) => ({
                ...current,
                code,
                isolationLabel: isolationTouched
                  ? current.isolationLabel
                  : suggestIsolation(code),
              }));
            }}
            required
          />
        </label>
        <label className="mt-3 block text-sm">
          Especialidade
          <input
            className={fieldClass}
            value={form.specialty}
            onChange={(event) =>
              setForm((current) => ({ ...current, specialty: event.target.value }))
            }
            placeholder="ginecologia"
          />
        </label>
        <label className="mt-3 block text-sm">
          Rótulo de isolamento
          <input
            className={fieldClass}
            value={form.isolationLabel}
            onChange={(event) => {
              setIsolationTouched(true);
              setForm((current) => ({ ...current, isolationLabel: event.target.value }));
            }}
            placeholder="prontuario-samara"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
          />
          Prática ativa
        </label>
        <FormActions
          primaryLabel={editingId ? "Salvar" : "Criar prática"}
          primaryBusy={busy}
          busyLabel="Salvando…"
          primaryDisabled={!form.name.trim() || !form.code.trim()}
          onPrimary={() => void save()}
          onCancel={closeForm}
        />
      </CreateFormShell>
    </div>
  );
}
