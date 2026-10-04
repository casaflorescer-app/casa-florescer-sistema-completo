-- C036 / Commit 036 prep — Fundação da Central de Relacionamentos
--
-- SEPARAÇÃO OBRIGATÓRIA:
--   MÓDULO CLÍNICO (prontuário/SOAP/exames/orientações/receitas)
--   ≠
--   CENTRAL DE RELACIONAMENTOS (contato/campanhas/oportunidades)
--
-- LGPD / PRIVACIDADE (primeira versão):
--   NÃO segmentar por diagnóstico, CID, gravidez, risco, exames, SOAP,
--   orientação, receita, histórico obstétrico ou qualquer dado de saúde.
--   Segmentação permitida: aniversário, canal, opt-out, tempo desde última
--   consulta (sem conteúdo clínico), ausência de novo agendamento, seleção manual.
--
-- Não reutiliza return_reminders como campaign.
-- Não altera agenda/prediction/blocks/clínico.
-- Provider real de WhatsApp/e-mail/push NÃO está configurado nesta etapa.

-- ---------------------------------------------------------------------------
-- 1) Helper de autorização (OWNER / ADMIN / SECRETARY da prática)
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_relationship(
  p_organization uuid,
  p_practice uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and public.current_profile_id() is not null
    and exists (
      select 1
      from public.practice_units pu
      where pu.id = p_practice
        and pu.organization_id = p_organization
    )
    and (
      public.has_practice_role(
        p_practice,
        array['owner', 'admin', 'secretary']::public.app_role[]
      )
      or public.is_house_ops(p_organization)
    )
    and not public.has_practice_role(
      p_practice,
      array['physician']::public.app_role[]
    )
    -- Médica com papel dual owner/admin/secretary continua elegível via has_practice_role acima.
    -- Bloqueio puro de physician-only: se só tem physician, has_practice_role owner/admin/secretary = false
    -- e is_house_ops = false → negado.
$$;

comment on function public.can_manage_relationship(uuid, uuid) is
  'Central de Relacionamentos: owner/admin/secretary (ou house ops). Paciente e physician-only: negado.';

revoke all on function public.can_manage_relationship(uuid, uuid) from public, anon;
grant execute on function public.can_manage_relationship(uuid, uuid) to authenticated;

-- Physician-only explícito: se o usuário tem owner/admin/secretary na prática, pode.
-- Ajustar helper para NÃO negar physician quando também tem ops role.
create or replace function public.can_manage_relationship(
  p_organization uuid,
  p_practice uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and public.current_profile_id() is not null
    and exists (
      select 1
      from public.practice_units pu
      where pu.id = p_practice
        and pu.organization_id = p_organization
    )
    and (
      public.has_practice_role(
        p_practice,
        array['owner', 'admin', 'secretary']::public.app_role[]
      )
      or public.is_house_ops(p_organization)
    );
$$;

-- ---------------------------------------------------------------------------
-- 2) communication_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  whatsapp_enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  relationship_messages_enabled boolean not null default true,
  campaign_messages_enabled boolean not null default true,
  administrative_messages_enabled boolean not null default true,
  preferred_channel text not null default 'whatsapp'
    check (preferred_channel in ('whatsapp', 'email', 'push', 'phone', 'other')),
  campaign_opt_out_at timestamptz,
  campaign_opt_out_reason text,
  campaign_opt_out_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, patient_id)
);

create index if not exists communication_preferences_patient_idx
  on public.communication_preferences (patient_id);

comment on table public.communication_preferences is
  'Preferências de relacionamento. Opt-out de campanha ≠ bloqueio administrativo. Sem dados clínicos.';

-- ---------------------------------------------------------------------------
-- 3) campaign_templates
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  name text not null,
  purpose text not null
    check (purpose in (
      'relationship', 'birthday', 'return', 'campaign', 'course',
      'news', 'promotion', 'administrative', 'other'
    )),
  channel text not null
    check (channel in ('whatsapp', 'email', 'push')),
  subject text,
  body text not null,
  variables jsonb not null default '["nome","primeiro_nome","nome_clinica","telefone_clinica","link_agendamento","data"]'::jsonb,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) >= 2),
  check (char_length(btrim(body)) >= 3)
);

