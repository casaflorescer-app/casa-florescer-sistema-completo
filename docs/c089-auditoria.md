# C089 — Auditoria de dependências do Supabase

Data: 2026-10-31. Etapa de inventário e plano. Não houve deploy, desativação do Supabase, escrita no BancoFlorescerPP, migration nem cópia de arquivo real.

O commit homologado da C086, `53b452682c0b04d12cad18e9c55586adcded47fb`, já é ancestral de `origin/main`. O `HEAD` publicado é `4f0ff4c229835b3f3758c1a0b3b2bb65e057adc4`. Não houve novo push da C086.

A produção continua com `NEXT_PUBLIC_CASA_AUTH` ausente. `lib/auth/casa-mode.ts` só liga o modo do browser quando o valor é exatamente `1`. Sem isso, o browser fala com o cliente em `lib/supabase/client.ts`.

## C090 — ramos fechados, sem prova HTTP nova

O commit documental desta auditoria, `a3c723c`, foi publicado em `origin/main` em fast-forward. Não houve deploy.

No modo da casa, a remoção da foto passou a usar `DELETE /api/casa/files`, com `can_access_patient_photo`, limpeza de `photo_path` e apagamento só no volume `CASA_FILES_ROOT`. A conversão que cria gestação nova aceita cliente nulo e usa `savePregnancyCasa` e `link_encounter_to_pregnancy`. Cadastro, edição e busca de paciente, encerramento e retaguarda da gestação, permissões de interface, profissionais, funcionários, notificações, portal, orientações e buscas de paciente, profissional e procedimento também seguem o servidor quando a flag é `1`. O cliente publicado permanece para quando a flag está ausente.

Isso não é homologação. `npx tsc --noEmit` passou. `scripts/uat-c090-casa-mode.mjs` e `scripts/uat-c086-agenda.mjs` passaram, 9 testes. O término clínico, com a flag em `1`, chama `recalculateDayPredictions` com cliente nulo: a leitura do dia, das durações, das amostras e dos bloqueios usa `withCasaUser`, e a gravação chama `appointment_predictions_append` já existente. `starts_at` e `scheduled_*` não são alterados. O prompt da VPS não estava aberto, então não houve HTTP nem Playwright em `casa_hml`. A flag de produção não foi ligada. A C090 não está homologada.

## Como ler a classificação

Uma tabela no Postgres não torna o módulo migrado. “Migrada e homologada” exige prova HTTP ou de tela na cópia `casa_hml`, registrada em `docs/Infraestrutura.md` e `docs/Progresso.md`. Código com ramo `isCasaBrowserAuth()` sem essa prova fica “implementada, mas não homologada” ou “parcialmente migrada”. O estado vivo do BancoFlorescerPP e de `casa_hml` não foi relido nesta sessão: fica “não verificável”, com a última prova citada.

## Inventário

| Dependência | Onde | Uso | Classe | Alternativa própria |
| --- | --- | --- | --- | --- |
| Cliente do browser | `lib/supabase/client.ts` | Auth, PostgREST e Storage enquanto a flag está ausente | executada em produção | `POST /api/casa/session` e `lib/db/casa.ts` quando a flag é `1` |
| Cliente do servidor | `lib/supabase/server.ts` | Rotas que ainda recebem o cliente | executada em produção | `withCasaUser` em `lib/db/casa.ts` |
| Middleware | `lib/supabase/middleware.ts` | Sessão GoTrue no pedido | executada em produção | cookie `casa_session` quando `CASA_DATABASE_URL` existe |
| Auth GoTrue | `app/(shell)/login/ui.tsx`, `lib/auth/sign-out.ts`, `components/auth/AuthProvider.tsx` | Login publicado | executada em produção | `app/api/casa/session/route.ts` |
| Realtime | nenhum `.channel(` no código da aplicação | o gateway publicado ainda inclui o serviço | infraestrutura, sem chamada do app | nenhuma chamada a desligar no app |
| Storage `patient-photos` | `lib/patients/directory.ts` `uploadPatientPhoto` com cliente | upload publicado | executada em produção | `POST /api/casa/files` com `kind=photo` quando o cliente é nulo |
| Remoção da foto | `removePatientPhoto` com cliente no caminho publicado | `DELETE /api/casa/files` quando o cliente é nulo | ramo no código, sem prova HTTP da C090 | volume privado e `can_access_patient_photo` |
| Storage `clinical-documents` | `lib/documents/directory.ts` upload com cliente | caminho publicado | executada em produção | `POST /api/casa/files` no ramo da casa |
| Buckets no schema | migrations `0009`, `0027`, `0030`, `0041`, `0046` | `patient-photos`, `clinical-orientations`, `clinical-exams`, `encounter-recordings`, `clinical-documents` | schema | volume `CASA_FILES_ROOT`, fora de `public/` |
| SDK em testes e seeds | `scripts/uat-*.mjs`, `scripts/seed-c070-demo.mjs` | prova antiga e semente | teste, não é o caminho publicado | não remover nesta etapa |
| Variáveis públicas | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | entram no build da imagem | executadas em produção | `NEXT_PUBLIC_CASA_AUTH`, `CASA_DATABASE_URL`, `CASA_SESSION_SECRET`, `CASA_FILES_ROOT` só no processo isolado, nunca no Florescer Web nesta etapa |

