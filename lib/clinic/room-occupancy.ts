export type RoomOccupancyKind = "propria" | "locada";

export type RoomOccupancy = {
  roomId: string;
  professionalId: string;
  professionalName: string;
  occupancy: RoomOccupancyKind;
};

export function parseRoomOccupancy(value: unknown): RoomOccupancy | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const roomId = typeof record.room_id === "string" ? record.room_id : null;
  const professionalId = typeof record.professional_id === "string" ? record.professional_id : null;
  const professionalName =
    typeof record.professional_name === "string" ? record.professional_name.trim() : "";
  const occupancy = record.occupancy === "propria" || record.occupancy === "locada" ? record.occupancy : null;
  if (!roomId || !professionalId || !professionalName || !occupancy) return null;
  return { roomId, professionalId, professionalName, occupancy };
}

export function singleOccupancyForProfessional(
  rows: RoomOccupancy[],
  professionalId: string,
): RoomOccupancy | null {
  const matches = rows.filter((row) => row.professionalId === professionalId);
  return matches.length === 1 ? matches[0] : null;
}

export function singleOccupancyForRoom(rows: RoomOccupancy[], roomId: string): RoomOccupancy | null {
  const matches = rows.filter((row) => row.roomId === roomId);
  return matches.length === 1 ? matches[0] : null;
}
