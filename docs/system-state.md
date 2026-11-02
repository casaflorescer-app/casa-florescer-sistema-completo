# System State — Casa Florescer

Fotografia oficial. Premissas de arquitetura **confirmadas pelo operador** (2026-10-30) têm prioridade sobre docs históricas.

**Ciclo infra:** Hosped.1d lacunas — **C — BLOCKED** nas lacunas internas (sem EasyPanel terminal/SSH)
**Ciclo produto:** C068 (`3937787`) em `florescerweb` (deploy manual EasyPanel)
**Gate V1:** não declarar concluída até Hosped.1d PASS + UAT autenticado produção

Legenda: **CONFIRMADO (operador)** · **COMPROVADO** · **DOCUMENTADO** · **UI OPERADOR** · **OBSERVADO** · **INCONCLUSIVO** · **BLOCKED**

---

## Arquitetura atual (confirmada)

```text
INTERNET
   ↓
HOSTINGER VPS + EASYPANEL
   ↓
florescerweb          ← frontend + API/backend (CONFIRMADO operador)
   ↓
bancoflorescer        ← PostgreSQL da Casa Florescer (CONFIRMADO operador)
   ↓
volumes / backup      ← ainda BLOCKED comprovar
```

| Item | Valor | Confiança |
|---|---|---|
| App oficial | https://sistema.thvp.cloud | CONFIRMADO / COMPROVADO |
| Deploy | Manual EasyPanel `florescerweb` | CONFIRMADO |
| Git push = deploy? | **Não** | CONFIRMADO |
| Supabase Cloud | **Não** é infra atual | CONFIRMADO |
| `florescerapi` | Serviço EasyPanel presente; papel **não** assumido como API CF | UI OPERADOR / BLOCKED inspect |

---

## Git

| Item | Valor | Confiança |
|---|---|---|
| Branch | `main` | COMPROVADO |
| HEAD | `3937787` | COMPROVADO |
| Migrations no Git | `0001` … `0055` (55) | COMPROVADO |
| Processo de apply no `bancoflorescer` | **DESCONHECIDO** (não presumir `supabase db push`) | BLOCKED |

---

## Produção (público)

| Item | Valor | Confiança |
|---|---|---|
| App | HTTP 200 | COMPROVADO |
| Cliente → `api.thvp.cloud` | Embebido no bundle Next | COMPROVADO |
| Auth `/auth/v1` | 401; Caddy+Envoy | COMPROVADO |
| REST `/rest/v1` | 401 | COMPROVADO |
| Storage version | `1.81.0` | COMPROVADO |
| Realtime | 401 | COMPROVADO |
| `X-Casa-Rev` | `3` (fixo; ≠ SHA) | COMPROVADO |

### Classificação protocolo `SUPABASE_*` no código

| Peça | Classificação |
|---|---|
| `@supabase/ssr` / `NEXT_PUBLIC_SUPABASE_*` | **Legado de protocolo/cliente** — app fala Auth/REST/Storage via esses nomes |
| Supabase Cloud (`*.supabase.co`) | **Não** é produção thvp (CONFIRMADO operador; `.env.local` local ≠ prod) |
| Onde Auth/REST/Storage rodam na VPS | **BLOCKED** (pode ser parte de `florescerweb`, `florescerapi`, ou outro) |

---

## Acesso técnico (Hosped.1d)

```text
SSH: root com senha entrou em 2026-10-31. A chave deste Mac continua recusada
Terminal EasyPanel: não usado na C082
DATABASE INSPECT: schema 0000–0058 no BancoFlorescerPP (C082). 102 tabelas, 0 organizações
MIGRATION PARITY: aplicada neste database. A API api.thvp.cloud não foi trocada
BACKUP OPERACIONAL: dispensado pelo operador nesta etapa. deploy/backup.sh continua no outro Postgres
RESTORE: NÃO TESTADO
```

---

## Lacunas abertas (não reinventar o que já é fato)

