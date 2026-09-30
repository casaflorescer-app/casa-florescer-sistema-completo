-- C032.1 — Formalizar restrição de appointment_predictions (governança)
-- A policy appointment_predictions_patient_select foi removida no remoto após a 0023
-- para impedir leitura de prediction_reason por paciente. Esta migration registra
-- essa correção de forma reproduzível e idempotente.
-- NÃO recria a policy de paciente.
-- NÃO altera appointments, RPCs, prontuário, obstetrícia nem catálogo.

drop policy if exists appointment_predictions_patient_select
  on public.appointment_predictions;

comment on table public.appointment_predictions is
  'C032.1: histórico versionável de previsões (uso interno/staff). Motor de recálculo fica para etapa futura. Nunca sobrescreve starts_at/ends_at nem scheduled_*. prediction_reason é interno e não deve ser exposto à paciente.';

comment on column public.appointment_predictions.prediction_reason is
  'C032.1: motivo operacional interno (ex.: atraso, emergência). NÃO expor à paciente. Camada pública/sanitizada fica para etapa futura.';
