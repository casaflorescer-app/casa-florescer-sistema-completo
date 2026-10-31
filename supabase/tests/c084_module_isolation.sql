-- C084 — prova de isolamento dos módulos, no BancoFlorescerPP, como postgre.
-- A transação termina em rollback. Não deixa organização, usuário nem paciente.
-- Não reaplicar migrations. Não publicar a porta 5432.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000111', 'samara.c084@example.com'),
  ('00000000-0000-4000-8000-000000000112', 'thais.c084@example.com'),
  ('00000000-0000-4000-8000-000000000113', 'secretaria.c084@example.com'),
  ('00000000-0000-4000-8000-000000000114', 'admin.c084@example.com');

insert into public.organizations (id, legal_name, trade_name, cnpj) values
  ('00000000-0000-4000-8000-000000000101', 'Casa Florescer C084', 'Casa Florescer C084', '00000000000084');

insert into public.practice_units (id, organization_id, kind, code, name, specialty, isolation_label) values
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'house', 'SAMARA-C084', 'Samara', 'ginecologia', 'Prática Samara'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000101', 'house', 'THAIS-C084', 'Thais', 'ginecologia', 'Prática Thais');

insert into public.profiles (id, organization_id, full_name, email) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 'Samara', 'samara.c084@example.com'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 'Thais', 'thais.c084@example.com'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000101', 'Secretária', 'secretaria.c084@example.com'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000101', 'Administradora', 'admin.c084@example.com');

insert into public.user_practice_roles (user_id, practice_id, role, clinical_access, can_cashier, can_schedule_any_practice) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000102', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000103', 'physician', 'practice', true, false),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000102', 'secretary', 'none', false, true),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000102', 'admin', 'none', false, true);

insert into public.professionals (
  id, profile_id, practice_id, organization_id, council_type, council_number, display_name, category, is_active
) values
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'CRM', 'C084-S', 'Samara', 'medico', true),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000101', 'CRM', 'C084-T', 'Thais', 'medico', true);

insert into public.patients (id, organization_id, full_name) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000101', 'Paciente das duas');

insert into public.patient_practice_links (patient_id, practice_id) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000103');

insert into public.patient_clinical_data (patient_id, organization_id, practice_id, allergies) values
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', 'ficha-samara'),
  ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', 'ficha-thais');

insert into public.rooms (id, organization_id, code, name) values
  ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000101', 'SALA-C084', 'Sala C084');

insert into public.appointments (
  id, organization_id, practice_id, room_id, patient_id, professional_id,
  starts_at, ends_at, scheduled_starts_at, scheduled_ends_at, created_by
) values
  (
    '00000000-0000-4000-8000-000000000151',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000141',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000121',
    '2026-11-02 09:00+00', '2026-11-02 09:30+00',
    '2026-11-02 09:00+00', '2026-11-02 09:30+00',
    '00000000-0000-4000-8000-000000000113'
  ),
  (
    '00000000-0000-4000-8000-000000000152',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000141',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000122',
    '2026-11-02 10:00+00', '2026-11-02 10:30+00',
    '2026-11-02 10:00+00', '2026-11-02 10:30+00',
    '00000000-0000-4000-8000-000000000113'
  );

insert into public.encounters (id, organization_id, practice_id, patient_id, professional_id) values
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000121'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000122');

insert into public.clinical_notes (encounter_id, organization_id, practice_id, body_ciphertext, created_by) values
  ('00000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', 'nota-samara', '00000000-0000-4000-8000-000000000111'),
  ('00000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', 'nota-thais', '00000000-0000-4000-8000-000000000112');