| Lacuna | Status |
|---|---|
| Env/network `florescerweb`→`bancoflorescer` | BLOCKED (fato da ligação: CONFIRMADO; evidência técnica: BLOCKED) |
| Inventário Compose / quem serve `api.thvp.cloud` | BLOCKED |
| Histórico migrations no PG vs Git | INCONCLUSIVO |
| Volumes persistentes | BLOCKED |
| Backup real vs `deploy/backup.sh` (`supabase-db`) | Script **desatualizado ou não usado** até prova; backup **NÃO COMPROVADO** |
| Buckets storage | BLOCKED |

Detalhe: [`docs/c069-hosped-1d.md`](./c069-hosped-1d.md).

---

## Co-hospedados EasyPanel (não integrados no app)

n8n · Chatwoot · Evolution — **NÃO INTEGRADOS** no TypeScript da Casa Florescer (WhatsApp app = `wa.me`).

---

## Segurança (resumo)

| Item | Status |
|---|---|
| Deploy manual | CONFIRMADO |
| EasyPanel `:3000` HTTP | COMPROVADO — P1 superfície |
| Postgres público | Não observado aberto (ciclos anteriores) |

---

## Próximo

1. Operador: Terminal EasyPanel ou SSH → fechar lacunas 1–6.
2. Atualizar este arquivo só com evidência.
3. UAT autenticado produção (C069) **após** Hosped.1d PASS.

---

## C076 — leitura do BancoFlorescerPP (2026-10-31)

| Item | Valor | Confiança |
|---|---|---|
| Database no serviço `bancoflorescer` | `postgres` e `BancoFlorescerPP` | COMPROVADO (leitura anterior, sem gravação) |
| `public.organizations` | ausente nos dois databases | COMPROVADO |
| Tabela com `practice` ou `organ` no nome | nenhuma em `BancoFlorescerPP` | COMPROVADO |
| `api.thvp.cloud` usa esse database | não | COMPROVADO pela ausência do schema da clínica |
| Schemas `auth`, `storage`, `extensions` | não listados por nome nesta sessão | INCONCLUSIVO |
| Apply, usuário, conexão, deploy | não feitos | CONFIRMADO nesta tarefa |

O código da casa está no repositório. A produção continua na API atual.

---

## C078 — leitura do BancoFlorescerPP (2026-10-31)

| Item | Valor | Confiança |
|---|---|---|
| `select current_database()` | `BancoFlorescerPP` | COMPROVADO nesta sessão |
| Versão | PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2), x86_64, gcc 14.2.0 | COMPROVADO (`select version()`) |
| Schemas `auth`, `storage`, `extensions` | a consulta não voltou | INCONCLUSIVO |
| `citext`, `btree_gist`, `pgcrypto` | a consulta não voltou | INCONCLUSIVO. Não é ausência |
| `public.organizations` nesta sessão | não reconsultado | A leitura anterior continua sendo a última prova de ausência |
| `api.thvp.cloud` | `/auth/v1/health` 401, `/rest/v1/` 401, `/storage/v1/version` 200 `1.81.0`, Caddy e Envoy | COMPROVADO. Continua o gateway Supabase, não este database |
| Apply, usuário, conexão, deploy | não feitos | CONFIRMADO |

O console do serviço é superusuário (`BancoFlorescerPP=#`). Depois das duas consultas, o comando seguinte ficou no textarea do terminal e não entrou no prompt. A infraestrutura não está validada.

---

## C079 — psql não interativo (2026-10-31)

| Item | Valor | Confiança |
|---|---|---|
| `psql -X -P pager=off -c 'select current_database()'` | não executou | O texto ficou no textarea. O prompt continuou vazio |
| Schemas, extensões, `public.organizations`, contagem de tabelas | não reconsultados | INCONCLUSIVO. A C078 continua valendo para database e versão |
| Papel `casa_login` | não criado | Proposta apenas |
| Revogação de `casa_session` | não implementada | O logout segue só apagando o cookie |

A infraestrutura não está validada.

## C080 — SSH (2026-10-31)

