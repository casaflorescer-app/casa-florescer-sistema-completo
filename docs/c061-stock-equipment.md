# C061 — Consolidação de Estoque, Materiais e Equipamentos

## Finalidade

Evolução do **C058** (`/app/inventory`). Não reconstrói o módulo de estoque.

Objetivo: classificar corretamente materiais consumíveis e separar **equipamentos patrimoniais** (identidade individual) de **quantidade em estoque**.

## Auditoria C058 (reuso)

| Conceito | Fonte | C061 |
|---|---|---|
| Material consumível | `public.items` + RPCs `stock_*` (0051) | REUSE |
| Local / depósito | `public.warehouses` (+ `room_id` já existente) | REUSE + UI room |
| Saldo / lote / FEFO | `stock_balances`, `item_lots`, `stock_movements` | REUSE |
| Inventário | `stock_audits` + `stock_inventory_confirm` | REUSE |
| Auth estoque | `can_access_stock` / PATH_RULES | REUSE |
| Equipamento / patrimônio | — | **NOVO** `clinic_equipment` |

**Não criados:** módulo paralelo de estoque, catálogo de fornecedores, baixa automática procedimento→estoque, receita→estoque, `/app/reports`.

## Classificação de materiais (`item_class`)

| Enum | Rótulo UI |
|---|---|
| `clinical_lot_controlled` | Medicamento (lote obrigatório) |
| `surgical_consumable` | Material cirúrgico (**novo C061**) |
| `procedure_consumable` | Material de procedimento (**novo C061**) |
| `pantry` | Gênero alimentício |
| `housekeeping` | Material geral — higiene/limpeza |
| `office` | Material geral — escritório/admin |
| `clinical_consumable` | Material clínico (legado C058) |

FEFO continua baseado em `item_lots.expires_on` (ordenação ascendente). Não se aplica a equipamentos.

## Equipamentos (patrimônio)

Tabelas (migration **0053**):

- `clinic_equipment` — nome, categoria, fabricante, modelo, série, patrimônio, aquisição, `room_id` → `rooms`, status, notas
- `clinic_equipment_events` — created / updated / transferred / status_changed / disposed

RPCs:

- `clinic_equipment_upsert(jsonb)`
- `clinic_equipment_transfer(jsonb)` — troca de sala **sem** saída/entrada de estoque consumível

Status: `active` | `maintenance` | `inactive` | `disposed` | `transferred`

UI: aba **Equipamentos** em `InventoryModule` (painel distinto de Materiais).

## Locais e salas

- Depósitos: `warehouses.room_id` (já em 0001/0051) — UI C061 passa a permitir vínculo.
- Equipamentos: `clinic_equipment.room_id` → salas do C060.

## RBAC / RLS

- PATH `/app/inventory`: owner \| admin \| `canManageStock` (inalterado).
- Políticas: `can_access_stock(organization_id)`.
- Auditoria: `write_audit` nas RPCs de equipamento.

## Dashboard

Indicadores reais: materiais, baixo/zerado, validade, movimentos 7d, **equipamentos totais**, **em manutenção**.

## Limitações (explícitas)

- Sem módulo de fornecedores neste ciclo.
- Sem integração procedimento → baixa automática (possível C062+).
- Sem integração receita → estoque.
- Sem catálogo regulatório / SNCR / ICP-Brasil.
- Sem módulo geral `/app/reports` (C062).
- Migration **0053** exige **db push autorizado** antes do UAT E2E remoto.

## Migration

`0053_c061_stock_equipment.sql` — aditiva. **db push NÃO automático.**

## Testes

`scripts/uat-c061-{structural,e2e,security,cleanup}.mjs` — marcador `UAT_C061_`.
