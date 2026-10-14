-- C040.5 — Fechamento documental: feedback do encounter + auditoria de revisão
-- Não altera 0001–0043. Não muda semântica de actual_end / starts_at / scheduled_*.
-- Assinatura continua em encounter_sign (0018). Encerramento temporal em appointment_record_actual_end (0039).

-- ============================================================================
-- 1) Feedback da paciente sobre o atendimento (≠ orientation_feedback)
-- ============================================================================

create table if not exists public.encounter_patient_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  encounter_id uuid not null references public.encounters (id),
  satisfaction_score integer
    check (satisfaction_score is null or (satisfaction_score between 1 and 5)),
  experience_comment text,
  source text not null default 'portal'
    check (source in ('portal', 'clinical', 'staff')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (encounter_id)
);

create index if not exists encounter_patient_feedback_patient_idx
  on public.encounter_patient_feedback (patient_id, created_at desc);

create index if not exists encounter_patient_feedback_practice_idx
  on public.encounter_patient_feedback (practice_id, created_at desc);

comment on table public.encounter_patient_feedback is
  'C040.5: feedback de experiência do atendimento. Não altera SOAP/receita/exames/anamnese.';

revoke all on table public.encounter_patient_feedback from public, anon, authenticated;
grant select on table public.encounter_patient_feedback to authenticated;

alter table public.encounter_patient_feedback enable row level security;

create policy encounter_patient_feedback_patient_select
  on public.encounter_patient_feedback
  for select to authenticated
  using (public.is_patient_self(patient_id));

create policy encounter_patient_feedback_physician_select
  on public.encounter_patient_feedback
  for select to authenticated
  using (
    public.can_read_clinical(
      practice_id,
      patient_id,
      (select e.professional_id from public.encounters e where e.id = encounter_id)
    )
  );

-- ============================================================================
-- 2) Auditoria de revisão (sem corpo clínico)
-- ============================================================================

create or replace function public.encounter_audit_event(
  p_encounter_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_allowed text[] := array[
    'encounter_review_started',
    'encounter_review_completed',
    'encounter_closed',
    'clinical_document_finalized',
    'patient_feedback_viewed'
  ];
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_event is null or not (p_event = any (v_allowed)) then
    raise exception 'INVALID_EVENT';
  end if;

  select * into v_enc from public.encounters where id = p_encounter_id;
  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if not (
    public.can_write_clinical(v_enc.practice_id)
    or public.can_read_clinical(v_enc.practice_id, v_enc.patient_id, v_enc.professional_id)
    or public.is_patient_self(v_enc.patient_id)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  -- paciente só pode registrar visualização de feedback
  if public.is_patient_self(v_enc.patient_id)
     and not public.can_write_clinical(v_enc.practice_id)
     and p_event is distinct from 'patient_feedback_viewed' then
    raise exception 'FORBIDDEN';
  end if;

  perform public.write_audit(
    'update'::public.audit_action,
    'encounters',
    v_enc.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_audit_event',
      'event', p_event,
      'encounter_id', v_enc.id,
      'encounter_status', v_enc.status
    )
  );
end;
$$;

revoke all on function public.encounter_audit_event(uuid, text) from public, anon;
grant execute on function public.encounter_audit_event(uuid, text) to authenticated;

-- ============================================================================
-- 3) Feedback upsert (idempotente por encounter)
-- ============================================================================

