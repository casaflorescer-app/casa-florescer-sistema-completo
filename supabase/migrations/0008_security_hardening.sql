-- Endurecimento pontual de RLS (não reescreve o baseline 0001–0007).
--
-- Auditoria: `encounters_clinical_insert` (0001)
--   WITH CHECK usava `pr.practice_id = practice_id` dentro de
--   `EXISTS (SELECT … FROM professionals pr …)`.
--   `professionals` também tem `practice_id`, então o lado direito
--   resolvia para a linha interna e a comparação era tautológica.
--   O INSERT também não exigia `can_read_clinical`, que é quem aplica
--   o teto `clinical_access` (practice vs own_encounters).
--
-- Correção: qualificar as colunas de `encounters` e exigir leitura
-- clínica autorizada na mesma prática/paciente/profissional.

drop policy if exists encounters_clinical_insert on public.encounters;

create policy encounters_clinical_insert on public.encounters
  for insert
  with check (
    public.can_write_clinical(encounters.practice_id)
    and public.can_read_clinical(
      encounters.practice_id,
      encounters.patient_id,
      encounters.professional_id
    )
    and exists (
      select 1
      from public.professionals pr
      where pr.id = encounters.professional_id
        and pr.profile_id = auth.uid()
        and pr.practice_id = encounters.practice_id
    )
  );
