/** C062 — tipos do módulo Relatórios (somente metadados / contagens). */

export type ReportsSummary = {
  period: { from: string; to: string; timezone: string };
  patients: { total: number; new_in_period: number };
  appointments: {
    total_in_period: number;
    by_status: Record<string, number>;
    by_kind: Record<string, number>;
    completed: number;
    cancelled: number;
    no_show: number;
    daily: Array<{ day: string; count: number }>;
  };
  encounters: {
    opened_in_period: number;
    signed_in_period: number;
    cancelled_in_period: number;
    returns_opened_in_period: number;
    open_now: number;
  };
  documents: {
    finalized_in_period: number;
    by_kind_finalized: Record<string, number>;
    superseded_in_period: number;
    published_to_portal_in_period: number;
  };
  exam_requests: {
    confirmed_in_period: number;
    draft_in_period: number;
    cancelled_in_period: number;
  };
  prescriptions: {
    signed_in_period: number;
    draft_in_period: number;
    cancelled_in_period: number;
  };
  rentals: {
    active: number;
    scheduled: number;
    ended: number;
    cancelled: number;
    expiring_soon: number;
  };
  rooms: { total: number; active: number };
  clinical_contracts: { obstetric_active: number; procedure_active: number };
  workforce: { active: number; inactive: number };
  stock: {
    items_active: number;
    low_stock: number;
    lots_expired: number;
    lots_expiring_soon: number;
    movements_in_period: number;
    movements_by_kind: Record<string, number>;
  };
  equipment: {
    total: number;
    by_status: Record<string, number>;
  };
  unavailable: Record<string, string>;
};

export type AppointmentDetailRow = {
  id: string;
  scheduled_starts_at: string;
  status: string;
  kind: string;
  practice_id: string;
  professional_id: string;
  room_id: string;
  patient_id: string;
  patient_name: string;
  professional_name: string;
};

export type AppointmentsDetail = {
  total: number;
  limit: number;
  offset: number;
  rows: AppointmentDetailRow[];
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  checked_in: "Check-in",
  in_progress: "Em atendimento",
  completed: "Concluído",
  no_show: "Falta",
  cancelled: "Cancelado",
};

export const APPOINTMENT_KIND_LABEL: Record<string, string> = {
  consultation: "Consulta",
  procedure: "Procedimento",
};

export const DOC_KIND_LABEL: Record<string, string> = {
  receita: "Receitas",
  solicitacao_exames: "Solicitações de exames",
  orientacao: "Orientações",
};

export const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  maintenance: "Manutenção",
  inactive: "Inativo",
  disposed: "Baixado",
  transferred: "Transferido",
};

export const STOCK_MOVEMENT_LABEL: Record<string, string> = {
  receipt: "Entrada",
  pantry_consume: "Saída",
  procedure_consume: "Consumo procedimento",
  transfer: "Transferência",
  adjustment: "Ajuste",
  expiry_writeoff: "Baixa validade",
  return: "Devolução",
};
