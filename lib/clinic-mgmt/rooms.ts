"use client";

import { createClient } from "@/lib/supabase/client";
import type { RoomAdminRow } from "@/lib/clinic-mgmt/types";
import { parseRoomOccupancy, singleOccupancyForRoom } from "@/lib/clinic/room-occupancy";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

export async function listRoomsAdmin(organizationId: string): Promise<RoomAdminRow[]> {
  const supabase = requireClient();
  const [roomsResult, occupancyResult] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, code, name, room_kind, is_house, status, sort_order, occupant_professional_id, organization_id")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("code"),
    supabase.from("room_occupancy_labels").select("room_id, professional_id, professional_name, occupancy"),
  ]);
  if (roomsResult.error) throw new Error(roomsResult.error.message);
  const occupancy = (occupancyResult.data ?? []).flatMap((item) => {
    const row = parseRoomOccupancy(item);
    return row ? [row] : [];
  });
  return (roomsResult.data ?? []).flatMap((item) => {
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : null;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!id || !name) return [];
    const assigned = singleOccupancyForRoom(occupancy, id);
    return [
      {
        id,
        code: typeof r.code === "string" ? r.code : "",
        name,
        roomKind: typeof r.room_kind === "string" ? r.room_kind : null,
        isHouse: r.is_house === true,
        status: typeof r.status === "string" ? r.status : "active",
        sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
        occupantProfessionalId:
          typeof r.occupant_professional_id === "string" ? r.occupant_professional_id : null,
        holderName: assigned?.professionalName ?? null,
      },
    ];
  });
}

export async function upsertRoom(input: {
  organizationId: string;
  id?: string;
  code: string;
  name: string;
  roomKind: string;
  isHouse: boolean;
  status: "active" | "maintenance" | "inactive";
  sortOrder?: number;
  occupantProfessionalId?: string | null;
}) {
  const supabase = requireClient();
  const payload = {
    organization_id: input.organizationId,
    code: input.code.trim(),
    name: input.name.trim(),
    room_kind: input.roomKind,
    is_house: input.isHouse,
    status: input.status,
    sort_order: input.sortOrder ?? 0,
    occupant_professional_id:
      input.roomKind === "house_consultorio" ? input.occupantProfessionalId || null : null,
  };
  if (input.id) {
    const { error } = await supabase.from("rooms").update(payload).eq("id", input.id).eq("organization_id", input.organizationId);
    if (error) throw new Error(error.message);
    return input.id;
  }
  const { data, error } = await supabase.from("rooms").insert(payload).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return String((data as { id?: string } | null)?.id ?? "");
}

export function roomsDashboard(rows: RoomAdminRow[]) {
  const active = rows.filter((r) => r.status === "active");
  const withHolder = active.filter((r) => Boolean(r.holderName));
  return {
    total: rows.length,
    active: active.length,
    available: active.filter((r) => !r.holderName && r.roomKind === "sublet_consultorio").length,
    occupied: withHolder.length,
    maintenance: rows.filter((r) => r.status === "maintenance").length,
  };
}