Objetos reais do Storage não foram listados. Não há inventário de órfãos.

## Matriz de migração

| Módulo | Dependência atual | Implementação própria | Homologação | Pendências | Risco |
| --- | --- | --- | --- | --- | --- |
| Autenticação e sessão | GoTrue no browser | `app/api/casa/session`, cookie `casa_session`, Argon2id em `staff_credentials` | Migrada e homologada na cópia: login 200, senha errada 401, logout 200, sem cookie 401 | Flag ausente na produção. Cookie `Secure` exige HTTPS | Alto se a flag for ligada sem o segredo de sessão |
| Cadastro de usuários | Admin API do Auth no bootstrap | `POST /api/casa/staff` só para `SYSTEM_ADMIN` | Migrada e homologada: principal criou; administradora recebeu 403 | Edição de vínculo existe em `createMembershipCasa` e não entrou na prova HTTP | Médio |
| Pacientes | cliente Supabase em `lib/patients/directory.ts` | `listPatientsCasa`, `createPatientCasa`, `searchPatientsCasa`, `getPatientCasa`, `updatePatientCasa` e `DELETE` da foto | Implementada, mas não homologada. A paciente da prova da C086 foi inserida em SQL | Sem prova HTTP do cadastro, da edição e da remoção da foto | Médio |
| Agenda | cliente na tela quando a flag está ausente | `app/api/casa/appointments` | Migrada e homologada na imagem `c086c`: criar, ler, alterar e cancelar 200; outra médica 404; sem cookie 401; secretária criou; linha ficou `cancelled`; “Salvando…” pintou | Produção continua no cliente | Alto no corte, baixo na cópia |
| Prontuário e ficha | ação antiga virava HTTP 500 | `GET` e `POST /api/casa/clinical` | Migrada e homologada na ficha: 401, 403, 404 e 200; autor da sessão; `DELETE` 405 | Notas, assinatura e o restante do atendimento têm ramo no código e não foram repetidos na `c086c` | Alto se a ficha for tratada como o prontuário inteiro |
| Gestações | cliente no browser quando a flag está ausente | `savePregnancyCasa`, `getPregnancyCasa`, conversão com cliente nulo, encerramento e retaguarda | Implementada, mas não homologada | Sem prova HTTP. O agendamento original permanece na conversão | Alto |
| Exames | cliente e bucket `clinical-exams` | `lib/exams/directory.ts` e `lib/casa/module-data.ts` | Parcialmente migrada | Pedido, catálogo e painel sem prova HTTP da C086 | Médio |
| Documentos e anexos | buckets do Storage | `app/api/casa/files` | Parcialmente migrada. Na primeira imagem, upload e download autorizados passaram e a outra médica foi recusada | Ciclo completo de emissão não foi repetido na `c086c`. Órfãos do Storage não verificados | Alto na cópia de arquivos |
| Faturamento particular | policy `invoices_select` no cliente publicado | `loadFinanceCasa`, `createInvoiceCasa` | Parcialmente migrada. A primeira imagem mostrou a fatura só para a médica dona e para a administradora | A gravação HTTP da fatura não está descrita nessa prova | Alto |
| Despesas particulares | `can_read_cost_allocation` | `createExpenseCasa` | Parcialmente migrada. A policy foi provada no SQL `c084_module_isolation.sql` com `ROLLBACK` | Sem prova HTTP da despesa particular | Alto |
| Despesas compartilhadas | mesma policy; centro `is_shared` e `practice_id` nulo | `loadFinanceCasa` | Migrada e homologada na visibilidade: as duas médicas e a administradora viram a despesa compartilhada | A gravação HTTP não está descrita | Médio |
| Administração da clínica | cliente em organizações e vínculos | `createOrganizationCasa`, `createMembershipCasa` | Parcialmente migrada | Sem prova HTTP além da recusa de criar usuário | Médio |
| Relatórios | cliente em `lib/reports/directory.ts` | `reportsSummaryCasa`, `reportsAppointmentsCasa` | Implementada, mas não homologada | Sem prova HTTP | Médio |
| Configurações | policies, salas, especialidades no cliente | `lib/policies/directory.ts`, `lib/clinic-mgmt/rooms.ts`, `specialties.ts` | Implementada, mas não homologada | Sem prova HTTP | Baixo |
| Portal | cliente em `lib/portal/directory.ts` | ramo `isCasaBrowserAuth` | Implementada, mas não homologada | Sem prova HTTP | Médio |
| Estoque e locação | cliente | `lib/casa/module-data.ts` | Implementada, mas não homologada | Sem prova HTTP | Baixo |
| Relacionamento | cliente | `lib/relationship/directory.ts` | Implementada, mas não homologada | Sem prova HTTP | Baixo |
| Receitas e orientações | cliente e buckets | `lib/prescriptions/directory.ts`, `lib/orientations/directory.ts` | Implementada, mas não homologada | Sem prova HTTP | Médio |
| Gravação e transcrição | Storage `encounter-recordings` | `app/api/casa/files` e rotas de transcrição leem `CASA_FILES_ROOT` quando a URL da casa existe | Implementada, mas não homologada | Sem prova HTTP na C086 | Médio |
| Auditoria | cliente em `lib/platform/audit.ts` | `listAuditEventsCasa` | Implementada, mas não homologada | Sem prova HTTP | Baixo |

