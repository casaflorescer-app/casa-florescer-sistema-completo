"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  grantSystemAdmin,
  listPlatformUsers,
  listSystemAdmins,
  revokeSystemAdmin,
  setProfileActive,
} from "@/lib/platform/users";
import { STAFF_ROLE_OPTIONS, type PlatformUser, type SystemAdminRecord } from "@/lib/platform/types";
import { formatDateTime } from "@/lib/platform/format";
import {
  PlatformBanner,
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";
import { UserAccessEditor } from "@/components/platform/UserAccessEditor";

export function UsersPanel() {
  const { authorization } = useAuth();
  const currentUserId = authorization?.user.id;
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [admins, setAdmins] = useState<SystemAdminRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
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
    const [nextUsers, nextAdmins] = await Promise.all([
      listPlatformUsers(supabase),
      listSystemAdmins(supabase),
    ]);
    setUsers(nextUsers);
    setAdmins(nextAdmins);
    setLoading(false);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((item) =>
      [item.fullName, item.email, item.organizationName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [users, query]);

  const selected = users.find((item) => item.id === selectedId) ?? null;
  const accessUser = users.find((item) => item.id === accessUserId) ?? null;
  const activeAdminCount = admins.filter((item) => item.status === "ativo").length;

  async function toggleActive(user: PlatformUser) {
    if (user.id === currentUserId) {
      setError("Não desative o próprio perfil por esta tela.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await setProfileActive(supabase, user.id, !user.isActive);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, isActive: !item.isActive } : item)),
      );
      setNotice(user.isActive ? "Perfil desativado." : "Perfil ativado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function grant(userId: string) {
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await grantSystemAdmin(supabase, userId, reason);
      setReason("");
      setNotice("SYSTEM_ADMIN concedido via RPC.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conceder SYSTEM_ADMIN.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string) {
    if (userId === currentUserId) {
      setError("Não revogue o próprio SYSTEM_ADMIN por esta tela.");
      return;
    }
    if (activeAdminCount <= 1) {
      setError("Não é possível revogar o último SYSTEM_ADMIN ativo.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await revokeSystemAdmin(supabase, userId, reason);
      setReason("");
      setNotice("SYSTEM_ADMIN revogado via RPC.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível revogar SYSTEM_ADMIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PlatformBanner
        title="Usuários da plataforma"
        description="Contas de profiles. Sem criação de Auth, sem senha e sem dados clínicos. SYSTEM_ADMIN só por RPC."
      />
      <StatusMessage error={error} notice={notice} />

      <input
        className={`${fieldClass} mb-4 max-w-sm`}
        placeholder="Pesquisar nome, e-mail ou organização"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {loading ? <p className="text-sm text-lotus-600">Carregando usuários…</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Organização</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">SYSTEM_ADMIN</th>
              <th className="px-4 py-3">Acesso</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.id}
                className={`cursor-pointer border-b border-lotus-50 hover:bg-lotus-50 ${
                  selectedId === item.id ? "bg-lotus-50" : ""
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <td className="px-4 py-3 font-medium text-lotus-900">{item.fullName}</td>
                <td className="px-4 py-3">{item.email}</td>
                <td className="px-4 py-3">{item.organizationName ?? "—"}</td>
                <td className="px-4 py-3">{item.isActive ? "ativo" : "inativo"}</td>
                <td className="px-4 py-3">{item.isSystemAdmin ? "Sim" : "Não"}</td>
                <td className="px-4 py-3">
                  {item.memberships.length === 0
                    ? "Sem prática vinculada"
                    : item.memberships
                        .map((membership) => {
                          const label =
                            STAFF_ROLE_OPTIONS.find((option) => option.value === membership.role)?.label ??
                            membership.role;
                          return `${membership.practiceName} (${label})`;
                        })
                        .join(" · ")}
                </td>
                <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(item.id);
                      setAccessUserId(item.id);
                    }}
                  >
                    Editar acesso
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <section className="card mt-4 space-y-2 text-sm text-lotus-800">
          <h2 className="font-semibold text-lotus-900">Detalhes técnicos</h2>
          <p>Nome: {selected.fullName}</p>
          <p>E-mail: {selected.email}</p>
          <p>Organização: {selected.organizationName ?? selected.organizationId}</p>
          <p>Status: {selected.isActive ? "ativo" : "inativo"}</p>
          <p>Último acesso: Indisponível</p>
          <p>SYSTEM_ADMIN: {selected.isSystemAdmin ? "Sim" : "Não"}</p>
          <p>
            Práticas:{" "}
            {selected.memberships.length === 0
              ? "Sem prática vinculada"
              : selected.memberships
                  .map((item) => {
                    const label =
                      STAFF_ROLE_OPTIONS.find((option) => option.value === item.role)?.label ?? item.role;
                    return `${item.practiceName} (${label})`;
                  })
                  .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => setAccessUserId(selected.id)}
            >
              Editar acesso
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              disabled={busy || selected.id === currentUserId}
              onClick={() => void toggleActive(selected)}
            >
              {selected.isActive ? "Desativar profile" : "Ativar profile"}
            </button>
          </div>
          <label className="mt-3 block text-sm">
            Motivo para concessão ou revogação
            <input
              className={fieldClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Obrigatório, mínimo 3 caracteres"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {!selected.isSystemAdmin ? (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => void grant(selected.id)}
              >
                Conceder SYSTEM_ADMIN
              </button>
            ) : (
              <button
                type="button"
                className={ghostButtonClass}
                disabled={busy || selected.id === currentUserId || activeAdminCount <= 1}
                onClick={() => void revoke(selected.id)}
              >
                Revogar SYSTEM_ADMIN
              </button>
            )}
          </div>
        </section>
      ) : null}

      {accessUser ? (
        <UserAccessEditor
          user={accessUser}
          onClose={() => setAccessUserId(null)}
          onChanged={async () => {
            await reload();
          }}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-lotus-500">
          SYSTEM_ADMINs
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Concedido em</th>
                <th className="px-4 py-3">Concedido por</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Revogado em</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((item) => (
                <tr key={`${item.userId}-${item.grantedAt}`} className="border-b border-lotus-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-lotus-900">{item.userName}</p>
                    <p className="text-xs text-lotus-600">{item.userEmail}</p>
                  </td>
                  <td className="px-4 py-3">{formatDateTime(item.grantedAt)}</td>
                  <td className="px-4 py-3">{item.grantedByName ?? "—"}</td>
                  <td className="px-4 py-3">{item.reason}</td>
                  <td className="px-4 py-3">{item.status}</td>
                  <td className="px-4 py-3">{item.revokedAt ? formatDateTime(item.revokedAt) : "—"}</td>
                </tr>
              ))}
              {!loading && admins.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-lotus-600" colSpan={6}>
                    Nenhum registro em system_admins visível.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
