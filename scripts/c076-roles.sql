-- Papéis do Postgres próprio. Rodar fora de transação, antes de 0000.
-- psql "postgresql://.../BancoFlorescerPP" -v ON_ERROR_STOP=1 -f scripts/c076-roles.sql
-- Não cria senha, usuário da clínica nem organização. Não aplicar sem autorização.

select 'create role anon nologin'
where not exists (select 1 from pg_roles where rolname = 'anon')
\gexec

select 'create role authenticated nologin'
where not exists (select 1 from pg_roles where rolname = 'authenticated')
\gexec

select 'create role service_role nologin'
where not exists (select 1 from pg_roles where rolname = 'service_role')
\gexec

select 'create role casa_app nologin'
where not exists (select 1 from pg_roles where rolname = 'casa_app')
\gexec
