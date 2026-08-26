"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listPlatformUsers, setProfileActive } from "@/lib/platform/users";
import type { PlatformUser } from "@/lib/platform/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { roleLabels } from "@/lib/auth/app-nav";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

export function ClinicUsersPanel() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId;
  const currentUserId = authorization?.user.id;
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    void listPlatformUsers(supabase)
      .then((rows) => {
        setUsers(orgId ? rows.filter((item) => item.organizationId === orgId) : rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
        setLoading(false);
      });
  }, [orgId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((item) => `${item.fullName} ${item.email}`.toLowerCase().includes(q));
  }, [users, query]);

  async function toggle(user: PlatformUser) {
    if (user.id === currentUserId) {
      setError("Não desative o próprio perfil por esta tela.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    try {
      await setProfileActive(supabase, user.id, !user.isActive);
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, isActive: !item.isActive } : item)),
      );
      setNotice("Status atualizado.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Usuários da clínica</h1>
      <p className="page-sub mt-2">
        Profiles da organização. A criação de contas Auth permanece fora desta fase.
      </p>
      <StatusMessage error={error} notice={notice} />
      <input
        className={`${fieldClass} mb-4 max-w-sm`}
        placeholder="Pesquisar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loading ? <p className="text-sm text-lotus-600">Carregando…</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papéis</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-lotus-50">
                <td className="px-4 py-3 font-medium text-lotus-900">{item.fullName}</td>
                <td className="px-4 py-3">{item.email}</td>
                <td className="px-4 py-3">
                  {item.memberships.length
                    ? roleLabels(item.memberships.map((membership) => membership.role))
                    : "sem membership"}
                </td>
                <td className="px-4 py-3">{item.isActive ? "ativo" : "inativo"}</td>
                <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    disabled={item.id === currentUserId}
                    onClick={() => void toggle(item)}
                  >
                    {item.isActive ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
