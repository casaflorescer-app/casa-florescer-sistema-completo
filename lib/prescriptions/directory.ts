import type { SupabaseClient } from "@supabase/supabase-js";

export type PrescriptionRow = {
  id: string;
  organizationId: string;
  practiceId: string;
  patientId: string;
  professionalId: string;
  encounterId: string | null;
  orientationId: string | null;
  examOrderId: string | null;
  status: "draft" | "signed" | "dispatched" | "cancelled";
  notes: string | null;
  signedAt: string | null;
  publishedToPatientAt: string | null;
  viewedByPatientAt: string | null;
  createdAt: string;
};

export type PrescriptionItemRow = {
  id: string;
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
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toRx(value: Record<string, unknown>): PrescriptionRow | null {
  const id = asString(value.id);
  const organizationId = asString(value.organization_id);
  const practiceId = asString(value.practice_id);
  const patientId = asString(value.patient_id);
  const professionalId = asString(value.professional_id);
  const status = asString(value.status) as PrescriptionRow["status"] | null;
  const createdAt = asString(value.created_at);
  if (!id || !organizationId || !practiceId || !patientId || !professionalId || !status || !createdAt) {
    return null;
  }
  return {
    id,
    organizationId,
    practiceId,
    patientId,
    professionalId,
    encounterId: asString(value.encounter_id),
    orientationId: asString(value.orientation_id),
    examOrderId: asString(value.exam_order_id),
    status,
    notes: asString(value.notes),
    signedAt: asString(value.signed_at),
    publishedToPatientAt: asString(value.published_to_patient_at),
    viewedByPatientAt: asString(value.viewed_by_patient_at),
    createdAt,
  };
}

function toItem(value: Record<string, unknown>): PrescriptionItemRow | null {
  const id = asString(value.id);
  const prescriptionId = asString(value.prescription_id);
  const medicationName = asString(value.medication_name);
  if (!id || !prescriptionId || !medicationName) return null;
  return {
    id,
    prescriptionId,
    medicationName,
    presentation: asString(value.presentation),
    quantity: asString(value.quantity),
    dosage: asString(value.dosage),
    frequency: asString(value.frequency),
    duration: asString(value.duration),
    route: asString(value.route),
    instructions: asString(value.instructions),
    sortOrder: typeof value.sort_order === "number" ? value.sort_order : 0,
  };
}

export function mapPrescriptionError(error: { message?: string } | null): string {
  const message = error?.message ?? "";
  if (message.includes("FORBIDDEN")) return "Sem permissão para esta receita.";
  if (message.includes("PRESCRIPTION_EMPTY")) return "Adicione ao menos um medicamento.";
  if (message.includes("NOT_AUTHENTICATED")) return "Sessão expirada.";
  return message || "Não foi possível concluir a operação.";
}

export async function listPrescriptionsForPatient(
  supabase: SupabaseClient,
  patientId: string,
): Promise<PrescriptionRow[]> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select(
      "id, organization_id, practice_id, patient_id, professional_id, encounter_id, orientation_id, exam_order_id, status, notes, signed_at, published_to_patient_at, viewed_by_patient_at, created_at",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data
    .map((row) => toRx(row as Record<string, unknown>))
    .filter((item): item is PrescriptionRow => Boolean(item));
}

export async function listPrescriptionItems(
  supabase: SupabaseClient,
  prescriptionId: string,
): Promise<PrescriptionItemRow[]> {
  const { data, error } = await supabase
    .from("prescription_items")
    .select(
      "id, prescription_id, medication_name, presentation, quantity, dosage, frequency, duration, route, instructions, sort_order",
    )
    .eq("prescription_id", prescriptionId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data
    .map((row) => toItem(row as Record<string, unknown>))
    .filter((item): item is PrescriptionItemRow => Boolean(item));
}

export async function createPrescriptionDraft(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    practiceId: string;
    patientId: string;
    professionalId: string;
    encounterId?: string | null;
    orientationId?: string | null;
    examOrderId?: string | null;
    notes?: string;
  },
): Promise<{ prescription: PrescriptionRow | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { prescription: null, error: "Sessão expirada." };

  const { data, error } = await supabase
    .from("prescriptions")
    .insert({
      organization_id: input.organizationId,
      practice_id: input.practiceId,
      patient_id: input.patientId,
      professional_id: input.professionalId,
      encounter_id: input.encounterId ?? null,
      orientation_id: input.orientationId ?? null,
      exam_order_id: input.examOrderId ?? null,
      status: "draft",
      notes: input.notes ?? null,
      created_by: user.id,
    })
    .select(
      "id, organization_id, practice_id, patient_id, professional_id, encounter_id, orientation_id, exam_order_id, status, notes, signed_at, published_to_patient_at, viewed_by_patient_at, created_at",
    )
    .single();
  if (error || !data) return { prescription: null, error: mapPrescriptionError(error) };
  return { prescription: toRx(data as Record<string, unknown>), error: null };
}

export async function addPrescriptionItem(
  supabase: SupabaseClient,
  input: {
    prescriptionId: string;
    medicationName: string;
    presentation?: string;
    quantity?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    route?: string;
    instructions?: string;
    sortOrder?: number;
  },
): Promise<{ item: PrescriptionItemRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("prescription_items")
    .insert({
      prescription_id: input.prescriptionId,
      medication_name: input.medicationName,
      presentation: input.presentation ?? null,
      quantity: input.quantity ?? null,
      dosage: input.dosage ?? null,
      frequency: input.frequency ?? null,
      duration: input.duration ?? null,
      route: input.route ?? null,
      instructions: input.instructions ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select(
      "id, prescription_id, medication_name, presentation, quantity, dosage, frequency, duration, route, instructions, sort_order",
    )
    .single();
  if (error || !data) return { item: null, error: mapPrescriptionError(error) };
  return { item: toItem(data as Record<string, unknown>), error: null };
}

export async function deletePrescriptionItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("prescription_items").delete().eq("id", itemId);
  return { error: error ? mapPrescriptionError(error) : null };
}

export async function publishPrescriptionToPatient(
  supabase: SupabaseClient,
  prescriptionId: string,
): Promise<{ prescription: PrescriptionRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("prescription_publish_to_patient", {
    p_prescription_id: prescriptionId,
  });
  if (error) return { prescription: null, error: mapPrescriptionError(error) };
  return {
    prescription: data ? toRx(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function markPrescriptionViewed(
  supabase: SupabaseClient,
  prescriptionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("prescription_mark_viewed", {
    p_prescription_id: prescriptionId,
  });
  return { error: error ? mapPrescriptionError(error) : null };
}
