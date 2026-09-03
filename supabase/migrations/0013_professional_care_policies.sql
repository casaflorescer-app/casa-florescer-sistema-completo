-- Fase B1 — política de atendimento versionada (profissional + prática).
-- NÃO edita 0011/0012. Sem disponibilidade, contrato, assinatura, financeiro ou desfecho.
-- Preço padrão NÃO entra em pregnancies, patients nem professionals.
-- Autorização comercial própria: não reutiliza can_access_pregnancy().
--
-- Leitura da secretária comum: flag individual em user_practice_roles
-- (mesmo padrão de can_manage_stock / can_cashier). NÃO usa profiles.permissions
-- (módulos de UI; nunca substituem RLS).

-- ---------------------------------------------------------------------------
-- Permissão comercial de leitura (secretária comum, por prática)
-- ---------------------------------------------------------------------------

alter table public.user_practice_roles
  add column if not exists can_view_care_policies boolean not null default false;

comment on column public.user_practice_roles.can_view_care_policies is
  'Secretária comum: permite SELECT da política padrão e dos valores desta prática. Default false. Não concede escrita, prontuário, gestação extra nem acesso a outra prática. OWNER/ADMIN/PHYSICIAN ignoram este flag (já leem/gerenciam pelo papel).';

create or replace function public.user_practice_roles_before_write()
returns trigger
language plpgsql
as $$
declare
  v_kind public.practice_kind;
begin
  if exists (select 1 from public.patient_accounts a where a.user_id = new.user_id) then
    raise exception 'Conta de paciente não pode receber papel de staff.';
  end if;

  select kind into v_kind
  from public.practice_units
  where id = new.practice_id;

  if new.role is distinct from 'physician' then
    new.clinical_access := 'none';
  else
    if new.clinical_access = 'break_glass' then
      raise exception 'break_glass não se concede em user_practice_roles.';
    end if;
    if v_kind = 'house' then
      if new.clinical_access = 'none' then
        new.clinical_access := 'practice';
      end if;
    else
      if new.clinical_access = 'practice' then
        raise exception 'Locatário não pode receber clinical_access = practice.';
      end if;
      if new.clinical_access = 'none' then
        new.clinical_access := 'own_encounters';
      end if;
    end if;
  end if;

  if new.role is distinct from 'secretary' then
    new.can_view_care_policies := false;
  end if;

  return new;
end;
$$;

create or replace function public.user_practice_roles_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'insert',
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
    if new.can_view_care_policies then
      perform public.write_audit(
        'grant',
        'user_practice_roles',
        new.id,
        new.practice_id,
        null,
        jsonb_build_object(
          'permission', 'can_view_care_policies',
          'user_id', new.user_id,
          'practice_id', new.practice_id,
          'enabled', true
        )
      );
    end if;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(
      'update',
      'user_practice_roles',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    );
    if old.can_view_care_policies is distinct from new.can_view_care_policies then
      perform public.write_audit(
        case when new.can_view_care_policies then 'grant' else 'revoke' end,
        'user_practice_roles',
        new.id,
        new.practice_id,
        null,
        jsonb_build_object(
          'permission', 'can_view_care_policies',
          'user_id', new.user_id,
          'practice_id', new.practice_id,
          'previous', old.can_view_care_policies,
          'current', new.can_view_care_policies
        )
      );
    end if;
  elsif tg_op = 'DELETE' then
    perform public.write_audit(
      'delete',
      'user_practice_roles',
      old.id,
      old.practice_id,
      null,
      jsonb_build_object('user_id', old.user_id, 'role', old.role)
    );
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cabeçalho estável (uma política por profissional + prática)
-- ---------------------------------------------------------------------------

create table public.professional_care_policies (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id),
  practice_id uuid not null references public.practice_units (id),
  organization_id uuid not null references public.organizations (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (professional_id, practice_id),
  unique (id, professional_id, practice_id),
  unique (id, organization_id),
  foreign key (professional_id, practice_id)
    references public.professionals (id, practice_id),
  foreign key (professional_id, organization_id)
    references public.professionals (id, organization_id)
);

comment on table public.professional_care_policies is
  'Política comercial de atendimento obstétrico. Uma por profissional + prática. O conteúdo vigente vive nas versões. B2 referenciará a versão (snapshot), não este cabeçalho mutável de valores.';

