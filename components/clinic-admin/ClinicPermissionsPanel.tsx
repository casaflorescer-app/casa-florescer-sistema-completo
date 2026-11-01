"use client";

import { useEffect, useState } from "react";
import { isCasaBrowserAuth } from "@/lib/auth/casa-mode";
import { listPermissionProfilesCasa } from "@/lib/casa/reads";
import { setProfilePermissionsCasa } from "@/lib/casa/writes";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { APP_MODULES, type ModuleId } from "@/lib/permissions";
import { mapDbError } from "@/lib/platform/format";
import { StatusMessage, buttonClass } from "@/components/platform/Ui";

type Row = {
  id: string;
  full_name: string;
  email: string;
  permissions: unknown;
};

/** Módulos de UI que o trigger 0004 só aceita com membership physician. */
const PHYSICIAN_ONLY_MODULES: ModuleId[] = ["prontuario", "obstetrico"];

function parseModules(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModuleId =>
    APP_MODULES.some((module) => module.id === item),
  );
}

function mapPermissionsSaveError(error: { code?: string; message?: string } | null): string {
  const raw = error?.message ?? "";
  if (/prontuario só pode ser atribuído a physician/i.test(raw)) {
    return "Prontuário só pode ser atribuído a quem já tem o papel Médica (physician) em Usuários → Acessos. O checkbox não substitui o membership clínico.";
  }
  if (/obstetrico só pode ser atribuído a physician/i.test(raw)) {
    return "Programação obstétrica só pode ser atribuída a quem já tem o papel Médica (physician) em Usuários → Acessos.";
  }
  if (/contratos só pode ser atribuído/i.test(raw)) {
    return "Contratos e Sublocações só podem ser atribuídos a Proprietária ou Administração.";
  }
  if (/permissoes só pode ser atribuído/i.test(raw)) {
    return "O módulo Usuários só pode ser atribuído a Proprietária ou Administração.";
  }
  return mapDbError(error);
}

function isPhysicianOnlyModule(moduleId: ModuleId) {
  return PHYSICIAN_ONLY_MODULES.includes(moduleId);
}

