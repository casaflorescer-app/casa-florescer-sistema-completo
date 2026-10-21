/**
 * Modelos administrativos de mensagem WhatsApp Web.
 * Sem conteúdo clínico sensível nas strings enviáveis.
 */

export type AppointmentMessageVars = {
  patientName: string;
  dateLabel?: string;
  timeLabel?: string;
  professionalName?: string;
  roomName?: string;
  kindLabel?: string;
};

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || "paciente";
}

export function buildAdministrativeHelloMessage(patientName: string): string {
  const name = firstName(patientName);
  return [
    `Olá, ${name}.`,
    "",
    "Aqui é da Casa Florescer.",
    "Estamos entrando em contato. Caso precise de alguma informação, estamos à disposição.",
  ].join("\n");
}

export function buildAppointmentConfirmationMessage(vars: AppointmentMessageVars): string {
  const name = firstName(vars.patientName);
  const lines = [
    `Olá, ${name}.`,
    "",
    "Aqui é da Casa Florescer.",
    "Estamos entrando em contato para confirmar seu atendimento.",
  ];
  if (vars.dateLabel) lines.push(`Data: ${vars.dateLabel}`);
  if (vars.timeLabel) lines.push(`Horário: ${vars.timeLabel}`);
  if (vars.professionalName) lines.push(`Profissional: ${vars.professionalName}`);
  if (vars.roomName) lines.push(`Sala: ${vars.roomName}`);
  if (vars.kindLabel) lines.push(`Tipo: ${vars.kindLabel}`);
  lines.push("", "Caso precise de alguma informação, estamos à disposição.");
  return lines.join("\n");
}

export function buildAppointmentReminderMessage(vars: AppointmentMessageVars): string {
  const name = firstName(vars.patientName);
  const lines = [
    `Olá, ${name}.`,
    "",
    "Aqui é da Casa Florescer.",
    "Lembrete do seu atendimento.",
  ];
  if (vars.dateLabel) lines.push(`Data: ${vars.dateLabel}`);
  if (vars.timeLabel) lines.push(`Horário: ${vars.timeLabel}`);
  lines.push("", "Caso precise reagendar, fale conosco.");
  return lines.join("\n");
}

export function buildDocumentAvailableMessage(patientName: string): string {
  const name = firstName(patientName);
  return [
    `Olá, ${name}.`,
    "",
    "Aqui é da Casa Florescer.",
    "Há uma informação administrativa referente ao seu atendimento.",
    "Se precisar, entre em contato com a clínica.",
    "",
    "(Se for anexar um documento, faça-o manualmente no WhatsApp após revisar esta mensagem.)",
  ].join("\n");
}

export function buildClinicContactMessage(patientName: string): string {
  return buildAdministrativeHelloMessage(patientName);
}

export const WHATSAPP_FEEDBACK_OPENED =
  "WhatsApp Web foi aberto. Revise a mensagem e clique em enviar no próprio WhatsApp.";

export const WHATSAPP_FEEDBACK_DOCUMENT =
  "WhatsApp Web aberto. Revise a mensagem e, se necessário, anexe o documento manualmente antes de enviar.";
