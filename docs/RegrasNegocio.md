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
- **Enunciado:** `can_cashier` lê e grava a fatura só da prática daquele papel e lê o rateio dessa fatura. A administradora vê as faturas e os rateios das duas. A secretária não lê fatura nem rateio.
- **Rastreio:** policy `invoices_select` em `0056`. Policy `payment_splits_select` em `0057`.

### RN-CASA-003 — Secretária nas duas agendas

- **Status:** `confirmada`
- **Enunciado:** A secretária pode operar as duas agendas com `can_schedule_any_practice`. Não lê prontuário nem fatura. Continua vendo o cadastro, porque a agenda é das duas.
- **Rastreio:** `can_schedule_in_org` em `0001`, sem alteração. `patients_house_select` em `0056` mantém `secretary` e tira `physician`.

### RN-CASA-004 — Administradora sem prontuário

- **Status:** `confirmada`
- **Enunciado:** A administradora central é `admin`. Vê o financeiro consolidado, inclusive o repasse das duas práticas. Não entra em `can_read_clinical`. `SYSTEM_ADMIN` não é essa conta e não ganha prontuário.
- **Rastreio:** `0056` não cria policy clínica para `admin` nem para `system_admins`. `can_read_pregnancy_procedure_payout` em `0057`.

### RN-CASA-005 — Despesa compartilhada e particular

- **Status:** `confirmada`
- **Enunciado:** Despesa com centro `is_shared` e sem `practice_id` aparece para as duas médicas e para a administradora. Despesa com `practice_id` aparece só para a médica daquela prática e para a administradora. Não há rateio novo.
- **Rastreio:** `public.can_read_cost_allocation` em `0056`.

### RN-CASA-006 — Ficha e evolução

- **Status:** `confirmada`
- **Enunciado:** A ficha `patient_clinical_data` é uma linha por paciente em cada prática. A médica lê e grava só a linha da prática dela, mesmo quando a paciente está vinculada às duas. A evolução segue `can_read_clinical` da prática do atendimento. Uma gestação em acompanhamento pode existir em cada prática.
- **Rastreio:** `patient_clinical_data` e o índice `pregnancies_one_in_care_per_practice` em `0057`. `obstetric_followups_select` em `0056`.

### RN-CASA-007 — Recepção de exame e receita

- **Status:** `revogada` em 2026-10-31
- **Enunciado:** Exame e receita assinada que já passam por `is_house_ops` permanecem assim até a recepção ser validada. Esta regra não abre prontuário.
- **Motivo:** a recepção fechou esse recorte. Alergia, exame e receita saem do caminho da secretária. A agenda continua em `is_house_ops`.
- **Rastreio:** `0055` e `0003`. Substituída por RN-CASA-009.

### RN-CASA-009 — Exame, receita e alergia fora da recepção

- **Status:** `confirmada`
- **Enunciado:** A secretária não lê alergia, pedido de exame, arquivo de exame nem receita. Quem lê é a médica da prática, o break-glass e a própria paciente. A administradora também não lê. A função `is_house_ops` permanece para a agenda.
- **Rastreio:** `0057_c077_clinical_finance_isolation.sql`. Prova em `supabase/tests/c077_practice_isolation.sql`, executada em 2026-10-31 no BancoFlorescerPP e desfeita na mesma transação.

### RN-CASA-008 — Senha da casa

- **Status:** `confirmada`
- **Enunciado:** Quando a casa deixar o Auth, a senha de staff é Argon2id em `staff_credentials`. O browser não recebe o hash. Cadastro público continua fechado.
- **Rastreio:** `0000_c076_postgres_prelude.sql`, `0056`, `app/api/casa/session/route.ts`.

### RN-CASA-010 — Sessão revogável

- **Status:** `confirmada`
- **Enunciado:** O cookie `casa_session` leva o identificador de uma linha em `casa_sessions`. Sair revoga essa linha. Trocar a senha revoga todas as linhas daquela conta e apaga o cookie. Um cookie com assinatura válida e linha revogada ou ausente não abre a sessão. O middleware, na borda, continua aceitando a assinatura; a recusa da linha acontece no processo Node, quando `CASA_DATABASE_URL` existe. Sem essa variável, a produção segue no Auth.
- **Rastreio:** `0058_c082_sessions.sql`, `lib/auth/casa-session.ts`, `app/api/casa/session/route.ts`, `app/api/casa/password/route.ts`, `components/layout/RoleGate.tsx`. Prova em `supabase/tests/c082_sessions_and_gaps.sql`, executada em 2026-10-31 e desfeita na mesma transação.

### RN-CASA-011 — Quem cria usuário

- **Status:** `confirmada`
- **Enunciado:** Só o administrador principal, que é `SYSTEM_ADMIN`, cria usuário da casa. A administradora, a secretária e as médicas não criam. A criação não concede `SYSTEM_ADMIN`. A secretária entra sem caixa e sem prontuário. A administradora entra no financeiro das duas práticas, sem prontuário e sem caixa própria. A médica entra só na própria prática, com a própria caixa. O primeiro administrador principal não nasce por essa função, porque ela exige um `SYSTEM_ADMIN` já ativo.
- **Rastreio:** `0059_c083_staff_and_reset.sql`, `app/api/casa/staff/route.ts`, `scripts/c083-bootstrap.sql`. A migration foi aplicada no BancoFlorescerPP em 2026-10-31. O teste `supabase/tests/c083_login_and_staff.sql` ainda não rodou.

### RN-CASA-012 — Redefinição sem revelar a conta

- **Status:** `confirmada`
- **Enunciado:** O pedido de redefinição responde a mesma mensagem para qualquer e-mail. Sem envio de e-mail configurado, nenhum token é gravado. Quando um token é usado, a senha nova é Argon2id e todas as sessões daquela conta caem.
- **Rastreio:** `app/api/casa/password/recover/route.ts`, `app/api/casa/password/reset/route.ts`, `0059_c083_staff_and_reset.sql`. As funções SQL estão no BancoFlorescerPP desde 2026-10-31. O teste dessa migration ainda não rodou.

## Histórico

- 2026-10-31 — RN-CASA-011 e RN-CASA-012: a `0059` entrou no BancoFlorescerPP. O teste SQL da C083 ainda não rodou.
- 2026-10-31 — RN-CASA-011 e RN-CASA-012: só o administrador principal cria usuário; a redefinição não revela se o e-mail existe. A `0059` ainda não foi aplicada.
- 2026-10-31 — RN-CASA-010: sessão da casa revogável no logout e na troca de senha. As provas C077 e C082 rodaram no BancoFlorescerPP e foram desfeitas. Nenhuma organização foi criada.
- 2026-10-31 — RN-CASA-007 revogada. Ficha por prática, rateio da própria fatura e repasse das duas para a administradora. O SQL da C077 ainda não foi aplicado.
- 2026-10-31 — regras de isolamento das duas práticas, da fatura, da despesa e da sessão da casa. O SQL ainda não foi aplicado no banco.
