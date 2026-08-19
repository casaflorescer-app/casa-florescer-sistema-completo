import type { AgendaAlert } from "../types/database";

export const previewAlerts: AgendaAlert[] = [
  {
    id: "alert-1",
    organization_id: "org",
    practice_id: "preview-house",
    appointment_id: "apt-9",
    audience: "all_staff",
    severity: "urgent",
    title: "Parto em andamento — Dra. Samara",
    body: "Agenda da tarde precisa de remarcação em massa. Secretarias: avisar as 6 pacientes de 14h–18h.",
    created_at: new Date().toISOString(),
    acknowledged_at: null,
  },
];

export const obstetricBoard = [
  {
    patient: "Carla Menezes",
    edd: "2026-08-22",
    week: "38s2d",
    risk: "Habitual",
    demand: "Alta — janela de parto",
  },
  {
    patient: "Juliana Prado",
    edd: "2026-08-28",
    week: "37s1d",
    risk: "Hipertensão",
    demand: "Retorno amanhã",
  },
  {
    patient: "Patrícia Nunes",
    edd: "2026-09-14",
    week: "34s4d",
    risk: "Habitual",
    demand: "Consulta de pré-natal",
  },
];

export const capacityRules = [
  { kind: "consultation" as const, max: 14, booked: 9, label: "Consultas / dia" },
  { kind: "procedure" as const, max: 4, booked: 2, label: "Procedimentos / dia" },
];

export const examQueue = [
  { patient: "Marina Alves", title: "US obstétrico", status: "available" as const },
  { patient: "Helena Dias", title: "Papanicolau", status: "pending" as const },
  { patient: "Rita Lopes", title: "Mamografia", status: "picked_up" as const },
];
