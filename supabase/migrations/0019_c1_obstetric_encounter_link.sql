-- FASE C1.1 / Migration 0019 — vinculo opcional encounter ↔ pregnancy
--
-- Escopo:
--   encounters.pregnancy_id nullable.
--   NULL = consulta sem gestacao (ginecologia e demais, comportamento C1).
--   Preenchido = atendimento obstetrico, com ACL propria.
--   RPC exclusiva para gravar ou limpar o vinculo (GUC local).
--   Leitura do SOAP obstetrico nao usa can_access_pregnancy.
--
-- NAO altera:
--   pregnancies, pregnancy_events, pregnancy_backup_grants,
--   pregnancy_procedures, pregnancy_procedure_payouts,
--   professional_payout_ledger_entries, professional_care_policies.
-- NAO cria episodio generico, clinical_procedures nem financeiro ginecologico.
-- encounter_sign nao passa a exigir pregnancy.
--
-- Aplicar somente quando autorizado. Este arquivo nao executa db push.

-- ---------------------------------------------------------------------------
-- 1) Autorizacao do vinculo (principal ou retaguarda com grant)
-- ---------------------------------------------------------------------------

create or replace function public.can_link_encounter_pregnancy(
  p_encounter_id uuid,
  p_pregnancy_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_preg public.pregnancies%rowtype;
begin
  if auth.uid() is null or p_encounter_id is null or p_pregnancy_id is null then
    return false;
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id;

  if not found then
    return false;
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    return false;
  end if;

  if not exists (
    select 1
    from public.professionals pr
    join public.profiles pf on pf.id = pr.profile_id
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
      and pf.is_active
  ) then
    return false;
  end if;

  select * into v_preg
  from public.pregnancies
  where id = p_pregnancy_id;

  if not found then
    return false;
  end if;

  if v_preg.status is distinct from 'in_care'::public.pregnancy_status then
    return false;
  end if;

  if v_preg.practice_id is distinct from v_enc.practice_id
     or v_preg.patient_id is distinct from v_enc.patient_id then
    return false;
  end if;

  if public.is_pregnancy_principal(v_preg.primary_professional_id) then
    return true;
  end if;

  if v_preg.backup_professional_id is not null
     and public.has_active_pregnancy_backup_grant(v_preg.id)
     and exists (
       select 1
       from public.professionals pr
       where pr.id = v_preg.backup_professional_id
         and pr.profile_id = auth.uid()
         and pr.practice_id = v_preg.practice_id
     ) then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.can_link_encounter_pregnancy(uuid, uuid) is
  'C1.1: encounter open, mesma paciente e pratica, usuaria e a profissional do atendimento, e principal da gestacao in_care ou retaguarda com grant ativo. Nao libera secretaria, paciente, system admin, owner/admin nem medica sem vinculo.';

-- Leitura do atendimento ja vinculado. Nao exige encounter open nem ser a profissional da linha,
-- para a principal poder ler o retorno feito pela retaguarda, inclusive apos a assinatura.
-- Nao inclui owner, admin nem secretaria (can_access_pregnancy nao e usada).
create or replace function public.can_read_linked_pregnancy(
  p_pregnancy_id uuid,
  p_practice_id uuid,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_pregnancy_id is not null
    and exists (
      select 1
      from public.pregnancies g
      where g.id = p_pregnancy_id
        and g.practice_id = p_practice_id
        and g.patient_id = p_patient_id
        and (
          public.is_pregnancy_principal(g.primary_professional_id)
          or (
            g.backup_professional_id is not null
            and public.has_active_pregnancy_backup_grant(g.id)
            and exists (
              select 1
              from public.professionals pr
              where pr.id = g.backup_professional_id
                and pr.profile_id = auth.uid()
            )
          )
          or public.has_active_break_glass(g.practice_id, g.patient_id)
        )
    )
$$;

comment on function public.can_read_linked_pregnancy(uuid, uuid, uuid) is
  'C1.1: leitura obstetrica restrita. Principal, retaguarda com grant ativo, ou break-glass da paciente. Nao usa can_access_pregnancy.';

-- ---------------------------------------------------------------------------
-- 2) Coluna, FKs e indice
-- ---------------------------------------------------------------------------

alter table public.encounters
  add column if not exists pregnancy_id uuid;

comment on column public.encounters.pregnancy_id is
  'Vinculo opcional com episodio obstetrico. NULL representa atendimento sem gestacao.';

alter table public.encounters
  drop constraint if exists encounters_pregnancy_id_fkey;

alter table public.encounters
  add constraint encounters_pregnancy_id_fkey
  foreign key (pregnancy_id)
  references public.pregnancies (id)
  on delete restrict;

alter table public.encounters
  drop constraint if exists encounters_pregnancy_patient_fkey;

alter table public.encounters
  add constraint encounters_pregnancy_patient_fkey
  foreign key (pregnancy_id, patient_id)
  references public.pregnancies (id, patient_id)
  on delete restrict;

alter table public.encounters
  drop constraint if exists encounters_pregnancy_practice_fkey;

alter table public.encounters
  add constraint encounters_pregnancy_practice_fkey
  foreign key (pregnancy_id, practice_id)
  references public.pregnancies (id, practice_id)
  on delete restrict;

create index if not exists encounters_pregnancy_idx
  on public.encounters (pregnancy_id)
  where pregnancy_id is not null;

comment on index public.encounters_pregnancy_idx is
  'C1.1: atendimentos vinculados a uma gestacao. Linhas ginecologicas (NULL) ficam de fora.';

-- ---------------------------------------------------------------------------
-- 3) encounters_before_write — regras C1.4 preservadas + trava do vinculo
-- ---------------------------------------------------------------------------

