"use client";

import { createClient } from "@/lib/supabase/client";
import { countEquipmentStats } from "@/lib/inventory/equipment";
import {
  STOCK_EXPIRING_SOON_DAYS,
  type BalanceRow,
  type ItemClass,
  type ItemRow,
  type LotRow,
  type MovementRow,
  type StockAlert,
  type StockDashboardStats,
  type WarehouseRow,
} from "@/lib/inventory/types";

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Autenticação não configurada neste ambiente.");
  return supabase;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapItem(row: Record<string, unknown>, totalQty?: number): ItemRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    itemClass: row.item_class as ItemClass,
    unit: String(row.unit ?? "un"),
    requiresLot: Boolean(row.requires_lot),
    minQty: Number(row.min_qty ?? 0),
    idealQty: Number(row.ideal_qty ?? 0),
    reorderQty: row.reorder_qty == null ? null : Number(row.reorder_qty),
    description: (row.description as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    isActive: row.is_active !== false,
    totalQty,
  };
}

function mapWarehouse(row: Record<string, unknown>): WarehouseRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    roomId: (row.room_id as string | null) ?? null,
    handlesClinical: Boolean(row.handles_clinical),
    handlesPantry: Boolean(row.handles_pantry),
    isActive: row.is_active !== false,
    notes: (row.notes as string | null) ?? null,
  };
}

function mapMovement(row: Record<string, unknown>): MovementRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    warehouseId: String(row.warehouse_id),
    itemId: String(row.item_id),
    lotId: (row.lot_id as string | null) ?? null,
    kind: String(row.kind),
    qty: Number(row.qty),
    qtyBefore: row.qty_before == null ? null : Number(row.qty_before),
    qtyAfter: row.qty_after == null ? null : Number(row.qty_after),
    transferGroupId: (row.transfer_group_id as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    occurredAt: String(row.occurred_at),
    createdBy: String(row.created_by),
  };
}

function mapRpcError(message: string): string {
  if (message.includes("STOCK_INSUFFICIENT") || message.includes("STOCK_LOT_INSUFFICIENT")) {
    return "Saldo insuficiente neste local/lote. Saída não permitida.";
  }
  if (message.includes("STOCK_LOT_REQUIRED")) {
    return "Informe o lote (e validade na entrada) para este material.";
  }
  if (message.includes("STOCK_UNIT_LOCKED")) {
    return "Unidade de medida bloqueada: já existem movimentações deste material.";
  }
  if (message.includes("STOCK_TRANSFER_SAME_WAREHOUSE")) {
    return "Origem e destino da transferência devem ser diferentes.";
  }
  if (message.includes("STOCK_EXIT_REASON_REQUIRED") || message.includes("STOCK_ADJUST_REASON_REQUIRED")) {
    return "Informe o motivo da operação.";
  }
  if (message.includes("FORBIDDEN")) {
    return "Sem permissão para estoque (owner/admin ou can_manage_stock).";
  }
  if (message.includes("STOCK_ITEM_NOT_FOUND") || message.includes("STOCK_WAREHOUSE_NOT_FOUND")) {
    return "Material ou local não encontrado nesta organização.";
  }
  if (message.includes("STOCK_ITEM_REQUIRED_FIELDS") || message.includes("STOCK_WAREHOUSE_REQUIRED")) {
    return "Preencha os campos obrigatórios (código/SKU e nome).";
  }
  if (message.includes("duplicate key") && message.includes("items")) {
    return "Já existe material com este SKU nesta organização.";
  }
  if (message.includes("duplicate key") && message.includes("warehouses")) {
    return "Já existe local/depósito com este código.";
  }
  return message;
}

export async function listWarehouses(organizationId: string): Promise<WarehouseRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select(
      "id, organization_id, code, name, room_id, handles_clinical, handles_pantry, is_active, notes",
    )
    .eq("organization_id", organizationId)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapWarehouse(r as Record<string, unknown>));
}

