"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusMessage } from "@/components/platform/Ui";
import {
  ROOM_NATURE_LABEL,
  roomNameEndsWithProfessional,
  roomNature,
  type RoomNature,
} from "@/lib/clinic/room-presentation";

type RoomRow = {
  id: string;
  name: string;
  roomKind: string | null;
  isHouse: boolean;
};

type ContractRow = {
  roomId: string;
  tenantProfessionalId: string;
};

type ProfessionalCard = {
  id: string;
  fullName: string;
  profession: string;
  roomName: string;
  nature: RoomNature | null;
  statusLabel: string;
};

function oneRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

export function ProfessionalsBoard() {
  const [rows, setRows] = useState<ProfessionalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError("Autenticação não configurada neste ambiente.");
      setLoading(false);
      return;
    }

    void (async () => {
      const [professionals, roomsResult, contractsResult] = await Promise.all([
        supabase
          .from("professionals")
          .select(
            "id, council_type, practice_id, profiles(full_name, is_active), practice_units(specialty)",
          ),
        supabase
          .from("rooms")
          .select("id, name, room_kind, is_house, status")
          .eq("status", "active"),
        supabase
          .from("rental_contracts")
          .select("room_id, tenant_professional_id, status, is_active")
          .eq("is_active", true),
      ]);

      if (professionals.error || roomsResult.error) {
        setRows([]);
        setError("Não foi possível carregar os profissionais.");
        return;
      }

      const rooms: RoomRow[] = (roomsResult.data ?? []).flatMap((item) => {
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (!id || !name) return [];
        return [
          {
            id,
            name,
            roomKind: typeof record.room_kind === "string" ? record.room_kind : null,
            isHouse: record.is_house === true,
          },
        ];
      });

      const contracts: ContractRow[] = contractsResult.error
        ? []
        : (contractsResult.data ?? []).flatMap((item) => {
            const record = item as Record<string, unknown>;
            const roomId = typeof record.room_id === "string" ? record.room_id : null;
            const tenantProfessionalId =
              typeof record.tenant_professional_id === "string" ? record.tenant_professional_id : null;
            const status = typeof record.status === "string" ? record.status : "";
            if (!roomId || !tenantProfessionalId) return [];
            if (record.is_active !== true) return [];
            if (status !== "active" && status !== "scheduled") return [];
            return [{ roomId, tenantProfessionalId }];
          });

      const cards = (professionals.data ?? []).flatMap((item) => {
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        if (!id) return [];
        const profile = oneRecord(record.profiles);
        const practice = oneRecord(record.practice_units);
        const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
        const specialty = typeof practice?.specialty === "string" ? practice.specialty.trim() : "";
        const council = typeof record.council_type === "string" ? record.council_type.trim() : "";
        const isActive = profile?.is_active;
        const contract = contracts.find((entry) => entry.tenantProfessionalId === id);
        const contractedRoom = contract ? rooms.find((room) => room.id === contract.roomId) : undefined;
        const namedMatches = rooms.filter(
          (room) =>
            room.roomKind !== "procedure" &&
            room.roomKind !== "pharmacy" &&
            room.roomKind !== "reception" &&
            fullName.length > 0 &&
            roomNameEndsWithProfessional(room.name, fullName),
        );
        const room = contractedRoom ?? (namedMatches.length === 1 ? namedMatches[0] : null);
        return [
          {
            id,
            fullName: fullName || "Profissional",
            profession: specialty || council || "—",
            roomName: room?.name ?? "Sala não vinculada",
            nature: room ? roomNature({ roomKind: room.roomKind, isHouse: room.isHouse }) : null,
            statusLabel: isActive === false ? "Inativa" : isActive === true ? "Ativa" : "—",
          },
        ];
      });

      cards.sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
      setRows(cards);
      setError(null);
    })()
      .catch(() => {
        setRows([]);
        setError("Não foi possível carregar os profissionais.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">Clínica</p>
      <h1 className="page-title mt-1">Profissionais</h1>
      <p className="page-sub mt-2">Médicas da casa, sala fixa e situação do cadastro.</p>
      <StatusMessage error={error} />
      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando profissionais…</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <section className="card mt-6 text-sm text-lotus-700">Nenhum profissional visível.</section>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <article className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-start">
                <Field label="Nome" value={row.fullName} strong />
                <Field label="Profissão" value={row.profession} />
                <Field label="Sala" value={row.roomName} />
                <Field label="Natureza" value={row.nature ? ROOM_NATURE_LABEL[row.nature] : "—"} />
                <Field label="Situação" value={row.statusLabel} />
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">{label}</p>
      <p className={`mt-1 text-sm text-lotus-900 ${strong ? "font-semibold" : ""}`}>{value}</p>
    </div>
  );
}