create or replace function public.encounters_before_write()
returns trigger
language plpgsql
as $$
declare
  v_patient_org uuid;
  v_prof_practice uuid;
  v_appt public.appointments%rowtype;
  v_allow text;
begin
  new.organization_id := public.resolve_org_from_practice(new.practice_id, new.organization_id);

  select organization_id into v_patient_org
  from public.patients where id = new.patient_id;

  select practice_id into v_prof_practice
  from public.professionals where id = new.professional_id;

  if v_patient_org is distinct from new.organization_id then
    raise exception 'Encounter: paciente de outra organização.';
  end if;
  if v_prof_practice is distinct from new.practice_id then
    raise exception 'Encounter: profissional não pertence à prática.';
  end if;

  if new.appointment_id is not null then
    select * into v_appt from public.appointments where id = new.appointment_id;
    if v_appt.practice_id is distinct from new.practice_id
       or v_appt.patient_id is distinct from new.patient_id
       or v_appt.professional_id is distinct from new.professional_id then
      raise exception 'Encounter: divergência em relação ao agendamento.';
    end if;
  end if;

  -- C1.4: encounter assinado nao reabre; identidade imutavel apos sign
  if TG_OP = 'UPDATE'
     and old.status = 'signed'::public.encounter_status then
    if new.status = 'open'::public.encounter_status then
      raise exception 'ENCOUNTER_SIGNED_LOCKED';
    end if;
    if new.patient_id is distinct from old.patient_id
       or new.practice_id is distinct from old.practice_id
       or new.professional_id is distinct from old.professional_id then
      raise exception 'ENCOUNTER_SIGNED_IDENTITY_LOCKED';
    end if;
    if new.pregnancy_id is distinct from old.pregnancy_id then
      raise exception 'ENCOUNTER_SIGNED_PREGNANCY_LOCKED';
    end if;
  end if;

  -- C1.1: pregnancy_id so muda pela RPC, com GUC local. Assinado nunca muda.
  if TG_OP = 'UPDATE'
     and new.pregnancy_id is distinct from old.pregnancy_id then
    if old.status = 'signed'::public.encounter_status
       or new.status = 'signed'::public.encounter_status then
      raise exception 'ENCOUNTER_SIGNED_PREGNANCY_LOCKED';
    end if;
    v_allow := current_setting('casa_florescer.allow_encounter_pregnancy_link', true);
    if v_allow is distinct from '1' then
      raise exception 'PREGNANCY_LINK_ONLY_RPC';
    end if;
  elsif TG_OP = 'INSERT' and new.pregnancy_id is not null then
    v_allow := current_setting('casa_florescer.allow_encounter_pregnancy_link', true);
    if v_allow is distinct from '1' then
      raise exception 'PREGNANCY_LINK_ONLY_RPC';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.encounters_before_write() is
  'C1.4 + C1.1: escopo do encounter, bloqueio signed→open, identidade apos assinatura, e pregnancy_id somente via RPC com encounter aberto.';

-- ---------------------------------------------------------------------------
-- 4) RPC link
-- ---------------------------------------------------------------------------

