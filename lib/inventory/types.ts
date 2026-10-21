/** C058/C061 — tipos do módulo Estoque (reusa items/warehouses/stock_* + clinic_equipment). */

export const ITEM_CLASSES = [
  "clinical_lot_controlled",
  "clinical_consumable",
  "surgical_consumable",
  "procedure_consumable",
  "pantry",
  "housekeeping",
  "office",
] as const;

export type ItemClass = (typeof ITEM_CLASSES)[number];

export const ITEM_CLASS_LABEL: Record<ItemClass, string> = {
  clinical_lot_controlled: "Medicamento",
  clinical_consumable: "Material clínico (legado)",
  surgical_consumable: "Material cirúrgico",
  procedure_consumable: "Material de procedimento",
  pantry: "Gênero alimentício",
  housekeeping: "Material geral — higiene/limpeza",
  office: "Material geral — escritório/admin",
};

/** Agrupamento operacional na UI (consumíveis vs patrimoniais). */
export const CONSUMABLE_CLASS_GROUPS = [
  {
    id: "medicamentos",
    label: "Medicamentos",
    classes: ["clinical_lot_controlled"] as const,
  },
  {
    id: "alimentos",
    label: "Gêneros alimentícios",
    classes: ["pantry"] as const,
  },
  {
    id: "cirurgicos",
    label: "Materiais cirúrgicos",
    classes: ["surgical_consumable"] as const,
  },
  {
    id: "procedimento",
    label: "Materiais de procedimento",
    classes: ["procedure_consumable"] as const,
  },
  {
    id: "gerais",
    label: "Materiais gerais",
    classes: ["housekeeping", "office", "clinical_consumable"] as const,
  },
] as const;

export const STOCK_UNITS = [
  "un",
  "cx",
  "pct",
  "frasco",
  "ampola",
  "L",
  "kg",
  "m",
] as const;

export const MOVEMENT_KIND_LABEL: Record<string, string> = {
  receipt: "Entrada",
  pantry_consume: "Saída",
  procedure_consume: "Consumo procedimento",
  transfer: "Transferência",
  adjustment: "Ajuste",
  expiry_writeoff: "Baixa por validade",
  return: "Devolução",
};

export const STOCK_EXPIRING_SOON_DAYS = 30;

export const EQUIPMENT_STATUSES = [
  "active",
  "maintenance",
  "inactive",
  "disposed",
  "transferred",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  active: "Ativo",
  maintenance: "Em manutenção",
  inactive: "Inativo",
  disposed: "Baixado",
  transferred: "Transferido",
};

export const EQUIPMENT_CATEGORIES = [
  "medico",
  "informatica",
  "mobiliario",
  "geral",
] as const;

export const EQUIPMENT_CATEGORY_LABEL: Record<string, string> = {
  medico: "Equipamento médico",
  informatica: "Informática",
  mobiliario: "Mobiliário",
  geral: "Geral",
};

export type WarehouseRow = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  roomId: string | null;
  handlesClinical: boolean;
  handlesPantry: boolean;
  isActive: boolean;
  notes: string | null;
};

export type ItemRow = {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  itemClass: ItemClass;
  unit: string;
  requiresLot: boolean;
  minQty: number;
  idealQty: number;
  reorderQty: number | null;
  description: string | null;
  notes: string | null;
  isActive: boolean;
  totalQty?: number;
};

export type BalanceRow = {
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  itemId: string;
  qtyOnHand: number;
};

export type LotRow = {
  id: string;
  itemId: string;
  warehouseId: string;
  lotCode: string;
  expiresOn: string | null;
  qtyOnHand: number;
};

export type MovementRow = {
  id: string;
  organizationId: string;
  warehouseId: string;
  itemId: string;
  lotId: string | null;
  kind: string;
  qty: number;
  qtyBefore: number | null;
  qtyAfter: number | null;
  transferGroupId: string | null;
  reason: string | null;
  note: string | null;
  occurredAt: string;
  createdBy: string;
};

export type EquipmentRow = {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  acquiredOn: string | null;
  roomId: string | null;
  roomCode?: string | null;
  roomName?: string | null;
  status: EquipmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentEventRow = {
  id: string;
  equipmentId: string;
  eventKind: string;
  fromRoomId: string | null;
  toRoomId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  actorId: string | null;
};

export type StockDashboardStats = {
  itemsTotal: number;
  itemsActive: number;
  lowStock: number;
  zeroStock: number;
  expiringSoon: number;
  expired: number;
  warehouses: number;
  recentMovements: number;
  equipmentTotal: number;
  equipmentMaintenance: number;
};

export type StockAlert = {
  id: string;
  severity: "warn" | "error";
  message: string;
};

export type RoomOption = {
  id: string;
  code: string;
  name: string;
};
