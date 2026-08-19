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

export type AppRole =
  | "owner"
  | "admin"
  | "physician"
  | "secretary"
  | "inventory"
  | "finance";

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