create index if not exists campaign_templates_practice_idx
  on public.campaign_templates (practice_id, active, purpose);

comment on table public.campaign_templates is
  'Modelos de mensagem de relacionamento. Variáveis cadastrais apenas — sem conteúdo clínico.';

-- ---------------------------------------------------------------------------
-- 4) campaigns
-- ---------------------------------------------------------------------------

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  name text not null,
  objective text not null
    check (objective in (
      'relationship', 'birthday', 'return', 'campaign', 'course',
      'news', 'procedure_promo', 'administrative', 'other'
    )),
  purpose text not null default 'relationship'
    check (purpose in ('relationship', 'campaign', 'administrative')),
  channel text not null
    check (channel in ('whatsapp', 'email', 'push')),
  template_id uuid references public.campaign_templates (id),
  status text not null default 'DRAFT'
    check (status in (
      'DRAFT', 'AUDIENCE_REVIEW', 'READY', 'QUEUED', 'PROCESSING',
      'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'
    )),
  audience_filter text
    check (
      audience_filter is null
      or audience_filter in (
        'manual', 'birthday_today', 'birthday_7d', 'inactive_12m', 'no_upcoming'
      )
    ),
  message_subject text,
  message_body text,
  audience_frozen_at timestamptz,
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  scheduled_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) >= 2)
);

create index if not exists campaigns_practice_status_idx
  on public.campaigns (practice_id, status, created_at desc);

comment on table public.campaigns is
  'Campanhas de relacionamento. Sem status SENT sem confirmação de provider real.';

-- ---------------------------------------------------------------------------
-- 5) campaign_audiences (snapshot)
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_audiences (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  patient_id uuid not null references public.patients (id),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  eligibility_status text not null
    check (eligibility_status in ('eligible', 'ineligible')),
  exclusion_reason text,
  selected_by uuid references public.profiles (id),
  selected_at timestamptz not null default now(),
  primary key (campaign_id, patient_id)
);

create index if not exists campaign_audiences_practice_idx
  on public.campaign_audiences (practice_id, eligibility_status);

comment on table public.campaign_audiences is
  'Snapshot de audiência. Congelado em audience_frozen_at da campanha.';

-- ---------------------------------------------------------------------------
-- 6) campaign_dispatches / recipients / messages
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  channel text not null check (channel in ('whatsapp', 'email', 'push')),
  status text not null default 'PENDING'
    check (status in (
      'PENDING', 'READY', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'
    )),
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  quantity_total integer not null default 0,
  quantity_processed integer not null default 0,
  quantity_success integer not null default 0,
  quantity_failed integer not null default 0,
  quantity_blocked integer not null default 0,
  quantity_opted_out integer not null default 0,
  provider_configured boolean not null default false,
  simulation_only boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_dispatches_campaign_idx
  on public.campaign_dispatches (campaign_id, created_at desc);

create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  dispatch_id uuid references public.campaign_dispatches (id) on delete set null,
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  channel text not null check (channel in ('whatsapp', 'email', 'push')),
  rendered_message text not null,
  status text not null default 'PENDING'
    check (status in (
      'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ',
      'FAILED', 'BLOCKED', 'OPTED_OUT', 'INVALID_CONTACT'
    )),
  provider_message_id text,
  idempotency_key text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  unique (campaign_id, patient_id, channel),
  unique (idempotency_key)
);

create index if not exists campaign_messages_dispatch_idx
  on public.campaign_messages (dispatch_id, status);

create table if not exists public.campaign_dispatch_recipients (
  dispatch_id uuid not null references public.campaign_dispatches (id) on delete cascade,
  patient_id uuid not null references public.patients (id),
  message_id uuid references public.campaign_messages (id) on delete set null,
  status text not null default 'PENDING'
    check (status in (
      'PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ',
      'FAILED', 'BLOCKED', 'OPTED_OUT', 'INVALID_CONTACT'
    )),
  created_at timestamptz not null default now(),
  primary key (dispatch_id, patient_id)
);

-- ---------------------------------------------------------------------------
-- 7) relationship_opportunities + history
-- ---------------------------------------------------------------------------

