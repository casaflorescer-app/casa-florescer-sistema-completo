-- FASE B3.3 / Commit 015 — Hardening de EXECUTE (A/B1/B2)
--
-- Evidencia:
--   SQL Editor mostrou SECURITY DEFINER com anon_execute=true em RPCs B2.
--   Migrations 0011/0012/0015 fazem REVOKE FROM public, mas nem sempre
--   REVOKE FROM anon explicitamente (0013 ja fazia para B1).
--   Helpers internos append_* / post_payout_ledger nunca tiveram REVOKE
--   e herdaram EXECUTE padrao para PUBLIC.
--
-- Principio: privilegio minimo.
--   - anon: sem EXECUTE em funcoes clinicas/financeiras A/B1/B2
--   - authenticated: preservado nas RPCs/helpers usados pelo app ou por RLS
--   - service_role: NAO revogado (sem Edge Function no repo; nao assumir remocao)
--
-- NAO altera: logica das funcoes, SECURITY DEFINER, owner, RLS, policies.

-- ---------------------------------------------------------------------------
-- Internos B2: somente chamados por RPCs SECURITY DEFINER (owner).
-- Frontend NAO chama. authenticated NAO precisa de EXECUTE.
-- ---------------------------------------------------------------------------

revoke all on function public.append_pregnancy_procedure_payout_event(uuid, text, text, text, integer, integer, jsonb) from public;
revoke all on function public.append_pregnancy_procedure_payout_event(uuid, text, text, text, integer, integer, jsonb) from anon;
revoke all on function public.append_pregnancy_procedure_payout_event(uuid, text, text, text, integer, integer, jsonb) from authenticated;

revoke all on function public.post_payout_ledger(uuid, text, text) from public;
revoke all on function public.post_payout_ledger(uuid, text, text) from anon;
revoke all on function public.post_payout_ledger(uuid, text, text) from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers B2 can_* (usados em RLS / RPCs). Frontend nao chama via rpc().
-- authenticated precisa EXECUTE para avaliacao de policies sob JWT.
-- ---------------------------------------------------------------------------

