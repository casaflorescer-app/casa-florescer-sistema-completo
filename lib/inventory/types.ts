/** C058 — tipos do módulo Estoque (reusa items/warehouses/stock_*). */

export const ITEM_CLASSES = [
  "clinical_lot_controlled",
  "clinical_consumable",
  "pantry",
  "housekeeping",
  "office",
] as const;

export type ItemClass = (typeof ITEM_CLASSES)[number];

export const ITEM_CLASS_LABEL: Record<ItemClass, string> = {
  clinical_lot_controlled: "Medicamento/lote",
  clinical_consumable: "Material clínico",
  pantry: "Insumo / pantry",
  housekeeping: "Higiene / limpeza",
  office: "Escritório",
};

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

export type StockDashboardStats = {
  itemsTotal: number;
  itemsActive: number;
  lowStock: number;
  zeroStock: number;
  expiringSoon: number;
  expired: number;
  warehouses: number;
  recentMovements: number;
};

export type StockAlert = {
  id: string;
  severity: "warn" | "error";
  message: string;
};
