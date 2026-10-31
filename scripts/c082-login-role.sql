-- Papel de conexão da aplicação. Fora de transação, depois de scripts/c076-roles.sql.
-- Sem senha neste arquivo. A senha só entra na conexão quando essa ligação for autorizada.

select 'create role casa_login login nosuperuser nobypassrls nocreatedb nocreaterole'
where not exists (select 1 from pg_roles where rolname = 'casa_login')
\gexec

grant casa_app to casa_login;
grant authenticated to casa_login;
