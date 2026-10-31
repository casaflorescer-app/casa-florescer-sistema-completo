-- C041 DRAFT — NÃO APLICAR sem autorização expressa.
-- Motivo: contas das sócias (Samara/Thais) constam como physician sem role owner
-- na CASA, então Gestão Clínica (owner|admin) não aparece no menu.
-- Esta migration é esboço idempotente; revisão humana obrigatória antes de db push.
--
-- Impacto: adiciona user_practice_roles.role = 'owner' onde já existe physician
-- para perfis identificados. RLS/grants inalterados (role já existente).
-- Rollback: delete das linhas owner criadas com o marcador de comentário abaixo.

-- PLACEHOLDER: preencher user_id após auditoria autorizada.
-- Exemplo (NÃO executar até autorização):
--
-- insert into public.user_practice_roles (
--   user_id, practice_id, role, clinical_access
-- )
-- select p.id, '7673bc0e-a789-4edd-b32f-392e407cc062', 'owner', 'practice'
-- from public.profiles p
-- where p.id in ('USER_ID_SAMARA', 'USER_ID_THAIS')
--   and not exists (
--     select 1 from public.user_practice_roles x
--     where x.user_id = p.id
--       and x.practice_id = '7673bc0e-a789-4edd-b32f-392e407cc062'
--       and x.role = 'owner'
--   );
--
-- comment: C041 partner owner grant

select 1; -- no-op enquanto draft
