# Banco de dados — Sistema Casa Florescer

Documento de auditoria. Data de referência: 22 de agosto de 2026.

Infraestrutura atual: **Supabase** (PostgreSQL + Auth). Fontes: `supabase/migrations/` (0001 a 0007) e tipos em `lib/types/database.ts`.

Não migrar o banco. Não recriar tabelas. Não alterar policies nesta etapa.

Legenda: **Existe** / **Problema** / **Recomendação** / **Futuro**.

---

## 1. Como o app usa o banco hoje

**Existe:**

- Cliente browser: `lib/supabase/client.ts`
- Cliente server / middleware (modo dinâmico): `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- Hydrate de sessão: SELECT em `profiles`, `user_practice_roles`, `patient_accounts`
- Cadastro: UPSERT em `patients` e `patient_clinical_data` **somente se** `isStaticHosting()` for falso

**Problema:** com o default `STATIC_EXPORT=true` (GitHub Pages e `next dev` sem env), o caminho principal é `localStorage` e fixtures. O schema é a especificação executável; a maior parte das telas **não** lê essas tabelas.

**Recomendação:** na fundação (etapa posterior), persistir de verdade no Supabase. Não nesta documentação.

Não há no repositório: `config.toml`, seeds SQL, Edge Functions, buckets de Storage, webhooks ou publicação Realtime.

---

## 2. Migrations (ordem)

| Arquivo | Função |
|---|---|
| `0001_core_multitenancy.sql` | Núcleo: org, práticas, salas, perfis, MPI, agenda, prontuário, financeiro, estoque, `audit_events`, helpers RLS |
| `0002_reception_concurrency.sql` | Anti-sobreposição de sala (GiST) + campos de recepção/check-in |
| `0003_rbac_modules.sql` | Portal da paciente, capacidade, obstetrícia, exames, alertas, auditoria de estoque |
| `0004_profile_permissions.sql` | `profiles.permissions` (jsonb) + policies de perfil |
| `0005_physical_ops.sql` | `room_kind`, contratos de aluguel de sublocação, movimentação de estoque por setor |
| `0006_patient_complete_cadastro.sql` | Endereço/convênio no MPI + `patient_clinical_data` (GPA, DUM, DPP Naegele) |
| `0007_master_admin_rls.sql` | `profiles.role` + `is_master_admin()` + policy `master_admin_all` em tabelas com RLS |

Extensions observadas: `pgcrypto`, `citext`, `btree_gist`.

---

## 3. Multi-tenancy no schema vs uma unidade

**Existe no SQL:** `organizations` (N) → `practice_units` (consultório/prática, `kind` `house` \| `sublet`) → `rooms`. Quase todas as entidades de negócio carregam `organization_id` e, quando o isolamento clínico importa, `practice_id`.

**Premissa de produto:** a Casa Florescer terá **somente uma unidade**. Não implementar multiempresa nem multiunidade na aplicação.

**Recomendação:** não dropar `organizations`. Operar com **uma** linha de organização (Casa Florescer). Usar `practice_units` para crescimento **interno**: consultório Dra. Samara, consultório Dra. Thais, práticas de sublocatários. Isso não é segunda unidade física.

**Problema:** a policy `patients_reception_read` (0001) autoriza staff com certos papéis **sem filtrar `organization_id`**. Inofensivo enquanto houver uma org; arriscado se o modelo multi-org for exercitado.

**Futuro:** se um dia houver outra casa, aí sim discutir segunda `organization`. Fora do escopo.

---

## 4. Relacionamentos (visão consolidada)

```
auth.users
  ├── profiles.id
  ├── patient_accounts.user_id
  └── professionals.profile_id  (via profiles)

organizations  (1 na operação da casa)
  ├── practice_units
  ├── rooms
  ├── profiles
  ├── patients ── patient_clinical_data (1:1)
  ├── procedures, cost_centers, split_rule_sets
  ├── warehouses, items, stock_movements
  ├── exam_orders, agenda_alerts, stock_audits
  ├── rental_contracts, inventory_movements
  └── invoices

practice_units
  ├── user_practice_roles
  ├── professionals
  ├── patient_practice_links, consents
  ├── appointments ── encounters ── clinical_notes
  ├── obstetric_followups, daily_capacity, exam_*
  └── occupancy_contracts, invoices

rooms
  ├── occupancy_contracts, appointments
  ├── rental_contracts
  ├── warehouses, inventory_movements
