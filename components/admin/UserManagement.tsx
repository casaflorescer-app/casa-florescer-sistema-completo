"use client";

import { useEffect, useMemo, useState } from "react";
import { APP_MODULES, MODULE_IDS, isMasterAdminRole, type ModuleId } from "@/lib/permissions";
import { UI_ROLE_LABEL, type UiRole } from "@/lib/types/domain";
import { readPreviewAclFromStorage, setPreviewAcl } from "@/lib/preview-api";
import { isStaticHosting } from "@/lib/hosting";
import {
  createDirectoryUser,
  defaultAclForDirectory,
  listDirectoryUsers,
  updateDirectoryUserRole,
  type DirectoryUser,
} from "@/lib/admin/directory";

const ROLE_OPTIONS: UiRole[] = ["manager", "physician", "secretary", "patient"];

function initials(name: string) {
  return name
    .split(" ")
    .filter((part) => !["Dra.", "Dr."].includes(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function UserManagement() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [query, setQuery] = useState("");
  const [acl, setAcl] = useState<Record<string, ModuleId[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModuleId[]>([]);
  const [draftRole, setDraftRole] = useState<UiRole>("secretary");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<UiRole>("secretary");
  const [createError, setCreateError] = useState("");

  function reload() {
    const directory = listDirectoryUsers();
    setUsers(directory);
    const stored = isStaticHosting() ? readPreviewAclFromStorage() : {};
    setAcl({ ...defaultAclForDirectory(), ...stored });
  }

  useEffect(() => {
    reload();
  }, []);

  const selected = users.find((user) => user.userId === openId) ?? null;
  const selectedIsAdmin = selected ? isMasterAdminRole(draftRole) : false;

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

  function open(user: DirectoryUser) {
    setOpenId(user.userId);
    setDraftRole(user.uiRole);
    setDraft(
      isMasterAdminRole(user.uiRole)
        ? [...MODULE_IDS]
        : [...(acl[user.userId] ?? [])],
    );
    setNotice("");
  }

  function close() {
    setOpenId(null);
  }

  function toggle(moduleId: ModuleId) {
    if (selectedIsAdmin) return;
    setDraft((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    updateDirectoryUserRole(selected.userId, draftRole);
    const modules = isMasterAdminRole(draftRole) ? [...MODULE_IDS] : draft;
    const next = { ...acl, [selected.userId]: modules };
    const res = await setPreviewAcl(next);
    setSaving(false);
    if (!res.ok) return;
    setAcl(next);
    setUsers(listDirectoryUsers());
    setNotice(`Acesso de ${selected.fullName} atualizado (${UI_ROLE_LABEL[draftRole]}).`);
    close();
  }

  function createUser(event: React.FormEvent) {
    event.preventDefault();
    setCreateError("");
    const created = createDirectoryUser({
      fullName: createName,
      email: createEmail,
      uiRole: createRole,
    });
    if ("error" in created) {
      setCreateError(created.error);
      return;
    }
    const modules = isMasterAdminRole(createRole)
      ? [...MODULE_IDS]
      : defaultAclForDirectory()[created.userId] ?? [];
    const next = { ...acl, [created.userId]: modules };
    void setPreviewAcl(next);
    setAcl(next);
    setUsers(listDirectoryUsers());
    setCreateName("");
    setCreateEmail("");
    setCreateRole("secretary");
    setNotice(`${created.fullName} criada. Senha inicial: florescer`);
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
      <h1 className="page-title">Gestão de usuários e permissões</h1>
      <p className="page-sub">
        O Admin Master vê todos os módulos. Aqui você cria acessos e define se a
        pessoa é admin, médica, secretaria ou paciente.
      </p>

      <form onSubmit={createUser} className="card mt-6 space-y-4">
        <p className="text-sm font-semibold text-lotus-900">Novo acesso</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-lotus-800">
            Nome
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-lotus-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="Nome completo"
            />
          </label>
          <label className="text-sm font-medium text-lotus-800">
            E-mail / login
            <input
              type="email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-lotus-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              placeholder="nome@florescer.clinica"
            />
          </label>
          <label className="text-sm font-medium text-lotus-800">
            Papel
            <select
              value={createRole}
              onChange={(event) => setCreateRole(event.target.value as UiRole)}
              className="mt-1.5 w-full rounded-xl border border-lotus-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {UI_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {createError ? <p className="text-sm text-rose-700">{createError}</p> : null}
        <button
          type="submit"
          className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
        >
          Criar usuário
        </button>
      </form>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar nome, e-mail ou função"
        className="mt-5 w-full max-w-md rounded-2xl border border-lotus-200 bg-white px-4 py-3 text-sm outline-none focus:border-lotus-500"
      />

      {notice ? <p className="mt-3 text-sm text-lotus-700">{notice}</p> : null}

      <ul className="mt-5 divide-y divide-lotus-100 overflow-hidden rounded-2xl border border-lotus-100 bg-white">
        {visible.map((user) => {
          const count = isMasterAdminRole(user.uiRole)
            ? MODULE_IDS.length
            : (acl[user.userId] ?? []).length;
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
                  {isMasterAdminRole(user.uiRole)
                    ? "Acesso total"
                    : `${count} ${count === 1 ? "módulo" : "módulos"}`}
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
              Papel e permissões
            </p>
            <h2 id="user-perm-title" className="mt-1 text-xl font-semibold text-lotus-900">
              {selected.fullName}
            </h2>
            <label className="mt-4 block text-sm font-medium text-lotus-800">
              Perfil no sistema
              <select
                value={draftRole}
                onChange={(event) => {
                  const role = event.target.value as UiRole;
                  setDraftRole(role);
                  if (isMasterAdminRole(role)) setDraft([...MODULE_IDS]);
                }}
                className="mt-1.5 w-full rounded-xl border border-lotus-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {UI_ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </label>
            {selectedIsAdmin ? (
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">
                Admin Master ignora a lista de módulos: Médico, Secretaria, Gestão e
                Paciente ficam visíveis.
              </p>
            ) : (
              <ul className="mt-4 max-h-[40vh] space-y-1 overflow-y-auto">
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
            )}
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
                className="rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar acesso"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
