"use client";

import { useEffect, useMemo, useState } from "react";
import { APP_MODULES, type ModuleId } from "@/lib/permissions";
import { UI_ROLE_LABEL, type UiRole } from "@/lib/types/domain";

export type Collaborator = {
  userId: string;
  fullName: string;
  email: string;
  uiRole: UiRole;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter((part) => !["Dra.", "Dr."].includes(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function UserManagement({
  users,
  initialAcl,
}: {
  users: Collaborator[];
  initialAcl: Record<string, ModuleId[]>;
}) {
  const [query, setQuery] = useState("");
  const [acl, setAcl] = useState(initialAcl);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModuleId[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = users.find((user) => user.userId === openId) ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.fullName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        UI_ROLE_LABEL[user.uiRole].toLowerCase().includes(q),
    );
  }, [query, users]);

  function open(user: Collaborator) {
    setOpenId(user.userId);
    setDraft([...(acl[user.userId] ?? [])]);
    setNotice("");
  }

  function close() {
    setOpenId(null);
  }

  function toggle(moduleId: ModuleId) {
    setDraft((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    const next = { ...acl, [selected.userId]: draft };
    const res = await fetch("/api/preview-acl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acl: next }),
    });
    setSaving(false);
    if (!res.ok) return;
    setAcl(next);
    setNotice(`Módulos de ${selected.fullName} atualizados.`);
    close();
  }

  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  return (
    <div>
      <h1 className="page-title">Gerenciamento de usuários</h1>
      <p className="page-sub">
        Toque na colaboradora para definir os módulos da barra lateral. A
        secretária começa com Agenda, Cadastro de Paciente e Exames.
      </p>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar nome, e-mail ou função"
        className="mt-5 w-full max-w-md rounded-2xl border border-lotus-200 bg-white px-4 py-3 text-sm outline-none focus:border-lotus-500"
      />

      {notice ? <p className="mt-3 text-sm text-lotus-700">{notice}</p> : null}

      <ul className="mt-5 divide-y divide-lotus-100 overflow-hidden rounded-2xl border border-lotus-100 bg-white">
        {visible.map((user) => {
          const count = (acl[user.userId] ?? []).length;
          return (
            <li key={user.userId}>
              <button
                type="button"
                onClick={() => open(user)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-lotus-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lotus-100 text-sm font-semibold text-lotus-800">
                  {initials(user.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-lotus-900">
                    {user.fullName}
                  </span>
                  <span className="block truncate text-sm text-lotus-600">
                    {UI_ROLE_LABEL[user.uiRole]} · {user.email}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-lotus-500">
                  {count} {count === 1 ? "módulo" : "módulos"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-lotus-900/40 p-4 sm:items-center"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-perm-title"
            className="view-enter w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
              Permissões de acesso
            </p>
            <h2 id="user-perm-title" className="mt-1 text-xl font-semibold text-lotus-900">
              {selected.fullName}
            </h2>
            <p className="text-sm text-lotus-600">
              {UI_ROLE_LABEL[selected.uiRole]} — marque o que aparece na sidebar.
            </p>
            <ul className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
              {APP_MODULES.map((mod) => {
                const checked = draft.includes(mod.id);
                return (
                  <li key={mod.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-lotus-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggle(mod.id)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-lotus-900">
                          {mod.label}
                        </span>
                        <span className="block text-xs text-lotus-600">
                          {mod.description}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-lotus-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-2xl bg-lotus-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar módulos"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
