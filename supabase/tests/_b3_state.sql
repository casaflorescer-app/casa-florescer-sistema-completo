select column_name from information_schema.columns
where table_schema='public' and table_name in ('pregnancy_procedures','pregnancy_procedure_payouts')
order by table_name, ordinal_position;

select upr.id as membership_id, upr.user_id, upr.role::text, upr.practice_id,
  upr.can_view_care_policies, p.id as professional_id, pr.full_name, pr.is_active
from user_practice_roles upr
join profiles pr on pr.id = upr.user_id
left join professionals p on p.profile_id = upr.user_id and p.practice_id = upr.practice_id
order by pr.full_name, upr.role;

select id, full_name from patients order by full_name;
select id, patient_id, practice_id, status::text, primary_professional_id, backup_professional_id, lmp_date, calculated_edd, clinical_edd
from pregnancies order by created_at;
select id, pregnancy_id, procedure_code, performed_by_professional_id, performed_as from pregnancy_procedures;
select id, pregnancy_procedure_id, amount_cents, status::text from pregnancy_procedure_payouts;
select count(*)::int as ledger_n from professional_payout_ledger_entries;
select id, pregnancy_id, backup_professional_id, revoked_at is null as active from pregnancy_backup_grants order by created_at;
select id, professional_id, practice_id from professional_care_policies;
