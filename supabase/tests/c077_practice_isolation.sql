-- C077 — prova de isolamento. Não executar agora.
-- Só depois do apply autorizado, no BancoFlorescerPP, como superusuário da migração.
-- A transação termina em rollback. Não deixa organização, usuário nem paciente.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'samara.c077@example.com'),
  ('00000000-0000-4000-8000-000000000012', 'thais.c077@example.com'),
  ('00000000-0000-4000-8000-000000000013', 'secretaria.c077@example.com'),
  ('00000000-0000-4000-8000-000000000014', 'admin.c077@example.com');

insert into public.organizations (id, legal_name, trade_name, cnpj) values
  ('00000000-0000-4000-8000-000000000001', 'Casa Florescer C077', 'Casa Florescer C077', '00000000000077');

insert into public.practice_units (id, organization_id, kind, code, name, specialty, isolation_label) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'house', 'SAMARA-C077', 'Samara', 'ginecologia', 'Prática Samara'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'house', 'THAIS-C077', 'Thais', 'ginecologia', 'Prática Thais');

insert into public.profiles (id, organization_id, full_name, email) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Samara', 'samara.c077@example.com'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'Thais', 'thais.c077@example.com'),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'Secretária', 'secretaria.c077@example.com'),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'Administradora', 'admin.c077@example.com');

insert into public.user_practice_roles (user_id, practice_id, role, clinical_access, can_cashier, can_schedule_any_practice) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000003', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002', 'secretary', 'none', false, true),
  ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000002', 'admin', 'none', false, true);

insert into public.professionals (id, profile_id, practice_id, organization_id, council_type, council_number) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'CRM', 'C077-S'),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'CRM', 'C077-T');

insert into public.patients (id, organization_id, full_name) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', 'Paciente das duas');

insert into public.patient_practice_links (patient_id, practice_id) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000003');

insert into public.patient_clinical_data (patient_id, organization_id, practice_id, allergies) values
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'ficha-samara'),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'ficha-thais');

insert into public.rooms (id, organization_id, code, name) values
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000001', 'SALA-C077', 'Sala C077');

insert into public.appointments (
  id, organization_id, practice_id, room_id, patient_id, professional_id,
  starts_at, ends_at, scheduled_starts_at, scheduled_ends_at, created_by
) values
  (
    '00000000-0000-4000-8000-000000000051',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000021',
    '2026-11-02 09:00+00', '2026-11-02 09:30+00',
    '2026-11-02 09:00+00', '2026-11-02 09:30+00',
    '00000000-0000-4000-8000-000000000013'
  ),
  (
    '00000000-0000-4000-8000-000000000052',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000041',
    '00000000-0000-4000-8000-000000000031',
    '00000000-0000-4000-8000-000000000022',
    '2026-11-02 10:00+00', '2026-11-02 10:30+00',
    '2026-11-02 10:00+00', '2026-11-02 10:30+00',
    '00000000-0000-4000-8000-000000000013'
  );

insert into public.encounters (id, organization_id, practice_id, patient_id, professional_id) values
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000022');

insert into public.clinical_notes (encounter_id, organization_id, practice_id, body_ciphertext, created_by) values
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'nota-samara', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000062', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'nota-thais', '00000000-0000-4000-8000-000000000012');

insert into public.exam_orders (id, organization_id, practice_id, patient_id, title, requested_by) values
  ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', 'Exame Thais', '00000000-0000-4000-8000-000000000022');

select set_config('app.user_id', '00000000-0000-4000-8000-000000000012', true);

insert into public.prescriptions (id, organization_id, practice_id, patient_id, professional_id, created_by) values
  ('00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000012');

insert into public.invoices (id, organization_id, practice_id, patient_id, payer_kind, total_cents) values
  ('00000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000031', 'private', 10000),
  ('00000000-0000-4000-8000-000000000092', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', 'private', 20000);

insert into public.payments (id, invoice_id, method, amount_cents) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000091', 'cash', 10000),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000092', 'cash', 20000);

insert into public.payment_splits (payment_id, beneficiary_kind, beneficiary_practice_id, amount_cents) values
  ('00000000-0000-4000-8000-0000000000a1', 'practice', '00000000-0000-4000-8000-000000000002', 10000),
  ('00000000-0000-4000-8000-0000000000a2', 'practice', '00000000-0000-4000-8000-000000000003', 20000);

insert into public.cost_centers (id, organization_id, code, name, is_shared) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'CASA-C077', 'Despesa da casa', true),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'THAIS-C077', 'Despesa Thais', false);

insert into public.cost_allocations (organization_id, cost_center_id, practice_id, competence, description, amount_cents) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', null, '2026-11-01', 'Compartilhada', 5000),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000003', '2026-11-01', 'Particular Thais', 7000);

grant select on table
  public.clinical_notes,
  public.patient_clinical_data,
  public.patient_safety_flags,
  public.exam_orders,
  public.prescriptions,
  public.invoices,
  public.payment_splits,
  public.cost_allocations,
  public.appointments
to authenticated;

grant update on table public.exam_orders to authenticated;

do $$
declare
  n int;
  v_updated int;
