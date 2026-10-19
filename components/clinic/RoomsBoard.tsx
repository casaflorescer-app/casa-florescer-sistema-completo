"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusMessage, buttonClass, fieldClass, ghostButtonClass } from "@/components/platform/Ui";
import { ROOM_NATURE_LABEL, roomNature, type RoomNature } from "@/lib/clinic/room-presentation";
import { listRoomsAdmin, roomsDashboard, upsertRoom } from "@/lib/clinic-mgmt/rooms";
import type { RoomAdminRow } from "@/lib/clinic-mgmt/types";

const NATURE_CLASS: Record<RoomNature, string> = {
  propria: "border-lotus-200 bg-white text-lotus-800",
  locada: "border-lotus-200 bg-lotus-50 text-lotus-800",
  compartilhada: "border-lotus-300 bg-lotus-100/70 text-lotus-900",
  operacional: "border-lotus-100 bg-white text-lotus-600",
};

const ROOM_KINDS = [
  { value: "house_consultorio", label: "Consultório da casa" },
  { value: "sublet_consultorio", label: "Consultório locado" },
  { value: "procedure", label: "Procedimentos" },
  { value: "pharmacy", label: "Farmácia" },
  { value: "reception", label: "Recepção" },
];

export function RoomsBoard() {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;
  const [rows, setRows] = useState<RoomAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoomAdminRow | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [roomKind, setRoomKind] = useState("sublet_consultorio");
  const [status, setStatus] = useState<"active" | "maintenance" | "inactive">("active");
  const [sortOrder, setSortOrder] = useState(0);

  const stats = useMemo(() => roomsDashboard(rows), [rows]);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listRoomsAdmin(orgId));
    } catch {
      setRows([]);
      setError("Não foi possível carregar as salas.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate() {
    setEditing(null);
    setCode("");
    setName("");
    setRoomKind("sublet_consultorio");
    setStatus("active");
    setSortOrder(rows.length + 1);
  }

  function startEdit(row: RoomAdminRow) {
    setEditing(row);
    setCode(row.code);
    setName(row.name);
    setRoomKind(row.roomKind ?? "sublet_consultorio");
    setStatus((row.status as "active" | "maintenance" | "inactive") || "active");
    setSortOrder(row.sortOrder);
  }

  async function onSave() {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await upsertRoom({
        organizationId: orgId,
        id: editing?.id,
        code,
        name,
        roomKind,
        isHouse: roomKind === "house_consultorio",
        status,
        sortOrder,
        occupantProfessionalId: editing?.occupantProfessionalId ?? null,
      });
      setNotice(editing ? "Sala atualizada." : "Sala cadastrada.");
      startCreate();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a sala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Gestão Clínica</p>
      <h1 className="page-title mt-1">Gestão de Salas</h1>
      <p className="page-sub mt-2">
        Cadastro operacional de salas. Locação permanece em{" "}
        <Link className="underline" href="/app/rentals">
          Aluguéis
        </Link>
        . Locatário ≠ funcionário.
      </p>
      <StatusMessage error={error} notice={notice} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Cadastradas", stats.total],
          ["Ativas", stats.active],
          ["Com titular/locatária", stats.occupied],
          ["Sublet disponíveis", stats.available],
          ["Manutenção", stats.maintenance],
        ].map(([label, value]) => (
          <div key={String(label)} className="card">
            <p className="text-xs uppercase tracking-wide text-lotus-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-lotus-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          {loading ? <p className="text-sm text-lotus-600">Carregando salas…</p> : null}
          {!loading && rows.length === 0 ? (
            <section className="card text-sm text-lotus-700">Nenhuma sala cadastrada.</section>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((room) => {
              const nature = roomNature({ roomKind: room.roomKind, isHouse: room.isHouse });
              return (
                <li key={room.id}>
                  <article className="card flex h-full flex-col gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{room.code}</p>
                      <h2 className="mt-1 text-base font-semibold text-lotus-900">{room.name}</h2>
                      <p className="mt-1 text-xs text-lotus-600">Status: {room.status}</p>
                    </div>
                    <p>
                      <span className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Natureza</span>
                      <span className="mt-1 block">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${NATURE_CLASS[nature]}`}
                        >
                          {nature === "compartilhada" ? "Uso compartilhado" : ROOM_NATURE_LABEL[nature]}
                        </span>
                      </span>
                    </p>
                    <p className="text-sm text-lotus-900">
                      <span className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                        {nature === "locada" ? "Locatária" : "Titular"}
                      </span>
                      <span className="mt-1 block">{room.holderName ?? "—"}</span>
                    </p>
                    <button type="button" className={ghostButtonClass} onClick={() => startEdit(room)}>
                      Editar
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="card h-fit">
          <h2 className="text-base font-semibold text-lotus-900">{editing ? "Editar sala" : "Nova sala"}</h2>
          <label className="mt-3 block text-sm">
            Código
            <input className={fieldClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm">
            Nome
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm">
            Tipo
            <select className={fieldClass} value={roomKind} onChange={(e) => setRoomKind(e.target.value)}>
              {ROOM_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Situação
            <select
              className={fieldClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "maintenance" | "inactive")}
            >
              <option value="active">Ativa</option>
              <option value="maintenance">Manutenção</option>
              <option value="inactive">Inativa</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Ordem
            <input
              className={fieldClass}
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !code.trim() || !name.trim()}
              onClick={() => void onSave()}
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {editing ? (
              <button type="button" className={ghostButtonClass} onClick={startCreate}>
                Cancelar
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
