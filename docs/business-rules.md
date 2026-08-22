# Regras de negócio — Sistema Casa Florescer

Documento de auditoria. Data de referência: 22 de agosto de 2026.

Regras extraídas do código, do schema SQL e do brief da casa. Cada regra indica se **já existe** no sistema, se é só **pretendida**, se há **problema** de cumprimento, ou se é **futuro**.

A Casa Florescer é **uma** unidade: clínica/centro das sócias Dra. Samara e Dra. Thais, especialidades ginecologia e obstetrícia, com consultórios próprios, salas para outros profissionais, sala de procedimentos, sala de medicamentos, recepção e áreas comuns.

---

## 1. Escopo da operação

| ID | Regra | Situação |
|---|---|---|
| N1 | O sistema administra uma única unidade: Casa Florescer | **Pretendida.** Schema permite N `organizations`. **Recomendação:** uma org na operação. |
| N2 | Crescimento interno permitido: profissionais, salas, serviços, usuários, módulos | **Existe** no modelo (`practice_units`, `rooms`, `profiles`, módulos ACL). UI ainda é preview. |
| N3 | Não há multiempresa / multiunidade nesta fase | **Recomendação de produto.** Não implementar seletor de empresa. |
| N4 | Três grupos de usuários: sócias, equipe administrativa, profissionais da estrutura | **Parcial.** Sócias e secretaria existem na UI. Profissional sublocatário só no SQL/fixtures. |

---

## 2. Espaço físico

**Existe** como fixture (`lib/ops/spaces.ts`) e como tipos/tabelas (`rooms.room_kind`, `rental_contracts`):

| Código | Uso pretendido |
|---|---|
| C1 | Consultório Dra. Samara (house, GO) |
| C2 | Consultório Dra. Thais (house, GO) |
| C3–C5 | Consultórios de sublocação (outros profissionais) |
| MED | Sala de medicamentos |
| PROC | Sala de procedimentos (uso compartilhado) |
| REC | Recepção |

**Problema:** isso não está seedado no Postgres. A tela de contratos/estoque lê constantes TypeScript.

**Regra pretendida:** sublocação com aluguel mensal e utilidades (água, luz, internet), extrato por competência — alinhada a `rental_contracts` / `rental_statements`. Há um segundo modelo SQL (`occupancy_contracts` com split/hora) sem UI.

---

## 3. Papéis e acesso

### 3.1 Papéis observados na UI hoje

| UiRole | Rótulo | Home típica | Módulos default |
|---|---|---|---|
| `physician` | Médica | `/medica` | obstétrico, agenda, pacientes, exames, prontuário, capacidade |
| `secretary` | Secretária | `/secretaria` | agenda, pacientes, exames |
| `manager` | Admin Master | `/gestao` | todos os módulos; sidebar inclui médica, secretaria e paciente |
| `patient` | Paciente | `/paciente` | nenhum módulo de staff |

Login demo: `secretaria@florescer.clinica`, `medica@florescer.clinica`, `admin@florescer.clinica`, `paciente@florescer.clinica`, senha `florescer`. Preview também lista Dra. Thais Oliveira e várias secretárias (`lib/rbac.ts` `PREVIEW_STAFF`).

**Problema:** senha e papel no client. Não é regra de produção.

### 3.2 Papéis previstos (produto) vs código

| Previsto | Situação |
|---|---|
| SUPER_ADMIN | **Não existe** como papel próprio. Bypass atual: `is_master_admin()` / `manager`. **Futuro:** administrador técnico distinto das sócias. |
| OWNER | **Existe** no enum SQL `owner`; na UI vira `manager`. Sócias deveriam ter clínico + administrativo + visão gerencial. |
| MANAGER | **Existe** como gestora / Admin Master. |
| SECRETARY | **Existe.** |
| DOCTOR | **Existe** como `physician`. |
| TENANT_PROFESSIONAL | **Pretendido.** SQL de sublocação; sem portal nem isolamento de UI. |

**Regra de desenho (recomendação):** não espalhar autorização nas telas. Usar `lib/permissions.ts`, `lib/rbac.ts`, `lib/nav.ts` e, no servidor, policies RLS. O stub de `RoleGate` **não cumpre** essa regra hoje.

**Regra de ouro (SQL existe, UI não garante):** usuário administrativo **não** acessa informação clínica sem autorização. `clinical_notes_no_secretary_write` impede INSERT da secretária. Leitura clínica passa por `can_read_clinical`. Manager na UI atual **vê** o menu do prontuário — **problema** se esse papel for equipe administrativa e não sócia.

---

## 4. Pacientes

| ID | Regra | Situação |
|---|---|---|
| P1 | MPI da casa: cadastro único por organização (CPF unique por org) | **Existe** no SQL. Persistência atual: `localStorage`. |
| P2 | Paciente pode se vincular a mais de uma prática (`patient_practice_links`) | **Existe** no SQL. UI não gerencia o vínculo. |
| P3 | Cadastro completo: identidade, endereço, GO, convênio/particular | **Existe** no wizard + schema 0006. |
| P4 | Especialidades de cuidado: ginecologia e/ou obstetrícia | **Existe** (`care_specialty`). |
| P5 | GPA: gestações ≥ partos + abortos | **Existe** (check SQL + form). |
| P6 | DPP pela regra de Naegele a partir da DUM; override permitido | **Existe** (`naegele_edd`, `edd_override`). |
| P7 | Recepção vê ficha de contato; dados clínicos de admissão são de staff clínico da org | **Parcial.** Policies 0006; app estático não as exercita. |
| P8 | Portal da paciente: ver próprios dados, exames, agenda | **Existe** schema + telas mock. `patient_accounts` 1:1. |

