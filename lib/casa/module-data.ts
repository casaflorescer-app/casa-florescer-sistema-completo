"use server";

import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";

type SqlRow = Record<string, unknown>;

function plain(row: SqlRow): SqlRow {
  const out: SqlRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) out[key] = value.toISOString();
    else out[key] = value;
  }
  return out;
}

async function rows(sql: string, args: unknown[]): Promise<SqlRow[]> {
  if (!isCasaDatabaseConfigured()) {
    throw new Error("A sessão da casa ainda não está ligada neste processo.");
  }
  const user = await getAuthUser();
  if (!user) throw new Error("Sem sessão.");
  return withCasaUser(user.userId, async (client) => {
    const result = await client.query<SqlRow>(sql, args);
    return result.rows.map(plain);
  });
}

export async function listWarehousesCasa(organizationId: string) {
  return rows(
    `select id, organization_id, code, name, room_id, handles_clinical, handles_pantry, is_active, notes
     from public.warehouses where organization_id = $1 order by code`,
    [organizationId],
  );
}

export async function listItemsCasa(input: {
  organizationId: string;
  search?: string;
  itemClass?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 200, 500);
  const search = input.search?.trim().replace(/[%_\\]/g, "") ?? "";
  return rows(
    `select id, organization_id, sku, name, item_class, unit, requires_lot, min_qty, ideal_qty,
            reorder_qty, description, notes, is_active
     from public.items
     where organization_id = $1
       and ($2::boolean is not true or is_active)
       and ($3::text is null or item_class = $3)
       and ($4::text = '' or name ilike '%' || $4 || '%' or sku ilike '%' || $4 || '%')
     order by name
     limit $5`,
    [
      input.organizationId,
      input.activeOnly === false ? false : true,
      input.itemClass && input.itemClass !== "all" ? input.itemClass : null,
      search,
      limit,
    ],
  );
}

export async function listBalancesCasa(itemIds: string[]) {
  if (itemIds.length === 0) return [];
  return rows(
    `select item_id, warehouse_id, qty_on_hand from public.stock_balances where item_id = any($1::uuid[])`,
    [itemIds],
  );
}

export async function listBalancesForItemCasa(itemId: string) {
  return rows(
    `select b.warehouse_id, b.item_id, b.qty_on_hand, w.code as warehouse_code, w.name as warehouse_name
     from public.stock_balances b
     left join public.warehouses w on w.id = b.warehouse_id
     where b.item_id = $1`,
    [itemId],
  );
}

export async function listLotsCasa(itemId: string) {
  return rows(
    `select id, item_id, warehouse_id, lot_code, expires_on::text, qty_on_hand
     from public.item_lots
     where item_id = $1 and qty_on_hand > 0
     order by expires_on nulls last`,
    [itemId],
  );
}

export async function listMovementsCasa(input: {
  organizationId: string;
  itemId?: string;
  warehouseId?: string;
  limit?: number;
}) {
  return rows(
    `select id, organization_id, warehouse_id, item_id, lot_id, kind, qty, qty_before, qty_after,
            transfer_group_id, reason, note, occurred_at, created_by
     from public.stock_movements
     where organization_id = $1
       and ($2::uuid is null or item_id = $2)
       and ($3::uuid is null or warehouse_id = $3)
     order by occurred_at desc
     limit $4`,
    [input.organizationId, input.itemId ?? null, input.warehouseId ?? null, Math.min(input.limit ?? 50, 200)],
  );
}

export async function loadStockPartsCasa(organizationId: string) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [items, warehouses, balances, lots, movements, equipment] = await Promise.all([
    rows(
      `select id, is_active, min_qty, name, sku from public.items where organization_id = $1`,
      [organizationId],
    ),
    rows(`select id from public.warehouses where organization_id = $1 and is_active`, [organizationId]),
    rows(`select b.item_id, b.qty_on_hand from public.stock_balances b join public.items i on i.id = b.item_id where i.organization_id = $1`, [
      organizationId,
    ]),
    rows(
      `select l.id, l.item_id, l.lot_code, l.expires_on::text, l.qty_on_hand
       from public.item_lots l
       join public.items i on i.id = l.item_id
       where i.organization_id = $1 and l.qty_on_hand > 0`,
      [organizationId],
    ),
    rows(
      `select id from public.stock_movements where organization_id = $1 and occurred_at >= $2`,
      [organizationId, since],
    ),
    rows(`select id, status from public.clinic_equipment where organization_id = $1`, [organizationId]),
  ]);
  return { items, warehouses, balances, lots, movements, equipment };
}

export async function listRoomsCasa(organizationId: string) {
  return rows(`select id, code, name from public.rooms where organization_id = $1 order by code`, [organizationId]);
}

