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