```

Isolamento clínico previsto: notas e follow-up obstétrico por `practice_id`. Helper `can_read_clinical(practice, patient)`. `break_glass_grants` para acesso excepcional.

Mapa físico **no app** (fixtures `lib/ops/spaces.ts`, não seed SQL): C1 Dra. Samara, C2 Dra. Thais, C3–C5 sublocação, MED, PROC, REC.

---

## 5. Tabelas por domínio

### 5.1 Identidade e acesso

| Tabela | Papel |
|---|---|
| `profiles` | 1:1 com `auth.users`; `organization_id`, `permissions` jsonb, `role` texto (0007) |
| `user_practice_roles` | Papel `app_role` por prática; `clinical_access`; flags de caixa e agenda cruzada |
| `professionals` | Conselho por prática |
| `patient_accounts` | Portal: 1 user ↔ 1 patient |

**Problema:** dois eixos de papel (`app_role` enum vs `profiles.role` texto vs `UiRole`). `inventory` e `finance` existem no enum e não têm portal.

### 5.2 Pacientes (MPI + ficha GO)

`patients`: identificação, contato, endereço, especialidades (`gynecology` \| `obstetrics`), convênio/particular. Unique `(organization_id, cpf)`.

`patient_clinical_data`: 1:1 — GPA (`pregnancies/births/abortions` com check), `lmp_date`, `edd` / `edd_override`, procedimentos ginecológicos, comorbidades, medicações, alergias. Function `naegele_edd`. Trigger de `updated_at`.

`patient_practice_links`, `consents`.

**Existe** na UI um wizard alinhado a esse desenho. **Problema:** persistência atual em `localStorage`; upsert SQL não envia `organization_id` (coluna NOT NULL no SQL).

### 5.3 Agenda e recepção

`appointments`: sala, prática, paciente, profissional, procedimento, intervalo, status, `kind` consulta/procedimento. Check `ends_at > starts_at`. Exclude GiST `appointments_room_no_overlap` (exceto cancelled/no_show). Campos 0002: `source`, `checkin_at`, `checked_in_by`.

`daily_capacity`, `agenda_alerts`, `return_reminders`.

**Problema:** `return_reminders` tem RLS ligado sem policy específica útil (além do bypass master em 0007). Telas de agenda são mock.

### 5.4 Prontuário

`encounters` (1:1 opcional com appointment), `clinical_notes` (`body_ciphertext`, `template_code`, `version`), `break_glass_grants`, `obstetric_followups`.

Policy: secretária **não** insere `clinical_notes`. Leitura clínica via `can_read_clinical`.

**Recomendação:** preservar esse isolamento; é a regra de ouro da casa. Completar na etapa de prontuário, não agora.

### 5.5 Espaço físico e contratos

Dois modelos **coexistem** no SQL:

1. `occupancy_contracts` (0001) — ocupação com valor fixo, hora, split (`revenue_share_bps`, etc.).
2. `rental_contracts` + `rental_statements` (0005) — aluguel mensal de sublocação com água/luz/internet. Trigger `ensure_rental_on_sublet`: só `room_kind = sublet_consultorio`. Unique parcial: um contrato ativo por sala.

`rooms.room_kind`: `house_consultorio`, `sublet_consultorio`, `pharmacy`, `procedure`, `reception`.

**Problema:** a UI de contratos usa preview (`RENTAL_PREVIEW`); não grava nas tabelas. Há sobreposição conceitual entre occupancy e rental.

**Recomendação:** na etapa de contratos, escolher o modelo operacional da casa (aluguel + utilidades parece ser o da UI) e tratar `occupancy_contracts` como legado ou complementar — sem dropar agora.

### 5.6 Estoque

Modelo “clínico com lote”: `warehouses`, `items` (`item_class`, `requires_lot` gerado), `item_lots` (FEFO), `stock_balances`, `procedure_kits`, `stock_movements`, `stock_audits` / `stock_audit_lines`.

Modelo “setor”: `inventory_movements` (`in` \| `out`, `destination_room_id`).

**Problema:** dois desenhos; a UI mostra `STOCK_PREVIEW` por setor. Não há tabela de medicamento/prescrição — só `item_class`.

### 5.7 Financeiro

`cost_centers`, `split_rule_sets`, `split_rules`, `invoices`, `invoice_items`, `payments`, `payment_splits`, `cost_allocations`.

**Existe** só no schema. **Futuro:** módulo finance. `cost_allocations.source_movement_id` não tem FK.

### 5.8 Exames e portal

`exam_orders`, `exam_uploads` (`storage_path` texto — **sem bucket SQL**), policies self + staff.

### 5.9 Auditoria

`audit_events`: `actor_id`, `action`, `entity_table`, `entity_id`, `practice_id`, `patient_id`, `metadata`. UPDATE/DELETE revogados para `anon`, `authenticated` e `service_role`. SELECT para owner/admin (+ master).

**Problema:** nenhum trigger grava essa tabela. A tela `/gestao/auditoria` não é este log (é contagem de estoque).

**Futuro:** triggers/funções para CREATE/UPDATE/DELETE/VIEW/EXPORT/LOGIN. Não implementar agora.

---

## 6. Funções e triggers

| Objeto | Migration | Notas |
|---|---|---|
| `current_profile_id()` | 0001 | SECURITY DEFINER |
| `has_practice_role(practice, roles[])` | 0001 | |
| `can_read_clinical(practice, patient)` | 0001 | |
| `is_patient_self(patient)` | 0003 | |
| `is_org_clinical_staff(org)` | 0006 / reescrita 0007 | |
| `is_master_admin()` | 0007 | `profiles.role = admin` **ou** practice role admin/owner |
| `naegele_edd(lmp)` | 0006 | +280 dias |
| `patient_clinical_data_before_write` | 0006 | trigger |
| `patients_touch_updated_at` | 0006 | trigger |
| `ensure_rental_on_sublet` | 0005 | trigger em `rental_contracts` |

Não há views materializadas no repositório de migrations.

---

## 7. RLS e policies

**Existe RLS** em tabelas críticas (práticas, pacientes, agenda, notes, invoices, movimentos, audit, exames, obstetrícia, rentals, etc.).

**Problema — RLS on sem policy própria (além do `master_admin_all` da 0007):** exemplos: `rooms`, `occupancy_contracts`, `professionals`, `patient_practice_links`, `break_glass_grants`, `payments`, `items`, `item_lots`, `return_reminders`, `stock_audit_lines`. Sem o bypass master, authenticated pode ficar sem acesso ou, conforme grants padrão, exposto.

**Problema — tabelas sem RLS na 0001:** `organizations`, `consents`, `procedures`, `cost_centers`, `split_rule_sets`, `split_rules`, `invoice_items`, `cost_allocations`, `warehouses`, `stock_balances`, `procedure_kits`, `procedure_kit_items`.

**0007:** loop cria `master_admin_all` FOR ALL em toda tabela `public` com RLS. Útil para operação da casa; **risco** se “admin” for concedido demais.

**Recomendação (etapa posterior):** fechar gaps de policy **antes** de dados reais; não recriar o modelo. Não executar nesta etapa.

Auth: o projeto **usa** o Auth do Supabase no código de callback e nos clients; o login da UI ainda não o aciona. Storage: só o campo `storage_path`. Edge Functions: ausentes.

---

## 8. Índices relevantes

- `occupancy_contracts_practice_idx`
- `user_practice_roles_user_idx`
- `patients_name_idx`
- `appointments_room_time_idx`, `appointments_practice_time_idx`
- `appointments_room_no_overlap` (EXCLUDE GiST)
- `cost_allocations_competence_idx`
- `item_lots_fefo_idx`
- `stock_movements_item_time_idx`
- `obstetric_followups (practice_id, edd)`

---

## 9. Inconsistências SQL ↔ TypeScript

- `database.ts` não tipa várias tabelas (`organizations`, `encounters`, `clinical_notes`, ledger, `audit_events`, …).
- `Appointment` no TS não inclui `source` / `checkin_*`.
- `Profile.permissions`: SQL jsonb vs TS `string[]`.
- Upsert de paciente/ficha no store omite `organization_id`.

**Recomendação:** alinhar tipos na fundação do módulo pacientes. Sem alteração de schema agora.

---

## 10. Síntese

O banco **já descreve** a Casa Florescer (GO, duas práticas house, sublocação, prontuário isolado, estoque, split). Não substituir o Supabase. Não migrar.

O trabalho futuro é: uma org na operação, RLS completo, persistência real, triggers de auditoria, Storage para exames — **nessa ordem**, em etapas aprovadas, sem recriação.
