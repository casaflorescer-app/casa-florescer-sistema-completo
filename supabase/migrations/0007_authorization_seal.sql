-- Fechamento de autorização do baseline Casa Florescer.
-- NÃO é god mode.
-- NÃO cria profiles.role.
-- NÃO cria is_master_admin().
-- NÃO cria master_admin_all.
-- NÃO percorre pg_class para gerar FOR ALL em todas as tabelas.
--
-- SYSTEM_ADMIN (desenvolvedor) recebe políticas NOMEADAS e delimitadas
-- sobre tabelas operacionais. Dados clínicos ordinários continuam
-- exigindo physician da prática ou break-glass auditado.

-- ---------------------------------------------------------------------------
-- SYSTEM_ADMIN — administração operacional (não clínico)
-- ---------------------------------------------------------------------------

create policy organizations_system_admin on public.organizations
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy practice_units_system_admin on public.practice_units
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy rooms_system_admin on public.rooms
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy profiles_system_admin on public.profiles
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy user_practice_roles_system_admin on public.user_practice_roles
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy professionals_system_admin on public.professionals
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy patients_system_admin on public.patients
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy patient_accounts_system_admin on public.patient_accounts
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy patient_practice_links_system_admin on public.patient_practice_links
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy consents_system_admin on public.consents
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy procedures_system_admin on public.procedures
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy appointments_system_admin on public.appointments
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy daily_capacity_system_admin on public.daily_capacity
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy exam_orders_system_admin on public.exam_orders
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy return_reminders_system_admin on public.return_reminders
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy agenda_alerts_system_admin on public.agenda_alerts
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy rental_contracts_system_admin on public.rental_contracts
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy rental_statements_system_admin on public.rental_statements
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy cost_centers_system_admin on public.cost_centers
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy split_rule_sets_system_admin on public.split_rule_sets
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy split_rules_system_admin on public.split_rules
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy invoices_system_admin on public.invoices
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy invoice_items_system_admin on public.invoice_items
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy payments_system_admin on public.payments
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy payment_splits_system_admin on public.payment_splits
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy cost_allocations_system_admin on public.cost_allocations
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy warehouses_system_admin on public.warehouses
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy items_system_admin on public.items
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy item_lots_system_admin on public.item_lots
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy stock_balances_system_admin on public.stock_balances
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy procedure_kits_system_admin on public.procedure_kits
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy procedure_kit_items_system_admin on public.procedure_kit_items
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy stock_movements_system_admin_select on public.stock_movements
  for select using (public.is_system_admin());

create policy stock_movements_system_admin_insert on public.stock_movements
  for insert with check (public.is_system_admin());

create policy stock_audits_system_admin on public.stock_audits
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy stock_audit_lines_system_admin on public.stock_audit_lines
  for all using (public.is_system_admin())
  with check (public.is_system_admin());

create policy audit_events_system_admin_select on public.audit_events
  for select using (public.is_system_admin());

create policy break_glass_system_admin_select on public.break_glass_grants
  for select using (public.is_system_admin());

-- Explicitamente NÃO há política SYSTEM_ADMIN em:
--   clinical_notes, encounters, obstetric_followups,
--   patient_clinical_data, exam_uploads, prescriptions, prescription_items.
-- Acesso clínico excepcional: grant_break_glass() + has_active_break_glass().

-- ---------------------------------------------------------------------------
-- Break-glass: leitura clínica adicional já coberta por can_read_clinical.
-- Complemento: arquivos de exame e receitas assinadas sob grant vigente.
-- ---------------------------------------------------------------------------

create policy exam_uploads_break_glass_select on public.exam_uploads
  for select using (public.has_active_break_glass(practice_id, patient_id));

create policy prescriptions_break_glass_select on public.prescriptions
  for select using (public.has_active_break_glass(practice_id, patient_id));

create policy prescription_items_break_glass_select on public.prescription_items
  for select using (
    exists (
      select 1 from public.prescriptions rx
      where rx.id = prescription_id
        and public.has_active_break_glass(rx.practice_id, rx.patient_id)
    )
  );

create policy obstetric_followups_break_glass_select on public.obstetric_followups
  for select using (public.has_active_break_glass(practice_id, patient_id));

comment on function public.grant_break_glass(uuid, uuid, uuid, text, timestamptz, timestamptz) is
  'Concede acesso clínico excepcional. SYSTEM_ADMIN ou OWNER. Não altera papéis. Motivo, paciente, prática, início, término e auditoria são obrigatórios.';

comment on function public.grant_system_admin(uuid, text) is
  'Concede SYSTEM_ADMIN. Bloqueado para OWNER e ADMIN. Bootstrap do primeiro registro: service_role/dashboard, nunca esta função.';

comment on function public.revoke_system_admin(uuid, text) is
  'Revoga SYSTEM_ADMIN. Bloqueado para OWNER e ADMIN.';

comment on function public.revoke_break_glass(uuid, text) is
  'Revoga break-glass antecipando expires_at. SYSTEM_ADMIN ou OWNER da casa da prática. Não apaga o registro e não altera papéis.';