RN-CASA-001 a RN-CASA-006, RN-CASA-008 e RN-CASA-009 permanecem confirmadas. RN-CASA-015 permanece `⚠ inferida`. Nenhuma regra foi reescrita.

## PostgreSQL próprio

O schema comparado é `supabase/migrations/` de `0000` a `0059`, mais `0056_c074_professionals_mgmt.sql`. Isolamento clínico e financeiro está em `0056_c076_practice_isolation.sql` e `0057_c077_clinical_finance_isolation.sql`. Sessão revogável está em `0058`. Senha e reset estão em `0059`.

Nesta sessão não houve `SELECT` no BancoFlorescerPP nem em `casa_hml`. O estado vivo fica não verificável. A última prova registrada, em `docs/Infraestrutura.md`: backup `bancoflorescerpp-20261031T215302Z.dump`, 1343810 bytes, modo 600, SHA-256 `7a4fc75468e59fb7c6cfa97cdd58072f107ca32f3cd21132ccd339b2f9af8eb6`; `casa_hml` existe; portas 5432 e 3017 fechadas; Florescer Web com zero ocorrências de `NEXT_PUBLIC_CASA_AUTH` e de `CASA_DATABASE_URL`.

## Segurança

A autorização conferida no servidor, não só na tela:

- Sem sessão, cookie inválido, sessão vencida e sessão revogada na ficha: 401. Agenda sem cookie: 401.
- Administradora ao criar usuário: 403.
- Outra médica na agenda e na ficha: 404, sem alergia.
- Secretária na ficha: 403, e na tela caiu em `/unauthorized`. Ela criou horário.
- Autor gravado na ficha foi a sessão, com `updatedBy` forjado ignorado pelo schema.
- Falha interna da ficha permanece 500, com o log `casa clinical: falha interna`, sem dado clínico. Essa falha não foi provocada na prova.