revoke all on function public.can_read_pregnancy_procedure(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_read_pregnancy_procedure(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.can_read_pregnancy_procedure(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.can_create_pregnancy_procedure(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_create_pregnancy_procedure(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.can_create_pregnancy_procedure(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.can_read_pregnancy_procedure_payout(uuid, uuid, uuid) from public;
revoke all on function public.can_read_pregnancy_procedure_payout(uuid, uuid, uuid) from anon;
grant execute on function public.can_read_pregnancy_procedure_payout(uuid, uuid, uuid) to authenticated;

revoke all on function public.can_manage_pregnancy_procedure_payout(uuid, uuid) from public;
revoke all on function public.can_manage_pregnancy_procedure_payout(uuid, uuid) from anon;
grant execute on function public.can_manage_pregnancy_procedure_payout(uuid, uuid) to authenticated;

revoke all on function public.can_edit_payout_notes(uuid, uuid, uuid) from public;
revoke all on function public.can_edit_payout_notes(uuid, uuid, uuid) from anon;
grant execute on function public.can_edit_payout_notes(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs B2 chamadas pelo frontend (lib/procedures/directory.ts)
-- ---------------------------------------------------------------------------

revoke all on function public.create_pregnancy_procedure(uuid, text, uuid, date, text) from public;
revoke all on function public.create_pregnancy_procedure(uuid, text, uuid, date, text) from anon;
grant execute on function public.create_pregnancy_procedure(uuid, text, uuid, date, text) to authenticated;

revoke all on function public.create_pregnancy_procedure_payout(uuid, integer, text, date) from public;
revoke all on function public.create_pregnancy_procedure_payout(uuid, integer, text, date) from anon;
grant execute on function public.create_pregnancy_procedure_payout(uuid, integer, text, date) to authenticated;

revoke all on function public.update_pregnancy_procedure_payout_notes(uuid, text) from public;
revoke all on function public.update_pregnancy_procedure_payout_notes(uuid, text) from anon;
grant execute on function public.update_pregnancy_procedure_payout_notes(uuid, text) to authenticated;

revoke all on function public.update_pregnancy_procedure_payout_amount(uuid, integer) from public;
revoke all on function public.update_pregnancy_procedure_payout_amount(uuid, integer) from anon;
grant execute on function public.update_pregnancy_procedure_payout_amount(uuid, integer) to authenticated;

revoke all on function public.settle_pregnancy_procedure_payout(uuid, date) from public;
revoke all on function public.settle_pregnancy_procedure_payout(uuid, date) from anon;
grant execute on function public.settle_pregnancy_procedure_payout(uuid, date) to authenticated;

revoke all on function public.cancel_pregnancy_procedure_payout(uuid, text) from public;
revoke all on function public.cancel_pregnancy_procedure_payout(uuid, text) from anon;
grant execute on function public.cancel_pregnancy_procedure_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fase A — RPCs + helpers (RLS / frontend grant-revoke)
-- ---------------------------------------------------------------------------

revoke all on function public.is_pregnancy_principal(uuid) from public;
revoke all on function public.is_pregnancy_principal(uuid) from anon;
grant execute on function public.is_pregnancy_principal(uuid) to authenticated;

revoke all on function public.has_active_pregnancy_backup_grant(uuid) from public;
revoke all on function public.has_active_pregnancy_backup_grant(uuid) from anon;
grant execute on function public.has_active_pregnancy_backup_grant(uuid) to authenticated;

revoke all on function public.can_create_pregnancy(uuid) from public;
revoke all on function public.can_create_pregnancy(uuid) from anon;
grant execute on function public.can_create_pregnancy(uuid) to authenticated;

revoke all on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.can_access_pregnancy(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) from public;
revoke all on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) from anon;
grant execute on function public.can_select_pregnancy(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.can_write_pregnancy(uuid) from public;
revoke all on function public.can_write_pregnancy(uuid) from anon;
grant execute on function public.can_write_pregnancy(uuid) to authenticated;

revoke all on function public.is_pregnancy_named_professional(uuid, uuid) from public;
revoke all on function public.is_pregnancy_named_professional(uuid, uuid) from anon;
grant execute on function public.is_pregnancy_named_professional(uuid, uuid) to authenticated;

revoke all on function public.grant_pregnancy_backup_access(uuid) from public;
revoke all on function public.grant_pregnancy_backup_access(uuid) from anon;
grant execute on function public.grant_pregnancy_backup_access(uuid) to authenticated;

revoke all on function public.revoke_pregnancy_backup_access(uuid) from public;
revoke all on function public.revoke_pregnancy_backup_access(uuid) from anon;
grant execute on function public.revoke_pregnancy_backup_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fase B1 — reforco explicito REVOKE anon (ja feito parcialmente em 0013)
-- ---------------------------------------------------------------------------

revoke all on function public.is_professional_self(uuid) from public;
revoke all on function public.is_professional_self(uuid) from anon;
grant execute on function public.is_professional_self(uuid) to authenticated;

revoke all on function public.can_manage_professional_policy(uuid, uuid) from public;
revoke all on function public.can_manage_professional_policy(uuid, uuid) from anon;
grant execute on function public.can_manage_professional_policy(uuid, uuid) to authenticated;

revoke all on function public.can_view_practice_care_policies(uuid) from public;
revoke all on function public.can_view_practice_care_policies(uuid) from anon;
grant execute on function public.can_view_practice_care_policies(uuid) to authenticated;

revoke all on function public.can_read_professional_policy(uuid, uuid) from public;
revoke all on function public.can_read_professional_policy(uuid, uuid) from anon;
grant execute on function public.can_read_professional_policy(uuid, uuid) to authenticated;

revoke all on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) from public;
revoke all on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) from anon;
grant execute on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) to authenticated;

revoke all on function public.set_secretary_care_policy_view(uuid, boolean) from public;
revoke all on function public.set_secretary_care_policy_view(uuid, boolean) from anon;
grant execute on function public.set_secretary_care_policy_view(uuid, boolean) to authenticated;
