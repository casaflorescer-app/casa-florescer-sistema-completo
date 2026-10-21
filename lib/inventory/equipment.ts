"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  EquipmentEventRow,
  EquipmentRow,
  EquipmentStatus,
  RoomOption,
} from "@/lib/inventory/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function mapEquipment(
  row: Record<string, unknown>,
  room?: { code?: string; name?: string } | null,
): EquipmentRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name ?? ""),
    category: String(row.category ?? "geral"),
    manufacturer: (row.manufacturer as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serialNumber: (row.serial_number as string | null) ?? null,
    assetTag: (row.asset_tag as string | null) ?? null,
    acquiredOn: (row.acquired_on as string | null) ?? null,
    roomId: (row.room_id as string | null) ?? null,
    roomCode: room?.code ?? null,
    roomName: room?.name ?? null,
    status: (row.status as EquipmentStatus) ?? "active",
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapRpcError(message: string): string {
  if (message.includes("EQUIPMENT_FORBIDDEN") || message.includes("FORBIDDEN")) {
    return "Sem permissão para equipamentos (owner/admin ou can_manage_stock).";
  }
  if (message.includes("EQUIPMENT_NAME_REQUIRED")) {
    return "Informe o nome do equipamento.";
  }
  if (message.includes("EQUIPMENT_STATUS_INVALID")) {
    return "Situação do equipamento inválida.";
  }
  if (message.includes("EQUIPMENT_NOT_FOUND")) {
    return "Equipamento não encontrado nesta organização.";
  }
  if (message.includes("EQUIPMENT_ROOM_NOT_FOUND")) {
    return "Sala/localização não encontrada nesta organização.";
  }
  if (message.includes("EQUIPMENT_TRANSFER_SAME_ROOM")) {
    return "Origem e destino da transferência devem ser diferentes.";
  }
  if (message.includes("duplicate key") && message.includes("asset")) {
    return "Já existe equipamento com este patrimônio nesta organização.";
  }
  if (message.includes("duplicate key") && message.includes("serial")) {
    return "Já existe equipamento com este número de série nesta organização.";
  }
  if (
    /Could not find|schema cache|relation|clinic_equipment/i.test(message) ||
    /does not exist/i.test(message)
  ) {
    return "Estrutura de equipamentos ainda não aplicada no banco (migration 0053).";
  }
  return message;
}

export async function listStockRooms(organizationId: string): Promise<RoomOption[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    code: String((r as { code: string }).code ?? ""),
    name: String((r as { name: string }).name ?? ""),
  }));
}

export async function listEquipment(params: {
  organizationId: string;
  search?: string;
  status?: string;
  category?: string;
  roomId?: string;
  limit?: number;
}): Promise<EquipmentRow[]> {
  const supabase = requireClient();
  let q = supabase
    .from("clinic_equipment")
    .select(
      "id, organization_id, name, category, manufacturer, model, serial_number, asset_tag, acquired_on, room_id, status, notes, created_at, updated_at",
    )
    .eq("organization_id", params.organizationId)
    .order("name")
    .limit(Math.min(params.limit ?? 200, 500));

  if (params.status && params.status !== "all") q = q.eq("status", params.status);
  if (params.category && params.category !== "all") q = q.eq("category", params.category);
  if (params.roomId && params.roomId !== "all") q = q.eq("room_id", params.roomId);

  const { data, error } = await q;
  if (error) throw new Error(mapRpcError(error.message));

  const roomIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { room_id: string | null }).room_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomMap = new Map<string, { code: string; name: string }>();
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, code, name")
      .in("id", roomIds);
    for (const r of rooms ?? []) {
      roomMap.set(String((r as { id: string }).id), {
        code: String((r as { code: string }).code ?? ""),
        name: String((r as { name: string }).name ?? ""),
      });
    }
  }

  let rows = (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    const roomId = (rec.room_id as string | null) ?? null;
    return mapEquipment(rec, roomId ? roomMap.get(roomId) : null);
  });

  const search = params.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (e) =>
        e.name.toLowerCase().includes(search) ||
        (e.assetTag ?? "").toLowerCase().includes(search) ||
        (e.serialNumber ?? "").toLowerCase().includes(search) ||
        (e.manufacturer ?? "").toLowerCase().includes(search) ||
        (e.model ?? "").toLowerCase().includes(search),
    );
  }
  return rows;
}

export async function listEquipmentEvents(
  equipmentId: string,
  limit = 40,
): Promise<EquipmentEventRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("clinic_equipment_events")
    .select(
      "id, equipment_id, event_kind, from_room_id, to_room_id, detail, created_at, actor_id",
    )
    .eq("equipment_id", equipmentId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 100));
  if (error) throw new Error(mapRpcError(error.message));
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      equipmentId: String(row.equipment_id),
      eventKind: String(row.event_kind),
      fromRoomId: (row.from_room_id as string | null) ?? null,
      toRoomId: (row.to_room_id as string | null) ?? null,
      detail: (row.detail as Record<string, unknown>) ?? {},
      createdAt: String(row.created_at),
      actorId: (row.actor_id as string | null) ?? null,
    };
  });
}

export async function upsertEquipment(payload: Record<string, unknown>): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("clinic_equipment_upsert", {
    p_payload: payload,
  });
  if (error) throw new Error(mapRpcError(error.message));
  if (!data) throw new Error("Equipamento sem identificador retornado.");
  return String(data);
}

export async function transferEquipment(payload: Record<string, unknown>): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("clinic_equipment_transfer", {
    p_payload: payload,
  });
  if (error) throw new Error(mapRpcError(error.message));
  if (!data) throw new Error("Transferência sem identificador retornado.");
  return String(data);
}

export async function countEquipmentStats(organizationId: string): Promise<{
  total: number;
  maintenance: number;
}> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("clinic_equipment")
    .select("id, status")
    .eq("organization_id", organizationId);
  if (error) {
    if (/Could not find|schema cache|relation|does not exist/i.test(error.message)) {
      return { total: 0, maintenance: 0 };
    }
    throw new Error(mapRpcError(error.message));
  }
  const rows = data ?? [];
  return {
    total: rows.length,
    maintenance: rows.filter((r) => (r as { status: string }).status === "maintenance").length,
  };
}
