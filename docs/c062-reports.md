# C062 — Relatórios e Indicadores

## Finalidade

Módulo `/app/reports` operacional (substitui `ModulePlaceholder`).

READ-ONLY. Contagens e metadados. Sem faturamento, sem SOAP/anamnese, sem SNCR/ICP-Brasil, sem WhatsApp “enviado”.

## Acesso

| Camada | Regra |
|---|---|
| PATH_RULES | `owner \|\| admin` |
| Nav | “Relatórios e indicadores” (gestão clínica) |
| RPC | `can_access_reports(org)` = `is_house_staff(owner\|admin)` |
| patient / anonymous / physician / secretary | bloqueados no path administrativo |

## Migration

`0054_c062_reports_ops.sql` — RPCs:

- `can_access_reports(uuid)`
- `reports_operational_summary(org, from, to)` — agregados
- `reports_appointments_detail(...)` — drill-down agenda (metadados)

**Justificativa SECURITY DEFINER:** owner/admin não passam `can_read_clinical`, mas precisam de contagens de encounters/documentos sem ler conteúdo clínico.

**db push NÃO automático.**

## Período

Timezone: **America/Sao_Paulo**.

Presets: hoje, ontem, 7d, 30d, mês atual, mês anterior, ano atual, personalizado.

Intervalo SQL: `[from, to)` em timestamptz (meia-noite SP).

## Dicionário de indicadores (implementados)

| Indicador | Fonte | Campo temporal | Regra |
|---|---|---|---|
| Atendimentos (agenda) | `appointments` | `scheduled_starts_at` | todos no período |
| Concluídos | `appointments` | `scheduled_starts_at` | `status = completed` |
| Cancelados | `appointments` | `scheduled_starts_at` | `status = cancelled` |
| Faltas | `appointments` | `scheduled_starts_at` | `status = no_show` |
| Por tipo | `appointments.kind` | idem | exclui cancelados no gráfico de tipo |
| Evolução diária | `appointments` | `scheduled_starts_at` → date SP | exclui cancelados |
| Encounters abertos | `encounters` | `created_at` | status qualquer no período |
| Encounters assinados | `encounters` | `signed_at` | `signed`/`amended` |
| Retornos | `encounters` | `created_at` | `return_of_encounter_id IS NOT NULL` |
| Novos pacientes | `patients` | `created_at` | |
| Pacientes total | `patients` | — | cadastro atual |
| Docs emitidos | `clinical_document_artifacts` | `issued_at` | `status = finalized` |
| Docs por tipo | idem | idem | `document_kind` |
| Superseded | idem | `issued_at` | histórico |
| Portal publicados | idem | `published_to_patient_at` | `available_to_patient` |
| Exames pedidos | `clinical_exam_requests` | `confirmed_at`/`created_at` | `confirmed` (≠ resultado) |
| Receitas | `prescriptions` | `signed_at`/`created_at` | `signed`/`dispatched` (≠ draft) |
| Aluguéis | `rental_contracts` | status atual | active/scheduled/ended/cancelled/expiring |
| Salas | `rooms` | — | total/active |
| Contratos clínicos | obstetric / procedure_agreements | — | status active |
| Workforce | `clinic_workforce` | — | active/inactive |
| Estoque baixo | `items` + balances | — | `qty <= min_qty` |
| Lotes validade | `item_lots` | `expires_on` | vencidos / ≤30d |
| Movimentações | `stock_movements` | `occurred_at` | por kind |
| Equipamentos | `clinic_equipment` | — | por status |

## NÃO DISPONÍVEL

| Tema | Motivo |
|---|---|
| Financeiro / faturamento | ledger não operacional |
| WhatsApp SENT/DELIVERED | provedor não configurado |
| SNCR / ICP-Brasil | flags falsas |
| Split ginecológico/obstétrico | `appointment.kind` só `consultation`\|`procedure` |

## UI

Abas: Visão geral · Atendimentos · Pacientes · Documentos · Salas e contratos · Estoque.

Exportação: CSV do detalhe de agenda (linhas da página atual).

## Testes

`scripts/uat-c062-{structural,e2e,security,cleanup}.mjs` — marcador `UAT_C062_`.
