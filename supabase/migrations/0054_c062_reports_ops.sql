-- C062 — Relatórios e indicadores (READ-ONLY operacional).
-- Justificativa da RPC SECURITY DEFINER: owner/admin não passam can_read_clinical,
-- mas precisam de CONTAGENS agregadas (sem conteúdo SOAP/anamnese/payload).
-- Aditiva. db push exige autorização expressa.

create or replace function public.can_access_reports(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_house_staff(p_org, array['owner', 'admin']::public.app_role[]);
$$;

comment on function public.can_access_reports(uuid) is
  'C062: acesso a relatórios administrativos (owner|admin da casa).';

revoke all on function public.can_access_reports(uuid) from public;
grant execute on function public.can_access_reports(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumo operacional (agregados somente)
-- Período: [p_from, p_to) em timestamptz. Agenda usa scheduled_starts_at (America/Sao_Paulo).
-- ---------------------------------------------------------------------------

create or replace function public.reports_operational_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz := p_from;
  v_to timestamptz := p_to;
  v_today date := (timezone('America/Sao_Paulo', now()))::date;
  v_soon date := v_today + 30;
  v_result jsonb;
begin
  if p_organization_id is null or not public.can_access_reports(p_organization_id) then
    raise exception 'REPORTS_FORBIDDEN' using errcode = '42501';
  end if;
  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'REPORTS_PERIOD_INVALID' using errcode = '22023';
  end if;
  if v_to > v_from + interval '400 days' then
    raise exception 'REPORTS_PERIOD_TOO_LONG' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'timezone', 'America/Sao_Paulo'
    ),
    'patients', jsonb_build_object(
      'total', (
        select count(*)::int from public.patients p
        where p.organization_id = p_organization_id
      ),
      'new_in_period', (
        select count(*)::int from public.patients p
        where p.organization_id = p_organization_id
          and p.created_at >= v_from and p.created_at < v_to
      )
    ),
    'appointments', jsonb_build_object(
      'total_in_period', (
        select count(*)::int from public.appointments a
        where a.organization_id = p_organization_id
          and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
      ),
      'by_status', coalesce((
        select jsonb_object_agg(status, cnt)
        from (
          select a.status::text as status, count(*)::int as cnt
          from public.appointments a
          where a.organization_id = p_organization_id
            and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
          group by a.status
        ) s
      ), '{}'::jsonb),
      'by_kind', coalesce((
        select jsonb_object_agg(kind, cnt)
        from (
          select a.kind::text as kind, count(*)::int as cnt
          from public.appointments a
          where a.organization_id = p_organization_id
            and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
            and a.status <> 'cancelled'
          group by a.kind
        ) k
      ), '{}'::jsonb),
      'completed', (
        select count(*)::int from public.appointments a
        where a.organization_id = p_organization_id
          and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
          and a.status = 'completed'
      ),
      'cancelled', (
        select count(*)::int from public.appointments a
        where a.organization_id = p_organization_id
          and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
          and a.status = 'cancelled'
      ),
      'no_show', (
        select count(*)::int from public.appointments a
        where a.organization_id = p_organization_id
          and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
          and a.status = 'no_show'
      ),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', day, 'count', cnt) order by day)
        from (
          select (timezone('America/Sao_Paulo', a.scheduled_starts_at))::date as day,
                 count(*)::int as cnt
          from public.appointments a
          where a.organization_id = p_organization_id
            and a.scheduled_starts_at >= v_from and a.scheduled_starts_at < v_to
            and a.status <> 'cancelled'
          group by 1
        ) d
      ), '[]'::jsonb)
    ),
    'encounters', jsonb_build_object(
      'opened_in_period', (
        select count(*)::int from public.encounters e
        where e.organization_id = p_organization_id
          and e.created_at >= v_from and e.created_at < v_to
      ),
      'signed_in_period', (
        select count(*)::int from public.encounters e
        where e.organization_id = p_organization_id
          and e.signed_at is not null
          and e.signed_at >= v_from and e.signed_at < v_to
          and e.status in ('signed', 'amended')
      ),
      'cancelled_in_period', (
        select count(*)::int from public.encounters e
        where e.organization_id = p_organization_id
          and e.created_at >= v_from and e.created_at < v_to
          and e.status = 'cancelled'
      ),
      'returns_opened_in_period', (
        select count(*)::int from public.encounters e
        where e.organization_id = p_organization_id
          and e.created_at >= v_from and e.created_at < v_to
          and e.return_of_encounter_id is not null
      ),
      'open_now', (
        select count(*)::int from public.encounters e
        where e.organization_id = p_organization_id
          and e.status = 'open'
      )
    ),
    'documents', jsonb_build_object(
      'finalized_in_period', (
        select count(*)::int from public.clinical_document_artifacts d
        where d.organization_id = p_organization_id
          and d.status = 'finalized'
          and d.issued_at >= v_from and d.issued_at < v_to
      ),
      'by_kind_finalized', coalesce((
        select jsonb_object_agg(document_kind, cnt)
        from (
          select d.document_kind, count(*)::int as cnt
          from public.clinical_document_artifacts d
          where d.organization_id = p_organization_id
            and d.status = 'finalized'
            and d.issued_at >= v_from and d.issued_at < v_to
          group by d.document_kind
        ) x
      ), '{}'::jsonb),
      'superseded_in_period', (
        select count(*)::int from public.clinical_document_artifacts d
        where d.organization_id = p_organization_id
          and d.status = 'superseded'
          and d.issued_at >= v_from and d.issued_at < v_to
      ),
      'published_to_portal_in_period', (
        select count(*)::int from public.clinical_document_artifacts d
        where d.organization_id = p_organization_id
          and d.available_to_patient = true
          and d.published_to_patient_at is not null
          and d.published_to_patient_at >= v_from and d.published_to_patient_at < v_to
      )
    ),
    'exam_requests', jsonb_build_object(
      'confirmed_in_period', (
        select count(*)::int from public.clinical_exam_requests r
        where r.organization_id = p_organization_id
          and r.status = 'confirmed'
          and coalesce(r.confirmed_at, r.created_at) >= v_from
          and coalesce(r.confirmed_at, r.created_at) < v_to
      ),
      'draft_in_period', (
        select count(*)::int from public.clinical_exam_requests r
        where r.organization_id = p_organization_id
          and r.status = 'draft'
          and r.created_at >= v_from and r.created_at < v_to
      ),
      'cancelled_in_period', (
        select count(*)::int from public.clinical_exam_requests r
        where r.organization_id = p_organization_id
          and r.status = 'cancelled'
          and r.created_at >= v_from and r.created_at < v_to
      )
    ),
    'prescriptions', jsonb_build_object(
      'signed_in_period', (
        select count(*)::int from public.prescriptions rx
        where rx.organization_id = p_organization_id
          and rx.status in ('signed', 'dispatched')
          and coalesce(rx.signed_at, rx.created_at) >= v_from
          and coalesce(rx.signed_at, rx.created_at) < v_to
      ),
      'draft_in_period', (
        select count(*)::int from public.prescriptions rx
        where rx.organization_id = p_organization_id
          and rx.status = 'draft'
          and rx.created_at >= v_from and rx.created_at < v_to
      ),
      'cancelled_in_period', (
        select count(*)::int from public.prescriptions rx
        where rx.organization_id = p_organization_id
          and rx.status = 'cancelled'
          and rx.created_at >= v_from and rx.created_at < v_to
      )
    ),
    'rentals', jsonb_build_object(
      'active', (
        select count(*)::int from public.rental_contracts c
        where c.organization_id = p_organization_id and c.status = 'active'
      ),
      'scheduled', (
        select count(*)::int from public.rental_contracts c
        where c.organization_id = p_organization_id and c.status = 'scheduled'
      ),
      'ended', (
        select count(*)::int from public.rental_contracts c
        where c.organization_id = p_organization_id and c.status = 'ended'
      ),
      'cancelled', (
        select count(*)::int from public.rental_contracts c
        where c.organization_id = p_organization_id and c.status = 'cancelled'
      ),
      'expiring_soon', (
        select count(*)::int from public.rental_contracts c
        where c.organization_id = p_organization_id
          and c.status = 'active'
          and c.ends_on is not null
          and c.ends_on <= (v_today + 30)
          and c.ends_on >= v_today
      )
    ),
    'rooms', jsonb_build_object(
      'total', (
        select count(*)::int from public.rooms r
        where r.organization_id = p_organization_id
      ),
      'active', (
        select count(*)::int from public.rooms r
        where r.organization_id = p_organization_id and r.status = 'active'
      )
    ),
    'clinical_contracts', jsonb_build_object(
      'obstetric_active', (
        select count(*)::int from public.obstetric_availability_contracts o
        where o.organization_id = p_organization_id and o.status = 'active'
      ),
      'procedure_active', (
        select count(*)::int from public.procedure_agreements pa
        where pa.organization_id = p_organization_id and pa.status = 'active'
      )
    ),
    'workforce', jsonb_build_object(
      'active', (
        select count(*)::int from public.clinic_workforce w
        where w.organization_id = p_organization_id and w.status = 'active'
      ),
      'inactive', (
        select count(*)::int from public.clinic_workforce w
        where w.organization_id = p_organization_id and w.status = 'inactive'
      )
    ),
    'stock', jsonb_build_object(
      'items_active', (
        select count(*)::int from public.items i
        where i.organization_id = p_organization_id and i.is_active = true
      ),
      'low_stock', (
        select count(*)::int
        from public.items i
        left join (
          select sb.item_id, sum(sb.qty_on_hand) as qty
          from public.stock_balances sb
          group by sb.item_id
        ) b on b.item_id = i.id
        where i.organization_id = p_organization_id
          and i.is_active = true
          and coalesce(b.qty, 0) <= i.min_qty
      ),
      'lots_expired', (
        select count(*)::int from public.item_lots l
        join public.items i on i.id = l.item_id
        where i.organization_id = p_organization_id
          and l.qty_on_hand > 0
          and l.expires_on is not null
          and l.expires_on < v_today
      ),
      'lots_expiring_soon', (
        select count(*)::int from public.item_lots l
        join public.items i on i.id = l.item_id
        where i.organization_id = p_organization_id
          and l.qty_on_hand > 0
          and l.expires_on is not null
          and l.expires_on >= v_today
          and l.expires_on <= v_soon
      ),
      'movements_in_period', (
        select count(*)::int from public.stock_movements m
        where m.organization_id = p_organization_id
          and m.occurred_at >= v_from and m.occurred_at < v_to
      ),
      'movements_by_kind', coalesce((
        select jsonb_object_agg(kind, cnt)
        from (
          select m.kind::text as kind, count(*)::int as cnt
          from public.stock_movements m
          where m.organization_id = p_organization_id
            and m.occurred_at >= v_from and m.occurred_at < v_to
          group by m.kind
        ) mk
      ), '{}'::jsonb)
    ),
    'equipment', jsonb_build_object(
      'total', (
        select count(*)::int from public.clinic_equipment e
        where e.organization_id = p_organization_id
      ),
      'by_status', coalesce((
        select jsonb_object_agg(status, cnt)
        from (
          select e.status, count(*)::int as cnt
          from public.clinic_equipment e
          where e.organization_id = p_organization_id
          group by e.status
        ) es
      ), '{}'::jsonb)
    ),
    'unavailable', jsonb_build_object(
      'finance', 'NÃO DISPONÍVEL — ledger/faturamento não operacional neste ciclo',
      'whatsapp_delivery', 'NÃO DISPONÍVEL — provedor de mensagens não configurado',
      'sncr_icp', 'NÃO DISPONÍVEL — sem integração regulatória / ICP-Brasil',
      'specialty_clinical_split', 'NÃO DISPONÍVEL — appointment.kind só consultation|procedure; sem classificação ginecológico/obstétrico no banco'
    )
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.reports_operational_summary(uuid, timestamptz, timestamptz) is
  'C062: agregados operacionais para owner|admin. Sem conteúdo clínico (SOAP/payload).';