create or replace function public.link_encounter_to_pregnancy(
  p_encounter_id uuid,
  p_pregnancy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if v_enc.status = 'signed'::public.encounter_status then
    raise exception 'ENCOUNTER_SIGNED_PREGNANCY_LOCKED';
  end if;

  if not public.can_link_encounter_pregnancy(p_encounter_id, p_pregnancy_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform set_config('casa_florescer.allow_encounter_pregnancy_link', '1', true);

  update public.encounters
     set pregnancy_id = p_pregnancy_id
   where id = p_encounter_id
   returning * into v_enc;

  perform public.write_audit(
    'update',
    'encounters',
    v_enc.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'link_encounter_to_pregnancy',
      'pregnancy_id', v_enc.pregnancy_id
    )
  );

  return v_enc.id;
end;
$$;

comment on function public.link_encounter_to_pregnancy(uuid, uuid) is
  'C1.1: vincula encounter aberto a gestacao in_care da mesma paciente e pratica. Somente principal ou retaguarda com grant, sendo a profissional do atendimento.';

-- ---------------------------------------------------------------------------
-- 5) RPC unlink
-- ---------------------------------------------------------------------------

create or replace function public.unlink_encounter_from_pregnancy(
  p_encounter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for update;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if v_enc.status = 'signed'::public.encounter_status then
    raise exception 'ENCOUNTER_SIGNED_PREGNANCY_LOCKED';
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if v_enc.pregnancy_id is null then
    raise exception 'PREGNANCY_LINK_ABSENT';
  end if;

  if not public.can_link_encounter_pregnancy(v_enc.id, v_enc.pregnancy_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform set_config('casa_florescer.allow_encounter_pregnancy_link', '1', true);

  update public.encounters
     set pregnancy_id = null
   where id = v_enc.id
   returning * into v_enc;

  perform public.write_audit(
    'update',
    'encounters',
    v_enc.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'unlink_encounter_from_pregnancy',
      'pregnancy_id', null
    )
  );

  return v_enc.id;
end;
$$;

comment on function public.unlink_encounter_from_pregnancy(uuid) is
  'C1.1: remove o vinculo somente com encounter aberto e profissional autorizada. Encounter assinado permanece bloqueado.';

-- ---------------------------------------------------------------------------
-- 6) clinical_note_upsert — se houver gestacao, revalida o vinculo
-- ---------------------------------------------------------------------------

create or replace function public.clinical_note_upsert(
  p_encounter_id uuid,
  p_body text,
  p_template_code text default 'soap_min'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_id uuid;
  v_version integer;
  v_body text;
  v_template text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 then
    raise exception 'NOTE_BODY_REQUIRED';
  end if;

  v_template := nullif(trim(coalesce(p_template_code, '')), '');
  if v_template is null then
    v_template := 'soap_min';
  end if;

  select * into v_enc
  from public.encounters
  where id = p_encounter_id
  for share;

  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if v_enc.status is distinct from 'open'::public.encounter_status then
    raise exception 'ENCOUNTER_NOT_OPEN';
  end if;

  if not public.can_write_clinical(v_enc.practice_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.professionals pr
    where pr.id = v_enc.professional_id
      and pr.profile_id = auth.uid()
      and pr.practice_id = v_enc.practice_id
  ) then
    raise exception 'ENCOUNTER_OWNER_REQUIRED';
  end if;

  if not public.can_read_clinical(
    v_enc.practice_id,
    v_enc.patient_id,
    v_enc.professional_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if v_enc.pregnancy_id is not null
     and not public.can_link_encounter_pregnancy(v_enc.id, v_enc.pregnancy_id) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.clinical_notes (
    encounter_id,
    organization_id,
    practice_id,
    body_ciphertext,
    template_code,
    version,
    created_by
  ) values (
    v_enc.id,
    v_enc.organization_id,
    v_enc.practice_id,
    v_body,
    v_template,
    1,
    auth.uid()
  )
  on conflict (encounter_id, template_code) do update
    set body_ciphertext = excluded.body_ciphertext,
        version = public.clinical_notes.version + 1
  returning id, version into v_id, v_version;

  perform public.write_audit(
    case when v_version = 1 then 'insert'::public.audit_action else 'update'::public.audit_action end,
    'clinical_notes',
    v_id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'encounter_id', v_enc.id,
      'template_code', v_template,
      'version', v_version,
      'rpc', 'clinical_note_upsert'
    )
  );

  return v_id;
end;
$$;

comment on function public.clinical_note_upsert(uuid, text, text) is
  'C1.4 + C1.1: upsert com encounter open e medica dona. Se pregnancy_id estiver preenchido, exige principal ou retaguarda com grant. Gestacao nao e obrigatoria para assinar.';

-- ---------------------------------------------------------------------------
-- 7) SELECT — ginecologia intacta; obstetrico sem can_access_pregnancy
-- ---------------------------------------------------------------------------

