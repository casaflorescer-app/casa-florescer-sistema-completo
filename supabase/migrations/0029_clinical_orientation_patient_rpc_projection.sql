-- C032.4 — RPCs da paciente não devolvem transcription_text.

drop function if exists public.clinical_orientation_mark_viewed(uuid);
drop function if exists public.clinical_orientation_mark_audio_played(uuid);

create function public.clinical_orientation_mark_viewed(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.clinical_orientation_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  if not public.is_patient_self(v_row.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.viewed_at is null then
    update public.clinical_orientation_versions
       set viewed_at = now()
     where id = p_version_id
    returning * into v_row;

    perform public.write_audit(
      'read'::public.audit_action,
      'clinical_orientation_versions',
      v_row.id,
      v_row.practice_id,
      v_row.patient_id,
      jsonb_build_object('rpc', 'clinical_orientation_mark_viewed', 'event', 'ORIENTATION_VIEWED')
    );
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'viewed_at', v_row.viewed_at,
    'audio_played_at', v_row.audio_played_at,
    'delivery_mode', v_row.delivery_mode
  );
end;
$$;

create function public.clinical_orientation_mark_audio_played(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_orientation_versions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row
  from public.clinical_orientation_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'ORIENTATION_NOT_FOUND';
  end if;

  if v_row.status <> 'published' then
    raise exception 'ORIENTATION_NOT_PUBLISHED';
  end if;

  if v_row.delivery_mode <> 'TEXT_AND_AUDIO' then
    raise exception 'ORIENTATION_AUDIO_NOT_AVAILABLE';
  end if;

  if not public.is_patient_self(v_row.patient_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_row.audio_played_at is null then
    update public.clinical_orientation_versions
       set audio_played_at = now(),
           viewed_at = coalesce(viewed_at, now())
     where id = p_version_id
    returning * into v_row;

    perform public.write_audit(
      'read'::public.audit_action,
      'clinical_orientation_versions',
      v_row.id,
      v_row.practice_id,
      v_row.patient_id,
      jsonb_build_object('rpc', 'clinical_orientation_mark_audio_played', 'event', 'ORIENTATION_AUDIO_PLAYED')
    );
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'viewed_at', v_row.viewed_at,
    'audio_played_at', v_row.audio_played_at,
    'delivery_mode', v_row.delivery_mode
  );
end;
$$;

revoke all on function public.clinical_orientation_mark_viewed(uuid) from public, anon;
revoke all on function public.clinical_orientation_mark_audio_played(uuid) from public, anon;
grant execute on function public.clinical_orientation_mark_viewed(uuid) to authenticated;
grant execute on function public.clinical_orientation_mark_audio_played(uuid) to authenticated;
