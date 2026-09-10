-- FASE B3.3 - Revogar god-mode clinico de SYSTEM_ADMIN em patients
--
-- Evidencia (auditoria B3.3):
--   policy patients_system_admin / patient_practice_links_system_admin
--   em 0007_authorization_seal.sql: FOR ALL usando is_system_admin().
--
-- Objetivo 9: SYSTEM_ADMIN nao deve receber acesso clinico automatico.
-- Gestacao / B1 / B2 ja NAO usam is_system_admin nas policies (0011-0015).
--
-- NAO aplicar via db push sem autorizacao explicita.
-- Apos aplicar: revalidar login SA, /app/system, e SELECT em patients
-- com papel autenticado SA sem membership clinica.

drop policy if exists patients_system_admin on public.patients;
drop policy if exists patient_practice_links_system_admin on public.patient_practice_links;

comment on table public.patients is
  'Cadastro de pacientes. Acesso via membership/RLS de pratica. SYSTEM_ADMIN nao tem FOR ALL clinico (B3.3).';