drop policy if exists encounters_clinical_select on public.encounters;

create policy encounters_clinical_select on public.encounters
  for select
  using (
    public.can_read_clinical(practice_id, patient_id, professional_id)
    and (
      pregnancy_id is null
      or public.can_read_linked_pregnancy(pregnancy_id, practice_id, patient_id)
    )
  );

comment on policy encounters_clinical_select on public.encounters is
  'C1.1: sem gestacao, can_read_clinical. Com gestacao, tambem principal, retaguarda com grant ou break-glass. Nao usa can_access_pregnancy.';

drop policy if exists clinical_notes_select on public.clinical_notes;

create policy clinical_notes_select on public.clinical_notes
  for select
  using (
    exists (
      select 1
      from public.encounters e
      where e.id = clinical_notes.encounter_id
        and public.can_read_clinical(e.practice_id, e.patient_id, e.professional_id)
        and (
          e.pregnancy_id is null
          or public.can_read_linked_pregnancy(e.pregnancy_id, e.practice_id, e.patient_id)
        )
    )
  );

comment on policy clinical_notes_select on public.clinical_notes is
  'C1.1: SOAP segue a mesma porta do encounter. Gestacao nula preserva a C1. Gestacao preenchida nao abre para secretaria, owner ou admin.';

-- UPDATE direto nao pode contornar a RPC: a policy da 0018 liberava qualquer medica da pratica.
drop policy if exists clinical_notes_update on public.clinical_notes;

create policy clinical_notes_update on public.clinical_notes
  for update
  using (
    public.can_write_clinical(practice_id)
    and exists (
      select 1
      from public.encounters e
      where e.id = clinical_notes.encounter_id
        and e.status = 'open'::public.encounter_status
        and (
          e.pregnancy_id is null
          or public.can_read_linked_pregnancy(e.pregnancy_id, e.practice_id, e.patient_id)
        )
    )
  )
  with check (
    public.can_write_clinical(practice_id)
    and exists (
      select 1
      from public.encounters e
      where e.id = clinical_notes.encounter_id
        and e.status = 'open'::public.encounter_status
        and (
          e.pregnancy_id is null
          or public.can_read_linked_pregnancy(e.pregnancy_id, e.practice_id, e.patient_id)
        )
    )
  );

comment on policy clinical_notes_update on public.clinical_notes is
  'C1.1: update so com encounter open e can_write_clinical. Sem gestacao, regra C1. Com gestacao, tambem can_read_linked_pregnancy. Nao usa can_access_pregnancy.';

-- ---------------------------------------------------------------------------
-- 8) Grants (padrao 0018)
-- ---------------------------------------------------------------------------

revoke all on function public.can_link_encounter_pregnancy(uuid, uuid) from public;
revoke all on function public.can_link_encounter_pregnancy(uuid, uuid) from anon;
grant execute on function public.can_link_encounter_pregnancy(uuid, uuid) to authenticated;

revoke all on function public.can_read_linked_pregnancy(uuid, uuid, uuid) from public;
revoke all on function public.can_read_linked_pregnancy(uuid, uuid, uuid) from anon;
grant execute on function public.can_read_linked_pregnancy(uuid, uuid, uuid) to authenticated;

revoke all on function public.link_encounter_to_pregnancy(uuid, uuid) from public;
revoke all on function public.link_encounter_to_pregnancy(uuid, uuid) from anon;
grant execute on function public.link_encounter_to_pregnancy(uuid, uuid) to authenticated;

revoke all on function public.unlink_encounter_from_pregnancy(uuid) from public;
revoke all on function public.unlink_encounter_from_pregnancy(uuid) from anon;
grant execute on function public.unlink_encounter_from_pregnancy(uuid) to authenticated;

revoke all on function public.clinical_note_upsert(uuid, text, text) from public;
revoke all on function public.clinical_note_upsert(uuid, text, text) from anon;
grant execute on function public.clinical_note_upsert(uuid, text, text) to authenticated;
