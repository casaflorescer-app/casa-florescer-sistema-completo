# C057 — Gestão de Aluguéis e Contratos

## Finalidade

Módulo operacional de **Gestão Clínica** para contratos de locação de consultórios (`sublet_consultorio`). Substitui o `ModulePlaceholder` em `/app/rentals`.

Não é agenda, consulta nem atendimento. O contrato define a relação administrativa/comercial; a agenda permanece responsável pelos agendamentos. **C057 não bloqueia a agenda automaticamente.**

## Entidades (reuso)

| Entidade | Fonte | Papel |
|---|---|---|
| Profissional | `professionals` + `profiles` + `practice_units` | Locatário (FK `tenant_professional_id`) |
| Sala | `rooms` (`room_kind = sublet_consultorio`) | Objeto do contrato |
| Contrato | `rental_contracts` (0005 + C057) | Relação comercial |
| Histórico | `rental_contract_events` (C057) | Criação/alteração/renovação/encerramento/cancelamento |
| Extrato | `rental_statements` (0005) | Evolução futura (não operacionalizado neste ciclo) |

**Não criados:** cadastro paralelo de médicos, salas, practices ou usuários.

## Status persistidos

Enum existente: `scheduled` | `active` | `ended` | `cancelled`.

Derivados na UI (não persistidos):

- **Próximo do vencimento** = `active` com `ends_on` nos próximos `RENTAL_EXPIRING_SOON_DAYS` (30) dias.

Regra de coerência com datas: `rental_contract_derive_status` na migration `0050_c057_rental_contracts_ops.sql`.

## Renovação

`rental_contract_renew`:

1. Encerra o contrato origem (se scheduled/active), com motivo de renovação.
2. Cria **novo** contrato com `renewed_from_id` apontando à origem.
3. Registra evento `renewed` no contrato origem.

Não reescreve silenciosamente o contrato encerrado.

## Conflito de sala

Duas regras do schema 0005 (explícitas, sem conflito silencioso):

1. **GiST** `rental_contracts_room_no_overlap`: períodos `scheduled`/`active` na mesma sala **não podem sobrepor**.
2. **Unique parcial** `rental_contracts_one_active_per_room`: no máximo **um** contrato `scheduled`/`active` por sala (mesmo em períodos consecutivos não sobrepostos).

Consequência operacional: para criar um contrato sequencial (ex. 2028 após 2027), o contrato anterior deve estar `ended` ou `cancelled`. A renovação já faz isso (encerra origem + cria novo).

Mensagem operacional: conflito de sala / `RENTAL_CONTRACT_ROOM_OVERLAP` (também mapeia violação do unique).

## RBAC

- Menu Gestão Clínica / Aluguéis / Contratos: `canAccessClinicManagement` = owner | admin.
- `PATH_RULES` `/app/rentals`: owner | admin.
- RPCs: `is_house_staff(org, {owner, admin})`.
- Médica comum, secretária, paciente, anônimo: sem acesso à superfície.

## RLS

- `rental_contracts`: policies house + tenant select (0005).
- `rental_contract_events`: house staff owner/admin (C057).

## Rotas

- `/app/rentals` — painel + listagem/formulário
- `/app/rentals?tab=contracts` — aba Contratos
- `/app/rentals/[id]` — detalhe (escopo por `organization_id`; IDOR → sem dados)

## Migration

Arquivo: `supabase/migrations/0050_c057_rental_contracts_ops.sql`

- Colunas: `contract_code`, `renewed_from_id`, `created_by`, `due_day`, cancel/end fields, `updated_at`
- Tabela: `rental_contract_events`
- RPCs: create / update / end / cancel / renew (+ `write_audit`)

**db push:** não automático neste ciclo — exige autorização expressa.

## Reajuste / financeiro completo

Evolução futura. C057 persiste `monthly_rent_cents` (inteiro) e `due_day`. Sem módulo financeiro paralelo.

## Testes

- `scripts/uat-c057-structural.mjs`
- `scripts/uat-c057-e2e.mjs`
- `scripts/uat-c057-security.mjs`
- `scripts/uat-c057-cleanup.mjs`

Marcador: `UAT_C057_`. Cleanup obrigatório com `uat_left = 0`.