insert into public.pregnancies (id, organization_id, practice_id, patient_id, primary_professional_id) values
  ('00000000-0000-4000-8000-000000000171', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000122');

insert into public.exam_orders (id, organization_id, practice_id, patient_id, title, requested_by) values
  ('00000000-0000-4000-8000-000000000181', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000131', 'Exame Thais', '00000000-0000-4000-8000-000000000122');

select set_config('app.user_id', '00000000-0000-4000-8000-000000000112', true);

insert into public.prescriptions (id, organization_id, practice_id, patient_id, professional_id, created_by) values
  ('00000000-0000-4000-8000-000000000191', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000112');

insert into public.invoices (id, organization_id, practice_id, patient_id, payer_kind, total_cents) values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000131', 'private', 10000),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000131', 'private', 20000);

insert into public.payments (id, invoice_id, method, amount_cents) values
  ('00000000-0000-4000-8000-0000000001b1', '00000000-0000-4000-8000-0000000001a1', 'cash', 10000),
  ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-0000000001a2', 'cash', 20000);

insert into public.payment_splits (payment_id, beneficiary_kind, beneficiary_practice_id, amount_cents) values
  ('00000000-0000-4000-8000-0000000001b1', 'practice', '00000000-0000-4000-8000-000000000102', 10000),
  ('00000000-0000-4000-8000-0000000001b2', 'practice', '00000000-0000-4000-8000-000000000103', 20000);

insert into public.cost_centers (id, organization_id, code, name, is_shared) values
  ('00000000-0000-4000-8000-0000000001c1', '00000000-0000-4000-8000-000000000101', 'CASA-C084', 'Despesa da casa', true),
  ('00000000-0000-4000-8000-0000000001c2', '00000000-0000-4000-8000-000000000101', 'THAIS-C084', 'Despesa Thais', false);

insert into public.cost_allocations (organization_id, cost_center_id, practice_id, competence, description, amount_cents) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000001c1', null, '2026-11-01', 'Compartilhada', 5000),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000001c2', '00000000-0000-4000-8000-000000000103', '2026-11-01', 'Particular Thais', 7000);

do $$
declare
  n int;
begin
  execute 'set local role authenticated';

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000111', true);
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000103';
  if n <> 0 then raise exception 'Samara leu nota de Thais'; end if;
  select count(*) into n from public.patient_clinical_data where allergies = 'ficha-samara';
  if n <> 1 then raise exception 'Samara não leu a própria ficha'; end if;
  select count(*) into n from public.patient_clinical_data where allergies = 'ficha-thais';
  if n <> 0 then raise exception 'Samara leu a ficha de Thais da mesma paciente'; end if;
  select count(*) into n from public.pregnancies where id = '00000000-0000-4000-8000-000000000171';
  if n <> 0 then raise exception 'Samara leu gestação de Thais'; end if;
  select count(*) into n from public.exam_orders where id = '00000000-0000-4000-8000-000000000181';
  if n <> 0 then raise exception 'Samara leu exame de Thais'; end if;
  select count(*) into n from public.prescriptions where id = '00000000-0000-4000-8000-000000000191';
  if n <> 0 then raise exception 'Samara leu receita de Thais'; end if;
  select count(*) into n from public.invoices where id = '00000000-0000-4000-8000-0000000001a2';
  if n <> 0 then raise exception 'Samara leu fatura de Thais'; end if;
  select count(*) into n from public.cost_allocations where description = 'Compartilhada';
  if n <> 1 then raise exception 'Samara não viu a despesa compartilhada'; end if;
  select count(*) into n from public.cost_allocations where description = 'Particular Thais';
  if n <> 0 then raise exception 'Samara viu despesa particular de Thais'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000112', true);
  select count(*) into n from public.clinical_notes where practice_id = '00000000-0000-4000-8000-000000000102';
  if n <> 0 then raise exception 'Thais leu nota de Samara'; end if;
  select count(*) into n from public.pregnancies where id = '00000000-0000-4000-8000-000000000171';
  if n <> 1 then raise exception 'Thais não leu a própria gestação'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000113', true);
  select count(*) into n from public.appointments;
  if n <> 2 then raise exception 'Secretária não vê as duas agendas'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Secretária leu nota'; end if;
  select count(*) into n from public.patient_clinical_data;
  if n <> 0 then raise exception 'Secretária leu ficha'; end if;
  select count(*) into n from public.pregnancies;
  if n <> 0 then raise exception 'Secretária leu gestação'; end if;
  select count(*) into n from public.exam_orders;
  if n <> 0 then raise exception 'Secretária leu exame'; end if;
  select count(*) into n from public.prescriptions;
  if n <> 0 then raise exception 'Secretária leu receita'; end if;
  select count(*) into n from public.invoices;
  if n <> 0 then raise exception 'Secretária leu fatura'; end if;

  perform set_config('app.user_id', '00000000-0000-4000-8000-000000000114', true);
  select count(*) into n from public.invoices;
  if n <> 2 then raise exception 'Administradora não viu as duas faturas'; end if;
  select count(*) into n from public.cost_allocations;
  if n <> 2 then raise exception 'Administradora não viu as despesas'; end if;
  select count(*) into n from public.clinical_notes;
  if n <> 0 then raise exception 'Administradora leu nota'; end if;
  select count(*) into n from public.pregnancies;
  if n <> 0 then raise exception 'Administradora leu gestação'; end if;
end $$;

rollback;