create or replace function public.encounter_patient_feedback_upsert(
  p_encounter_id uuid,
  p_satisfaction_score integer default null,
  p_experience_comment text default null,
  p_source text default 'portal'
)
returns public.encounter_patient_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_row public.encounter_patient_feedback%rowtype;
  v_source text := coalesce(nullif(trim(p_source), ''), 'portal');
  v_is_patient boolean;
  v_is_physician boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_source not in ('portal', 'clinical', 'staff') then
    raise exception 'INVALID_SOURCE';
  end if;
  if p_satisfaction_score is not null
     and (p_satisfaction_score < 1 or p_satisfaction_score > 5) then
    raise exception 'INVALID_SCORE';
  end if;
  if p_satisfaction_score is null
     and (p_experience_comment is null or length(trim(p_experience_comment)) = 0) then
    raise exception 'FEEDBACK_EMPTY';
  end if;

  select * into v_enc from public.encounters where id = p_encounter_id for share;
  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  v_is_patient := public.is_patient_self(v_enc.patient_id);
  v_is_physician := public.can_write_clinical(v_enc.practice_id)
    and exists (
      select 1 from public.professionals pr
      where pr.id = v_enc.professional_id
        and pr.profile_id = auth.uid()
        and pr.practice_id = v_enc.practice_id
    );

  if not v_is_patient and not v_is_physician then
    raise exception 'FORBIDDEN';
  end if;

  -- paciente: somente após assinatura; nunca cria SOAP
  if v_is_patient then
    if v_enc.status is distinct from 'signed'::public.encounter_status
       and v_enc.status is distinct from 'amended'::public.encounter_status then
      raise exception 'ENCOUNTER_NOT_SIGNED';
    end if;
    v_source := 'portal';
  end if;

  insert into public.encounter_patient_feedback (
    organization_id, practice_id, patient_id, encounter_id,
    satisfaction_score, experience_comment, source, created_by
  ) values (
    v_enc.organization_id, v_enc.practice_id, v_enc.patient_id, v_enc.id,
    p_satisfaction_score,
    nullif(trim(coalesce(p_experience_comment, '')), ''),
    v_source,
    auth.uid()
  )
  on conflict (encounter_id) do update
    set satisfaction_score = excluded.satisfaction_score,
        experience_comment = excluded.experience_comment,
        source = excluded.source,
        updated_at = now()
  returning * into v_row;

  perform public.write_audit(
    case when v_row.created_at = v_row.updated_at
      then 'insert'::public.audit_action
      else 'update'::public.audit_action
    end,
    'encounter_patient_feedback',
    v_row.id,
    v_enc.practice_id,
    v_enc.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_patient_feedback_upsert',
      'event', case when v_row.created_at = v_row.updated_at
        then 'patient_feedback_created'
        else 'patient_feedback_updated'
      end,
      'encounter_id', v_enc.id,
      'source', v_row.source,
      'has_score', v_row.satisfaction_score is not null
    )
  );

  return v_row;
end;
$$;

revoke all on function public.encounter_patient_feedback_upsert(uuid, integer, text, text)
  from public, anon;
grant execute on function public.encounter_patient_feedback_upsert(uuid, integer, text, text)
  to authenticated;

create or replace function public.encounter_patient_feedback_get(p_encounter_id uuid)
returns public.encounter_patient_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc public.encounters%rowtype;
  v_row public.encounter_patient_feedback%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_enc from public.encounters where id = p_encounter_id;
  if not found then
    raise exception 'ENCOUNTER_NOT_FOUND';
  end if;

  if not (
    public.is_patient_self(v_enc.patient_id)
    or public.can_read_clinical(v_enc.practice_id, v_enc.patient_id, v_enc.professional_id)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_row
  from public.encounter_patient_feedback
  where encounter_id = p_encounter_id;

  return v_row;
end;
$$;

revoke all on function public.encounter_patient_feedback_get(uuid) from public, anon;
grant execute on function public.encounter_patient_feedback_get(uuid) to authenticated;

-- Lista encounters assinados elegíveis a feedback no portal (sem SOAP)
create or replace function public.patient_portal_feedback_targets()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select pa.patient_id into v_patient
  from public.patient_accounts pa
  where pa.user_id = auth.uid()
  limit 1;

  if v_patient is null then
    raise exception 'FORBIDDEN';
  end if;

  return coalesce((
    select jsonb_agg(item order by item->>'signed_at' desc nulls last)
    from (
      select jsonb_build_object(
        'encounter_id', e.id,
        'practice_id', e.practice_id,
        'signed_at', e.signed_at,
        'created_at', e.created_at,
        'has_feedback', exists (
          select 1 from public.encounter_patient_feedback f where f.encounter_id = e.id
        )
      ) as item
      from public.encounters e
      where e.patient_id = v_patient
        and e.status in ('signed'::public.encounter_status, 'amended'::public.encounter_status)
      order by e.signed_at desc nulls last, e.created_at desc
      limit 20
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.patient_portal_feedback_targets() from public, anon;
grant execute on function public.patient_portal_feedback_targets() to authenticated;
