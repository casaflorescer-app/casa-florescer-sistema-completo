# Roadmap — Sistema Casa Florescer

Documento de auditoria. Data de referência: 22 de agosto de 2026.

Sequência recomendada de desenvolvimento. Distingue o que já ocorreu, o que esta etapa entrega, e o que **não** deve ser feito agora.

Premissas:

1. Preservar o projeto iniciado.
2. GitHub permanece o repositório de código.
3. Supabase permanece banco e serviços atuais.
4. Uma única unidade: Casa Florescer.
5. VPS própria é etapa posterior.
6. Sem migração de banco, sem troca de stack, sem configuração de VPS, sem módulos funcionais nesta etapa.
7. GitHub Pages permanece como está (preview estático), não como implementação definitiva dos módulos.

---

## Fase 0 — Auditoria (concluída)

**Existe (entregue):** leitura do repositório, schema, CI, auth, UI e riscos. Diagnóstico apresentado e aprovado para documentação.

Nenhum módulo funcional foi implementado nessa fase.

---

## Fase 1 — Documentação (esta etapa)

**Escopo autorizado:** apenas `/docs`.

| Arquivo | Conteúdo |
|---|---|
| `docs/architecture.md` | Arquitetura, stack, hosting, RBAC, segurança |
| `docs/database.md` | Tabelas, relacionamentos, RLS, recomendações de schema |
| `docs/roadmap.md` | Este arquivo |
| `docs/business-rules.md` | Regras de negócio observadas vs pretendidas |

**Fora desta fase:** qualquer alteração em `app/`, `lib/`, `supabase/`, `_dynamic/`, `next.config.mjs`, workflow de Pages, variáveis `STATIC_EXPORT`.

---

## Fase 2 — Fundação (próxima, após nova aprovação)

Objetivo: tornar o runtime seguro o suficiente para o **primeiro** módulo operacional. Ainda não é o sistema completo.

Itens previstos (não executar agora):

1. Versionar `package-lock.json` e alinhar `.env.example` ao remote real.
2. Definir **uma** `organization` Casa Florescer na operação (sem dropar a tabela).
3. Unificar vocabulário de papéis (SUPER_ADMIN, OWNER, MANAGER, SECRETARY, DOCTOR, TENANT_PROFESSIONAL) **mapeando** colunas/enums existentes.
4. Auth Supabase real no login; preview apenas com flag explícita, nunca como caminho clínico.
5. **`STATIC_EXPORT`:** não mudar agora. Na fundação, se a operação real for o alvo, será tecnicamente necessário `STATIC_EXPORT=false` nos ambientes dinâmicos (dev local autenticado, futuro servidor/VPS), reativando `_dynamic/` (middleware, `app/api`, RoleGate). O GitHub Pages pode continuar como canal estático de demonstração, separado.
6. Enforcement de rota no servidor. Centralizar autorização; não espalhar ifs nas telas.
7. Fechar gaps de RLS **antes** de gravar dados reais de pacientes.
8. Tratar `ignoreBuildErrors` / aviso de CVE do Next 14.2.15 com plano de patch, sem upgrade impulsivo.

**Não nesta fase:** financeiro, prontuário completo, VPS, Docker.

---

## Fase 3 — Pacientes (primeiro módulo de negócio)

Já é o domínio mais maduro na UI (wizard, Zod, ficha GO).

- Persistência em `patients` + `patient_clinical_data` no Supabase.
- MPI da casa (cadastro compartilhado na recepção).
- Sem prontuário completo ainda.

---

## Fase 4 — Agenda e salas

Aproveitar `appointments` e o Exclude GiST de sobreposição por sala.

- Agenda da recepção e agenda da médica.
- Check-in.
- Capacidade diária (`daily_capacity`) se ainda fizer sentido operacional.

---

## Fase 5 — Prontuário isolado

Regra central: consultório Dra. Samara e consultório Dra. Thais não compartilham notas clínicas.

- `encounters` / `clinical_notes` / `obstetric_followups`.
- Secretária sem write clínico (já no SQL).
- Break-glass só com trilha.

---

## Fase 6 — Profissionais da estrutura e contratos

- Papel TENANT_PROFESSIONAL na UI, acesso individualizado.
- `rental_contracts` / `rental_statements` (aluguel + utilidades), alinhados à tela atual de contratos.
- Decidir destino de `occupancy_contracts` (legado vs complementar) **sem drop prematuro**.

---

## Fase 7 — Estoque e medicamentos

- Unificar na operação o modelo “setor” (`inventory_movements`) vs lote/FEFO (`item_lots`).
- Sala de medicamentos e kits de procedimento.
- Prescrições: **não existem** como tabela; são módulo novo (Futuro desta fase ou seguinte).

---

## Fase 8 — Financeiro e comercial

Schema de invoices/splits já existe. Ligar caixa, rateio casa vs profissionais, relatórios. Campanhas e bônus: **não existem** no código; só entrar com brief próprio.

---

## Fase 9 — Auditoria, exames (Storage) e LGPD

- Triggers em `audit_events` (CREATE/UPDATE/DELETE; VIEW/EXPORT/LOGIN se aprovado).
- Buckets Supabase Storage para `exam_uploads`.
- Portal da paciente com Auth real (`patient_accounts`).
- Revisão de policies e de quem é master admin.

A tela `/gestao/auditoria` hoje é conferência de estoque; o log de sistema é outra coisa (`audit_events`).

---

## Fase 10 — Implantação em VPS (posterior)

**Futuro explícito. Não fazer agora.**

Quando houver aprovação:

- Mesmo app Next dinâmico (`STATIC_EXPORT=false`) atrás de HTTPS.
- Variáveis de ambiente de produção distintas das de desenvolvimento.
- Backups do Postgres (Supabase ou Postgres na VPS — decisão posterior; **não migrar o banco agora**).
- Logs, monitoramento, possibilidade de containerização.

Supabase pode continuar como BaaS mesmo com frontend na VPS. Essa decisão não precisa ser tomada nesta etapa.

---

## O que não está no roadmap imediato

| Item | Motivo |
|---|---|
| Recriar o projeto | Base deve ser preservada |
| Trocar Next, React ou Supabase | Stack definida |
| Criar pastas `/features/*` vazias | Extração quando o domínio for real |
| Tratar Pages como produção clínica | É preview estático |
| Alterar `STATIC_EXPORT` agora | Só registrar a necessidade futura |
| Seed SQL da casa / Docker / Nginx | Etapas 2 e 10 |
| WhatsApp / automações de comunicação | UI mock; depende de integração externa |

---

## Critério para avançar de fase

Só iniciar a fase N+1 com:

1. Aprovação explícita.
2. Commits no GitHub, rastreáveis.
3. Sem atalho de “já que estamos aqui” para módulo fora do escopo.
