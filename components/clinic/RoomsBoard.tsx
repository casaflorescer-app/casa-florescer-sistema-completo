"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage } from "@/components/platform/Ui";
import { ROOM_NATURE_LABEL, roomNature, type RoomNature } from "@/lib/clinic/room-presentation";
import { parseRoomOccupancy, singleOccupancyForRoom } from "@/lib/clinic/room-occupancy";

type RoomCard = {
  id: string;
  code: string;
  name: string;
  nature: RoomNature;
  holderLabel: string;
  holderValue: string;
  sortOrder: number;
};

const NATURE_CLASS: Record<RoomNature, string> = {
  propria: "border-lotus-200 bg-white text-lotus-800",
  locada: "border-lotus-200 bg-lotus-50 text-lotus-800",
  compartilhada: "border-lotus-300 bg-lotus-100/70 text-lotus-900",
  operacional: "border-lotus-100 bg-white text-lotus-600",
};

export function RoomsBoard() {
  const [rows, setRows] = useState<RoomCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [result, occupancyResult] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, code, name, room_kind, is_house, status, sort_order")
          .eq("status", "active")
          .order("sort_order")
          .order("code"),
        supabase
          .from("room_occupancy_labels")
          .select("room_id, professional_id, professional_name, occupancy"),
      ]);
      if (cancelled) return;
      if (result.error || occupancyResult.error) {
        setRows([]);
        setError("Não foi possível carregar as salas.");
        return;
      }
      const occupancy = (occupancyResult.data ?? []).flatMap((item) => {
        const row = parseRoomOccupancy(item);
        return row ? [row] : [];
      });
      const cards = (result.data ?? []).flatMap((item) => {
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        const code = typeof record.code === "string" ? record.code : "";
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (!id || !name) return [];
        const roomKind = typeof record.room_kind === "string" ? record.room_kind : null;
        const isHouse = record.is_house === true;
        const sortOrder = typeof record.sort_order === "number" ? record.sort_order : 0;
        const nature = roomNature({ roomKind, isHouse });
        const assigned = singleOccupancyForRoom(occupancy, id);
        const holder =
          nature === "compartilhada" || nature === "operacional"
            ? { holderLabel: "Titular", holderValue: "nenhum" }
            : {
                holderLabel: nature === "locada" ? "Locatária" : "Titular",
                holderValue: assigned?.professionalName ?? "—",
              };
        return [{ id, code, name, nature, sortOrder, ...holder }];
      });
      cards.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
      setRows(cards);
      setError(null);
    })()
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError("Não foi possível carregar as salas.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">Salas</h1>
      <p className="page-sub mt-2">
        Consultórios fixos da casa e a sala compartilhada de procedimentos.
      </p>
      <StatusMessage error={error} />
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando salas…</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <section className="card mt-6 text-sm text-lotus-700">Nenhuma sala ativa visível.</section>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((room) => (
            <li key={room.id}>
              <article className="card flex h-full flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                    {room.code}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-lotus-900">{room.name}</h2>
                </div>
                <p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-lotus-500">Natureza</span>
                  <span className="mt-1 block">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${NATURE_CLASS[room.nature]}`}
                    >
                      {room.nature === "compartilhada" ? "Uso compartilhado" : ROOM_NATURE_LABEL[room.nature]}
                    </span>
                  </span>
                </p>
                <p className="text-sm text-lotus-900">
                  <span className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                    {room.holderLabel}
                  </span>
                  <span className="mt-1 block">{room.holderValue}</span>
                </p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
