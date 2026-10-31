-- Privilégios do papel authenticated depois das migrations.
-- Não devolve staff_credentials nem casa_sessions. Não concede staff_login_hash.

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
grant usage on schema storage to authenticated;
grant usage on schema extensions to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on table public.staff_credentials from authenticated;
revoke all on table public.casa_sessions from authenticated;

grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  r record;
begin
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype = 'e'
  loop
    execute format('grant usage on type public.%I to authenticated', r.typname);
  end loop;
end $$;

revoke all on function public.staff_login_hash(text) from authenticated;
revoke all on function public.casa_session_start(uuid, uuid, timestamptz) from authenticated;
revoke all on function public.casa_session_active(uuid) from authenticated;
revoke all on function public.casa_session_revoke(uuid) from authenticated;
revoke all on function public.casa_sessions_revoke_user(uuid) from authenticated;
revoke all on function public.casa_staff_hash(uuid) from authenticated;
revoke all on function public.casa_password_replace(uuid, text) from authenticated;
revoke all on function public.casa_password_reset_store(text, text, timestamptz) from authenticated;
revoke all on function public.casa_password_reset_finish(text, text) from authenticated;
revoke all on function public.casa_staff_create(text, text, text, uuid, jsonb) from authenticated;
revoke all on table public.casa_password_resets from authenticated;