## Arquivos

Destino próprio: volume `CASA_FILES_ROOT` montado fora de `public/`. A rota `app/api/casa/files/route.ts` lê o caminho gravado na linha e aplica `can_read_exam_file` ou `can_access_patient_photo`. A gravação clínica exige a dona do atendimento. Nenhum objeto foi copiado, apagado ou regravado. A lista de objetos do Storage e a procura por órfãos ficam para a fase C, com autorização.

## Plano de corte

Nenhuma fase abaixo foi executada.

### Fase A — Preparação

Completar o que a matriz marca como parcial: remoção de foto sem cliente Supabase, conversão de gestação, prova HTTP de fatura gravada, despesa particular, cadastro de paciente, gestações, exames e documentos. Critério de parada: qualquer fluxo ainda exigir o cliente quando a flag é `1`. Rollback: não publicar a flag.

### Fase B — Homologação

Repetir a cópia isolada, só em `casa_hml` ou noutra cópia restaurada do backup, em `127.0.0.1`, sem rótulo de proxy. Dados fictícios e limpeza com contagem zero. Cobrir cada linha da matriz que ainda não está homologada, nos tamanhos 1280×800, 768×1024 e 390×844. Critério de parada: 401 virar 500, vazamento de alergia ou fatura, ou contagem residual. Rollback: remover o contêiner e as linhas fictícias, como na C086.

### Fase C — Migração

Com backup novo conferido por tamanho e SHA-256, copiar usuários, vínculos e referências de arquivo. Copiar objetos dos cinco buckets para o volume, conferindo caminho gravado. Não apagar a origem. Critério de parada: contagem de objetos diferente ou caminho órfão sem decisão. Rollback: descartar a cópia de destino e manter o Storage.

### Fase D — Corte

Só com autorização expressa. Build seguinte com `NEXT_PUBLIC_CASA_AUTH=1`. Variáveis só no processo do Florescer Web: `CASA_DATABASE_URL` com `casa_login`, sem superusuário e sem `BYPASSRLS`; segredo de sessão; volume privado. Postgres sem porta pública. Janela com login, um agendamento, uma ficha, uma fatura e um arquivo. Critério de parada: qualquer um desses falhar. Rollback: imagem anterior e variáveis da casa removidas do processo. A API antiga permanece.

### Fase E — Monitoramento

Acompanhar login, 401 real, 403 e 404 sem corpo clínico, erro 500 genérico e tempo da agenda. Critério de parada: vazamento entre práticas ou sessão que não revoga. Rollback: o mesmo da fase D.

### Fase F — Desativação

Só depois de autorização expressa e de a matriz não ter linha “dependente do Supabase” no caminho publicado. Aí se planeja desligar Auth, PostgREST, Storage e Realtime. Rollback: religar o gateway e a imagem anterior. Esta fase não tem data.

## Critérios de aceite da implantação futura

- Backup restaurável conferido de novo, com tamanho e SHA-256 registrados.
- Cada linha da matriz em “migrada e homologada”, ou pendência aceita por escrito.
- 401, 403 e 404 distintos, sem alergia nem fatura no corpo recusado.
- Secretária agenda e não lê ficha nem fatura.
- Administradora não cria usuário.
- Porta 5432 fechada.
- Imagem anterior guardada para o rollback da fase D.

## Pareceres

Validator: APPROVED para a auditoria. A matriz separa código de prova HTTP. O corte não está autorizado. Lacuna: o estado vivo do banco não foi relido.

Tester: APPROVED para o relatório. As provas citadas são as da C086 e o SQL com `ROLLBACK` da C084. Módulos sem prova HTTP permanecem não homologados. A falha interna 500 da ficha não foi provocada.

Security Specialist: APPROVED para a auditoria. Não houve deploy, segredo em documento, abertura de porta nem remoção de código. O risco alto continua sendo ligar a flag na produção antes da fase B. A remoção da foto ainda exige o cliente Supabase.
