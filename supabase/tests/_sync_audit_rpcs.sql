select p.proname as fn, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_pregnancy_procedure',
    'create_pregnancy_procedure_payout',
    'update_pregnancy_procedure_payout_notes',
    'update_pregnancy_procedure_payout_amount',
    'settle_pregnancy_procedure_payout',
    'cancel_pregnancy_procedure_payout',
    'can_read_pregnancy_procedure_payout',
    'can_manage_pregnancy_procedure_payout',
    'can_edit_payout_notes',
    'can_access_pregnancy',
    'grant_pregnancy_backup_access',
    'revoke_pregnancy_backup_access',
    'can_read_professional_policy',
    'publish_professional_care_policy_version',
    'set_secretary_care_policy_view'
  )
order by 1;