export async function listEquipmentCasa(input: {
  organizationId: string;
  status?: string;
  category?: string;
  roomId?: string;
  limit?: number;
}) {
  return rows(
    `select e.id, e.organization_id, e.name, e.category, e.manufacturer, e.model, e.serial_number,
            e.asset_tag, e.acquired_on::text, e.room_id, e.status, e.notes, e.created_at, e.updated_at,
            r.code as room_code, r.name as room_name
     from public.clinic_equipment e
     left join public.rooms r on r.id = e.room_id
     where e.organization_id = $1
       and ($2::text is null or e.status = $2)
       and ($3::text is null or e.category = $3)
       and ($4::uuid is null or e.room_id = $4)
     order by e.name
     limit $5`,
    [
      input.organizationId,
      input.status && input.status !== "all" ? input.status : null,
      input.category && input.category !== "all" ? input.category : null,
      input.roomId && input.roomId !== "all" ? input.roomId : null,
      Math.min(input.limit ?? 200, 500),
    ],
  );
}

export async function listEquipmentEventsCasa(equipmentId: string, limit = 40) {
  return rows(
    `select id, equipment_id, event_kind, from_room_id, to_room_id, detail, created_at, actor_id
     from public.clinic_equipment_events
     where equipment_id = $1
     order by created_at desc
     limit $2`,
    [equipmentId, Math.min(limit, 100)],
  );
}

