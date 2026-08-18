-- Concorrência da recepção: 4 secretárias não podem duplo-agendar a mesma sala.
create extension if not exists btree_gist;

alter table public.patients
  add column if not exists reception_notes text,
  add column if not exists preferred_channel text not null default 'whatsapp';

alter table public.appointments
  add column if not exists source text not null default 'reception',
  add column if not exists checkin_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles (id);

alter table public.appointments
  drop constraint if exists appointments_room_no_overlap;

alter table public.appointments
  add constraint appointments_room_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show'));

comment on constraint appointments_room_no_overlap on public.appointments is
  'Impede duas secretárias de ocuparem o mesmo consultório no mesmo intervalo.';
