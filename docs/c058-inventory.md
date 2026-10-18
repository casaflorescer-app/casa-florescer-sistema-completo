# C058 — Gestão de Estoque e Materiais

## Finalidade

Módulo administrativo de **Gestão Clínica → Estoque** (`/app/inventory`). Substitui o `ModulePlaceholder`.

Não é prescrição, prontuário, receita, exame nem dispensação clínica ao paciente.

## Auditoria (reuso)

| Conceito | Fonte |
|---|---|
| Material | `public.items` (+ `ideal_qty`, `is_active`, … em 0051) |
| Local | `public.warehouses` |
| Saldo | `public.stock_balances` (atualizado por RPCs) |
| Lote / validade | `public.item_lots` (FEFO index existente) |
| Movimentações | `public.stock_movements` (livro único) |
| Inventário | `public.stock_audits` + `stock_audit_lines` |
| Auth | `can_access_stock` / `can_manage_stock` / owner\|admin |

**Não criados:** tabelas `materials`, `products`, `inventory_movements` paralelas.

## Movimentações (RPCs 0051)

| Operação | RPC | Kind |
|---|---|---|
| Entrada | `stock_movement_receipt` | `receipt` |
| Saída | `stock_movement_exit` | `pantry_consume` |
| Transferência | `stock_movement_transfer` | `transfer` ×2 (mesmo `transfer_group_id`) |
| Ajuste | `stock_movement_adjust` | `adjustment` |
| Inventário | `stock_inventory_confirm` | gera `stock_audits` + ajustes |

Todas usam `stock_apply_qty_delta` com `FOR UPDATE` (sem saldo negativo).

## Regras

- Saldo só muda via movimentação rastreável (`qty_before` / `qty_after`).
- Unidade bloqueada após primeira movimentação (`STOCK_UNIT_LOCKED`).
- Lote obrigatório se `item_class = clinical_lot_controlled`.
- Estoque baixo: `total <= min_qty`.
- Ideal / reposição: `max(0, ideal - total)`.
- Alertas derivados na UI (sem segundo sistema; não usa `agenda_alerts`).

## RBAC

- PATH `/app/inventory`: owner \| admin \| `canManageStock` \| system_admin.
- RPCs: `can_access_stock(org)`.
- Médica comum / secretária sem flag / paciente / anônimo: sem acesso.

## Migration

`0051_c058_stock_ops.sql` — **db push NÃO automático**.

## Testes

`scripts/uat-c058-{structural,e2e,security,cleanup}.mjs` — marcador `UAT_C058_`.
