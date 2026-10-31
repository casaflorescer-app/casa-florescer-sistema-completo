select 'patients' as t, count(*)::bigint as n from patients
union all select 'pregnancies', count(*) from pregnancies
union all select 'pregnancy_procedures', count(*) from pregnancy_procedures
union all select 'pregnancy_procedure_payouts', count(*) from pregnancy_procedure_payouts
union all select 'pregnancy_procedure_payout_events', count(*) from pregnancy_procedure_payout_events
union all select 'professional_payout_ledger_entries', count(*) from professional_payout_ledger_entries
order by 1;
