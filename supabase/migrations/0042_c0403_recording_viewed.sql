-- C040.3.1 — RECORDING_VIEWED (auditoria de reprodução/acesso ao áudio)
-- Migration mínima: somente RPC SECURITY DEFINER + grants.
-- Não altera tabelas clínicas, bucket, RLS de SELECT, nem RPCs existentes de gravação.

create or replace function public.encounter_recording_mark_viewed(
  p_session_id uuid,
  p_segment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sess public.encounter_recording_sessions%rowtype;
  v_seg public.encounter_recording_segments%rowtype;
  v_recent boolean := false;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_session_id is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  select * into v_sess
  from public.encounter_recording_sessions
  where id = p_session_id;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if not public.can_read_clinical(v_sess.practice_id, v_sess.patient_id, v_sess.professional_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_segment_id is not null then
    select * into v_seg
    from public.encounter_recording_segments
    where id = p_segment_id
      and session_id = v_sess.id;

    if not found then
      raise exception 'SEGMENT_NOT_FOUND';
    end if;
  end if;

  -- Dedup curto: evita rajadas de re-render / play acidental.
  select exists (
    select 1
    from public.audit_events ae
    where ae.actor_id = auth.uid()
      and ae.entity_table = 'encounter_recording_sessions'
      and ae.entity_id = v_sess.id
      and ae.action = 'read'::public.audit_action
      and ae.occurred_at > now() - interval '2 minutes'
      and ae.metadata->>'event' = 'RECORDING_VIEWED'
      and (
        p_segment_id is null
        or ae.metadata->>'segment_id' = p_segment_id::text
      )
  ) into v_recent;

  if v_recent then
    return;
  end if;

  perform public.write_audit(
    'read'::public.audit_action,
    'encounter_recording_sessions',
    v_sess.id,
    v_sess.practice_id,
    v_sess.patient_id,
    jsonb_build_object(
      'rpc', 'encounter_recording_mark_viewed',
      'event', 'RECORDING_VIEWED',
      'encounter_id', v_sess.encounter_id,
      'recording_session_id', v_sess.id,
      'segment_id', p_segment_id
    )
  );
end;
$$;

revoke all on function public.encounter_recording_mark_viewed(uuid, uuid) from public, anon;
grant execute on function public.encounter_recording_mark_viewed(uuid, uuid) to authenticated;

comment on function public.encounter_recording_mark_viewed(uuid, uuid) is
  'C040.3.1: registra RECORDING_VIEWED ao reproduzir/acessar áudio (sem payload clínico).';
