select 'patients' as kind, count(*)::text as n from public.patients where full_name like 'TESTE B2%'
union all select 'pregnancies', count(*)::text from public.pregnancies where notes like 'TESTE B2%'
union all select 'procedures', count(*)::text from public.pregnancy_procedures pp join public.pregnancies p on p.id = pp.pregnancy_id where p.notes like 'TESTE B2%'
union all select 'payouts', count(*)::text from public.pregnancy_procedure_payouts po join public.pregnancies p on p.id = po.pregnancy_id where p.notes like 'TESTE B2%'
union all select 'events', count(*)::text from public.pregnancy_procedure_payout_events e join public.pregnancy_procedure_payouts po on po.id = e.payout_id join public.pregnancies p on p.id = po.pregnancy_id where p.notes like 'TESTE B2%'
union all select 'ledger', count(*)::text from public.professional_payout_ledger_entries l join public.pregnancy_procedure_payouts po on po.id = l.payout_id join public.pregnancies p on p.id = po.pregnancy_id where p.notes like 'TESTE B2%';