revoke all on function public.reports_operational_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.reports_operational_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Drill-down: metadados de agenda (sem notas clínicas)
-- ---------------------------------------------------------------------------

create or replace function public.reports_appointments_detail(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_status text default null,
  p_kind text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_rows jsonb;
begin
  if p_organization_id is null or not public.can_access_reports(p_organization_id) then
    raise exception 'REPORTS_FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'REPORTS_PERIOD_INVALID' using errcode = '22023';
  end if;

  select count(*)::int into v_total
  from public.appointments a
  where a.organization_id = p_organization_id
    and a.scheduled_starts_at >= p_from and a.scheduled_starts_at < p_to
    and (p_status is null or p_status = '' or a.status::text = p_status)
    and (p_kind is null or p_kind = '' or a.kind::text = p_kind);

  select coalesce(jsonb_agg(row_data order by scheduled_starts_at desc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', a.id,
      'scheduled_starts_at', a.scheduled_starts_at,
      'status', a.status,
      'kind', a.kind,
      'practice_id', a.practice_id,
      'professional_id', a.professional_id,
      'room_id', a.room_id,
      'patient_id', a.patient_id,
      'patient_name', p.full_name,
      'professional_name', coalesce(pf.full_name, '')
    ) as row_data,
    a.scheduled_starts_at
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join public.profiles pf on pf.id = pr.profile_id
    where a.organization_id = p_organization_id
      and a.scheduled_starts_at >= p_from and a.scheduled_starts_at < p_to
      and (p_status is null or p_status = '' or a.status::text = p_status)
      and (p_kind is null or p_kind = '' or a.kind::text = p_kind)
    order by a.scheduled_starts_at desc
    limit v_limit offset v_offset
  ) q;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.reports_appointments_detail(uuid, timestamptz, timestamptz, text, text, int, int) from public;
grant execute on function public.reports_appointments_detail(uuid, timestamptz, timestamptz, text, text, int, int) to authenticated;