| Item | Valor | Confiança |
|---|---|---|
| `deploy@2.25.151.136` | `Permission denied (publickey,password)` | COMPROVADO. `BatchMode`, sem senha, sem console EasyPanel |
| `root@2.25.151.136` | `Permission denied (publickey,password)` | COMPROVADO. Mesma tentativa |
| Schemas, extensões, `public.organizations`, contagem de tabelas | não consultados | INCONCLUSIVO. Ausência de resposta não é extensão ausente |

Não há `~/.ssh/config` neste computador. As chaves locais não estão autorizadas na VPS. O `docker exec` não rodou daqui. Nada foi aplicado.

## C081 — catálogo lido pelo administrador (2026-10-31)

Leitura no SSH do host `srv2083061`, container `cap-romao_bancoflorescer.1.ztmjkauvhnvygcuyck02n14sy`, database `BancoFlorescerPP`, PostgreSQL 18.6. Nenhuma gravação.

| Item | Valor | Confiança |
|---|---|---|
| `citext` | 1.8 disponível, não instalada | COMPROVADO pelo administrador |
| `btree_gist` | 1.8 disponível, não instalada | COMPROVADO pelo administrador |
| `pgcrypto` | 1.4 disponível, não instalada | COMPROVADO pelo administrador |
| Schemas presentes | `information_schema`, `pg_catalog`, `pg_toast`, `public` | COMPROVADO pelo administrador |
| Schemas `auth`, `storage`, `extensions` | ausentes | COMPROVADO pelo administrador |
| Tabelas em `public` | 0. `public.organizations` ausente | COMPROVADO pelo administrador |
| Backup, papéis, migrations, `casa_login`, sessão, deploy | não executados | CONFIRMADO |

O nome do container muda se o EasyPanel recriar o serviço. `deploy/backup.sh` continua apontando para `supabase-db` e para o database `postgres`. A implantação que veio depois está na C082.

## C082 — schema aplicado (2026-10-31)

Aplicação direta no BancoFlorescerPP, sem backup e sem database temporário. A API `api.thvp.cloud` e `CASA_DATABASE_URL` não foram alteradas. Nenhum deploy.

| Item | Valor | Confiança |
|---|---|---|
| Extensões instaladas | `btree_gist` 1.8, `citext` 1.8, `pgcrypto` 1.4 | COMPROVADO depois dos testes |
| Schemas | `auth`, `storage`, `extensions` presentes | COMPROVADO |
| `casa_login` | login, `rolsuper` falso, `rolbypassrls` falso | COMPROVADO |
| Tabelas em `public` | 102 | COMPROVADO |
| `public.organizations` | 0 linhas | COMPROVADO |
| Provas | C077 e C082, transação desfeita, saída `C082_OK tabelas=102 orgs=0` | COMPROVADO |
| Organizações, práticas e usuários reais | não criados | CONFIRMADO |
| `0059`, senha de `casa_login`, `CASA_DATABASE_URL` | ver a seção C083 abaixo | CONFIRMADO |

## C083 — 0059 e C074 no BancoFlorescerPP (2026-10-31)

Aplicação pelo Bash do container do serviço `bancoflorescer`, usuário de console `postgre`, database `BancoFlorescerPP`. A API `api.thvp.cloud`, `CASA_DATABASE_URL` e `NEXT_PUBLIC_CASA_AUTH` não foram alteradas. Nenhum deploy. Nenhuma organização, prática ou usuário real.

| Item | Valor | Confiança |
|---|---|---|
| `public.casa_staff_create(text,text,text,uuid,jsonb)` | presente | COMPROVADO |
| `professionals.display_name` e `professional_upsert(jsonb)` | presentes. Profissionais 0 | COMPROVADO |
| `public.organizations` | 0 linhas, depois da C074 | COMPROVADO |
| `casa_login` | login em `127.0.0.1`, `rolsuper` falso, `rolbypassrls` falso. Saída `casa_login\|false\|false` | COMPROVADO |
| Senha de `casa_login` | definida no papel. O valor não está no Git. Um valor anterior apareceu no console e foi substituído | CONFIRMADO |
| Teste `supabase/tests/c083_login_and_staff.sql` | executado e desfeito. Saída `BEGIN` … `DO` `ROLLBACK`. Organizações 0 | COMPROVADO |