export function ClinicPermissionsPanel() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId;
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ModuleId[]>>({});
  const [physicianIds, setPhysicianIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const casa = isCasaBrowserAuth();
    const supabase = casa ? null : createClient();
    if (!casa && !supabase) return;
    setLoading(true);
    if (casa) {
      void listPermissionProfilesCasa(orgId)
        .then((data) => {
          const next = data.map((row) => ({
            id: String(row.id),
            full_name: String(row.full_name ?? ""),
            email: String(row.email ?? ""),
            permissions: row.permissions,
          }));
          setRows(next);
          const nextDrafts: Record<string, ModuleId[]> = {};
          for (const row of next) nextDrafts[row.id] = parseModules(row.permissions);
          setDrafts(nextDrafts);
          setPhysicianIds(
            new Set(
              data
                .filter((row) => Array.isArray(row.roles) && row.roles.includes("physician"))
                .map((row) => String(row.id)),
            ),
          );
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Não foi possível carregar as permissões.");
        })
        .finally(() => setLoading(false));
      return;
    }
    void (async () => {
      const { data, error: queryError } = await supabase!
        .from("profiles")
        .select("id, full_name, email, permissions")
        .eq("organization_id", orgId)
        .order("full_name");
      if (queryError) {
        setError(mapDbError(queryError));
        setLoading(false);
        return;
      }
      const next = (data ?? []) as Row[];
      setRows(next);
      const nextDrafts: Record<string, ModuleId[]> = {};
      for (const row of next) nextDrafts[row.id] = parseModules(row.permissions);
      setDrafts(nextDrafts);

      const ids = next.map((row) => row.id);
      if (ids.length === 0) {
        setPhysicianIds(new Set());
        setLoading(false);
        return;
      }

      const { data: roles, error: rolesError } = await supabase!
        .from("user_practice_roles")
        .select("user_id, role")
        .in("user_id", ids)
        .eq("role", "physician");

      if (rolesError) {
        // Não bloquear a tela: checkboxes clínicos ficam conservadores (disabled).
        setPhysicianIds(new Set());
        setError(
          `${mapDbError(rolesError)} Não foi possível verificar quem é médica; Prontuário e Obstétrica permanecem bloqueados até o papel existir em Usuários → Acessos.`,
        );
      } else {
        setPhysicianIds(
          new Set(
            (roles ?? [])
              .map((item) => (typeof item.user_id === "string" ? item.user_id : null))
              .filter((id): id is string => Boolean(id)),
          ),
        );
      }
      setLoading(false);
    })();
  }, [orgId]);

  function canToggleClinical(userId: string, moduleId: ModuleId, currentlyOn: boolean) {
    if (!isPhysicianOnlyModule(moduleId)) return true;
    // Sempre permite desmarcar; marcar só com membership physician.
    if (currentlyOn) return true;
    return physicianIds.has(userId);
  }

  function toggle(userId: string, moduleId: ModuleId) {
    setDrafts((current) => {
      const list = current[userId] ?? [];
      const currentlyOn = list.includes(moduleId);
      if (!canToggleClinical(userId, moduleId, currentlyOn)) return current;
      const next = currentlyOn ? list.filter((item) => item !== moduleId) : [...list, moduleId];
      return { ...current, [userId]: next };
    });
  }

  async function save(userId: string) {
    const casa = isCasaBrowserAuth();
    const supabase = casa ? null : createClient();
    if (!casa && !supabase) return;
    const payload = drafts[userId] ?? [];
    if (!physicianIds.has(userId)) {
      const blocked = payload.filter((id) => isPhysicianOnlyModule(id));
      if (blocked.length > 0) {
        setError(
          "Remova Prontuário / Programação obstétrica ou conceda o papel Médica em Usuários → Acessos antes de salvar.",
        );
        setNotice(null);
        return;
      }
    }
    if (!supabase) {
      try {
        await setProfilePermissionsCasa(userId, payload);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Não foi possível salvar as permissões.");
        setNotice(null);
        return;
      }
      setNotice(
        "Módulos de interface atualizados. Isso não altera o RLS nem substitui o papel Médica necessário ao prontuário.",
      );
      setError(null);
      return;
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ permissions: payload })
      .eq("id", userId);
    if (updateError) {
      setError(mapPermissionsSaveError(updateError));
      setNotice(null);
      return;
    }
    setNotice(
      "Módulos de interface atualizados. Isso não altera o RLS nem substitui o papel Médica necessário ao prontuário.",
    );
    setError(null);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Permissões</h1>
      <p className="page-sub mt-2">
        Módulos de interface em profiles.permissions. Não substituem membership nem o banco. Prontuário e
        Programação obstétrica exigem papel Médica em Usuários → Acessos.
      </p>
      <StatusMessage error={error} notice={notice} />
      {loading ? <p className="mt-4 text-sm text-lotus-600">Carregando colaboradores…</p> : null}
      <div className="mt-4 space-y-4">
        {rows.map((row) => {
          const isPhysician = physicianIds.has(row.id);
          return (
            <section key={row.id} className="card space-y-3">
              <div>
                <p className="font-semibold text-lotus-900">{row.full_name}</p>
                <p className="text-sm text-lotus-600">{row.email}</p>
                {!isPhysician ? (
                  <p className="mt-2 text-xs text-lotus-600">
                    Sem papel Médica: Prontuário e Programação obstétrica ficam indisponíveis. Conceda o
                    membership em Usuários → Acessos para homologação clínica.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-lotus-600">
                    Papel Médica detectado — módulos clínicos de interface podem ser marcados.
                  </p>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {APP_MODULES.map((module) => {
                  const checked = (drafts[row.id] ?? []).includes(module.id);
                  const clinicalLocked =
                    isPhysicianOnlyModule(module.id) && !isPhysician && !checked;
                  return (
                    <label
                      key={module.id}
                      className={`flex items-center gap-2 text-sm ${
                        clinicalLocked ? "text-lotus-400" : "text-lotus-800"
                      }`}
                      title={
                        clinicalLocked
                          ? "Requer papel Médica (physician) em Usuários → Acessos"
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={clinicalLocked}
                        onChange={() => toggle(row.id, module.id)}
                      />
                      {module.label}
                      {clinicalLocked ? (
                        <span className="text-xs text-lotus-500">(requer Médica)</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <button type="button" className={buttonClass} onClick={() => void save(row.id)}>
                Salvar módulos
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