export async function listItems(params: {
  organizationId: string;
  search?: string;
  itemClass?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<ItemRow[]> {
  const supabase = requireClient();
  let q = supabase
    .from("items")
    .select(
      "id, organization_id, sku, name, item_class, unit, requires_lot, min_qty, ideal_qty, reorder_qty, description, notes, is_active",
    )
    .eq("organization_id", params.organizationId)
    .order("name")
    .limit(Math.min(params.limit ?? 200, 500));

  if (params.activeOnly !== false) q = q.eq("is_active", true);
  if (params.itemClass && params.itemClass !== "all") {
    q = q.eq("item_class", params.itemClass);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let items = (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
  const search = params.search?.trim().toLowerCase();
  if (search) {
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(search) ||
        i.sku.toLowerCase().includes(search),
    );
  }
  if (items.length === 0) return items;

  const ids = items.map((i) => i.id);
  const { data: bals } = await supabase
    .from("stock_balances")
    .select("item_id, qty_on_hand")
    .in("item_id", ids);

  const totals = new Map<string, number>();
  for (const b of bals ?? []) {
    const id = String((b as { item_id: string }).item_id);
    totals.set(id, (totals.get(id) ?? 0) + Number((b as { qty_on_hand: number }).qty_on_hand));
  }
  return items.map((i) => ({ ...i, totalQty: totals.get(i.id) ?? 0 }));
}

export async function getItem(
  organizationId: string,
  itemId: string,
): Promise<ItemRow | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, organization_id, sku, name, item_class, unit, requires_lot, min_qty, ideal_qty, reorder_qty, description, notes, is_active",
    )
    .eq("organization_id", organizationId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const item = mapItem(data as Record<string, unknown>);
  const { data: bals } = await supabase
    .from("stock_balances")
    .select("qty_on_hand")
    .eq("item_id", itemId);
  item.totalQty = (bals ?? []).reduce(
    (s, b) => s + Number((b as { qty_on_hand: number }).qty_on_hand),
    0,
  );
  return item;
}

export async function listBalancesForItem(itemId: string): Promise<BalanceRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("stock_balances")
    .select("warehouse_id, item_id, qty_on_hand, warehouses:warehouse_id(code, name)")
    .eq("item_id", itemId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const wh = Array.isArray(r.warehouses) ? r.warehouses[0] : r.warehouses;
    const whRec = (wh ?? null) as Record<string, unknown> | null;
    return {
      warehouseId: String(r.warehouse_id),
      itemId: String(r.item_id),
      qtyOnHand: Number(r.qty_on_hand),
      warehouseCode: whRec ? String(whRec.code ?? "") : undefined,
      warehouseName: whRec ? String(whRec.name ?? "") : undefined,
    };
  });
}

export async function listLotsForItem(itemId: string): Promise<LotRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("item_lots")
    .select("id, item_id, warehouse_id, lot_code, expires_on, qty_on_hand")
    .eq("item_id", itemId)
    .gt("qty_on_hand", 0)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    itemId: String((r as { item_id: string }).item_id),
    warehouseId: String((r as { warehouse_id: string }).warehouse_id),
    lotCode: String((r as { lot_code: string }).lot_code),
    expiresOn: ((r as { expires_on: string | null }).expires_on as string | null) ?? null,
    qtyOnHand: Number((r as { qty_on_hand: number }).qty_on_hand),
  }));
}

export async function listMovements(params: {
  organizationId: string;
  itemId?: string;
  warehouseId?: string;
  limit?: number;
}): Promise<MovementRow[]> {
  const supabase = requireClient();
  let q = supabase
    .from("stock_movements")
    .select(
      "id, organization_id, warehouse_id, item_id, lot_id, kind, qty, qty_before, qty_after, transfer_group_id, reason, note, occurred_at, created_by",
    )
    .eq("organization_id", params.organizationId)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(params.limit ?? 50, 200));
  if (params.itemId) q = q.eq("item_id", params.itemId);
  if (params.warehouseId) q = q.eq("warehouse_id", params.warehouseId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapMovement(r as Record<string, unknown>));
}

