-- C032.4 — Isolar transcrição automática do SELECT da paciente.
-- Paciente continua lendo versões published (texto final / delivery_mode),
-- sem poder projetar transcription_text / transcription_error via PostgREST.
-- Médica lê transcrição via RPC security definer.

revoke select on table public.clinical_orientation_versions from authenticated;

grant select (
  id,
  orientation_id,
  organization_id,
  practice_id,
  patient_id,
  professional_id,
  version,
  status,
  audio_storage_path,
  audio_mime_type,
  audio_duration_seconds,
  transcription_status,
  final_text,
  delivery_mode,
  reviewed_confirmed,
  created_by,
  created_at,
  published_at,
  published_by,
  viewed_at,
  audio_played_at
) on table public.clinical_orientation_versions to authenticated;

comment on column public.clinical_orientation_versions.transcription_text is
  'Rascunho automático. Sem GRANT SELECT para authenticated; leitura clínica via RPC.';

create or replace function public.clinical_orientation_versions_list(p_orientation_id uuid)
returns setof public.clinical_orientation_versions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_practice uuid;
  v_patient uuid;
  v_professional uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select practice_id, patient_id, professional_id
    into v_practice, v_patient, v_professional
  from public.clinical_orientations
  where id = p_orientation_id;

  if not found then
    return;
  end if;

  if not public.can_read_clinical(v_practice, v_patient, v_professional) then
    raise exception 'FORBIDDEN';
  end if;

  return query
    select v.*
    from public.clinical_orientation_versions v
    where v.orientation_id = p_orientation_id
    order by v.version desc;
end;
$$;

revoke all on function public.clinical_orientation_versions_list(uuid) from public, anon;
grant execute on function public.clinical_orientation_versions_list(uuid) to authenticated;