export async function listRentalContractsCasa(input: {
  organizationId: string;
  roomId?: string;
  specialty?: string;
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return rows(
    `select c.id, c.organization_id, c.room_id, c.tenant_professional_id, c.tenant_name, c.tenant_specialty,
            c.monthly_rent_cents, c.water_included, c.electricity_included, c.internet_included,
            c.starts_on::text, c.ends_on::text, c.status, c.is_active, c.notes, c.created_at,
            c.contract_code, c.renewed_from_id, c.created_by, c.updated_at, c.due_day,
            c.cancelled_at, c.cancel_reason, c.ended_at, c.end_reason,
            r.code as room_code, r.name as room_name
     from public.rental_contracts c
     left join public.rooms r on r.id = c.room_id
     where c.organization_id = $1
       and ($2::uuid is null or c.room_id = $2)
       and ($3::text is null or c.tenant_specialty ilike '%' || $3 || '%')
       and ($4::date is null or c.starts_on >= $4::date)
       and ($5::date is null or c.starts_on <= $5::date)
       and ($6::text is null or c.status = $6)
       and ($7::boolean is not true or (
         c.status = 'active' and c.ends_on is not null and c.ends_on >= $8::date and c.ends_on <= $9::date
       ))
     order by c.starts_on desc
     limit $10`,
    [
      input.organizationId,
      input.roomId ?? null,
      input.specialty?.trim() || null,
      input.from ?? null,
      input.to ?? null,
      input.status && input.status !== "all" && input.status !== "expiring_soon" ? input.status : null,
      input.status === "expiring_soon",
      today,
      soon,
      Math.min(Math.max(input.limit ?? 100, 1), 300),
    ],
  );
}

export async function getRentalContractCasa(organizationId: string, contractId: string) {
  const list = await listRentalContractsCasa({ organizationId, limit: 300 });
  return list.find((row) => String(row.id) === contractId) ?? null;
}

export async function listRentalEventsCasa(contractId: string) {
  return rows(
    `select id, contract_id, event_kind, actor_id, detail, created_at
     from public.rental_contract_events
     where contract_id = $1
     order by created_at desc
     limit 100`,
    [contractId],
  );
}

export async function loadRentalPartsCasa(organizationId: string) {
  const [contracts, rooms] = await Promise.all([
    rows(
      `select id, status, ends_on::text, room_id from public.rental_contracts where organization_id = $1`,
      [organizationId],
    ),
    rows(
      `select id, room_kind from public.rooms where organization_id = $1 and status = 'active'`,
      [organizationId],
    ),
  ]);
  return { contracts, rooms };
}

export async function listSubletRoomsCasa(organizationId: string) {
  return rows(
    `select id, code, name, room_kind
     from public.rooms
     where organization_id = $1 and status = 'active' and room_kind = 'sublet_consultorio'
     order by code`,
    [organizationId],
  );
}

export async function listRentalProfessionalsCasa(organizationId: string) {
  return rows(
    `select pr.id, pr.council_type, pr.council_number, p.full_name, p.is_active, u.name as practice_name, null::text as specialty
     from public.professionals pr
     left join public.profiles p on p.id = pr.profile_id
     left join public.practice_units u on u.id = pr.practice_id
     where pr.organization_id = $1`,
    [organizationId],
  );
}

export async function listCampaignTemplatesCasa(practiceId: string) {
  return rows(
    `select id, organization_id, practice_id, name, purpose, channel, subject, body, active
     from public.campaign_templates where practice_id = $1 order by name`,
    [practiceId],
  );
}

export async function listCampaignsCasa(practiceId: string) {
  return rows(
    `select id, organization_id, practice_id, name, objective, purpose, channel, template_id, status,
            audience_filter, message_subject, message_body, audience_frozen_at, created_at
     from public.campaigns where practice_id = $1 order by created_at desc limit 50`,
    [practiceId],
  );
}

export async function listCampaignAudienceCasa(campaignId: string) {
  return rows(
    `select a.campaign_id, a.patient_id, a.eligibility_status, a.exclusion_reason,
            p.full_name as patient_name, p.phone
     from public.campaign_audiences a
     left join public.patients p on p.id = a.patient_id
     where a.campaign_id = $1
     order by a.selected_at desc`,
    [campaignId],
  );
}

export async function listOpenOpportunitiesCasa(practiceId: string) {
  return rows(
    `select o.*, p.full_name as patient_name
     from public.relationship_opportunities o
     left join public.patients p on p.id = o.patient_id
     where o.practice_id = $1
       and o.status in ('NEW', 'PENDING', 'OPEN')
     order by o.created_at desc
     limit 80`,
    [practiceId],
  );
}

export async function listRelationshipHistoryCasa(practiceId: string) {
  return rows(
    `select h.*, p.full_name as patient_name
     from public.relationship_history h
     left join public.patients p on p.id = h.patient_id
     where h.practice_id = $1
     order by h.created_at desc
     limit 80`,
    [practiceId],
  );
}

export async function listExamCatalogCasa(practiceId: string, activeOnly: boolean) {
  return rows(
    `select id, practice_id, name, short_name, category, description, is_active, sort_order
     from public.clinical_exam_catalog
     where practice_id = $1 and ($2::boolean is not true or is_active)
     order by sort_order, name`,
    [practiceId, activeOnly],
  );
}

export async function listExamGroupsCasa(practiceId: string, activeOnly: boolean): Promise<SqlRow[]> {
  const groups = await rows(
    `select id, practice_id, name, description, is_active, sort_order
     from public.clinical_exam_groups
     where practice_id = $1 and ($2::boolean is not true or is_active)
     order by sort_order, name`,
    [practiceId, activeOnly],
  );
  if (groups.length === 0) return groups.map((group) => ({ ...group, catalog_ids: [] as string[] }));
  const items = await rows(
    `select group_id, catalog_id
     from public.clinical_exam_group_items
     where group_id = any($1::uuid[])
     order by sort_order`,
    [groups.map((row) => String(row.id))],
  );
  return groups.map((group) => ({
    ...group,
    catalog_ids: items
      .filter((item) => String(item.group_id) === String(group.id))
      .map((item) => String(item.catalog_id)),
  }));
}

export async function listPrescriptionTemplatesCasa(practiceId: string) {
  return rows(
    `select id, practice_id, name, description, is_active
     from public.prescription_templates
     where practice_id = $1
     order by name`,
    [practiceId],
  );
}

export async function listPrescriptionTemplateItemsCasa(practiceId: string) {
  return rows(
    `select i.id, i.template_id, i.medication_name, i.presentation, i.concentration, i.dosage,
            i.route, i.frequency, i.duration, i.quantity, i.observations
     from public.prescription_template_items i
     join public.prescription_templates t on t.id = i.template_id
     where t.practice_id = $1
     order by i.sort_order`,
    [practiceId],
  );
}

export async function listExamRequestsCasa(input: { encounterId?: string; patientId?: string }) {
  return rows(
    `select id, encounter_id, patient_id, status, notes, clinical_indication, confirmed_at, created_at
     from public.clinical_exam_requests
     where ($1::uuid is null or encounter_id = $1)
       and ($2::uuid is null or patient_id = $2)
     order by created_at desc`,
    [input.encounterId ?? null, input.patientId ?? null],
  );
}

export async function listExamRequestItemsCasa(requestIds: string[]) {
  if (requestIds.length === 0) return [];
  return rows(
    `select i.id, i.request_id, i.catalog_id, i.group_id, i.custom_name,
            c.name as catalog_name, g.name as group_name
     from public.clinical_exam_request_items i
     left join public.clinical_exam_catalog c on c.id = i.catalog_id
     left join public.clinical_exam_groups g on g.id = i.group_id
     where i.request_id = any($1::uuid[])
     order by i.sort_order`,
    [requestIds],
  );
}

export async function searchPatientsCasa(organizationId: string, query: string) {
  const search = query.trim().replace(/[%_\\]/g, "");
  return rows(
    `select id, full_name, phone
     from public.patients
     where organization_id = $1
       and ($2::text = '' or full_name ilike '%' || $2 || '%' or coalesce(phone, '') ilike '%' || $2 || '%')
     order by full_name
     limit 30`,
    [organizationId, search],
  );
}

export async function listExamOrdersCasa(patientId: string) {
  return rows(
    `select id, organization_id, practice_id, patient_id, title, source, clinical_status, observation,
            document_date::text, encounter_id, analysis_notes, analyzed_at, analyzed_by, received_at,
            requested_at, updated_at
     from public.exam_orders
     where patient_id = $1
     order by requested_at desc`,
    [patientId],
  );
}

export async function listExamUploadsCasa(examOrderId: string) {
  return rows(
    `select id, exam_order_id, storage_path, original_name, mime_type, uploaded_at
     from public.exam_uploads
     where exam_order_id = $1
     order by uploaded_at desc`,
    [examOrderId],
  );
}

export async function listPrescriptionsCasa(patientId: string) {
  return rows(
    `select id, organization_id, practice_id, patient_id, professional_id, encounter_id, orientation_id,
            exam_order_id, status, notes, signed_at, published_to_patient_at, viewed_by_patient_at, created_at
     from public.prescriptions where patient_id = $1 order by created_at desc`,
    [patientId],
  );
}

export async function listPrescriptionItemsCasa(prescriptionId: string) {
  return rows(
    `select id, prescription_id, medication_name, presentation, quantity, dosage, frequency, duration,
            route, instructions, sort_order
     from public.prescription_items where prescription_id = $1 order by sort_order`,
    [prescriptionId],
  );
}

export async function insertPrescriptionItemCasa(input: {
  prescriptionId: string;
  medicationName: string;
  presentation: string | null;
  quantity: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  sortOrder: number;
}) {
  const result = await rows(
    `insert into public.prescription_items (
       prescription_id, medication_name, presentation, quantity, dosage, frequency, duration,
       route, instructions, sort_order
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id, prescription_id, medication_name, presentation, quantity, dosage, frequency,
               duration, route, instructions, sort_order`,
    [
      input.prescriptionId,
      input.medicationName,
      input.presentation,
      input.quantity,
      input.dosage,
      input.frequency,
      input.duration,
      input.route,
      input.instructions,
      input.sortOrder,
    ],
  );
  return result[0] ?? null;
}

export async function deletePrescriptionItemCasa(itemId: string) {
  await rows(`delete from public.prescription_items where id = $1 returning id`, [itemId]);
}

export async function loadClinicalDocumentCasa(documentId: string) {
  const found = await rows(
    `select id, organization_id, practice_id, patient_id, encounter_id, professional_id, source_type, source_id,
            document_kind, version, status, title, issued_at, frozen_payload, content_sha256, pdf_storage_path,
            pdf_sha256, signature_kind, signed_at, signed_by, available_to_patient, published_to_patient_at,
            viewed_by_patient_at, supersedes_id, correction_reason, created_by, created_at
     from public.clinical_document_artifacts
     where id = $1`,
    [documentId],
  );
  return found[0] ?? null;
}

export async function listClinicalDocumentsCasa(patientId: string, sourceType?: string) {
  return rows(
    `select id, organization_id, practice_id, patient_id, encounter_id, professional_id, source_type, source_id,
            document_kind, version, status, title, issued_at, frozen_payload, content_sha256, pdf_storage_path,
            pdf_sha256, signature_kind, signed_at, signed_by, available_to_patient, published_to_patient_at,
            viewed_by_patient_at, supersedes_id, correction_reason, created_by, created_at
     from public.clinical_document_artifacts
     where patient_id = $1 and ($2::text is null or source_type = $2)
     order by issued_at desc`,
    [patientId, sourceType ?? null],
  );
}

export async function readStoredPathCasa(kind: "encounter" | "orientation", id: string) {
  if (kind === "encounter") {
    const found = await rows(
      `select s.audio_storage_path
       from public.encounter_recording_transcriptions t
       join public.encounter_recording_segments s on s.id = t.segment_id
       where t.id = $1`,
      [id],
    );
    return typeof found[0]?.audio_storage_path === "string" ? found[0].audio_storage_path : "";
  }
  const found = await rows(
    `select audio_storage_path from public.clinical_orientation_versions where id = $1`,
    [id],
  );
  return typeof found[0]?.audio_storage_path === "string" ? found[0].audio_storage_path : "";
}