Seeds de preview incluem CPF e alergias no browser — **problema** de tratamento de dado de saúde, não regra de negócio desejada.

---

## 5. Agenda e recepção

| ID | Regra | Situação |
|---|---|---|
| A1 | Não sobrepor dois agendamentos ativos na mesma sala | **Existe** no SQL (EXCLUDE GiST). UI não persiste. |
| A2 | Consulta vs procedimento (`appointment_kind`) | **Existe** no SQL e em labels da UI. Agenda mock. |
| A3 | Secretária agenda na prática; flag `can_schedule_any_practice` para cruzar | **Existe** no SQL. |
| A4 | Check-in com timestamp e operador | **Existe** colunas 0002. Sem fluxo na UI. |
| A5 | Teto diário por profissional/tipo (`daily_capacity`) | **Existe** SQL + tela médica com fixtures. |
| A6 | Fila / reagendamento em massa | **Só UI mock** (`/secretaria/reagendamento`). |
| A7 | Comunicação WhatsApp / mural de avisos | **Só UI mock** (`/secretaria/comunicacao`). **Futuro:** canal real. |

---

## 6. Clínica (prontuário e obstetrícia)

| ID | Regra | Situação |
|---|---|---|
| C1 | Prontuário isolado por consultório/prática | **Existe** no SQL (`practice_id` em encounters/notes/follow-ups). Telas de prontuário são stub + `ClinicalSnapshot` do cadastro local. |
| C2 | Só physician/owner escrevem notas clínicas | **Existe** policy. |
| C3 | Acesso excepcional (break-glass) com motivo, aprovador e validade | **Existe** tabela. Sem UI. |
| C4 | Corpo da nota tratado como dado sensível (`body_ciphertext`) | **Existe** coluna. Sem criptografia de aplicação documentada além do nome. |
| C5 | Programação obstétrica (DPP / risco) | **Existe** `obstetric_followups` + board preview em `/medica`. |
| C6 | Exames: pedido staff, upload paciente, retirada | **Existe** SQL. UI secretaria/paciente mock. Sem Storage. |

---

## 7. Contratos, estoque e financeiro

| ID | Regra | Situação |
|---|---|---|
| O1 | Profissionais externos pagam uso da estrutura (aluguel ± utilidades) | **Pretendida.** SQL 0005 + preview de contratos. |
| O2 | Um contrato de sublocação ativo por sala | **Existe** unique parcial SQL. |
| O3 | Contrato de sublocação só em sala `sublet_consultorio` | **Existe** trigger. |
| O4 | Estoque da casa por setor (recepção, medicamentos, procedimentos, consultórios) | **Existe** preview. Dois modelos SQL (lote FEFO vs movimento in/out). |
| O5 | Consumo de kit em procedimento pode ir para paciente ou casa (`charge_target`) | **Existe** no SQL. Sem UI. |
| O6 | Split financeiro casa vs práticas vs profissionais | **Existe** schema rico. **Futuro** operacional. |
| O7 | Conferência física de estoque | **Existe** `stock_audits`. UI `/gestao/auditoria` é mock dessa ideia — **não** é log de sistema. |

---

## 8. Auditoria e conformidade

| ID | Regra | Situação |
|---|---|---|
| G1 | Registrar quem fez o quê, em qual entidade, quando, com metadados | **Existe** `audit_events` append-only. **Problema:** ninguém grava. **Futuro:** CREATE/UPDATE/DELETE/VIEW/EXPORT/LOGIN. |
| G2 | Dados de saúde separados de dados administrativos | **Parcial** no SQL; **não** na sessão preview. |
| G3 | Consentimentos por finalidade | **Existe** tabela `consents`. Sem UI. Sem RLS próprio na 0001. |
| G4 | Sessão autenticada para áreas staff e portal | **Pretendida.** Hoje preview local. |

LGPD: o sistema **vai** tratar dados pessoais, administrativos, financeiros e de saúde. A arquitetura SQL está mais preparada que o runtime atual. Produção clínica no GitHub Pages **não** atende essa regra.

---

## 9. Interface (regras de uso)

Observado no código, não necessariamente cumprido em todas as telas:

- Identidade lotus / rose; linguagem da casa.
- Poucos cliques na secretaria: agenda, cadastro, exames.
- Busca no diretório de pacientes e na gestão de usuários.
- Formulário de cadastro em passos, máscaras CPF/telefone/CEP.

**Problema:** sidebar mobile sem drawer; login mistura PT/EN (“Password”, “Sign In”); a maioria das ações não persiste; tabelas são listas em card, sem paginação.

**Recomendação:** na evolução de cada módulo, manter o shell atual (`StaffShell`) e endurecer persistência/mensagens. Não redesenhar o produto inteiro.

---

## 10. Regras que ainda não devem ser implementadas

Enquanto não houver aprovação da fase correspondente:

- Módulos financeiros, campanhas, bônus, prescrições, manutenção de ativos.
- Segundo estabelecimento / franquia.
- Integração WhatsApp real.
- Criptografia de ponta a ponta do prontuário além do que o schema já antecipa.
- Qualquer seed ou dado real de paciente em ambiente Pages.

---

## 11. Síntese

As regras **já escritas no SQL** (uma casa, duas práticas house, sublocação, MPI, isolamento clínico, anti-overlap de sala, ficha GO) são o núcleo do negócio e devem ser **preservadas**.

As regras **ainda só na UI de preview** não devem ser confundidas com operação. O cumprimento real começa na fundação (auth + RLS) e no módulo pacientes — etapas futuras, não esta.
