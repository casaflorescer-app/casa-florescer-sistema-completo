"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  StatusMessage,
  buttonClass,
  fieldClass,
  ghostButtonClass,
} from "@/components/platform/Ui";
import {
  getItem,
  listBalancesForItem,
  listItems,
  listLotsForItem,
  listMovements,
  listWarehouses,
  loadStockDashboard,
  replenishNeed,
  stockAdjust,
  stockExit,
  stockInventoryConfirm,
  stockReceipt,
  stockTransfer,
  upsertItem,
  upsertWarehouse,
} from "@/lib/inventory/directory";
import {
  ITEM_CLASSES,
  ITEM_CLASS_LABEL,
  MOVEMENT_KIND_LABEL,
  STOCK_EXPIRING_SOON_DAYS,
  STOCK_UNITS,
  type BalanceRow,
  type ItemRow,
  type LotRow,
  type MovementRow,
  type StockAlert,
  type StockDashboardStats,
  type WarehouseRow,
} from "@/lib/inventory/types";

type TabId = "dashboard" | "items" | "move" | "inventory";

function fmtQty(n: number, unit?: string): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
  return unit ? `${v} ${unit}` : v;
}

export function InventoryModule({
  initialTab = "dashboard",
  focusItemId = null,
}: {
  initialTab?: TabId;
  focusItemId?: string | null;
}) {
  const { authorization } = useAuth();
  const orgId = authorization?.profile?.organizationId ?? null;

  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState<StockDashboardStats | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);

  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [itemMoves, setItemMoves] = useState<MovementRow[]>([]);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({
    id: "",
    sku: "",
    name: "",
    itemClass: "clinical_consumable",
    unit: "un",
    minQty: "0",
    idealQty: "0",
    description: "",
    notes: "",
  });

  const [showWhForm, setShowWhForm] = useState(false);
  const [whForm, setWhForm] = useState({ code: "", name: "", notes: "" });

  const [moveForm, setMoveForm] = useState({
    type: "receipt" as "receipt" | "exit" | "transfer" | "adjust",
    itemId: "",
    warehouseId: "",
    toWarehouseId: "",
    qty: "",
    adjustSign: "+" as "+" | "-",
    lotCode: "",
    lotId: "",
    expiresOn: "",
    reason: "",
    note: "",
  });

  const [invForm, setInvForm] = useState({
    warehouseId: "",
    itemId: "",
    countedQty: "",
    notes: "",
  });

  const refresh = useCallback(async () => {
    if (!orgId) {
      setError("Organização não identificada no perfil.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [dash, itemRows, whRows, movs] = await Promise.all([
        loadStockDashboard(orgId),
        listItems({
          organizationId: orgId,
          search,
          itemClass: classFilter,
        }),
        listWarehouses(orgId),
        listMovements({ organizationId: orgId, limit: 30 }),
      ]);
      setStats(dash.stats);
      setAlerts(dash.alerts);
      let list = itemRows;
      if (lowOnly) {
        list = list.filter((i) => (i.totalQty ?? 0) <= i.minQty);
      }
      setItems(list);
      setWarehouses(whRows);
      setMovements(movs);

      if (focusItemId) {
        const found =
          list.find((i) => i.id === focusItemId) ??
          (await getItem(orgId, focusItemId));
        if (found) {
          setSelected(found);
          setTab("items");
        } else {
          setError("Material não encontrado nesta organização (ou sem permissão).");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  }, [orgId, search, classFilter, lowOnly, focusItemId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected || !orgId) {
      setBalances([]);
      setLots([]);
      setItemMoves([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listBalancesForItem(selected.id),
      listLotsForItem(selected.id),
      listMovements({ organizationId: orgId, itemId: selected.id, limit: 40 }),
    ])
      .then(([b, l, m]) => {
        if (!cancelled) {
          setBalances(b);
          setLots(l);
          setItemMoves(m);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBalances([]);
          setLots([]);
          setItemMoves([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, orgId]);

  useEffect(() => {
    if (!moveForm.itemId) return;
    let cancelled = false;
    void listLotsForItem(moveForm.itemId)
      .then((l) => {
        if (!cancelled) setLots(l);
      })
      .catch(() => {
        if (!cancelled) setLots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [moveForm.itemId]);

  async function saveItem() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      if (!itemForm.sku.trim() || !itemForm.name.trim()) {
        throw new Error("Informe SKU e nome do material.");
      }
      const id = await upsertItem({
        id: itemForm.id || null,
        organization_id: orgId,
        sku: itemForm.sku.trim(),
        name: itemForm.name.trim(),
        item_class: itemForm.itemClass,
        unit: itemForm.unit,
        min_qty: Number(itemForm.minQty.replace(",", ".")) || 0,
        ideal_qty: Number(itemForm.idealQty.replace(",", ".")) || 0,
        description: itemForm.description.trim() || null,
        notes: itemForm.notes.trim() || null,
        is_active: true,
      });
      setNotice(itemForm.id ? "Material atualizado." : "Material cadastrado.");
      setShowItemForm(false);
      await refresh();
      const found = await getItem(orgId, id);
      setSelected(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o material.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWarehouse() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      if (!whForm.code.trim() || !whForm.name.trim()) {
        throw new Error("Informe código e nome do local.");
      }
      await upsertWarehouse({
        organization_id: orgId,
        code: whForm.code.trim().toUpperCase(),
        name: whForm.name.trim(),
        notes: whForm.notes.trim() || null,
        handles_pantry: true,
        is_active: true,
      });
      setNotice("Local de estoque criado.");
      setShowWhForm(false);
      setWhForm({ code: "", name: "", notes: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o local.");
    } finally {
      setSaving(false);
    }
  }

  async function submitMove() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const qty = Number(moveForm.qty.replace(",", "."));
      if (!moveForm.itemId) throw new Error("Selecione o material.");
      if (!moveForm.warehouseId) throw new Error("Selecione o local.");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Informe quantidade > 0.");

      if (moveForm.type === "receipt") {
        await stockReceipt({
          organization_id: orgId,
          warehouse_id: moveForm.warehouseId,
          item_id: moveForm.itemId,
          qty,
          lot_code: moveForm.lotCode.trim() || null,
          expires_on: moveForm.expiresOn || null,
          note: moveForm.note.trim() || null,
          reason: moveForm.reason.trim() || "Entrada de estoque",
        });
        setNotice("Entrada registrada.");
      } else if (moveForm.type === "exit") {
        if (!moveForm.reason.trim()) throw new Error("Informe o motivo da saída.");
        await stockExit({
          organization_id: orgId,
          warehouse_id: moveForm.warehouseId,
          item_id: moveForm.itemId,
          qty,
          lot_id: moveForm.lotId || null,
          reason: moveForm.reason.trim(),
          note: moveForm.note.trim() || null,
        });
        setNotice("Saída registrada.");
      } else if (moveForm.type === "transfer") {
        if (!moveForm.toWarehouseId) throw new Error("Selecione o local de destino.");
        await stockTransfer({
          organization_id: orgId,
          from_warehouse_id: moveForm.warehouseId,
          to_warehouse_id: moveForm.toWarehouseId,
          item_id: moveForm.itemId,
          qty,
          lot_id: moveForm.lotId || null,
          reason: moveForm.reason.trim() || "Transferência",
          note: moveForm.note.trim() || null,
        });
        setNotice("Transferência registrada (saída + entrada).");
      } else {
        if (!moveForm.reason.trim()) throw new Error("Informe o motivo do ajuste.");
        const signed = moveForm.adjustSign === "-" ? -qty : qty;
        await stockAdjust({
          organization_id: orgId,
          warehouse_id: moveForm.warehouseId,
          item_id: moveForm.itemId,
          delta: signed,
          lot_id: moveForm.lotId || null,
          lot_code: moveForm.lotCode.trim() || null,
          expires_on: moveForm.expiresOn || null,
          reason: moveForm.reason.trim(),
          note: moveForm.note.trim() || null,
        });
        setNotice("Ajuste registrado.");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na movimentação.");
    } finally {
      setSaving(false);
    }
  }

  async function submitInventory() {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    try {
      const counted = Number(invForm.countedQty.replace(",", "."));
      if (!invForm.warehouseId || !invForm.itemId) {
        throw new Error("Selecione local e material.");
      }
      if (!Number.isFinite(counted) || counted < 0) {
        throw new Error("Informe a quantidade física (≥ 0).");
      }
      await stockInventoryConfirm({
        organization_id: orgId,
        warehouse_id: invForm.warehouseId,
        notes: invForm.notes.trim() || null,
        lines: [{ item_id: invForm.itemId, counted_qty: counted }],
      });
      setNotice("Inventário confirmado (ajustes gerados quando houver divergência).");
      setInvForm({ warehouseId: "", itemId: "", countedQty: "", notes: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no inventário.");
    } finally {
      setSaving(false);
    }
  }

  const selectedNeed =
    selected != null
      ? replenishNeed(selected.minQty, selected.idealQty, selected.totalQty ?? 0)
      : 0;

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lotus-500">
        Gestão Clínica
      </p>
      <h1 className="page-title mt-1">Estoque e Materiais</h1>
      <p className="page-sub mt-2 max-w-3xl">
        Controle administrativo de materiais e insumos. Não substitui prescrição, prontuário
        nem dispensação clínica ao paciente.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Painel"],
            ["items", "Materiais"],
            ["move", "Movimentar"],
            ["inventory", "Inventário"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? buttonClass : ghostButtonClass}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setItemForm({
              id: "",
              sku: "",
              name: "",
              itemClass: "clinical_consumable",
              unit: "un",
              minQty: "10",
              idealQty: "30",
              description: "",
              notes: "",
            });
            setShowItemForm(true);
            setTab("items");
          }}
        >
          Novo material
        </button>
        <button
          type="button"
          className={ghostButtonClass}
          onClick={() => {
            setShowWhForm(true);
            setTab("items");
          }}
        >
          Novo local
        </button>
      </div>

      <div className="mt-4">
        <StatusMessage error={error} notice={notice} />
      </div>

      {loading ? <p className="mt-6 text-sm text-lotus-600">Carregando estoque…</p> : null}

      {!loading && tab === "dashboard" ? (
        <section className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { label: "Materiais", value: stats?.itemsTotal ?? 0 },
              { label: "Ativos", value: stats?.itemsActive ?? 0 },
              { label: "Estoque baixo", value: stats?.lowStock ?? 0 },
              { label: "Zerados", value: stats?.zeroStock ?? 0 },
              { label: "Próx. validade", value: stats?.expiringSoon ?? 0 },
              { label: "Vencidos", value: stats?.expired ?? 0 },
              { label: "Locais", value: stats?.warehouses ?? 0 },
              { label: "Mov. 7 dias", value: stats?.recentMovements ?? 0 },
            ].map((c) => (
              <article key={c.label} className="card min-w-0 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-lotus-500">
                  {c.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-lotus-900">{c.value}</p>
              </article>
            ))}
          </div>
          <p className="text-xs text-lotus-500">
            Validade próxima = lotes com expires_on em até {STOCK_EXPIRING_SOON_DAYS} dias.
          </p>
          {alerts.length > 0 ? (
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-semibold text-lotus-900">Alertas</h2>
              <ul className="space-y-2">
                {alerts.slice(0, 40).map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      a.severity === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    {a.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="card p-4 text-sm text-lotus-700">
              Nenhum alerta operacional no momento.
            </section>
          )}
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-lotus-900">Movimentações recentes</h2>
            <ul className="mt-3 space-y-2">
              {movements.slice(0, 12).map((m) => (
                <li key={m.id} className="border-b border-lotus-50 pb-2 text-sm text-lotus-800">
                  <span className="font-medium">
                    {MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}
                  </span>{" "}
                  · {fmtQty(m.qty)} ·{" "}
                  {new Date(m.occurredAt).toLocaleString("pt-BR")}
                  {m.qtyBefore != null && m.qtyAfter != null
                    ? ` · ${fmtQty(m.qtyBefore)} → ${fmtQty(m.qtyAfter)}`
                    : null}
                </li>
              ))}
              {movements.length === 0 ? (
                <li className="text-sm text-lotus-600">Sem movimentações ainda.</li>
              ) : null}
            </ul>
          </section>
        </section>
      ) : null}

      {!loading && tab === "items" ? (
        <section className="mt-6 space-y-4">
          {warehouses.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Nenhum local de estoque. Crie um local (ex.: Farmácia, Procedimentos) antes das
              entradas.
            </p>
          ) : (
            <p className="text-sm text-lotus-600">
              Locais: {warehouses.map((w) => `${w.code} (${w.name})`).join(" · ")}
            </p>
          )}

          <div className="card grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <label className="block text-sm text-lotus-800">
              Buscar
              <input
                className={fieldClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou SKU"
              />
            </label>
            <label className="block text-sm text-lotus-800">
              Categoria
              <select
                className={fieldClass}
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="all">Todas</option>
                {ITEM_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {ITEM_CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm text-lotus-800">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
              />
              Somente estoque baixo
            </label>
          </div>

          <ul className="space-y-3 md:hidden">
            {items.map((item) => {
              const low = (item.totalQty ?? 0) <= item.minQty;
              return (
                <li key={item.id}>
                  <article className="card space-y-2 p-4">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase text-lotus-500">{item.sku}</p>
                        <h3 className="font-semibold text-lotus-900">{item.name}</h3>
                      </div>
                      {low ? (
                        <span className="text-xs font-medium text-amber-800">Baixo</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-lotus-700">
                      {ITEM_CLASS_LABEL[item.itemClass]} ·{" "}
                      {fmtQty(item.totalQty ?? 0, item.unit)}
                    </p>
                    <button
                      type="button"
                      className={ghostButtonClass}
                      onClick={() => setSelected(item)}
                    >
                      Detalhes
                    </button>
                  </article>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-lotus-100 text-xs uppercase tracking-wide text-lotus-500">
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Categoria</th>
                  <th className="px-2 py-2">Saldo</th>
                  <th className="px-2 py-2">Mín / Ideal</th>
                  <th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-lotus-50">
                    <td className="px-2 py-3 font-medium">{item.sku}</td>
                    <td className="px-2 py-3">{item.name}</td>
                    <td className="px-2 py-3">{ITEM_CLASS_LABEL[item.itemClass]}</td>
                    <td className="px-2 py-3">
                      {fmtQty(item.totalQty ?? 0, item.unit)}
                      {(item.totalQty ?? 0) <= item.minQty ? (
                        <span className="ml-2 text-xs text-amber-800">baixo</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      {fmtQty(item.minQty)} / {fmtQty(item.idealQty)}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setSelected(item)}
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? (
              <p className="mt-4 text-sm text-lotus-600">Nenhum material encontrado.</p>
            ) : null}
          </div>

          {selected ? (
            <section className="card space-y-4 p-4 sm:p-6" id="material-detalhe">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-lotus-500">{selected.sku}</p>
                  <h2 className="text-xl font-semibold text-lotus-900">{selected.name}</h2>
                  <p className="mt-1 text-sm text-lotus-600">
                    {ITEM_CLASS_LABEL[selected.itemClass]} · unidade {selected.unit}
                    {selected.requiresLot ? " · controla lote" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => {
                      setItemForm({
                        id: selected.id,
                        sku: selected.sku,
                        name: selected.name,
                        itemClass: selected.itemClass,
                        unit: selected.unit,
                        minQty: String(selected.minQty),
                        idealQty: String(selected.idealQty),
                        description: selected.description ?? "",
                        notes: selected.notes ?? "",
                      });
                      setShowItemForm(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => {
                      setMoveForm((f) => ({ ...f, itemId: selected.id, type: "receipt" }));
                      setTab("move");
                    }}
                  >
                    Movimentar
                  </button>
                  <button
                    type="button"
                    className={ghostButtonClass}
                    onClick={() => setSelected(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <h3 className="text-sm font-semibold">Saldo total</h3>
                  <p className="mt-1 text-lg font-semibold">
                    {fmtQty(selected.totalQty ?? 0, selected.unit)}
                  </p>
                  <p className="text-sm text-lotus-600">
                    Mín {fmtQty(selected.minQty)} · Ideal {fmtQty(selected.idealQty)}
                    {selectedNeed > 0 ? ` · Repor ${fmtQty(selectedNeed)}` : ""}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold">Por local</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {balances.map((b) => (
                      <li key={b.warehouseId}>
                        {b.warehouseCode ?? b.warehouseId}: {fmtQty(b.qtyOnHand, selected.unit)}
                      </li>
                    ))}
                    {balances.length === 0 ? <li>Sem saldo registrado.</li> : null}
                  </ul>
                </div>
              </div>

              {lots.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold">Lotes (FEFO)</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {lots.map((l) => (
                      <li key={l.id}>
                        {l.lotCode} · val. {l.expiresOn ?? "—"} · {fmtQty(l.qtyOnHand)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-semibold">Histórico</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {itemMoves.map((m) => (
                    <li key={m.id} className="rounded-lg border border-lotus-100 px-3 py-2">
                      {MOVEMENT_KIND_LABEL[m.kind] ?? m.kind} · {fmtQty(m.qty)} ·{" "}
                      {new Date(m.occurredAt).toLocaleString("pt-BR")}
                      {m.qtyBefore != null && m.qtyAfter != null
                        ? ` · ${fmtQty(m.qtyBefore)} → ${fmtQty(m.qtyAfter)}`
                        : null}
                      {m.reason ? ` · ${m.reason}` : null}
                    </li>
                  ))}
                  {itemMoves.length === 0 ? <li>Sem movimentações.</li> : null}
                </ul>
              </div>
            </section>
          ) : null}

          {showItemForm ? (
            <section className="card space-y-3 p-4 sm:p-6">
              <h2 className="text-lg font-semibold">
                {itemForm.id ? "Editar material" : "Novo material"}
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm">
                  SKU
                  <input
                    className={fieldClass}
                    value={itemForm.sku}
                    onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Nome
                  <input
                    className={fieldClass}
                    value={itemForm.name}
                    onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Categoria
                  <select
                    className={fieldClass}
                    value={itemForm.itemClass}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, itemClass: e.target.value }))
                    }
                  >
                    {ITEM_CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {ITEM_CLASS_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Unidade
                  <select
                    className={fieldClass}
                    value={itemForm.unit}
                    onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                  >
                    {STOCK_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Estoque mínimo
                  <input
                    className={fieldClass}
                    value={itemForm.minQty}
                    onChange={(e) => setItemForm((f) => ({ ...f, minQty: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Estoque ideal
                  <input
                    className={fieldClass}
                    value={itemForm.idealQty}
                    onChange={(e) => setItemForm((f) => ({ ...f, idealQty: e.target.value }))}
                  />
                </label>
                <label className="text-sm md:col-span-2">
                  Descrição
                  <textarea
                    className={fieldClass}
                    rows={2}
                    value={itemForm.description}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, description: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={saving}
                  onClick={() => void saveItem()}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => setShowItemForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </section>
          ) : null}

          {showWhForm ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-lg font-semibold">Novo local de estoque</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm">
                  Código
                  <input
                    className={fieldClass}
                    value={whForm.code}
                    onChange={(e) => setWhForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="FARMA"
                  />
                </label>
                <label className="text-sm">
                  Nome
                  <input
                    className={fieldClass}
                    value={whForm.name}
                    onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Farmácia"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={saving}
                  onClick={() => void saveWarehouse()}
                >
                  Salvar local
                </button>
                <button
                  type="button"
                  className={ghostButtonClass}
                  onClick={() => setShowWhForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {!loading && tab === "move" ? (
        <section className="card mt-6 space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Movimentação</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm">
              Tipo
              <select
                className={fieldClass}
                value={moveForm.type}
                onChange={(e) =>
                  setMoveForm((f) => ({
                    ...f,
                    type: e.target.value as typeof moveForm.type,
                  }))
                }
              >
                <option value="receipt">Entrada</option>
                <option value="exit">Saída</option>
                <option value="transfer">Transferência</option>
                <option value="adjust">Ajuste</option>
              </select>
            </label>
            <label className="text-sm">
              Material
              <select
                className={fieldClass}
                value={moveForm.itemId}
                onChange={(e) => setMoveForm((f) => ({ ...f, itemId: e.target.value }))}
              >
                <option value="">—</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku} — {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Local {moveForm.type === "transfer" ? "(origem)" : ""}
              <select
                className={fieldClass}
                value={moveForm.warehouseId}
                onChange={(e) =>
                  setMoveForm((f) => ({ ...f, warehouseId: e.target.value }))
                }
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>
            {moveForm.type === "transfer" ? (
              <label className="text-sm">
                Destino
                <select
                  className={fieldClass}
                  value={moveForm.toWarehouseId}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, toWarehouseId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm">
              Quantidade
              <input
                className={fieldClass}
                value={moveForm.qty}
                onChange={(e) => setMoveForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </label>
            {moveForm.type === "adjust" ? (
              <label className="text-sm">
                Direção do ajuste
                <select
                  className={fieldClass}
                  value={moveForm.adjustSign}
                  onChange={(e) =>
                    setMoveForm((f) => ({
                      ...f,
                      adjustSign: e.target.value as "+" | "-",
                    }))
                  }
                >
                  <option value="+">Aumentar (+)</option>
                  <option value="-">Reduzir (−)</option>
                </select>
              </label>
            ) : null}
            {(moveForm.type === "receipt" || moveForm.type === "adjust") && (
              <>
                <label className="text-sm">
                  Lote (se aplicável)
                  <input
                    className={fieldClass}
                    value={moveForm.lotCode}
                    onChange={(e) =>
                      setMoveForm((f) => ({ ...f, lotCode: e.target.value }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Validade
                  <input
                    type="date"
                    className={fieldClass}
                    value={moveForm.expiresOn}
                    onChange={(e) =>
                      setMoveForm((f) => ({ ...f, expiresOn: e.target.value }))
                    }
                  />
                </label>
              </>
            )}
            {(moveForm.type === "exit" || moveForm.type === "transfer") && (
              <label className="text-sm">
                Lote (id, se controla lote)
                <select
                  className={fieldClass}
                  value={moveForm.lotId}
                  onChange={(e) => setMoveForm((f) => ({ ...f, lotId: e.target.value }))}
                >
                  <option value="">— automático / N/A —</option>
                  {lots
                    .filter((l) => l.warehouseId === moveForm.warehouseId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lotCode} (val. {l.expiresOn ?? "—"} · {fmtQty(l.qtyOnHand)})
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="text-sm md:col-span-2">
              Motivo
              <input
                className={fieldClass}
                value={moveForm.reason}
                onChange={(e) => setMoveForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
            <label className="text-sm md:col-span-2">
              Observação
              <input
                className={fieldClass}
                value={moveForm.note}
                onChange={(e) => setMoveForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
          </div>
          <p className="text-xs text-lotus-500">
            Saldo negativo não é permitido. Transferência gera saída + entrada na mesma
            operação.
          </p>
          <button
            type="button"
            className={buttonClass}
            disabled={saving}
            onClick={() => void submitMove()}
          >
            {saving ? "Registrando…" : "Confirmar movimentação"}
          </button>
        </section>
      ) : null}

      {!loading && tab === "inventory" ? (
        <section className="card mt-6 space-y-4 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Inventário / conferência</h2>
          <p className="text-sm text-lotus-600">
            Informe a quantidade física. O sistema gera ajuste com histórico (saldo anterior →
            posterior).
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm">
              Local
              <select
                className={fieldClass}
                value={invForm.warehouseId}
                onChange={(e) => setInvForm((f) => ({ ...f, warehouseId: e.target.value }))}
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Material
              <select
                className={fieldClass}
                value={invForm.itemId}
                onChange={(e) => setInvForm((f) => ({ ...f, itemId: e.target.value }))}
              >
                <option value="">—</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.sku} — {i.name} (sistema: {fmtQty(i.totalQty ?? 0)})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Quantidade física
              <input
                className={fieldClass}
                value={invForm.countedQty}
                onChange={(e) => setInvForm((f) => ({ ...f, countedQty: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              Observações
              <input
                className={fieldClass}
                value={invForm.notes}
                onChange={(e) => setInvForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={saving}
            onClick={() => void submitInventory()}
          >
            Confirmar inventário
          </button>
        </section>
      ) : null}
    </div>
  );
}
