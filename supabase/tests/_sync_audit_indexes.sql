select indexname from pg_indexes
where schemaname='public'
  and tablename in (
    'pregnancy_procedures','pregnancy_procedure_payouts',
    'pregnancy_procedure_payout_events','professional_payout_ledger_entries'
  )
order by 1;