## C086 — cópia e homologação isolada (2026-10-31)

O BancoFlorescerPP não recebeu escrita desta etapa. O dump `bancoflorescerpp-20261031T215302Z.dump` foi conferido de novo: 1343810 bytes, modo 600, SHA-256 `7a4fc75468e59fb7c6cfa97cdd58072f107ca32f3cd21132ccd339b2f9af8eb6`. A cópia `casa_hml` existe. A imagem `casa-hml-web:c086c` falou só com essa cópia, em `127.0.0.1:3017`, e foi removida. A porta 3017 e a 5432 fecharam. As linhas fictícias saíram: 4 agendamentos e 1 ficha antes da limpeza; usuários, organizações, pacientes, fichas, agendamentos e profissionais da prova em 0. O Florescer Web publicado ficou com zero ocorrências de `NEXT_PUBLIC_CASA_AUTH` e de `CASA_DATABASE_URL`. A ficha sem sessão, com cookie inválido, com sessão vencida e com sessão revogada respondeu 401. A secretária recebeu 403 e a outra médica 404. A médica da prática recebeu 200. “Salvando…” pintou com o botão desabilitado e um único envio pendente. A C089 não começou.

## C111.1 — correções operacionais (2026-11-02)

Parecer: a tela Organização está corrigida no código e provada num contêiner só em `127.0.0.1`. Razão social, nome fantasia e CNPJ apareceram. A frase de autenticação não apareceu. Esse contêiner foi removido. A imagem publicada continua `casa-web:c093`, `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`, então `sistema.thvp.cloud` ainda não tem essa tela. Uma imagem candidata `casa-web:c1111` ficou na VPS e não foi publicada.

O BancoFlorescerPP segue com 1 paciente e 0 gestações, 1 perfil ativo com physician, admin, owner e secretary, 0 profissionais e 0 salas ativas. Não há nome Samara nem Thais. Não há `can_schedule_any_practice`. O cadastro real não foi gravado. Faltam a identidade de cada médica, conselho, número e UF, a prática de cada uma, código, nome e tipo da sala, e uma secretária distinta da conta médica.

Na cópia `casa_c111`, já removida: agendamento criado, horário alterado, cancelado, bloqueio `REUNIAO` criado e cancelado, secretária com uma linha em cada prática e a outra prática invisível. Tudo em `rollback`. O paciente real da cópia não foi editado.

## C111 — auditoria funcional (2026-11-02)

Parecer: **APTO COM RESSALVAS**. Não houve correção de código nem deploy. A imagem publicada continua `casa-web:c093`, `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`. O BancoFlorescerPP segue com 1 paciente e 0 gestações.

| Módulo | Estado | Prioridade | Ação |
| --- | --- | --- | --- |
| Pacientes | Leitura, criação e foto no servidor da casa. CPF repetido é recusado pelo índice. | P2 | A frase da tela ainda pode ser a do banco. |
| Agenda | Criar, alterar, cancelar, abrir atendimento e bloqueio chamam o servidor. | P1 de cadastro | Publicados: 0 profissionais e 0 salas. Não gravar esse cadastro sem autorização. |
| Prontuário | Evolução, assinatura e autoria usam o servidor. O isolamento entre práticas já foi provado na cópia anterior. | — | Nenhuma. |
| Obstetrícia | Conversão e vínculo usam o servidor com cliente nulo. A prova de navegador continua a da C094, na cópia. | — | Nenhuma. |
| Financeiro | Permanece o de RN-CASA-014. | — | Nenhuma. |
| Administração | Usuários, profissionais, salas e especialidades têm ramo da casa. A tela Organização só lê o cliente antigo. | P2 | Trocar essa leitura por `listOrganizationsCasa` numa etapa autorizada. |
| Complementares | Portal, estoque, locação, contratos e relatórios têm ramo da casa. Integrações são atalhos. Configurações redirecionam. | P3 | Nenhuma nesta etapa. |

