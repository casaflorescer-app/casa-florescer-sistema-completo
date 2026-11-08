"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  listPlatformUsers,
  listPracticeUnits,
  setProfileActive,
  setSecretaryCarePolicyView,
} from "@/lib/platform/users";
import {
  STAFF_ROLE_OPTIONS,
  type PlatformMembership,
  type PlatformPractice,
  type PlatformUser,
} from "@/lib/platform/types";
import type { AppRole } from "@/lib/types/database";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasStaffRole } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/app-nav";
import { formatDateTime } from "@/lib/platform/format";
import { StatusMessage, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryCreateButton } from "@/components/ui/PrimaryCreateButton";
import { CreateFormShell } from "@/components/ui/CreateFormShell";
import { FormActions } from "@/components/ui/FormActions";
import { UserAccessEditor } from "@/components/platform/UserAccessEditor";

type CreateFormState = {
  fullName: string;
  email: string;
  practiceId: string;
  role: AppRole | "";
};

type PasswordReveal = {
  fullName: string;
  email: string;
  temporaryPassword: string;
};

const EMPTY_FORM: CreateFormState = {
  fullName: "",
  email: "",
  practiceId: "",
  role: "",
};

export function ClinicUsersPanel() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId;
  const currentUserId = authorization?.user.id;
  const callerIsOwner = authorization ? hasStaffRole(authorization, "owner") : false;
  const allowedRoles = useMemo(
    () =>
      STAFF_ROLE_OPTIONS.filter((item) => item.value !== "owner" || callerIsOwner).map(
        (item) => item.value,
      ),
    [callerIsOwner],
  );

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [practices, setPractices] = useState<PlatformPractice[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [passwordReveal, setPasswordReveal] = useState<PasswordReveal | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);

  const housePractices = useMemo(
    () =>
      practices.filter(
        (item) =>
          item.organizationId === orgId && item.kind === "house" && item.isActive,
      ),
    [practices, orgId],
  );

  const reload = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    const [rows, practiceRows] = await Promise.all([
      listPlatformUsers(supabase),
      listPracticeUnits(supabase),
    ]);
    setUsers(orgId ? rows.filter((item) => item.organizationId === orgId) : rows);
    setPractices(practiceRows);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
      setLoading(false);
    });
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((item) => `${item.fullName} ${item.email}`.toLowerCase().includes(q));
  }, [users, query]);

  function startCreate() {
    setForm({
      ...EMPTY_FORM,
      practiceId: housePractices[0]?.id ?? "",
      role: "secretary",
    });
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setForm(EMPTY_FORM);
  }

  async function createUser() {
    if (busy) return;
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    if (!fullName || !email || !form.practiceId || !form.role) {
      setError("Preencha nome, e-mail, prática e papel.");
      return;
    }
    if (!allowedRoles.includes(form.role)) {
      setError("Você não pode conceder este papel.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          practiceId: form.practiceId,
          role: form.role,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        userId?: string;
        temporaryPassword?: string;
        email?: string;
        fullName?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível criar o usuário.");
      }
      if (!payload.temporaryPassword) {
        throw new Error("Usuário criado, mas a senha provisória não veio na resposta.");
      }
      setPasswordReveal({
        fullName: payload.fullName ?? fullName,
        email: payload.email ?? email,
        temporaryPassword: payload.temporaryPassword,
      });
      setCopied(false);
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setNotice("Usuário criado. Copie a senha provisória e envie pelo WhatsApp.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!passwordReveal) return;
    try {
      await navigator.clipboard.writeText(passwordReveal.temporaryPassword);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar. Selecione a senha manualmente.");
    }
  }

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

  async function toggleCarePolicyView(user: PlatformUser, membership: PlatformMembership) {
    const supabase = createClient();
    if (!supabase) return;
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

  const secretaries = users.filter((item) =>
    item.memberships.some((membership) => membership.role === "secretary"),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Administração da clínica"
        title="Usuários da clínica"
        description="Crie contas com senha provisória (envie pelo WhatsApp Web) e gerencie papéis da organização. Papel médico não cadastra profissional automaticamente."
        actions={<PrimaryCreateButton label="Novo usuário" onClick={startCreate} />}
      />
      <StatusMessage error={error} notice={notice} />
      <input
        className={`${fieldClass} mb-4 max-w-sm`}
        placeholder="Pesquisar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Pesquisar usuários"
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ghostButtonClass}
                      onClick={() => {
                        setEditingUser(item);
                        setNotice(null);
                        setError(null);
                      }}
                    >
                      Papéis
                    </button>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      disabled={item.id === currentUserId}
                      onClick={() => void toggle(item)}
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

      {editingUser ? (
        <UserAccessEditor
          user={editingUser}
          allowedRoles={allowedRoles}
          onClose={() => setEditingUser(null)}
          onChanged={async () => {
            const supabase = createClient();
            if (!supabase || !orgId) return;
            const rows = await listPlatformUsers(supabase);
            const scoped = rows.filter((item) => item.organizationId === orgId);
            setUsers(scoped);
            const refreshed = scoped.find((item) => item.id === editingUser.id);
            if (refreshed) setEditingUser(refreshed);
          }}
        />
      ) : null}

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

      <CreateFormShell
        open={formOpen}
        title="Novo usuário"
        description="A senha provisória aparece uma vez. Envie pelo WhatsApp Web e peça a troca no primeiro acesso."
        size="md"
        busy={busy}
        onClose={closeForm}
        formId="clinic-user-create-form"
      >
        <label className="block text-sm">
          Nome completo
          <input
            className={fieldClass}
            value={form.fullName}
            onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
            autoComplete="name"
            required
          />
        </label>
        <label className="mt-3 block text-sm">
          E-mail
          <input
            className={fieldClass}
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            autoComplete="email"
            required
          />
        </label>
        <label className="mt-3 block text-sm">
          Prática (casa)
          <select
            className={fieldClass}
            value={form.practiceId}
            onChange={(event) =>
              setForm((current) => ({ ...current, practiceId: event.target.value }))
            }
            required
          >
            <option value="">Selecione</option>
            {housePractices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {housePractices.length === 0 ? (
            <span className="mt-1 block text-xs text-lotus-600">
              Nenhuma prática house ativa nesta organização.
            </span>
          ) : null}
        </label>
        <label className="mt-3 block text-sm">
          Papel
          <select
            className={fieldClass}
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                role: event.target.value as AppRole | "",
              }))
            }
            required
          >
            <option value="">Selecione</option>
            {STAFF_ROLE_OPTIONS.filter((item) => allowedRoles.includes(item.value)).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <FormActions
          primaryLabel="Criar usuário"
          primaryBusy={busy}
          busyLabel="Criando…"
          primaryDisabled={
            !form.fullName.trim() ||
            !form.email.trim() ||
            !form.practiceId ||
            !form.role ||
            housePractices.length === 0
          }
          onPrimary={() => void createUser()}
          onCancel={closeForm}
        />
      </CreateFormShell>

      <CreateFormShell
        open={Boolean(passwordReveal)}
        title="Senha provisória"
        description="Mostre esta senha só agora. Depois ela não volta a aparecer."
        size="md"
        onClose={() => setPasswordReveal(null)}
        formId="clinic-user-temp-password"
      >
        {passwordReveal ? (
          <div className="space-y-4 text-sm text-lotus-800">
            <p>
              Conta de <strong className="font-semibold text-lotus-900">{passwordReveal.fullName}</strong>{" "}
              ({passwordReveal.email}).
            </p>
            <div className="rounded-2xl border border-lotus-100 bg-lotus-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                Senha provisória
              </p>
              <p
                className="mt-2 break-all font-mono text-base text-lotus-900"
                data-temp-password="true"
              >
                {passwordReveal.temporaryPassword}
              </p>
            </div>
            <p>
              Envie pelo WhatsApp Web e peça a troca no primeiro acesso. A pessoa só entra no sistema
              depois de definir a senha definitiva.
            </p>
            <FormActions
              primaryLabel={copied ? "Copiada" : "Copiar senha"}
              onPrimary={() => void copyPassword()}
              cancelLabel="Fechar"
              onCancel={() => setPasswordReveal(null)}
            />
          </div>
        ) : null}
      </CreateFormShell>
    </div>
  );
}
