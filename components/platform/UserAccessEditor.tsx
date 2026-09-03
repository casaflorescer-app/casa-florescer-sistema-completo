"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createMembership,
  deleteMembership,
  listPracticeUnits,
  listUserMemberships,
  setSecretaryCarePolicyView,
} from "@/lib/platform/users";
import {
  STAFF_ROLE_OPTIONS,
  type PlatformMembership,
  type PlatformPractice,
  type PlatformUser,
} from "@/lib/platform/types";
import type { AppRole, PracticeKind } from "@/lib/types/database";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";

function roleLabel(role: AppRole) {
  return STAFF_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

function practiceKindLabel(kind: PracticeKind | null) {
  if (kind === "house") return "Casa";
  if (kind === "sublet") return "Locatária";
  return null;
}

function practiceOptionLabel(practice: PlatformPractice) {
  const kind = practiceKindLabel(practice.kind);
  return kind ? `${practice.name} (${kind})` : practice.name;
}

export function UserAccessEditor({
  user,
  onClose,
  onChanged,
}: {
  user: PlatformUser;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [memberships, setMemberships] = useState<PlatformMembership[]>(user.memberships);
  const [practices, setPractices] = useState<PlatformPractice[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(user.memberships.length === 0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orgPractices = useMemo(
    () =>
      practices.filter(
        (item) => item.organizationId === user.organizationId && item.isActive,
      ),
    [practices, user.organizationId],
  );

  async function loadAccess() {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    const [nextMemberships, nextPractices] = await Promise.all([
      listUserMemberships(supabase, user.id),
      listPracticeUnits(supabase),
    ]);
    setMemberships(nextMemberships);
    setPractices(nextPractices);
    setShowForm(nextMemberships.length === 0);
    setLoading(false);
  }

  useEffect(() => {
    setMemberships(user.memberships);
    setPracticeId("");
    setRole("");
    setConfirmId(null);
    setShowForm(user.memberships.length === 0);
    setError(null);
    setNotice(null);
    setLoading(true);
    void loadAccess().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o acesso. Tente novamente.");
      setLoading(false);
    });
  }, [user.id]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!practiceId || !role) {
      setError("Selecione a prática e a função.");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await createMembership(supabase, { userId: user.id, practiceId, role });
      setPracticeId("");
      setRole("");
      setNotice("Vínculo adicionado.");
      await loadAccess();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o acesso. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(membership: PlatformMembership) {
    if (busy) return;
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMembership(supabase, membership.id);
      setConfirmId(null);
      setNotice("Vínculo removido.");
      await loadAccess();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o acesso. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCarePolicyView(membership: PlatformMembership) {
    if (busy) return;
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await setSecretaryCarePolicyView(supabase, membership.id, !membership.canViewCarePolicies);
      setNotice(
        membership.canViewCarePolicies
          ? "Permissão de visualizar políticas revogada."
          : "Permissão de visualizar políticas concedida.",
      );
      await loadAccess();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a permissão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4 space-y-4 text-sm text-lotus-800" aria-labelledby="edit-access-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="edit-access-title" className="font-semibold text-lotus-900">
            Editar acesso
          </h2>
          <p className="mt-1 text-lotus-600">
            {user.fullName} · {user.organizationName ?? "organização"}
          </p>
        </div>
        <button type="button" className={ghostButtonClass} onClick={onClose} disabled={busy}>
          Fechar
        </button>
      </div>

      <StatusMessage error={error} notice={notice} />

      {loading ? <p className="text-sm text-lotus-600">Carregando vínculos…</p> : null}

      {!loading && memberships.length === 0 ? (
        <p className="rounded-xl border border-lotus-100 bg-lotus-50/60 px-3 py-2 text-sm text-lotus-700">
          Sem prática vinculada
        </p>
      ) : null}

      {!loading && memberships.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-lotus-100 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
              <tr>
                <th className="px-4 py-3">Prática</th>
                <th className="px-4 py-3">Função</th>
                <th className="px-4 py-3">Permissão comercial</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((item) => {
                const kind = practiceKindLabel(item.practiceKind);
                return (
                  <tr key={item.id} className="border-b border-lotus-50 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-lotus-900">{item.practiceName}</p>
                      {kind ? <p className="text-xs text-lotus-600">{kind}</p> : null}
                    </td>
                    <td className="px-4 py-3">{roleLabel(item.role)}</td>
                    <td className="px-4 py-3">
                      {item.role === "secretary" ? (
                        <label className="flex items-start gap-2 text-sm text-lotus-800">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={item.canViewCarePolicies}
                            disabled={busy}
                            onChange={() => void toggleCarePolicyView(item)}
                          />
                          <span>
                            Visualizar políticas e valores de atendimento
                            <span className="mt-0.5 block text-xs text-lotus-600">
                              Permissão comercial desta prática. Não é acesso clínico.
                            </span>
                          </span>
                        </label>
                      ) : (
                        <span className="text-lotus-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {confirmId === item.id ? (
                        <div className="space-y-2">
                          <p className="text-xs text-rose-800">
                            Remover {item.practiceName} · {roleLabel(item.role)}?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={buttonClass}
                              disabled={busy}
                              onClick={() => void handleDelete(item)}
                            >
                              {busy ? "Removendo…" : "Confirmar remoção"}
                            </button>
                            <button
                              type="button"
                              className={ghostButtonClass}
                              disabled={busy}
                              onClick={() => setConfirmId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={ghostButtonClass}
                          disabled={busy}
                          onClick={() => setConfirmId(item.id)}
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!showForm ? (
        <button
          type="button"
          className={ghostButtonClass}
          disabled={busy || loading}
          onClick={() => setShowForm(true)}
        >
          Adicionar vínculo
        </button>
      ) : (
        <form className="space-y-3 rounded-2xl border border-lotus-100 bg-white p-4" onSubmit={(event) => void handleCreate(event)}>
          <p className="font-medium text-lotus-900">Novo vínculo</p>
          <div>
            <label htmlFor="membership-practice" className="text-sm font-medium text-lotus-800">
              Prática
            </label>
            <select
              id="membership-practice"
              className={fieldClass}
              value={practiceId}
              disabled={busy || orgPractices.length === 0}
              onChange={(event) => setPracticeId(event.target.value)}
              required
            >
              <option value="">Selecione a prática</option>
              {orgPractices.map((item) => (
                <option key={item.id} value={item.id}>
                  {practiceOptionLabel(item)}
                </option>
              ))}
            </select>
            {orgPractices.length === 0 && !loading ? (
              <p className="mt-1 text-xs text-lotus-600">
                Nenhuma prática visível para a organização deste usuário.
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="membership-role" className="text-sm font-medium text-lotus-800">
              Função
            </label>
            <select
              id="membership-role"
              className={fieldClass}
              value={role}
              disabled={busy}
              onChange={(event) => setRole(event.target.value as AppRole | "")}
              required
            >
              <option value="">Selecione a função</option>
              {STAFF_ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={busy || orgPractices.length === 0}>
              {busy ? "Salvando…" : "Salvar vínculo"}
            </button>
            {memberships.length > 0 ? (
              <button
                type="button"
                className={ghostButtonClass}
                disabled={busy}
                onClick={() => {
                  setShowForm(false);
                  setPracticeId("");
                  setRole("");
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
