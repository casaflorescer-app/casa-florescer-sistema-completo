"use client";

import { useCallback, useEffect, useState } from "react";
import {
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";
import {
  listEquipment,
  listEquipmentEvents,
  listStockRooms,
  transferEquipment,
  upsertEquipment,
} from "@/lib/inventory/equipment";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_STATUSES,
  EQUIPMENT_STATUS_LABEL,
  type EquipmentEventRow,
  type EquipmentRow,
  type RoomOption,
} from "@/lib/inventory/types";

const EVENT_LABEL: Record<string, string> = {
  created: "Cadastro",
  updated: "Atualização",
  transferred: "Transferência",
  status_changed: "Mudança de situação",
  disposed: "Baixa",
};

export function EquipmentPanel({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [selected, setSelected] = useState<EquipmentRow | null>(null);
  const [events, setEvents] = useState<EquipmentEventRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [roomFilter, setRoomFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    category: "medico",
    manufacturer: "",
    model: "",
    serialNumber: "",
    assetTag: "",
    acquiredOn: "",
    roomId: "",
    status: "active",
    notes: "",
  });

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferRoomId, setTransferRoomId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [equip, roomRows] = await Promise.all([
        listEquipment({
          organizationId,
          search,
          status: statusFilter,
          category: categoryFilter,
          roomId: roomFilter,
        }),
        listStockRooms(organizationId),
      ]);
      setRows(equip);
      setRooms(roomRows);
      setSelected((prev) => (prev ? equip.find((e) => e.id === prev.id) ?? null : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar equipamentos.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, search, statusFilter, categoryFilter, roomFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void listEquipmentEvents(selected.id)
      .then((ev) => {
        if (!cancelled) setEvents(ev);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (!form.name.trim()) throw new Error("Informe o nome do equipamento.");
      const id = await upsertEquipment({
        id: form.id || null,
        organization_id: organizationId,
        name: form.name.trim(),
        category: form.category,
        manufacturer: form.manufacturer.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serialNumber.trim() || null,
        asset_tag: form.assetTag.trim() || null,
        acquired_on: form.acquiredOn || null,
        room_id: form.roomId || null,
        status: form.status,
        notes: form.notes.trim() || null,
      });
      setNotice(form.id ? "Equipamento atualizado." : "Equipamento cadastrado.");
      setShowForm(false);
      await refresh();
      const found = (await listEquipment({ organizationId })).find((e) => e.id === id) ?? null;
      setSelected(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o equipamento.");
    } finally {
      setSaving(false);
    }
  }

  async function submitTransfer() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await transferEquipment({
        organization_id: organizationId,
        id: selected.id,
        to_room_id: transferRoomId || null,
        reason: transferReason.trim() || null,
      });
      setNotice("Transferência patrimonial registrada.");
      setShowTransfer(false);
      setTransferReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na transferência.");
    } finally {
      setSaving(false);
    }
  }

  function openNew() {
    setForm({
      id: "",
      name: "",
      category: "medico",
      manufacturer: "",
      model: "",
      serialNumber: "",
      assetTag: "",
      acquiredOn: "",
      roomId: "",
      status: "active",
      notes: "",
    });
    setShowForm(true);
  }

  function openEdit(row: EquipmentRow) {
    setForm({
      id: row.id,
      name: row.name,
      category: row.category,
      manufacturer: row.manufacturer ?? "",
      model: row.model ?? "",
      serialNumber: row.serialNumber ?? "",
      assetTag: row.assetTag ?? "",
      acquiredOn: row.acquiredOn ?? "",
      roomId: row.roomId ?? "",
      status: row.status,
      notes: row.notes ?? "",
    });
    setShowForm(true);
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-xl border border-lotus-100 bg-lotus-50/60 px-4 py-3 text-sm text-lotus-800">
        Equipamentos são patrimônio individual (série / patrimônio), distintos de materiais
        consumíveis com quantidade em estoque.
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={openNew}>
          Novo equipamento
        </button>
        <button type="button" className={ghostButtonClass} onClick={() => void refresh()}>
          Atualizar
        </button>
      </div>

      <StatusMessage error={error} notice={notice} />

      <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <label className="block text-sm text-lotus-800">
          Buscar
          <input
            className={fieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, patrimônio, série"
          />
        </label>
        <label className="block text-sm text-lotus-800">
          Situação
          <select
            className={fieldClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EQUIPMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-lotus-800">
          Categoria
          <select
            className={fieldClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {EQUIPMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EQUIPMENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-lotus-800">
          Sala
          <select
            className={fieldClass}
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-lotus-600">Carregando equipamentos…</p> : null}

      {!loading ? (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <article className="card space-y-2 p-4">
                  <h3 className="font-semibold text-lotus-900">{row.name}</h3>
                  <p className="text-sm text-lotus-700">
                    {EQUIPMENT_CATEGORY_LABEL[row.category] ?? row.category} ·{" "}
                    {EQUIPMENT_STATUS_LABEL[row.status]}
                  </p>
                  <p className="text-xs text-lotus-500">
                    Patrimônio {row.assetTag ?? "—"} · Série {row.serialNumber ?? "—"}
                  </p>
                  <p className="text-xs text-lotus-500">
                    Sala: {row.roomCode ? `${row.roomCode} — ${row.roomName}` : "Não vinculada"}
                  </p>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => setSelected(row)}
                  >
                    Detalhes
                  </button>
                </article>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Categoria</th>
                  <th className="px-2 py-2">Patrimônio</th>
                  <th className="px-2 py-2">Série</th>
                  <th className="px-2 py-2">Sala</th>
                  <th className="px-2 py-2">Situação</th>
                  <th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-lotus-50">
                    <td className="px-2 py-3 font-medium">{row.name}</td>
                    <td className="px-2 py-3">
                      {EQUIPMENT_CATEGORY_LABEL[row.category] ?? row.category}
                    </td>
                    <td className="px-2 py-3">{row.assetTag ?? "—"}</td>
                    <td className="px-2 py-3">{row.serialNumber ?? "—"}</td>
                    <td className="px-2 py-3">
                      {row.roomCode ? `${row.roomCode}` : "—"}
                    </td>
                    <td className="px-2 py-3">{EQUIPMENT_STATUS_LABEL[row.status]}</td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setSelected(row)}
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-lotus-600">Nenhum equipamento encontrado.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {selected ? (
        <section className="card space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-lotus-900">{selected.name}</h2>
              <p className="mt-1 text-sm text-lotus-600">
                {EQUIPMENT_CATEGORY_LABEL[selected.category] ?? selected.category} ·{" "}
                {EQUIPMENT_STATUS_LABEL[selected.status]}
              </p>
              <p className="mt-1 text-sm text-lotus-700">
                Patrimônio {selected.assetTag ?? "—"} · Série {selected.serialNumber ?? "—"}
              </p>
              <p className="text-sm text-lotus-700">
                Fabricante {selected.manufacturer ?? "—"} · Modelo {selected.model ?? "—"}
              </p>
              <p className="text-sm text-lotus-700">
                Sala:{" "}
                {selected.roomCode
                  ? `${selected.roomCode} — ${selected.roomName}`
                  : "Não vinculada"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => openEdit(selected)}
              >
                Editar
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => {
                  setTransferRoomId(selected.roomId ?? "");
                  setShowTransfer(true);
                }}
              >
                Transferir sala
              </button>
              <button
                type="button"
                className={ghostButtonClass}
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
            </div>
          </div>

          {selected.notes ? (
            <p className="text-sm text-lotus-700">Obs.: {selected.notes}</p>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold">Histórico patrimonial</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-lotus-100 px-3 py-2">
                  {EVENT_LABEL[ev.eventKind] ?? ev.eventKind} ·{" "}
                  {new Date(ev.createdAt).toLocaleString("pt-BR")}
                  {ev.fromRoomId || ev.toRoomId
                    ? ` · sala ${ev.fromRoomId ?? "—"} → ${ev.toRoomId ?? "—"}`
                    : null}
                </li>
              ))}
              {events.length === 0 ? <li>Sem eventos.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}

      {showForm ? (
        <section className="card space-y-3 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">
            {form.id ? "Editar equipamento" : "Novo equipamento"}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              Nome
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Categoria
              <select
                className={fieldClass}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EQUIPMENT_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Situação
              <select
                className={fieldClass}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EQUIPMENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Fabricante
              <input
                className={fieldClass}
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Modelo
              <input
                className={fieldClass}
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Número de série
              <input
                className={fieldClass}
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Patrimônio / código interno
              <input
                className={fieldClass}
                value={form.assetTag}
                onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Data de aquisição
              <input
                type="date"
                className={fieldClass}
                value={form.acquiredOn}
                onChange={(e) => setForm((f) => ({ ...f, acquiredOn: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Sala / localização
              <select
                className={fieldClass}
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
              >
                <option value="">— não vinculada —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              Observações
              <textarea
                className={fieldClass}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void save()}
            >
              Salvar
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {showTransfer && selected ? (
        <section className="card space-y-3 p-4">
          <h2 className="text-lg font-semibold">Transferir equipamento de sala</h2>
          <p className="text-sm text-lotus-600">
            Mantém a identidade do equipamento (patrimônio/série). Não gera saída de estoque
            consumível.
          </p>
          <label className="block text-sm">
            Nova sala
            <select
              className={fieldClass}
              value={transferRoomId}
              onChange={(e) => setTransferRoomId(e.target.value)}
            >
              <option value="">— sem sala —</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Motivo
            <input
              className={fieldClass}
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void submitTransfer()}
            >
              Confirmar transferência
            </button>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={() => setShowTransfer(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
