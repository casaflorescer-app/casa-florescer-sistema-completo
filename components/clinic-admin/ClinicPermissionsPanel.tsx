"use client";

import { useEffect, useState } from "react";
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

function parseModules(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModuleId =>
    APP_MODULES.some((module) => module.id === item),
  );
}

export function ClinicPermissionsPanel() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId;
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ModuleId[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    if (!supabase) return;
    void supabase
      .from("profiles")
      .select("id, full_name, email, permissions")
      .eq("organization_id", orgId)
      .order("full_name")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(mapDbError(queryError));
          return;
        }
        const next = (data ?? []) as Row[];
        setRows(next);
        const nextDrafts: Record<string, ModuleId[]> = {};
        for (const row of next) nextDrafts[row.id] = parseModules(row.permissions);
        setDrafts(nextDrafts);
      });
  }, [orgId]);

  function toggle(userId: string, moduleId: ModuleId) {
    setDrafts((current) => {
      const list = current[userId] ?? [];
      const next = list.includes(moduleId)
        ? list.filter((item) => item !== moduleId)
        : [...list, moduleId];
      return { ...current, [userId]: next };
    });
  }

  async function save(userId: string) {
    const supabase = createClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ permissions: drafts[userId] ?? [] })
      .eq("id", userId);
    if (updateError) {
      setError(mapDbError(updateError));
      setNotice(null);
      return;
    }
    setNotice("Módulos de interface atualizados. Isso não altera o RLS.");
    setError(null);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Administração da clínica
      </p>
      <h1 className="page-title mt-1">Permissões</h1>
      <p className="page-sub mt-2">
        Módulos de interface em profiles.permissions. Não substituem membership nem o banco.
      </p>
      <StatusMessage error={error} notice={notice} />
      <div className="space-y-4">
        {rows.map((row) => (
          <section key={row.id} className="card space-y-3">
            <div>
              <p className="font-semibold text-lotus-900">{row.full_name}</p>
              <p className="text-sm text-lotus-600">{row.email}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {APP_MODULES.map((module) => (
                <label key={module.id} className="flex items-center gap-2 text-sm text-lotus-800">
                  <input
                    type="checkbox"
                    checked={(drafts[row.id] ?? []).includes(module.id)}
                    onChange={() => toggle(row.id, module.id)}
                  />
                  {module.label}
                </label>
              ))}
            </div>
            <button type="button" className={buttonClass} onClick={() => void save(row.id)}>
              Salvar módulos
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