export async function loadStockDashboard(
  organizationId: string,
): Promise<{ stats: StockDashboardStats; alerts: StockAlert[] }> {
  const supabase = requireClient();
  const today = new Date().toISOString().slice(0, 10);
  const soon = addDaysIso(today, STOCK_EXPIRING_SOON_DAYS);

  const [itemsRes, whRes, balsRes, lotsRes, movRes, equipStats] = await Promise.all([
    supabase
      .from("items")
      .select("id, is_active, min_qty, name, sku")
      .eq("organization_id", organizationId),
    supabase
      .from("warehouses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase.from("stock_balances").select("item_id, qty_on_hand, warehouse_id"),
    supabase
      .from("item_lots")
      .select("id, item_id, lot_code, expires_on, qty_on_hand")
      .gt("qty_on_hand", 0),
    supabase
      .from("stock_movements")
      .select("id")
      .eq("organization_id", organizationId)
      .gte("occurred_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    countEquipmentStats(organizationId).catch(() => ({ total: 0, maintenance: 0 })),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (whRes.error) throw new Error(whRes.error.message);

  const items = itemsRes.data ?? [];
  const itemIds = new Set(items.map((i) => i.id as string));
  const totals = new Map<string, number>();
  for (const b of balsRes.data ?? []) {
    const id = b.item_id as string;
    if (!itemIds.has(id)) continue;
    totals.set(id, (totals.get(id) ?? 0) + Number(b.qty_on_hand));
  }

  let lowStock = 0;
  let zeroStock = 0;
  const alerts: StockAlert[] = [];
  const seen = new Set<string>();
  const push = (id: string, severity: "warn" | "error", message: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    alerts.push({ id, severity, message });
  };

  for (const item of items) {
    if (item.is_active === false) continue;
    const total = totals.get(item.id as string) ?? 0;
    const min = Number(item.min_qty ?? 0);
    if (total <= 0) {
      zeroStock += 1;
      push(`zero:${item.id}`, "error", `${item.sku} — ${item.name}: estoque zerado.`);
    } else if (total <= min) {
      lowStock += 1;
      push(
        `low:${item.id}`,
        "warn",
        `${item.sku} — ${item.name}: estoque baixo (${total} ≤ mín. ${min}).`,
      );
    }
  }

  let expiringSoon = 0;
  let expired = 0;
  for (const lot of lotsRes.data ?? []) {
    if (!itemIds.has(lot.item_id as string)) continue;
    const exp = lot.expires_on as string | null;
    if (!exp) continue;
    if (exp < today) {
      expired += 1;
      push(
        `expired:${lot.id}`,
        "error",
        `Lote ${lot.lot_code} vencido em ${exp} (qtd ${lot.qty_on_hand}).`,
      );
    } else if (exp <= soon) {
      expiringSoon += 1;
      push(
        `soon:${lot.id}`,
        "warn",
        `Lote ${lot.lot_code} vence em ${exp} (qtd ${lot.qty_on_hand}).`,
      );
    }
  }

  return {
    stats: {
      itemsTotal: items.length,
      itemsActive: items.filter((i) => i.is_active !== false).length,
      lowStock,
      zeroStock,
      expiringSoon,
      expired,
      warehouses: (whRes.data ?? []).length,
      recentMovements: (movRes.data ?? []).length,
      equipmentTotal: equipStats.total,
      equipmentMaintenance: equipStats.maintenance,
    },
    alerts,
  };
}

export async function upsertItem(payload: Record<string, unknown>): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("stock_item_upsert", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
  const row = data as { id?: string } | null;
  if (!row?.id) throw new Error("Material sem identificador retornado.");
  return row.id;
}

export async function upsertWarehouse(payload: Record<string, unknown>): Promise<string> {
  const supabase = requireClient();
  const { data, error } = await supabase.rpc("stock_warehouse_upsert", {
    p_payload: payload,
  });
  if (error) throw new Error(mapRpcError(error.message));
  const row = data as { id?: string } | null;
  if (!row?.id) throw new Error("Local sem identificador retornado.");
  return row.id;
}

export async function stockReceipt(payload: Record<string, unknown>): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("stock_movement_receipt", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function stockExit(payload: Record<string, unknown>): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("stock_movement_exit", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function stockTransfer(payload: Record<string, unknown>): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("stock_movement_transfer", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function stockAdjust(payload: Record<string, unknown>): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("stock_movement_adjust", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
}

export async function stockInventoryConfirm(payload: Record<string, unknown>): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.rpc("stock_inventory_confirm", { p_payload: payload });
  if (error) throw new Error(mapRpcError(error.message));
}

export function replenishNeed(minQty: number, idealQty: number, total: number): number {
  const target = Math.max(idealQty, minQty);
  return Math.max(0, target - total);
}
