export type RoomNature = "propria" | "locada" | "compartilhada" | "operacional";

export const ROOM_NATURE_LABEL: Record<RoomNature, string> = {
  propria: "Própria",
  locada: "Locada",
  compartilhada: "Compartilhada",
  operacional: "Operacional",
};

/** Natureza física a partir de room_kind e do marcador is_house. Não usa o nome da sala. */
export function roomNature(input: {
  roomKind: string | null | undefined;
  isHouse: boolean;
}): RoomNature {
  if (input.roomKind === "procedure") return "compartilhada";
  if (input.roomKind === "pharmacy" || input.roomKind === "reception") return "operacional";
  if (input.roomKind === "house_consultorio") return "propria";
  if (input.roomKind === "sublet_consultorio") return "locada";
  return input.isHouse ? "propria" : "locada";
}

/**
 * A sala própria não tem profissional titular no banco.
 * O nome gravado na sala é o rótulo operacional já definido pela clínica.
 * Só associa quando o nome termina exatamente com o nome do profissional.
 */
export function roomNameEndsWithProfessional(roomName: string, fullName: string): boolean {
  const name = fullName.trim();
  if (name.length < 3) return false;
  return roomName.trim().endsWith(name);
}