create index professional_care_policies_practice_idx
  on public.professional_care_policies (practice_id);

create index professional_care_policies_org_idx
  on public.professional_care_policies (organization_id);

-- ---------------------------------------------------------------------------
-- Versões imutáveis (valores e regras). No máximo uma vigente.
-- ---------------------------------------------------------------------------

create table public.professional_care_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.professional_care_policies (id),
  professional_id uuid not null references public.professionals (id),
  practice_id uuid not null references public.practice_units (id),
  organization_id uuid not null references public.organizations (id),
  version_number integer not null check (version_number >= 1),
  normal_birth_cents integer not null check (normal_birth_cents >= 0),
  cesarean_cents integer not null check (cesarean_cents >= 0),
  requires_availability_for_prenatal boolean not null,
  allows_prenatal_exception boolean not null,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (policy_id, version_number),
  check (effective_to is null or effective_to >= effective_from),
  check (
    allows_prenatal_exception = false
    or requires_availability_for_prenatal = true
  ),
  foreign key (policy_id, professional_id, practice_id)
    references public.professional_care_policies (id, professional_id, practice_id),
  foreign key (professional_id, practice_id)
    references public.professionals (id, practice_id),
  foreign key (professional_id, organization_id)
    references public.professionals (id, organization_id)
);

create unique index professional_care_policy_versions_one_current
  on public.professional_care_policy_versions (professional_id, practice_id)
  where effective_to is null;

create unique index professional_care_policy_versions_one_current_policy
  on public.professional_care_policy_versions (policy_id)
  where effective_to is null;

create index professional_care_policy_versions_policy_idx
  on public.professional_care_policy_versions (policy_id, version_number desc);

comment on table public.professional_care_policy_versions is
  'Versão imutável da política. effective_to NULL = vigente. Encerrar cria nova linha; valores históricos não são UPDATE. B2 deve gravar policy_version_id (snapshot).';
comment on column public.professional_care_policy_versions.normal_birth_cents is
  'Valor padrão parto normal em centavos. Zero permitido como lista (cortesia por paciente é B2).';
comment on column public.professional_care_policy_versions.cesarean_cents is
  'Valor padrão cesariana em centavos.';
comment on column public.professional_care_policy_versions.requires_availability_for_prenatal is
  'Se verdadeiro, a política exige contratação de disponibilidade para parto para realizar pré-natal. A entidade de exceção é B2.';
comment on column public.professional_care_policy_versions.allows_prenatal_exception is
  'Se verdadeiro, a política admite exceção de pré-natal sem disponibilidade (registro da exceção é B2). Só pode ser verdadeiro se requires_availability_for_prenatal.';
comment on column public.professional_care_policy_versions.effective_to is
  'NULL = vigente. Preenchido ao publicar a versão seguinte. Não reabre.';

-- ---------------------------------------------------------------------------
-- Autorização comercial (não clínica)
-- ---------------------------------------------------------------------------

create or replace function public.is_professional_self(p_professional uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.professionals pr
    where pr.id = p_professional
      and pr.profile_id = auth.uid()
  )
$$;

comment on function public.is_professional_self(uuid) is
  'Identidade comercial: o usuário autenticado é o profile deste professional. Não concede acesso clínico a gestações.';

