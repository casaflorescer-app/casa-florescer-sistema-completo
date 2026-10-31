"use server";

import { getAuthUser } from "@/lib/auth/session";
import { isCasaDatabaseConfigured, withCasaUser } from "@/lib/db/casa";

const ALLOWED: Record<string, number> = {
  appointment_update: 9,
  appointment_set_status: 2,
  appointment_record_arrival: 1,
  appointment_record_actual_end: 1,
  encounter_open_from_appointment: 1,
  encounter_open_return: 2,
  encounter_sign: 1,
  clinical_note_upsert: 3,
  link_encounter_to_pregnancy: 2,
  unlink_encounter_from_pregnancy: 1,
  agenda_block_create: 1,
  agenda_block_update: 1,
  agenda_block_cancel: 2,
  agenda_block_end: 1,
  clinical_exam_request_create: 7,
  clinical_exam_request_confirm: 1,
  exam_order_submit: 1,
  exam_upload_register: 1,
  exam_mark_in_analysis: 1,
  exam_mark_analyzed: 1,
  clinical_document_issue_from_prescription: 4,
  clinical_document_issue_from_exam_request: 5,
  clinical_document_issue_from_orientation: 4,
  clinical_document_attach_pdf: 3,
  clinical_document_list_for_encounter: 1,
  clinical_document_mark_viewed: 1,
  clinical_document_audit_download: 1,
  stock_item_upsert: 1,
  stock_warehouse_upsert: 1,
  stock_movement_receipt: 1,
  stock_movement_exit: 1,
  stock_movement_transfer: 1,
  stock_movement_adjust: 1,
  stock_inventory_confirm: 1,
  clinic_equipment_upsert: 1,
  clinic_equipment_transfer: 1,
  rental_contract_create: 1,
  rental_contract_update: 2,
  rental_contract_end: 2,
  rental_contract_cancel: 2,
  rental_contract_renew: 4,
  relationship_dashboard_stats: 2,
  relationship_attention_dismiss: 3,
  campaign_template_upsert: 1,
  campaign_create: 1,
  campaign_update_draft: 1,
  campaign_duplicate: 1,
  campaign_build_audience: 1,
  campaign_audience_mutate: 1,
  campaign_confirm_prepare: 1,
  campaign_cancel: 2,
  campaign_check_recent_overlap: 2,
  campaign_preview_messages: 2,
  relationship_opportunities_refresh: 2,
  relationship_contact_queue: 5,
  relationship_opportunity_set_status: 2,
  relationship_opportunity_create_manual: 1,
  communication_preferences_upsert: 1,
  patient_portal_my_appointments: 1,
  patient_portal_record_arrival: 1,
  prescription_publish_to_patient: 1,
  prescription_mark_viewed: 1,
  prescription_template_upsert: 6,
  prescription_template_apply: 2,
  clinical_exam_catalog_upsert: 8,
  clinical_exam_group_upsert: 7,
  encounter_recording_save_transcription_result: 6,
  clinical_orientation_create: 1,
  clinical_orientation_save_draft: 1,
  clinical_orientation_publish: 1,
  clinical_orientation_new_version: 1,
  clinical_orientation_cancel_draft: 1,
  clinical_orientation_versions_list: 1,
  clinical_orientation_mark_viewed: 1,
  clinical_orientation_mark_audio_played: 1,
  clinical_orientation_link_exams: 2,
  orientation_feedback_submit: 1,
  encounter_recording_start: 1,
  encounter_recording_set_status: 2,
  encounter_recording_register_segment: 5,
  encounter_recording_mark_segment_uploaded: 3,
  encounter_recording_request_transcription: 1,
  encounter_recording_review_transcription: 2,
  encounter_recording_prepare_share: 5,
  encounter_recording_confirm_share: 2,
  encounter_recording_list: 1,
  encounter_recording_mark_viewed: 2,
  ai_assistance_list: 1,
  ai_assistance_request_create: 3,
  ai_assistance_save_result: 7,
  ai_assistance_review: 3,
  encounter_patient_feedback_get: 1,
  encounter_patient_feedback_upsert: 4,
  patient_portal_feedback_targets: 0,
  encounter_audit_event: 2,
  obstetric_availability_contract_create: 1,
  obstetric_availability_contract_update: 1,
  obstetric_availability_contract_end: 1,
  procedure_agreement_create: 1,
  procedure_agreement_acknowledge: 1,
  procedure_agreement_cancel: 1,
  clinic_specialty_upsert: 1,
  professional_specialty_set: 1,
  publish_professional_care_policy_version: 7,
  set_secretary_care_policy_view: 2,
  grant_system_admin: 2,
  revoke_system_admin: 2,
};

const JSONB_AT: Record<string, number[]> = {
  ai_assistance_save_result: [4],
  ai_assistance_review: [2],
  obstetric_availability_contract_create: [0],
  obstetric_availability_contract_update: [0],
  obstetric_availability_contract_end: [0],
  procedure_agreement_create: [0],
  procedure_agreement_acknowledge: [0],
  procedure_agreement_cancel: [0],
  clinic_specialty_upsert: [0],
  professional_specialty_set: [0],
};

function assertName(name: string, args: unknown[]) {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Operação recusada.");
  const count = ALLOWED[name];
  if (count == null || args.length !== count) throw new Error("Operação recusada.");
  return name;
}

export async function callCasaRpc(name: string, args: unknown[]): Promise<unknown> {
  const fn = assertName(name, args);
  if (!isCasaDatabaseConfigured()) {
    throw new Error("A sessão da casa ainda não está ligada neste processo.");
  }
  const user = await getAuthUser();
  if (!user) throw new Error("Sem sessão.");
  const jsonbAt = new Set(JSONB_AT[fn] ?? []);
  const placeholders = args
    .map((_, index) => (jsonbAt.has(index) ? `$${index + 1}::jsonb` : `$${index + 1}`))
    .join(", ");
  try {
    return await withCasaUser(user.userId, async (client) => {
      const result = await client.query<{ data: unknown }>(
        `select to_jsonb(public.${fn}(${placeholders})) as data`,
        args,
      );
      return result.rows[0]?.data ?? null;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
    throw new Error(message.split("\n")[0] ?? "Não foi possível concluir a operação.");
  }
}
