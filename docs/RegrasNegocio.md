# Regras de Negócio — Casa Florescer

Última atualização: 2026-10-31

Este documento começa pelas regras de isolamento da casa. As telas já descritas em `docs/business-rules.md` ainda não foram trazidas para cá.

## Status

| Status | Significado |
| --- | --- |
| `confirmada` | Validada pelo negócio neste ciclo. |
| `⚠ inferida` | Lida do código, ainda sem confirmação. |
| `a definir` | Lacuna. |
| `revogada` | Histórica. |

## Glossário

| Termo | Significado | Onde |
| --- | --- | --- |
| Casa | A organização da clínica | `organizations` |
| Prática | Agenda e prontuário de uma médica, `kind = house` | `practice_units` |
| Despesa compartilhada | Centro `is_shared` e lançamento sem `practice_id` | `cost_centers`, `cost_allocations` |
| Despesa particular | Lançamento com `practice_id` | `cost_allocations` |
| Administradora | Papel `admin`. Não é `SYSTEM_ADMIN` e não é `physician` | `user_practice_roles` |

## Regras

### RN-CASA-001 — Duas práticas

- **Status:** `confirmada`
- **Enunciado:** Samara e Thais são médicas da mesma casa, cada uma na própria prática. Uma não é `owner` nem `physician` da outra.
- **Rastreio:** `supabase/migrations/0056_c076_practice_isolation.sql`. A organização e as duas práticas ainda não são inseridas.

### RN-CASA-002 — Fatura da própria prática

- **Status:** `confirmada`
- **Enunciado:** `can_cashier` lê e grava a fatura só da prática daquele papel. A administradora vê o financeiro das duas. A secretária não lê fatura.
- **Rastreio:** policy `invoices_select` em `0056`.

### RN-CASA-003 — Secretária nas duas agendas

- **Status:** `confirmada`
- **Enunciado:** A secretária pode operar as duas agendas com `can_schedule_any_practice`. Não lê prontuário nem fatura. Continua vendo o cadastro, porque a agenda é das duas.
- **Rastreio:** `can_schedule_in_org` em `0001`, sem alteração. `patients_house_select` em `0056` mantém `secretary` e tira `physician`.

### RN-CASA-004 — Administradora sem prontuário

- **Status:** `confirmada`
- **Enunciado:** A administradora central é `admin`. Vê o financeiro consolidado. Não entra em `can_read_clinical`. `SYSTEM_ADMIN` não é essa conta e não ganha prontuário.
- **Rastreio:** `0056` não cria policy clínica para `admin` nem para `system_admins`.

### RN-CASA-005 — Despesa compartilhada e particular

- **Status:** `confirmada`
- **Enunciado:** Despesa com centro `is_shared` e sem `practice_id` aparece para as duas médicas e para a administradora. Despesa com `practice_id` aparece só para a médica daquela prática e para a administradora. Não há rateio novo.
- **Rastreio:** `public.can_read_cost_allocation` em `0056`.

### RN-CASA-006 — Ficha e evolução

- **Status:** `confirmada`
- **Enunciado:** A leitura de `patient_clinical_data` e de `obstetric_followups` segue `can_read_clinical` da prática vinculada. A escrita da ficha segue `can_write_clinical` dessa prática.
- **Rastreio:** policies `patient_clinical_data_clinical_*` e `obstetric_followups_select` em `0056`.

### RN-CASA-007 — Recepção de exame e receita

- **Status:** `confirmada`
- **Enunciado:** Exame e receita assinada que já passam por `is_house_ops` permanecem assim até a recepção ser validada. Esta regra não abre prontuário.
- **Rastreio:** `0055` e `0003`, sem alteração em `0056`.

### RN-CASA-008 — Senha da casa

- **Status:** `confirmada`
- **Enunciado:** Quando a casa deixar o Auth, a senha de staff é Argon2id em `staff_credentials`. O browser não recebe o hash. Cadastro público continua fechado.
- **Rastreio:** `0000_c076_postgres_prelude.sql`, `0056`, `app/api/casa/session/route.ts`.

## Histórico

- 2026-10-31 — regras de isolamento das duas práticas, da fatura, da despesa e da sessão da casa. O SQL ainda não foi aplicado no banco.