create table if not exists public.relationship_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid references public.patients (id),
  opportunity_type text not null
    check (opportunity_type in (
      'birthday', 'inactive_12m', 'no_upcoming', 'manual',
      'patient_requested_contact', 'campaign_available', 'other'
    )),
  title text not null,
  description text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  status text not null default 'OPEN'
    check (status in (
      'OPEN', 'IN_PROGRESS', 'CONTACTED', 'CONVERTED', 'DISMISSED', 'EXPIRED'
    )),
  due_at date,
  source text not null default 'rule'
    check (source in ('rule', 'manual', 'system')),
  assigned_to uuid references public.profiles (id),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (char_length(btrim(title)) >= 2),
  -- metadata NÃO deve carregar conteúdo clínico
  check (not (metadata ? 'diagnosis' or metadata ? 'cid' or metadata ? 'soap' or metadata ? 'exam_result'))
);

create index if not exists relationship_opportunities_practice_open_idx
  on public.relationship_opportunities (practice_id, status, due_at)
  where status in ('OPEN', 'IN_PROGRESS');

comment on table public.relationship_opportunities is
  'Oportunidades de relacionamento. Sem dados clínicos. Não é prontuário.';

create table if not exists public.relationship_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  practice_id uuid not null references public.practice_units (id),
  patient_id uuid not null references public.patients (id),
  event_type text not null,
  title text not null,
  detail text,
  campaign_id uuid references public.campaigns (id) on delete set null,
  opportunity_id uuid references public.relationship_opportunities (id) on delete set null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (char_length(btrim(title)) >= 2)
);

create index if not exists relationship_history_patient_idx
  on public.relationship_history (patient_id, created_at desc);

comment on table public.relationship_history is
  'Histórico de relacionamento separado do prontuário/SOAP/exames/orientações.';

-- ---------------------------------------------------------------------------
-- 8) Grants + RLS
-- ---------------------------------------------------------------------------

revoke all on table public.communication_preferences from public, anon, authenticated;
revoke all on table public.campaign_templates from public, anon, authenticated;
revoke all on table public.campaigns from public, anon, authenticated;
revoke all on table public.campaign_audiences from public, anon, authenticated;
revoke all on table public.campaign_dispatches from public, anon, authenticated;
revoke all on table public.campaign_messages from public, anon, authenticated;
revoke all on table public.campaign_dispatch_recipients from public, anon, authenticated;
revoke all on table public.relationship_opportunities from public, anon, authenticated;
revoke all on table public.relationship_history from public, anon, authenticated;

grant select on table public.communication_preferences to authenticated;
grant select on table public.campaign_templates to authenticated;
grant select on table public.campaigns to authenticated;
grant select on table public.campaign_audiences to authenticated;
grant select on table public.campaign_dispatches to authenticated;
grant select on table public.campaign_messages to authenticated;
grant select on table public.campaign_dispatch_recipients to authenticated;
grant select on table public.relationship_opportunities to authenticated;
grant select on table public.relationship_history to authenticated;

alter table public.communication_preferences enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_audiences enable row level security;
alter table public.campaign_dispatches enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.campaign_dispatch_recipients enable row level security;
alter table public.relationship_opportunities enable row level security;
alter table public.relationship_history enable row level security;

create policy communication_preferences_ops_select on public.communication_preferences
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaign_templates_ops_select on public.campaign_templates
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaigns_ops_select on public.campaigns
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaign_audiences_ops_select on public.campaign_audiences
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaign_dispatches_ops_select on public.campaign_dispatches
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaign_messages_ops_select on public.campaign_messages
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy campaign_dispatch_recipients_ops_select on public.campaign_dispatch_recipients
  for select to authenticated
  using (
    exists (
      select 1 from public.campaign_dispatches d
      where d.id = dispatch_id
        and public.can_manage_relationship(d.organization_id, d.practice_id)
    )
  );

create policy relationship_opportunities_ops_select on public.relationship_opportunities
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

create policy relationship_history_ops_select on public.relationship_history
  for select to authenticated
  using (public.can_manage_relationship(organization_id, practice_id));

-- Sem INSERT/UPDATE/DELETE direto — apenas RPCs SECURITY DEFINER.
