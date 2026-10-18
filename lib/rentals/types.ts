/** C057 — tipos do módulo Aluguéis/Contratos (reusa rental_contracts). */

export const RENTAL_CONTRACT_STATUSES = [
  "scheduled",
  "active",
  "ended",
  "cancelled",
] as const;

export type RentalContractStatus = (typeof RENTAL_CONTRACT_STATUSES)[number];

export const RENTAL_STATUS_LABEL: Record<RentalContractStatus, string> = {
  scheduled: "Futuro",
  active: "Ativo",
  ended: "Encerrado",
  cancelled: "Cancelado",
};

/** Alerta derivado (não é status persistido). */
export type RentalDisplayStatus = RentalContractStatus | "expiring_soon";

export const RENTAL_DISPLAY_LABEL: Record<RentalDisplayStatus, string> = {
  ...RENTAL_STATUS_LABEL,
  expiring_soon: "Próximo do vencimento",
};

/** Dias para classificar "próximo do vencimento". */
export const RENTAL_EXPIRING_SOON_DAYS = 30;

export type RentalContractRow = {
  id: string;
  organizationId: string;
  roomId: string;
  tenantProfessionalId: string | null;
  tenantName: string;
  tenantSpecialty: string;
  monthlyRentCents: number;
  waterIncluded: boolean;
  electricityIncluded: boolean;
  internetIncluded: boolean;
  startsOn: string;
  endsOn: string | null;
  status: RentalContractStatus;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  contractCode: string | null;
  renewedFromId: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  dueDay: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  endedAt: string | null;
  endReason: string | null;
  roomName?: string | null;
  roomCode?: string | null;
};

export type RentalContractEventRow = {
  id: string;
  contractId: string;
  eventKind: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type RentalDashboardStats = {
  active: number;
  scheduled: number;
  expiringSoon: number;
  ended: number;
  cancelled: number;
  subletRooms: number;
  roomsWithActiveContract: number;
};

export type RentalRoomOption = {
  id: string;
  code: string;
  name: string;
  roomKind: string | null;
};

export type CreateRentalContractInput = {
  organizationId: string;
  roomId: string;
  tenantProfessionalId?: string | null;
  tenantName: string;
  tenantSpecialty: string;
  monthlyRentCents: number;
  startsOn: string;
  endsOn?: string | null;
  dueDay?: number | null;
  notes?: string | null;
};
