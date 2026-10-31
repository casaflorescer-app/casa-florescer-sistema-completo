"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listPlatformUsers, setProfileActive, setSecretaryCarePolicyView } from "@/lib/platform/users";
import type { PlatformMembership, PlatformUser } from "@/lib/platform/types";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { listClinicUsersCasa } from "@/lib/casa/reads";
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
  const casa = isCasaBrowserAuth();
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState<"secretary" | "physician" | "admin">("secretary");
  const [staffPractices, setStaffPractices] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      if (!isCasaBrowserAuth()) {
        setError("Autenticação não configurada neste ambiente.");
        setUsers([]);
        setLoading(false);
        return;
      }
      void listClinicUsersCasa()
        .then((data) => {
          const orgNames = new Map(
            data.organizations.map((row) => [
              String(row.id),
              String(row.trade_name || row.legal_name || row.id),
            ]),
          );
          const admins = new Set(
            data.admins
              .filter((row) => row.revoked_at == null)
              .map((row) => String(row.user_id)),
          );
          const memberships = new Map<string, PlatformUser["memberships"]>();
          for (const row of data.roles) {
            const userId = String(row.user_id ?? "");
            const list = memberships.get(userId) ?? [];
            list.push({
              id: String(row.id),
              practiceId: String(row.practice_id),
              practiceName: String(row.practice_name || row.practice_id),
              practiceKind: row.practice_kind === "house" || row.practice_kind === "sublet" ? row.practice_kind : null,
              role: row.role as PlatformUser["memberships"][number]["role"],
              clinicalAccess: String(row.clinical_access ?? "none"),
              canViewCarePolicies: row.can_view_care_policies === true,
            });
            memberships.set(userId, list);
          }
          const rows: PlatformUser[] = data.profiles.flatMap((row) => {
            const id = String(row.id ?? "");
            const organizationId = String(row.organization_id ?? "");
            if (!id || !row.full_name || !row.email || !organizationId) return [];
            if (orgId && organizationId !== orgId) return [];
            return [
              {
                id,
                fullName: String(row.full_name),
                email: String(row.email),
                organizationId,
                organizationName: orgNames.get(organizationId) ?? null,
                isActive: row.is_active !== false,
                createdAt: String(row.created_at ?? ""),
                lastAccess: null,
                isSystemAdmin: admins.has(id),
                memberships: memberships.get(id) ?? [],
              },
            ];
          });
          setUsers(rows);
          setLoading(false);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
          setLoading(false);
        });
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
    if (!supabase && !isCasaBrowserAuth()) return;
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

  async function toggleCarePolicyView(user: PlatformUser, membership: PlatformMembership) {
    const supabase = createClient();
    if (!supabase && !isCasaBrowserAuth()) return;
    try {
      await setSecretaryCarePolicyView(supabase, membership.id, !membership.canViewCarePolicies);
      setUsers((current) =>
        current.map((item) =>
          item.id !== user.id
            ? item
            : {
                ...item,
                memberships: item.memberships.map((entry) =>
                  entry.id === membership.id
                    ? { ...entry, canViewCarePolicies: !entry.canViewCarePolicies }
                    : entry,
                ),
              },
        ),
      );
      setNotice(
        membership.canViewCarePolicies
          ? "Permissão de visualizar políticas revogada."
          : "Permissão de visualizar políticas concedida.",
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a permissão.");
    }
  }

  async function createStaff(event: React.FormEvent) {
    event.preventDefault();
    if (!authorization?.isSystemAdmin || !orgId) {
      setError("Só o administrador principal cria usuários.");
      return;
    }
    const practiceIds = staffPractices
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (staffPassword.length < 8 || practiceIds.length === 0) {
      setError("Informe uma senha de 8 caracteres e ao menos uma prática.");
      return;
    }
    setStaffBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/casa/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: staffEmail.trim(),
          fullName: staffName.trim(),
          password: staffPassword,
          organizationId: orgId,
          memberships: practiceIds.map((practiceId) => ({
            practiceId,
            role: staffRole,
            canScheduleAnyPractice: staffRole !== "physician",
          })),
        }),
      });
      if (!response.ok) {
        setError("Não foi possível criar o usuário.");
        return;
      }
      setStaffPassword("");
      setStaffEmail("");
      setStaffName("");
      setNotice("Usuário criado. A senha digitada não fica nesta tela.");
    } catch {
      setError("Não foi possível criar o usuário.");
    } finally {
      setStaffBusy(false);
    }
  }

  const secretaries = users.filter((item) =>
    item.memberships.some((membership) => membership.role === "secretary"),
  );

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Usuários da clínica</h1>
      <p className="page-sub mt-2">
        {casa
          ? "No modo da casa, só o administrador principal cria usuários por esta tela."
          : "Profiles da organização. A criação de contas Auth permanece fora desta fase."}
      </p>
      {casa && authorization?.isSystemAdmin ? (
        <form className="mb-6 max-w-xl space-y-3 rounded-2xl border border-lotus-100 bg-white p-4" onSubmit={(event) => void createStaff(event)}>
          <h2 className="text-sm font-semibold text-lotus-900">Novo usuário</h2>
          <input className={fieldClass} placeholder="Nome" value={staffName} onChange={(event) => setStaffName(event.target.value)} required />
          <input className={fieldClass} type="email" placeholder="E-mail" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} required />
          <input className={fieldClass} type="password" placeholder="Senha inicial" value={staffPassword} onChange={(event) => setStaffPassword(event.target.value)} autoComplete="new-password" required minLength={8} />
          <select className={fieldClass} value={staffRole} onChange={(event) => setStaffRole(event.target.value as "secretary" | "physician" | "admin")}>
            <option value="secretary">Secretária</option>
            <option value="physician">Médica</option>
            <option value="admin">Administradora</option>
          </select>
          <textarea className={fieldClass} placeholder="IDs das práticas, um por linha" value={staffPractices} onChange={(event) => setStaffPractices(event.target.value)} required />
          <button className={ghostButtonClass} type="submit" disabled={staffBusy}>
            {staffBusy ? "Criando…" : "Criar usuário"}
          </button>
        </form>
      ) : null}
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

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lotus-500">
          Permissões comerciais da secretária
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-lotus-700">
          Independente do prontuário, das gestações, da agenda e dos exames. Controla somente a
          consulta da política padrão e dos valores de atendimento nesta prática. Nenhuma secretária
          comum publica ou altera política.
        </p>
        {secretaries.length === 0 && !loading ? (
          <p className="mt-4 text-sm text-lotus-600">Nenhuma secretária comum vinculada.</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {secretaries.map((user) => (
            <article key={user.id} className="rounded-2xl border border-lotus-100 bg-white p-4">
              <p className="font-medium text-lotus-900">{user.fullName}</p>
              <p className="text-sm text-lotus-600">{user.email}</p>
              <ul className="mt-3 space-y-2">
                {user.memberships
                  .filter((membership) => membership.role === "secretary")
                  .map((membership) => (
                    <li key={membership.id}>
                      <label className="flex items-start gap-2 text-sm text-lotus-800">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={membership.canViewCarePolicies}
                          onChange={() => void toggleCarePolicyView(user, membership)}
                        />
                        <span>
                          Visualizar políticas e valores de atendimento
                          <span className="mt-0.5 block text-xs text-lotus-600">
                            {membership.practiceName}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
