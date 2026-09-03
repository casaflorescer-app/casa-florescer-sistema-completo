-- Correção B1: set_secretary_care_policy_view falhava no UPDATE
-- porque o CASE 'grant'/'revoke' era TEXT, e write_audit espera audit_action.
-- 0013 já aplicada no remoto: não editar 0013. Não altera RLS, RPC nem regra comercial.

create or replace function public.user_practice_roles_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'insert'::public.audit_action,
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
    if new.can_view_care_policies then
      perform public.write_audit(
        'grant'::public.audit_action,
        'user_practice_roles',
        new.id,
        new.practice_id,
        null,
        jsonb_build_object(
          'permission', 'can_view_care_policies',
          'user_id', new.user_id,
          'practice_id', new.practice_id,
          'enabled', true
        )
      );
    end if;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(
      'update'::public.audit_action,
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
    if old.can_view_care_policies is distinct from new.can_view_care_policies then
      perform public.write_audit(
        (case
           when new.can_view_care_policies then 'grant'
           else 'revoke'
         end)::public.audit_action,
        'user_practice_roles',
        new.id,
        new.practice_id,
        null,
        jsonb_build_object(
          'permission', 'can_view_care_policies',
          'user_id', new.user_id,
          'practice_id', new.practice_id,
          'previous', old.can_view_care_policies,
          'current', new.can_view_care_policies
        )
      );
    end if;
  elsif tg_op = 'DELETE' then
    perform public.write_audit(
      'delete'::public.audit_action,
      'user_practice_roles',
      old.id,
      old.practice_id,
      null,
      jsonb_build_object('user_id', old.user_id, 'role', old.role)
    );
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.user_practice_roles_after_write() is
  'Auditoria de membership. grant/revoke de can_view_care_policies usam audit_action. Não altera autorização comercial nem clínica.';
