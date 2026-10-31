-- Preparo do cadastro inicial. Não contém senha, e-mail real nem CNPJ real.
-- Recusa a execução. O primeiro administrador principal não nasce pela função
-- casa_staff_create, porque ela exige um SYSTEM_ADMIN já ativo.
-- Quando houver autorização e os dados, a ordem é:
-- 1. organizations (Casa Florescer)
-- 2. duas practice_units house, Samara e Thais
-- 3. auth.users, profiles, staff_credentials e system_admins do administrador principal
-- 4. os demais usuários por casa_staff_create, já com a sessão desse administrador
-- A secretária entra nas duas práticas, sem caixa e sem prontuário.
-- A administradora entra nas duas práticas, sem prontuário e sem SYSTEM_ADMIN.
-- Cada médica entra só na própria prática, com a própria caixa.

do $$
begin
  raise exception 'C083_BOOTSTRAP_RECUSADO';
end $$;
