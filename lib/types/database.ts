export type PracticeKind = "house" | "sublet";
export type RoomStatus = "active" | "maintenance" | "inactive";
export type RoomKind =
  | "house_consultorio"
  | "sublet_consultorio"
  | "pharmacy"
  | "procedure"
  | "reception";
export type InventoryDirection = "in" | "out";
export type OccupancyModel =
  | "fixed_monthly"
  | "hourly"
  | "shift"
  | "revenue_share"
  | "hybrid";

export type AppRole = "owner" | "admin" | "physician" | "secretary";

export type ClinicalAccess =
  | "none"
  | "own_encounters"
  | "practice"
  | "break_glass";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled";

export type AppointmentKind = "consultation" | "procedure";
export type EncounterStatus = "open" | "signed" | "amended" | "cancelled";
export type ExamStatus = "pending" | "available" | "picked_up";
export type AlertSeverity = "info" | "warning" | "urgent";
export type AlertAudience = "secretary" | "physician" | "admin" | "all_staff";
export type ItemClass =
  | "clinical_lot_controlled"
  | "clinical_consumable"
  | "pantry"
  | "housekeeping"
  | "office";

export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  permissions: string[];
};

export type UserPracticeRole = {
  id: string;
  user_id: string;
  practice_id: string;
  role: AppRole;
  clinical_access: ClinicalAccess;
  can_cashier: boolean;
  can_schedule_any_practice: boolean;
  can_manage_stock: boolean;
  can_view_care_policies: boolean;
};

export type PracticeUnit = {
  id: string;
  organization_id: string;
  kind: PracticeKind;
  code: string;
  name: string;
  specialty: string;
  isolation_label: string;
  is_active: boolean;
};

export type CareSpecialty = "gynecology" | "obstetrics";
export type BillingModality = "private" | "insurance";
export type PrivatePaymentMethod = "pix" | "card" | "cash";

export type Patient = {
  id: string;
  organization_id: string;
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  reception_notes: string | null;
  preferred_channel: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  care_specialties: CareSpecialty[];
  billing_modality: BillingModality | null;
  insurance_name: string | null;
  insurance_card_number: string | null;
  insurance_valid_until: string | null;
  private_payment_method: PrivatePaymentMethod | null;
  updated_at: string;
};

export type PatientClinicalData = {
  id: string;
  patient_id: string;
  organization_id: string;
  pregnancies: number;
  births: number;
  abortions: number;
  lmp_date: string | null;
  edd: string | null;
  edd_override: boolean;
  gyn_procedures: string[];
  comorbidities: string | null;
  continuous_medications: string | null;
  allergies: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type Appointment = {
  id: string;
  organization_id: string;
  practice_id: string;
  room_id: string;
  patient_id: string;
  professional_id: string;
  procedure_id: string | null;
  kind: AppointmentKind;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  urgency_note: string | null;
  created_by: string;
};

export type ObstetricFollowup = {
  id: string;
  practice_id: string;
  patient_id: string;
  professional_id: string;
  lmp_date: string | null;
  edd: string;
  gestational_risk: string | null;
  notes: string | null;
};

export type PregnancyStatus = "in_care" | "closed" | "transferred" | "cancelled";
export type PregnancyRisk = "habitual" | "high";
export type PregnancyEventKind =
  | "created"
  | "updated"
  | "principal_changed"
  | "backup_changed"
  | "practice_changed"
  | "closed"
  | "transferred"
  | "cancelled"
  | "backup_access_granted"
  | "backup_access_revoked";

export type DailyCapacity = {
  id: string;
  professional_id: string;
  practice_id: string;
  kind: AppointmentKind;
  weekday: number | null;
  max_patients: number;
};

export type ExamOrder = {
  id: string;
  organization_id: string;
  practice_id: string;
  patient_id: string;
  requested_by: string | null;
  title: string;
  status: ExamStatus;
  requested_at: string;
  available_at: string | null;
  picked_up_at: string | null;
};

export type ExamUpload = {
  id: string;
  exam_order_id: string | null;
  patient_id: string;
  practice_id: string;
  storage_path: string;
  original_name: string;
  uploaded_at: string;
  reviewed_at: string | null;
};

export type AgendaAlert = {
  id: string;
  organization_id: string;
  practice_id: string | null;
  appointment_id: string | null;
  audience: AlertAudience;
  severity: AlertSeverity;
  title: string;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
};

export type OccupancyContract = {
  id: string;
  organization_id: string;
  practice_id: string;
  room_id: string;
  model: OccupancyModel;
  starts_on: string;
  ends_on: string | null;
  fixed_amount_cents: number;
};

export type RentalContract = {
  id: string;
  organization_id: string;
  room_id: string;
  tenant_professional_id: string | null;
  tenant_name: string;
  tenant_specialty: string;
  monthly_rent_cents: number;
  water_included: boolean;
  electricity_included: boolean;
  internet_included: boolean;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
};

export type RentalStatement = {
  id: string;
  rental_contract_id: string;
  competence: string;
  rent_cents: number;
  extras_cents: number;
  total_cents: number;
  issued_at: string;
};

export type InventoryMovement = {
  id: string;
  organization_id: string;
  item_id: string;
  qty: number;
  direction: InventoryDirection;
  destination_room_id: string;
  encounter_id: string | null;
  professional_id: string | null;
  supervised_by: string;
  occurred_at: string;
  note: string | null;
};

export type Item = {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  item_class: ItemClass;
  unit: string;
  min_qty: number;
};

export type StockAudit = {
  id: string;
  organization_id: string;
  warehouse_id: string;
  counted_by: string;
  counted_at: string;
  notes: string | null;
};

export type ProfessionalCarePolicy = {
  id: string;
  professional_id: string;
  practice_id: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
};

export type ProfessionalCarePolicyVersion = {
  id: string;
  policy_id: string;
  professional_id: string;
  practice_id: string;
  organization_id: string;
  version_number: number;
  normal_birth_cents: number;
  cesarean_cents: number;
  requires_availability_for_prenatal: boolean;
  allows_prenatal_exception: boolean;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
};

/** B2 — ocorrência de procedimento na gestação (não é política comercial). */
export type PregnancyProcedure = {
  id: string;
  organization_id: string;
  practice_id: string;
  pregnancy_id: string;
  procedure_id: string;
  procedure_code: string;
  performed_by_professional_id: string;
  performed_as: "principal" | "backup";
  backup_grant_id: string | null;
  performed_at: string;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** B2 — repasse opcional principal → retaguarda (amount_cents). */
export type PregnancyProcedurePayout = {
  id: string;
  organization_id: string;
  practice_id: string;
  pregnancy_id: string;
  pregnancy_procedure_id: string;
  principal_professional_id: string;
  backup_professional_id: string;
  amount_cents: number;
  status: "pending" | "settled" | "cancelled";
  effective_on: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_by: string;
  updated_by: string | null;
  settled_at: string | null;
  settled_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};
