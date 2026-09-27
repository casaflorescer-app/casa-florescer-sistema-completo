"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage } from "@/components/platform/Ui";
import { ROOM_NATURE_LABEL, roomNature, type RoomNature } from "@/lib/clinic/room-presentation";

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
      const [result, labelsResult, contractsResult] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, code, name, room_kind, is_house, status, sort_order, occupant_professional_id")
          .eq("status", "active")
          .order("sort_order")
          .order("code"),
        supabase.from("professional_labels").select("id, full_name"),
        supabase
          .from("rental_contracts")
          .select("room_id, tenant_professional_id, tenant_name, status, is_active")
          .eq("is_active", true),
      ]);
      if (cancelled) return;
      if (result.error) {
        setRows([]);
        setError("Não foi possível carregar as salas.");
        return;
      }
      const names = new Map<string, string>();
      for (const item of labelsResult.data ?? []) {
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        const fullName = typeof record.full_name === "string" ? record.full_name.trim() : "";
        if (id && fullName) names.set(id, fullName);
      }
      const tenantsByRoom = new Map<string, string[]>();
      if (!contractsResult.error) {
        for (const item of contractsResult.data ?? []) {
          const record = item as Record<string, unknown>;
          const roomId = typeof record.room_id === "string" ? record.room_id : null;
          const status = typeof record.status === "string" ? record.status : "";
          if (!roomId || record.is_active !== true) continue;
          if (status !== "active" && status !== "scheduled") continue;
          const tenantId =
            typeof record.tenant_professional_id === "string" ? record.tenant_professional_id : null;
          const tenantName =
            typeof record.tenant_name === "string" && record.tenant_name.trim()
              ? record.tenant_name.trim()
              : tenantId
                ? names.get(tenantId) ?? ""
                : "";
          if (!tenantName) continue;
          const current = tenantsByRoom.get(roomId) ?? [];
          current.push(tenantName);
          tenantsByRoom.set(roomId, current);
        }
      }
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
        const occupantId =
          typeof record.occupant_professional_id === "string" ? record.occupant_professional_id : null;
        const tenants = tenantsByRoom.get(id) ?? [];
        const holder =
          nature === "propria"
            ? { holderLabel: "Titular", holderValue: occupantId ? names.get(occupantId) ?? "—" : "—" }
            : nature === "locada"
              ? { holderLabel: "Locatária", holderValue: tenants.length === 1 ? tenants[0] : "—" }
              : { holderLabel: "Titular", holderValue: "nenhum" };
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