begin
  execute 'set local role authenticated';

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000011', true);
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'Samara leu nota de Thais'; end if;
  select count(*) into n from public.patient_clinical_data where practice_id = '00000000-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'Samara leu a ficha de Thais da mesma paciente'; end if;
  select count(*) into n from public.patient_clinical_data where allergies = 'ficha-samara';
  if n <> 1 then raise exception 'Samara não leu a própria ficha'; end if;
  select count(*) into n from public.exam_orders where id = '00000000-0000-4000-8000-000000000071';
  if n <> 0 then raise exception 'Samara leu exame de Thais'; end if;
  select count(*) into n from public.prescriptions where id = '00000000-0000-4000-8000-000000000081';
  if n <> 0 then raise exception 'Samara leu receita de Thais'; end if;
  select count(*) into n from public.invoices where id = '00000000-0000-4000-8000-000000000092';
  if n <> 0 then raise exception 'Samara leu fatura de Thais'; end if;
  select count(*) into n from public.payment_splits where payment_id = '00000000-0000-4000-8000-0000000000a2';
  if n <> 0 then raise exception 'Samara leu rateio de Thais'; end if;
  select count(*) into n from public.payment_splits where payment_id = '00000000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'Samara não leu o próprio rateio'; end if;
  select count(*) into n from public.cost_allocations where description = 'Compartilhada';
  if n <> 1 then raise exception 'Samara não viu a despesa compartilhada'; end if;
  select count(*) into n from public.cost_allocations where description = 'Particular Thais';
  if n <> 0 then raise exception 'Samara viu despesa particular de Thais'; end if;
  if public.can_read_pregnancy_procedure_payout(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000022',
    null
  ) then
    raise exception 'Samara leu repasse de Thais';
  end if;
  update public.exam_orders
     set practice_id = '00000000-0000-4000-8000-000000000002'
   where id = '00000000-0000-4000-8000-000000000071';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'Samara trocou a prática do exame de Thais';
  end if;
  begin
    perform public.exam_order_submit(jsonb_build_object(
      'organization_id', '00000000-0000-4000-8000-000000000001',
      'practice_id', '00000000-0000-4000-8000-000000000003',
      'patient_id', '00000000-0000-4000-8000-000000000031',
      'title', 'Pedido cruzado',
      'source', 'secretaria'
    ));
    raise exception 'Pedido de exame atravessou a prática';
  exception
    when others then
      if sqlerrm <> 'FORBIDDEN' and sqlerrm <> 'Pedido de exame atravessou a prática' then
        raise;
      end if;
      if sqlerrm = 'Pedido de exame atravessou a prática' then
        raise;
      end if;
  end;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000012', true);
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000002';
  if n <> 0 then raise exception 'Thais leu nota de Samara'; end if;
  select count(*) into n from public.patient_clinical_data where allergies = 'ficha-samara';
  if n <> 0 then raise exception 'Thais leu a ficha de Samara da mesma paciente'; end if;
  select count(*) into n from public.invoices where id = '00000000-0000-4000-8000-000000000091';
  if n <> 0 then raise exception 'Thais leu fatura de Samara'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000013', true);
  if not public.can_schedule_in_org('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')
     or not public.can_schedule_in_org('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003') then
    raise exception 'Secretária não agenda as duas práticas';
  end if;
  select count(*) into n from public.appointments;
  if n <> 2 then raise exception 'Secretária não vê as duas agendas'; end if;
  select count(*) into n from public.invoices;
  if n <> 0 then raise exception 'Secretária leu fatura'; end if;
  select count(*) into n from public.payment_splits;
  if n <> 0 then raise exception 'Secretária leu rateio'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Secretária leu nota'; end if;
  select count(*) into n from public.patient_clinical_data;
  if n <> 0 then raise exception 'Secretária leu ficha'; end if;
  select count(*) into n from public.patient_safety_flags;
  if n <> 0 then raise exception 'Secretária leu alergia'; end if;
  select count(*) into n from public.exam_orders;
  if n <> 0 then raise exception 'Secretária leu exame'; end if;
  select count(*) into n from public.prescriptions;
  if n <> 0 then raise exception 'Secretária leu receita'; end if;
  if public.can_read_pregnancy_procedure_payout(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000021',
    null
  ) then
    raise exception 'Secretária leu repasse';
  end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000014', true);
  select count(*) into n from public.invoices;
  if n <> 2 then raise exception 'Administradora não viu as duas faturas'; end if;
  select count(*) into n from public.payment_splits;
  if n <> 2 then raise exception 'Administradora não viu os dois rateios'; end if;
  select count(*) into n from public.cost_allocations;
  if n <> 2 then raise exception 'Administradora não viu as despesas'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Administradora leu nota'; end if;
  select count(*) into n from public.patient_clinical_data;
  if n <> 0 then raise exception 'Administradora leu ficha'; end if;
  if not public.can_read_pregnancy_procedure_payout(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000021',
    null
  ) or not public.can_read_pregnancy_procedure_payout(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000022',
    null
  ) then
    raise exception 'Administradora não leu os dois repasses';
  end if;
end $$;

rollback;
