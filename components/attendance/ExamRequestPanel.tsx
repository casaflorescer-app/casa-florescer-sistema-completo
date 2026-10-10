"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmExamRequest,
  createExamRequest,
  listExamCatalog,
  listExamGroups,
  listExamRequestsForEncounter,
  upsertExamCatalog,
  upsertExamGroup,
  type ExamCatalogRow,
  type ExamGroupRow,
  type ExamRequestRow,
} from "@/lib/attendance/clinical-support-directory";
import { buttonClass, fieldClass, ghostButtonClass, StatusMessage } from "@/components/platform/Ui";
import { formatDateTime } from "@/lib/platform/format";

export function ExamRequestPanel({
  supabase,
  practiceId,
  encounterId,
  locked,
  canEdit,
}: {
  supabase: SupabaseClient;
  practiceId: string;
  encounterId: string;
  locked: boolean;
  canEdit: boolean;
}) {
  const [catalog, setCatalog] = useState<ExamCatalogRow[]>([]);
  const [groups, setGroups] = useState<ExamGroupRow[]>([]);
  const [requests, setRequests] = useState<ExamRequestRow[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newExamName, setNewExamName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  const reload = useCallback(async () => {
    const [c, g, r] = await Promise.all([
      listExamCatalog(supabase, practiceId, true),
      listExamGroups(supabase, practiceId, true),
      listExamRequestsForEncounter(supabase, encounterId),
    ]);
    setCatalog(c);
    setGroups(g);
    setRequests(r);
  }, [encounterId, practiceId, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.shortName ?? "").toLowerCase().includes(q) ||
        (item.category ?? "").toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const previewNames = useMemo(() => {
    const names: string[] = [];
    for (const groupId of selectedGroups) {
      const group = groups.find((g) => g.id === groupId);
      if (!group) continue;
      for (const catalogId of group.catalogIds) {
        const item = catalog.find((c) => c.id === catalogId);
        if (item) names.push(`${item.name} (grupo ${group.name})`);
      }
    }
    for (const catalogId of selectedCatalog) {
      const item = catalog.find((c) => c.id === catalogId);
      if (item) names.push(item.name);
    }
    if (customName.trim()) names.push(customName.trim());
    return names;
  }, [catalog, customName, groups, selectedCatalog, selectedGroups]);

  function toggle(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  async function onCreate(confirm: boolean) {
    if (!canEdit || locked) return;
    if (previewNames.length === 0) {
      setError("Selecione exames ou um grupo antes de confirmar.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createExamRequest(supabase, {
        encounterId,
        catalogIds: selectedCatalog,
        groupIds: selectedGroups,
        customNames: customName.trim() ? [customName.trim()] : [],
        notes: notes.trim() || undefined,
        confirm,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedCatalog([]);
      setSelectedGroups([]);
      setCustomName("");
      setNotes("");
      setNotice(confirm ? "Pedido de exames confirmado." : "Rascunho de pedido salvo.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDraft(requestId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmExamRequest(supabase, requestId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Pedido confirmado.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onAddCatalogExam() {
    if (!newExamName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await upsertExamCatalog(supabase, {
        practiceId,
        name: newExamName.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewExamName("");
      setNotice("Exame adicionado ao catálogo.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onAddGroup() {
    if (!newGroupName.trim() || selectedCatalog.length === 0) {
      setError("Informe o nome do grupo e selecione exames do catálogo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await upsertExamGroup(supabase, {
        practiceId,
        name: newGroupName.trim(),
        catalogIds: selectedCatalog,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewGroupName("");
      setNotice("Grupo de exames criado.");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4 overflow-x-hidden">
      <h2 className="text-base font-semibold text-lotus-900">Pedido de exames</h2>
      <p className="mt-1 text-sm text-lotus-600">
        Pedido clínico distinto de anexos/resultados. Confirme o resumo antes de concluir.
      </p>

      {!canEdit || locked ? (
        <p className="mt-3 text-sm text-lotus-600">
          {locked ? "Atendimento assinado — pedidos somente leitura." : "Sem permissão para pedir exames."}
        </p>
      ) : (
        <>
          <label className="mt-3 block text-sm font-medium text-lotus-800">
            Pesquisar catálogo
            <input
              className={fieldClass}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, abreviação ou categoria"
            />
          </label>

          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-lotus-100 p-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-lotus-500">Catálogo vazio ou sem resultados.</p>
            ) : (
              filtered.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-lotus-800">
                  <input
                    type="checkbox"
                    checked={selectedCatalog.includes(item.id)}
                    onChange={() => toggle(selectedCatalog, item.id, setSelectedCatalog)}
                  />
                  <span>
                    {item.name}
                    {item.category ? ` · ${item.category}` : ""}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-sm font-medium text-lotus-800">Grupos</p>
            {groups.length === 0 ? (
              <p className="text-sm text-lotus-500">Nenhum grupo ativo.</p>
            ) : (
              groups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm text-lotus-800">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={() => toggle(selectedGroups, group.id, setSelectedGroups)}
                  />
                  <span>
                    {group.name}
                    {group.description ? ` — ${group.description}` : ""}
                  </span>
                </label>
              ))
            )}
          </div>

          <label className="mt-3 block text-sm font-medium text-lotus-800">
            Exame avulso (texto livre)
            <input
              className={fieldClass}
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-lotus-800">
            Observações do pedido
            <textarea
              className={fieldClass}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {previewNames.length > 0 ? (
            <div className="mt-3 rounded-lg border border-lotus-200 bg-lotus-50/50 p-3">
              <p className="text-sm font-semibold text-lotus-900">Resumo do pedido</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-lotus-700">
                {previewNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={ghostButtonClass} disabled={busy} onClick={() => void onCreate(false)}>
              Salvar rascunho
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void onCreate(true)}>
              Confirmar pedido
            </button>
          </div>

          <div className="mt-4 grid gap-3 border-t border-lotus-100 pt-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-lotus-800">
                Novo exame no catálogo
                <input
                  className={fieldClass}
                  value={newExamName}
                  onChange={(event) => setNewExamName(event.target.value)}
                />
              </label>
              <button type="button" className={`${ghostButtonClass} mt-2`} disabled={busy} onClick={() => void onAddCatalogExam()}>
                Adicionar ao catálogo
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-lotus-800">
                Novo grupo (com exames selecionados)
                <input
                  className={fieldClass}
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                />
              </label>
              <button type="button" className={`${ghostButtonClass} mt-2`} disabled={busy} onClick={() => void onAddGroup()}>
                Criar grupo
              </button>
            </div>
          </div>
        </>
      )}

      <div className="mt-3">
        <StatusMessage error={error} notice={notice} />
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold text-lotus-900">Pedidos deste atendimento</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-lotus-500">Nenhum pedido registrado.</p>
        ) : (
          requests.map((request) => (
            <div key={request.id} className="rounded-lg border border-lotus-100 p-3 text-sm">
              <p className="font-medium text-lotus-900">
                {request.status === "confirmed"
                  ? "Confirmado"
                  : request.status === "draft"
                    ? "Rascunho"
                    : "Cancelado"}{" "}
                · {formatDateTime(request.createdAt)}
              </p>
              <ul className="mt-1 list-disc pl-5 text-lotus-700">
                {request.items.map((item) => (
                  <li key={item.id}>{item.catalogName || item.customName || "Exame"}</li>
                ))}
              </ul>
              {canEdit && !locked && request.status === "draft" ? (
                <button
                  type="button"
                  className={`${ghostButtonClass} mt-2`}
                  disabled={busy}
                  onClick={() => void onConfirmDraft(request.id)}
                >
                  Confirmar
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