create or replace function public.can_manage_professional_policy(
  p_practice uuid,
  p_professional uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_practice_role(
      p_practice,
      array['owner', 'admin']::public.app_role[]
    )
    or (
      public.is_professional_self(p_professional)
      and exists (
        select 1
        from public.professionals pr
        where pr.id = p_professional
          and pr.practice_id = p_practice
      )
      and public.has_practice_role(
        p_practice,
        array['physician']::public.app_role[]
      )
    )
$$;

comment on function public.can_manage_professional_policy(uuid, uuid) is
  'Escrita da política comercial: owner/admin da prática, ou a própria médica (physician) deste professional nesta prática. Secretária comum NÃO. SYSTEM_ADMIN NÃO é god mode. Não usa can_access_pregnancy.';

create or replace function public.can_view_practice_care_policies(p_practice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_practice_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and p.is_active
      and r.practice_id = p_practice
      and r.role = 'secretary'
      and r.can_view_care_policies
  )
$$;

comment on function public.can_view_practice_care_policies(uuid) is
  'Secretária comum com flag can_view_care_policies NESTA prática. Não é owner/admin. Não amplia clínico.';

create or replace function public.can_read_professional_policy(
  p_practice uuid,
  p_professional uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_practice_role(
      p_practice,
      array['owner', 'admin']::public.app_role[]
    )
    or public.can_view_practice_care_policies(p_practice)
    or (
      public.is_professional_self(p_professional)
      and exists (
        select 1
        from public.professionals pr
        where pr.id = p_professional
          and pr.practice_id = p_practice
      )
    )
$$;

comment on function public.can_read_professional_policy(uuid, uuid) is
  'Leitura comercial: owner/admin da prática, secretária COM can_view_care_policies nesta prática, ou a própria médica. Secretária sem o flag NÃO lê. Não usa can_access_pregnancy. Não amplia prontuário.';

revoke all on function public.is_professional_self(uuid) from public;
revoke all on function public.can_manage_professional_policy(uuid, uuid) from public;
revoke all on function public.can_view_practice_care_policies(uuid) from public;
revoke all on function public.can_read_professional_policy(uuid, uuid) from public;
revoke all on function public.is_professional_self(uuid) from anon;
revoke all on function public.can_manage_professional_policy(uuid, uuid) from anon;
revoke all on function public.can_view_practice_care_policies(uuid) from anon;
revoke all on function public.can_read_professional_policy(uuid, uuid) from anon;
grant execute on function public.is_professional_self(uuid) to authenticated;
grant execute on function public.can_manage_professional_policy(uuid, uuid) to authenticated;
grant execute on function public.can_view_practice_care_policies(uuid) to authenticated;
grant execute on function public.can_read_professional_policy(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: numeração, encerramento da vigente, congelamento, auditoria
-- ---------------------------------------------------------------------------

create or replace function public.professional_care_policy_versions_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.professional_care_policy_versions%rowtype;
  v_close_to date;
  v_next integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Versão de política não pode ser excluída.';
  end if;

  if tg_op = 'UPDATE' then
    if new.policy_id is distinct from old.policy_id
       or new.professional_id is distinct from old.professional_id
       or new.practice_id is distinct from old.practice_id
       or new.organization_id is distinct from old.organization_id
       or new.version_number is distinct from old.version_number
       or new.normal_birth_cents is distinct from old.normal_birth_cents
       or new.cesarean_cents is distinct from old.cesarean_cents
       or new.requires_availability_for_prenatal is distinct from old.requires_availability_for_prenatal
       or new.allows_prenatal_exception is distinct from old.allows_prenatal_exception
       or new.effective_from is distinct from old.effective_from
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Versão histórica de política não pode ser alterada.';
    end if;
    if old.effective_to is not null then
      raise exception 'Versão já encerrada não pode ser alterada.';
    end if;
    if new.effective_to is null then
      raise exception 'Encerramento de versão exige effective_to.';
    end if;
    return new;
  end if;

  if new.effective_to is not null then
    raise exception 'Nova versão deve nascer vigente (effective_to nulo).';
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  select coalesce(max(v.version_number), 0) + 1
    into v_next
  from public.professional_care_policy_versions v
  where v.policy_id = new.policy_id;

  new.version_number := v_next;

  select *
    into v_prev
  from public.professional_care_policy_versions v
  where v.policy_id = new.policy_id
    and v.effective_to is null
  for update;

  if found then
    if new.effective_from < v_prev.effective_from then
      raise exception 'A vigência da nova versão não pode começar antes da versão vigente.';
    end if;
    if v_prev.normal_birth_cents is not distinct from new.normal_birth_cents
       and v_prev.cesarean_cents is not distinct from new.cesarean_cents
       and v_prev.requires_availability_for_prenatal is not distinct from new.requires_availability_for_prenatal
       and v_prev.allows_prenatal_exception is not distinct from new.allows_prenatal_exception then
      raise exception 'Não criar versão duplicada: os valores e as regras são idênticos à vigente.';
    end if;
    if new.effective_from > v_prev.effective_from then
      v_close_to := new.effective_from - 1;
    else
      v_close_to := v_prev.effective_from;
    end if;
    update public.professional_care_policy_versions
       set effective_to = v_close_to
     where id = v_prev.id;
  end if;

  return new;
end;
$$;

create or replace function public.professional_care_policies_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Política de atendimento não pode ser excluída.';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Cabeçalho da política não pode ser alterado. Publique uma nova versão.';
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.professional_care_policy_versions_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(
      'insert',
      'professional_care_policy_versions',
      new.id,
      new.practice_id,
      null,
      jsonb_build_object(
        'action', 'publish_version',
        'policy_id', new.policy_id,
        'professional_id', new.professional_id,
        'practice_id', new.practice_id,
        'organization_id', new.organization_id,
        'version_number', new.version_number,
        'normal_birth_cents', new.normal_birth_cents,
        'cesarean_cents', new.cesarean_cents,
        'requires_availability_for_prenatal', new.requires_availability_for_prenatal,
        'allows_prenatal_exception', new.allows_prenatal_exception,
        'effective_from', new.effective_from,
        'effective_to', new.effective_to
      )
    );
    return new;
  end if;

  perform public.write_audit(
    'update',
    'professional_care_policy_versions',
    new.id,
    new.practice_id,
    null,
    jsonb_build_object(
      'action', 'close_version',
      'policy_id', new.policy_id,
      'professional_id', new.professional_id,
      'practice_id', new.practice_id,
      'version_number', new.version_number,
      'previous', jsonb_build_object(
        'effective_to', old.effective_to,
        'normal_birth_cents', old.normal_birth_cents,
        'cesarean_cents', old.cesarean_cents,
        'requires_availability_for_prenatal', old.requires_availability_for_prenatal,
        'allows_prenatal_exception', old.allows_prenatal_exception
      ),
      'current', jsonb_build_object(
        'effective_to', new.effective_to,
        'normal_birth_cents', new.normal_birth_cents,
        'cesarean_cents', new.cesarean_cents,
        'requires_availability_for_prenatal', new.requires_availability_for_prenatal,
        'allows_prenatal_exception', new.allows_prenatal_exception
      )
    )
  );
  return new;
end;
$$;

drop trigger if exists professional_care_policies_before_write on public.professional_care_policies;
create trigger professional_care_policies_before_write
  before insert or update or delete
  on public.professional_care_policies
  for each row execute function public.professional_care_policies_before_write();

drop trigger if exists professional_care_policy_versions_before_write
  on public.professional_care_policy_versions;
create trigger professional_care_policy_versions_before_write
  before insert or update or delete
  on public.professional_care_policy_versions
  for each row execute function public.professional_care_policy_versions_before_write();

drop trigger if exists professional_care_policy_versions_after_write
  on public.professional_care_policy_versions;
create trigger professional_care_policy_versions_after_write
  after insert or update
  on public.professional_care_policy_versions
  for each row execute function public.professional_care_policy_versions_after_write();

-- ---------------------------------------------------------------------------
-- RPC oficial de publicação. Única via de escrita para authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.publish_professional_care_policy_version(
  p_professional_id uuid,
  p_practice_id uuid,
  p_normal_birth_cents integer,
  p_cesarean_cents integer,
  p_requires_availability_for_prenatal boolean,
  p_allows_prenatal_exception boolean,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof public.professionals%rowtype;
  v_policy_id uuid;
  v_version_id uuid;
  v_allows boolean;
begin
  if auth.uid() is null then
    raise exception 'Sessão ausente.';
  end if;

  if p_professional_id is null or p_practice_id is null then
    raise exception 'Profissional e prática são obrigatórios.';
  end if;

  if p_normal_birth_cents is null or p_normal_birth_cents < 0
     or p_cesarean_cents is null or p_cesarean_cents < 0 then
    raise exception 'Valores monetários devem ser inteiros em centavos, maiores ou iguais a zero.';
  end if;

  if p_effective_from is null then
    raise exception 'Data de início da vigência é obrigatória.';
  end if;

  select * into v_prof
  from public.professionals
  where id = p_professional_id;

  if v_prof.id is null then
    raise exception 'Profissional inexistente.';
  end if;

  if v_prof.practice_id is distinct from p_practice_id then
    raise exception 'O profissional não pertence à prática informada.';
  end if;

  if not public.can_manage_professional_policy(p_practice_id, p_professional_id) then
    raise exception 'Sem permissão para gerenciar a política comercial deste profissional.';
  end if;

  v_allows := coalesce(p_allows_prenatal_exception, false);
  if not coalesce(p_requires_availability_for_prenatal, false) then
    v_allows := false;
  end if;

  select id into v_policy_id
  from public.professional_care_policies
  where professional_id = v_prof.id
    and practice_id = v_prof.practice_id;

  if v_policy_id is null then
    insert into public.professional_care_policies (
      professional_id, practice_id, organization_id, created_by
    ) values (
      v_prof.id, v_prof.practice_id, v_prof.organization_id, auth.uid()
    )
    returning id into v_policy_id;
  end if;

  insert into public.professional_care_policy_versions (
    policy_id,
    professional_id,
    practice_id,
    organization_id,
    version_number,
    normal_birth_cents,
    cesarean_cents,
    requires_availability_for_prenatal,
    allows_prenatal_exception,
    effective_from,
    created_by
  ) values (
    v_policy_id,
    v_prof.id,
    v_prof.practice_id,
    v_prof.organization_id,
    1,
    p_normal_birth_cents,
    p_cesarean_cents,
    coalesce(p_requires_availability_for_prenatal, false),
    v_allows,
    p_effective_from,
    auth.uid()
  )
  returning id into v_version_id;

  return v_version_id;
end;
$$;

comment on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) is
  'Publica uma nova versão vigente. Encerra a anterior. Não altera valores históricos. Secretária comum recusada por can_manage_professional_policy.';

revoke all on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) from public;
revoke all on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) from anon;
grant execute on function public.publish_professional_care_policy_version(uuid, uuid, integer, integer, boolean, boolean, date) to authenticated;

create or replace function public.set_secretary_care_policy_view(
  p_membership_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_practice_roles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão ausente.';
  end if;

  select * into v_row
  from public.user_practice_roles
  where id = p_membership_id;

  if v_row.id is null then
    raise exception 'Vínculo inexistente.';
  end if;

  if v_row.role is distinct from 'secretary' then
    raise exception 'A permissão de visualizar políticas aplica-se somente à secretária comum.';
  end if;

  if not public.has_practice_role(
    v_row.practice_id,
    array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'Somente owner ou admin da prática pode alterar esta permissão.';
  end if;

  update public.user_practice_roles
     set can_view_care_policies = coalesce(p_enabled, false)
   where id = v_row.id;
end;
$$;

comment on function public.set_secretary_care_policy_view(uuid, boolean) is
  'Concede ou revoga can_view_care_policies no vínculo secretary da prática. Não altera papel, clinical_access nem gestações.';

revoke all on function public.set_secretary_care_policy_view(uuid, boolean) from public;
revoke all on function public.set_secretary_care_policy_view(uuid, boolean) from anon;
grant execute on function public.set_secretary_care_policy_view(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.professional_care_policies enable row level security;
alter table public.professional_care_policy_versions enable row level security;

create policy professional_care_policies_select on public.professional_care_policies
  for select using (
    public.can_read_professional_policy(
      professional_care_policies.practice_id,
      professional_care_policies.professional_id
    )
  );

create policy professional_care_policy_versions_select on public.professional_care_policy_versions
  for select using (
    public.can_read_professional_policy(
      professional_care_policy_versions.practice_id,
      professional_care_policy_versions.professional_id
    )
  );

-- INSERT/UPDATE/DELETE somente via RPC definer (como pregnancy_backup_grants).

grant select on public.professional_care_policies to authenticated;
grant select on public.professional_care_policy_versions to authenticated;
revoke insert, update, delete on public.professional_care_policies from authenticated, anon;
revoke insert, update, delete on public.professional_care_policy_versions from authenticated, anon;

create or replace view public.professional_care_policy_current
with (security_invoker = true)
as
select
  p.id as policy_id,
  v.id as version_id,
  p.professional_id,
  p.practice_id,
  p.organization_id,
  v.version_number,
  v.normal_birth_cents,
  v.cesarean_cents,
  v.requires_availability_for_prenatal,
  v.allows_prenatal_exception,
  v.effective_from,
  v.effective_to,
  v.created_by,
  v.created_at
from public.professional_care_policies p
join public.professional_care_policy_versions v
  on v.policy_id = p.id
 and v.effective_to is null;

comment on view public.professional_care_policy_current is
  'Versão vigente por política. security_invoker: herda RLS das tabelas. Não é disponibilidade nem contrato.';

grant select on public.professional_care_policy_current to authenticated;