Na cópia `casa_c111`, já removida: `RESTORE_EXIT=0`, paciente fictício único, segundo CPF com a mesma chave recusado, bloqueio `REUNIAO` criado e cancelado, `rollback`, pacientes de novo 1 e bloqueio 0. O publicado foi lido antes e depois: 1 e 0. A etiqueta `florescerweb:c091-rollback` e os cinco serviços legados permanecem como na C110.

## C110 — encerramento controlado (2026-11-02)

RN-CASA-013 e RN-CASA-014 estão `confirmada`. Auth, REST, Storage, Realtime e a porta da API seguem parados e agora têm o perfil `legado-off`, então um `compose up` padrão não os inicia. `cap-romao_florescerweb` continua `1/1` em `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`. O BancoFlorescerPP segue com 1 paciente e 0 gestações. A foto segue com 496021 bytes. O backup de 2026-11-02 foi conferido de novo pelos mesmos tamanhos e SHA-256. `supabase-db` e o envoy continuam. A exclusão dos cinco, do envoy, de studio, meta, imgproxy e de `casa-florescer-app-1` continua pendente de autorização. `supabase-db` não entra nessa exclusão. A porta 5432 segue fechada. O detalhe está em `docs/Infraestrutura.md` e `docs/Auth.md`.

## C094 — backup conferido e reinício travado (2026-11-02)

O backup vivo do BancoFlorescerPP é `bancoflorescerpp-20261102T100239Z.dump`, 1345981 bytes, SHA-256 `98c51dcce577a73b80a16c73ff1cf2b802825b761d7ca14d5ec167e5fa0d445d`. A restauração isolada repetiu as contagens e o database de prova foi apagado. O publicado segue com 1 paciente e 0 gestações. A foto segue com 496021 bytes. `cap-romao_florescerweb` continua em `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`. Auth, REST, Storage, Realtime e a porta da API estão parados com reinício `no`. `supabase-db` e o envoy continuam. `casa-florescer-app-1` é o Compose local `casa-florescer`, sem porta publicada, e não é o site. A porta 5432 segue fechada. O detalhe está em `docs/Infraestrutura.md`.

## C093 — imagem nova e API antiga parada (2026-11-02)

Por volta de 06:45 -0300 o serviço `cap-romao_florescerweb` executa `casa-web:c093`, `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`, com `/root/casa-files` em `/casa-files` sem somente leitura. O BancoFlorescerPP segue com 1 paciente. A foto real segue com 496021 bytes. `casa-web:c091` e `florescerweb:c091-rollback` permanecem. Auth, REST, Storage, Realtime e `cap-romao_florescerapi-porta-api-1` estão parados, sem remoção de volume. `supabase-db` e o envoy antigo continuam. `api.thvp.cloud` responde 502. `sistema.thvp.cloud` respondeu login, ficha, agenda, financeiro e foto com esses cinco parados. A porta 5432 segue fechada. O dump do BancoFlorescerPP de 2026-11-01 não semeia dados. O detalhe está em `docs/Infraestrutura.md` e `docs/Auth.md`.

## C092 — Florescer Web no BancoFlorescerPP (2026-11-02)

Desde 06:02 -0300 o serviço `cap-romao_florescerweb` executa `casa-web:c091`, `sha256:493cb8e34e576d485d5a74153f64a12e86d1f24b64a0edd388903f69e63afae2`, com volume somente leitura em `/casa-files`. O BancoFlorescerPP tem a cópia e 1 credencial. A origem `supabase-db` / `postgres` continua com 1 organização, 1 paciente e 1 objeto. A porta 5432 segue fechada. `api.thvp.cloud` segue no ar. A volta é `florescerweb:c091-rollback`, `sha256:13d80a36ff7b8b50085fd3617de5fcc90c6fd4c32ccce40b80ed81f349e69ffb`. O detalhe está em `docs/Infraestrutura.md` e `docs/Auth.md`.
