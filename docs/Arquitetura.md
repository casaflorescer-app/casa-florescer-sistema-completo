# Arquitetura

## Decisão

Em produção o Next.js e o Supabase rodam na mesma VPS. O navegador só alcança o Caddy, nas portas 80 e 443.

O modo dinâmico (`output: "standalone"` em `next.config.mjs`) é o de produção. `STATIC_EXPORT=true` continua só para o export estático legado.

## Topologia

- `APP_HOST` — Caddy encaminha para o container `app` (Next, porta 3000 interna).
- `API_HOST` — Caddy encaminha só `/auth`, `/rest`, `/storage`, `/realtime` e `/graphql` para o gateway do Supabase. Qualquer outro caminho responde 404, inclusive o Studio.
- Gateway do Supabase (Envoy, alias de rede `kong`) publicado apenas em `127.0.0.1:8000`, para o túnel SSH do Studio.
- Postgres sem porta no host. O pooler (Supavisor) não sobe no fluxo normal.
- Funções de borda, analytics e vector não sobem. O repositório não tem `supabase/functions`.
- Storage e imgproxy sobem, porque fotos e documentos clínicos usam buckets.

O commit do diretório oficial `supabase/docker` está em `deploy/SUPABASE_PIN`.

## Dados

As migrations em `supabase/migrations/` criam o schema e não inserem organização nem usuário. O primeiro acesso depende de `deploy/bootstrap-admin.sh`.

A chave anon vai no browser. A chave `service_role` fica só no `deploy/.env` da VPS e no bootstrap. O container do Next não recebe `service_role`.

## C076 — Postgres próprio, schema aplicado, conexão ainda sem troca

O browser de produção continua em `api.thvp.cloud`. `CASA_DATABASE_URL` não foi gravada e não houve deploy.

Em 2026-10-31 o schema `0000`–`0058` foi aplicado no BancoFlorescerPP. O banco ficou com 102 tabelas em `public` e 0 linhas em `organizations`. As extensões `citext` 1.8, `btree_gist` 1.8 e `pgcrypto` 1.4 estão instaladas. Os schemas `auth`, `storage` e `extensions` existem. Nenhuma organização, prática ou usuário real foi criado.

O processo Next, quando a conexão for ligada, entra como `casa_login`. Esse papel faz login, não é superusuário e não tem `BYPASSRLS`. Ele herda `casa_app`, que chama o hash e as funções de sessão, e herda `authenticated` para o pedido. Cada pedido grava `app.user_id`, faz `SET LOCAL ROLE authenticated` e, ao devolver a conexão, `RESET ROLE`. `0056` e `0057` apertam o isolamento das duas práticas. `0058` guarda a sessão revogável em `public.casa_sessions`. `0059` cria o usuário só pelo administrador principal e a redefinição de senha. Essa migration foi aplicada no BancoFlorescerPP em 2026-10-31, junto com a C074 (`display_name` e `professional_upsert`). A senha de `casa_login` existe e a prova devolveu `casa_login|false|false`. `CASA_DATABASE_URL` continua ausente. Enquanto ela existir, o servidor não usa o cliente Supabase. Com `NEXT_PUBLIC_CASA_AUTH=1`, o browser também não usa. Nenhuma das duas variáveis foi ligada.

O ramo da C084 fica em `lib/casa/actions.ts`. As telas só o chamam quando `NEXT_PUBLIC_CASA_AUTH` é `1`. Sem essa variável, o cliente Supabase permanece. O build local de 2026-10-31 passou sem `CASA_DATABASE_URL`. A prova `supabase/tests/c084_module_isolation.sql` está no repositório e ainda não foi executada no BancoFlorescerPP.

## C085 — gravações, volume privado e financeiro

Com o modo da casa ligado, agenda, prontuário, gestação, pedido de exame, emissão de documento e rascunho de receita passam a chamar as funções SQL que já existem, por uma lista fechada em `lib/casa/rpc.ts`. A lista de usuários lê `profiles` e `user_practice_roles` no servidor. A criação continua em `POST /api/casa/staff`.

Foto, exame e PDF entram por `POST /api/casa/files` e saem por `GET` no mesmo caminho. O arquivo fica sob `CASA_FILES_ROOT`, fora de `public/`. O banco guarda o caminho relativo. A leitura clínica exige `can_read_exam_file`. A fotografia exige `can_access_patient_photo`. Sem a variável do volume, a rota responde indisponível. Essa variável não foi gravada na produção.

A tela `/app/finance` lista fatura, pagamento, rateio e despesa pelo que a policy já devolve. O rateio não calcula percentual. A gravação de despesa só aparece para administradora. Fatura e pagamento só aparecem para quem tem caixa ou é administradora.

Com o modo da casa ligado, estoque, locação, relacionamento, portal, gravação, compositor de receitas e catálogo de exames chamam as funções SQL já existentes. A gravação lê o áudio no volume privado e só segue se o caminho pedido for o caminho gravado. O PDF do documento segue o mesmo volume. Pedidos de exame, itens de modelo de receita, busca de paciente para audiência e o painel de resultados também leem pelo servidor. O anexo do resultado entra por `POST /api/casa/files` e a abertura usa o identificador gravado.

A prova SQL da C084 rodou no BancoFlorescerPP em 2026-10-31. A transação terminou em `ROLLBACK` e a contagem de organizações ficou 0. Na mesma data, a repetição da C088 foi confirmada no prompt da VPS: organizações em 0 antes da prova, `ROLLBACK` ao fim e organizações de novo em 0. Em 2026-10-31 o BancoFlorescerPP ganhou um `pg_dump` em formato customizado, de 1343810 bytes, SHA-256 `7a4fc75468e59fb7c6cfa97cdd58072f107ca32f3cd21132ccd339b2f9af8eb6`, PostgreSQL 18.6. O arquivo está no host, fora do Git, modo 600. A restauração de prova repetiu 0 organizações, 0 profissionais, 103 tabelas e 1580 constraints, e esse database temporário foi apagado. A cópia `casa_hml` ficou com os mesmos números. O BancoFlorescerPP continuou com 0 organizações. Em 2026-10-31 a imagem `casa-hml-web:c086` foi construída só na VPS, a partir do clone em `/root/casa-hml-src`, com `NEXT_PUBLIC_CASA_AUTH=1` e endereços públicos de exemplo. O `Dockerfile` do Git não mudou. O contêiner `casa-hml-web` escutou em `127.0.0.1:3017` e falou com `casa_hml` como `casa_login`. O Florescer Web não recebeu `CASA_DATABASE_URL` nem `NEXT_PUBLIC_CASA_AUTH`. Depois da primeira rodada o contêiner foi removido. A leitura da agenda daquela imagem devolveu lista vazia, porque ela ainda não tinha a criação. A ficha foi criada, lida e alterada; a outra médica não a viu. A aplicação publicada continua na API antiga. O corte não foi executado. A rodada seguinte está na seção complementar.

Dependências do Supabase:

- Já migrado, com a variável exatamente `1`: login da casa, agenda, prontuário, gestação, exames, receitas, repasse, relatórios, usuários, estoque, locação, relacionamento, portal, gravação, arquivos privados, financeiro, busca de item de estoque, orientações, documentos do atendimento, queixa, anamnese, exame físico, retorno clínico, feedback, auxílio de IA, contratos, salas, especialidades, políticas, auditoria, linha do tempo, vínculo de gestação na tela do atendimento, vínculo de prática e organizações.
- Parcial: a conversão que cria uma gestação nova e o vínculo de uma já em cuidado usam o servidor quando o cliente está ausente. Na C094 o navegador executou o diálogo numa cópia restaurada do backup novo; a gestação ficou nessa cópia e o BancoFlorescerPP permaneceu com 0 gestações.
- Pendente: nenhuma função nova foi criada. O que não tinha função ou policy continua no cliente publicado.
- Legado: não há chamada de Realtime pelo app. Com `CASA_DATABASE_URL`, o middleware não consulta o Auth antigo. Auth, REST, Storage, Realtime e a porta da API foram parados; o banco antigo e o envoy permanecem. O SDK continua no código para o ramo sem a variável da casa.

## C110 — os cinco ficam fora do compose padrão

Em 2026-11-02 `auth`, `rest`, `realtime`, `storage` e `porta-api` receberam `profiles: ["legado-off"]`. Um `docker compose config --services` sem esse perfil lista `studio`, `api-gw`, `db`, `imgproxy` e `meta`. Com `--profile legado-off`, entram também `realtime`, `rest`, `storage` e `auth`. No Compose do EasyPanel, o padrão não lista serviço; com o perfil, só `porta-api`. `functions` e `supavisor` continuam no perfil `manual` do override. Nenhum `docker compose up` foi executado e o serviço Swarm não foi atualizado. Os cinco containers seguem parados. `supabase-db`, o envoy e o Florescer Web, imagem `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`, seguem no ar. RN-CASA-013 e RN-CASA-014 passaram a `confirmada`, com o enunciado da C109.

## C094 — conversão no navegador, na cópia restaurada

Em 2026-11-02 o backup novo do BancoFlorescerPP foi restaurado em `casa_c094` e depois apagado. O Chromium abriu o atendimento de prova nessa cópia, em `127.0.0.1`, com a imagem `casa-web:c093`. O botão “Alterar para atendimento obstétrico” apareceu, a confirmação seguiu e a frase “Acompanhamento obstétrico criado” ficou na tela. A gestação `in_care` ficou vinculada ao atendimento só em `casa_c094`. O BancoFlorescerPP permaneceu com 1 paciente e 0 gestações. O domínio publicado não recebeu essa gravação. RN-CASA-013 e RN-CASA-014 continuam inferidas.

## C093 — middleware sem o Auth antigo

Em 2026-11-02 o serviço `cap-romao_florescerweb` passou a executar `casa-web:c093`, `sha256:105956a7a607baeecb2326fa094a43813cfa9eb2468a86d975eedf1ce002bf34`. A imagem foi construída do commit `972d8c0` com a alteração do middleware e com `NEXT_PUBLIC_CASA_AUTH=1`. Com `CASA_DATABASE_URL`, `skipLegacyAuth` devolve usuário nulo e não chama `supabase.auth.getUser()`. `lib/db/casa.ts` não entra nesse arquivo. O volume `/root/casa-files` está montado em `/casa-files` sem somente leitura. `casa-web:c091` (`sha256:493cb8e34e576d485d5a74153f64a12e86d1f24b64a0edd388903f69e63afae2`) e `florescerweb:c091-rollback` (`sha256:13d80a36ff7b8b50085fd3617de5fcc90c6fd4c32ccce40b80ed81f349e69ffb`) permanecem.

A conversão de gestação já tinha ramo com cliente nulo. A prova isolada, no database `casa_c093` depois apagado, criou uma gestação, vinculou uma já em cuidado e gravou a especialidade. O BancoFlorescerPP permaneceu com 1 paciente. O dump `bancoflorescerpp-20261101T230539Z.dump` tem as seções COPY vazias e não semeia essas linhas; os arquivos de dump não foram apagados.

Depois da prova no domínio, foram parados, sem `docker rm` e sem apagar volume: `cap-romao_florescerapi-porta-api-1`, `supabase-auth`, `supabase-rest`, `supabase-storage` e `realtime-dev.supabase-realtime`. Continuam no ar `supabase-db`, `supabase-studio`, `supabase-meta`, `supabase-imgproxy`, `supabase-envoy` e `casa-florescer-app-1`. `https://api.thvp.cloud/` respondeu 502. A segunda prova no domínio, com esses cinco parados, repetiu login 200, senha errada 401, ficha 200, agenda anônima 401, identificador inexistente 404, financeiro 200, foto 200 com 496021 bytes antes e depois de um arquivo de prova criado e apagado, logout 200 e 1 paciente. O Supabase não está apagado: o banco antigo e o envoy permanecem. Se a prova da imagem nova tivesse falhado, a volta seria `casa-web:c091` com o volume outra vez somente leitura e as três variáveis `CASA` mantidas. A etiqueta `florescerweb:c091-rollback` ainda consulta o Auth antigo; com ele parado, essa volta exige religar os cinco containers antes.

## C092 — corte do Florescer Web

Em 2026-11-02, às 06:02 no horário de Brasília, o serviço `cap-romao_florescerweb` passou a executar `casa-web:c091`, digest `sha256:493cb8e34e576d485d5a74153f64a12e86d1f24b64a0edd388903f69e63afae2`. O volume é `/root/casa-files` em `/casa-files`, somente leitura. O processo lê o BancoFlorescerPP com `casa_login`. `https://sistema.thvp.cloud` respondeu login 200, senha errada 401, sessão 200, logout 200 e sessão seguinte 401. A ficha respondeu 200. A foto respondeu 200 com 496021 bytes. A agenda sem cookie respondeu 401 e, com cookie, 404 para um identificador inexistente, com 0 linhas. `/app/finance` respondeu 200 e as faturas continuaram em 0. A origem `supabase-db` permaneceu com 1 organização, 1 paciente e 1 objeto. O destino permaneceu com as mesmas contagens e 1 credencial. A etiqueta `florescerweb:c091-rollback` permanece `sha256:13d80a36ff7b8b50085fd3617de5fcc90c6fd4c32ccce40b80ed81f349e69ffb`. `api.thvp.cloud` continua no ar. A porta 5432 continua fechada. Os dumps não foram apagados.

## C092 — credencial e prova isolada, sem corte

Em 2026-11-02 a conta já migrada ganhou uma linha em `staff_credentials`. O hash foi gerado por `hash()` do `argon2` dentro da imagem candidata, sem parâmetros extras, e inserido para o administrador ativo que já existia. `casa_password_replace` não cria a primeira linha. Nenhum outro usuário, perfil ou papel foi criado. A contagem ficou em 1, com prefixo `$argon2id$`, e o agregado dos 4 papéis não mudou.

A imagem `casa-web:c091` que tinha ficado sem contêiner foi removida do host antes da prova. Ela foi reconstruída do mesmo commit `972d8c0`, com `NEXT_PUBLIC_CASA_AUTH=1`. O identificador novo é `sha256:493cb8e34e576d485d5a74153f64a12e86d1f24b64a0edd388903f69e63afae2`. O contêiner `c092-web` escutou só em `127.0.0.1:3018`, na rede `easypanel-cap-romao`, com `/root/casa-c091.env` e o volume `/root/casa-files:/casa-files:ro`. Não teve rótulo de proxy. O processo `node` não atravessa o `/root` da imagem, modo 700; por isso `CASA_FILES_ROOT` dentro do contêiner é `/casa-files`. No host, os arquivos continuam em `/root/casa-files`, dono numérico 1000, diretórios 700 e arquivo 600.

A prova, só leitura, devolveu login 200, senha errada 401, sessão 200, logout 200 e sessão seguinte 401. A ficha respondeu 200 com a paciente presente. A foto respondeu 200 com 496021 bytes. A agenda sem cookie respondeu 401; com cookie, um identificador inexistente respondeu 404 e a tabela continuou com 0 linhas. A tela `/app/finance` respondeu 200 e `public.invoices` continuou em 0. Nada disso gravou paciente, agendamento ou fatura. O contêiner foi removido. A origem permaneceu com 1 organização, 1 paciente e 1 objeto. O BancoFlorescerPP permaneceu com as mesmas contagens e 1 credencial. O Florescer Web publicado não recebeu a imagem nem variável `CASA`. `api.thvp.cloud` continua no ar. O corte não foi executado.

## C091 — prontidão, sem corte

O Postgres que o Florescer API usa hoje é o database `postgres` do contêiner `supabase-db`. Em 2026-11-01 ele tinha 1 organização, 1 prática, 1 perfil, 1 paciente, 4 vínculos, 1 administrador ativo, 8 eventos de auditoria e 1 objeto no bucket `patient-photos`. Agendamentos, gestações e faturas estavam em 0. O BancoFlorescerPP estava em 0 nessas tabelas. A cópia levou essas mesmas contagens, mais o arquivo de 496021 bytes para `/root/casa-files`, fora de `public/`. A origem não foi apagada. Naquele momento `staff_credentials` estava em 0 e o login da casa ainda não autenticava essa pessoa. O `Dockerfile` declara `NEXT_PUBLIC_CASA_AUTH` com padrão vazio. A flag só entra na imagem que for construída com o argumento `1`. A imagem candidata daquele momento era `casa-web:c091`, commit `972d8c0`, sem contêiner e fora do proxy. O Florescer Web publicado não recebeu essa imagem nem as variáveis. `api.thvp.cloud` continua no ar. O corte não foi executado. A credencial e a prova isolada estão na C092, abaixo. O desenho publicado continua o desta seção.

## C090 — prova na cópia, sem corte

O argumento `jsonb` entra em `callCasaRpc` serializado uma vez. Uma lista `SETOF`, como `clinical_orientation_versions_list`, volta inteira; `appointment_predictions_append` continua no caso que já existia. Se a previsão não grava, a tela diz que o término foi registrado e a previsão não. A rota `/app/finance` aceita owner, admin ou caixa. `/app/admin/users` aceita o administrador principal, owner ou admin; o layout de `/app/admin` só abre essa exceção nesse caminho. A imagem isolada `casa-hml-web:c090e` rodou em `127.0.0.1:3017` contra `casa_hml` e foi removida, com as imagens anteriores da mesma prova e o volume de arquivos. O Florescer Web não recebeu a flag. O corte não foi executado.

## C089 — auditoria, sem corte

O inventário e a matriz estão em `docs/c089-auditoria.md`. Ter ramo no servidor não é homologação. A prova HTTP da cópia cobre autenticação, criação de usuário, agenda, ficha, visibilidade de fatura e de despesa compartilhada, e o arquivo autorizado. Na C090, a remoção da foto, a conversão de gestação nova e a previsão depois do término clínico passaram a ter ramo sem cliente Supabase. Realtime não é chamado pelo app. O Florescer Web não recebeu a flag. Nenhuma fase do corte foi executada.

## C086 — revalidação da ficha e do “Salvando…”

A imagem `casa-hml-web:c086c` foi construída no clone da VPS, escutou em `127.0.0.1:3017` e falou só com `casa_hml`. O prontuário passou a chamar `GET` e `POST /api/casa/clinical`. Ausência de sessão, cookie inválido, sessão vencida e sessão revogada responderam 401. A secretária recebeu 403. A outra médica recebeu 404. A médica da prática leu e gravou com 200, e o autor foi a sessão. O formulário da agenda, com o pedido de criação segurado, mostrou “Salvando…”, deixou o botão desabilitado e manteve um único envio pendente. Depois da resposta, “Agendamento criado.” apareceu, a paciente ficou na lista e o botão voltou a “Novo atendimento”. O contêiner foi removido. As linhas fictícias saíram: 4 agendamentos e 1 ficha antes; 0 depois. O Florescer Web continuou sem as variáveis da casa. O corte não foi executado. A C089 não começa.

## C086 complementar — rota de agenda na cópia

A imagem `casa-hml-web:c086b`, construída no clone da VPS depois do código de criar agendamento, escutou em `127.0.0.1:3017` e falou só com `casa_hml`. `POST`, `GET`, `PATCH` e `DELETE` de `/api/casa/appointments` rodaram. O `DELETE` cancelou e a linha ficou. A ficha foi criada, lida e alterada pela ação já existente; o autor gravado foi a sessão. A outra médica não viu o agendamento nem a alergia. A secretária agendou e não leu a alergia. A agenda sem cookie respondeu 401. A ação da ficha sem cookie respondeu 500. O contêiner foi removido, as linhas fictícias saíram e o Florescer Web continuou sem `CASA_DATABASE_URL` e sem `NEXT_PUBLIC_CASA_AUTH`. O corte não foi executado. A etapa permanece bloqueada. A C089 não começa.

## C112 — visão geral e casca

A página `/app` e `/app/dashboard`, para quem já é da clínica, deixam a grade de atalhos e passam a `loadHomeCasa`. A leitura conta pacientes e gestações em acompanhamento no escopo da policy. Consultas do dia, da semana, próximos horários e pendências só entram quando a sessão tem profissional vinculado ou, sem o papel physician, quando a prática já está na sessão. Sem esse vínculo, esses blocos ficam vazios e o aviso de perfil profissional permanece. A lista inteira de pacientes não é carregada para rotular o dia. O financeiro do mês só entra para owner, admin ou caixa, como soma dos centavos já gravados.

A casca autenticada continua em `AppShell` e `AppSidebar`. O menu segue `navSectionsFor`. Enquanto a autorização não chega, a casca de esqueleto permanece e o miolo espera. A miniatura da foto é gerada na hora em `GET /api/casa/files` e não grava outro arquivo.

## Histórico

- 2026-11-02 — C112: a visão geral lê um recorte curto e a casca autenticada muda de cor. Sem deploy. A imagem publicada continua `casa-web:c093`.
- 2026-11-02 — C110: `auth`, `rest`, `realtime`, `storage` e `porta-api` ficaram no perfil `legado-off`. O `compose up` padrão não os inclui. RN-CASA-013 e RN-CASA-014 passaram a confirmadas.
- 2026-11-02 — C094: a conversão de gestação rodou no navegador contra a cópia restaurada do backup novo. O banco publicado permaneceu com 1 paciente e 0 gestações. Auth, REST, Storage, Realtime e a porta da API seguem parados, com reinício `no`.
- 2026-11-02 — C093: o middleware deixa de consultar o Auth antigo quando `CASA_DATABASE_URL` existe. A imagem publicada passou a `casa-web:c093`. Auth, REST, Storage, Realtime e a porta da API foram parados; o banco antigo e o envoy permanecem.
- 2026-11-02 — C092: o Florescer Web publicado passou para `casa-web:c091` e o BancoFlorescerPP. `api.thvp.cloud` permaneceu.
- 2026-11-02 — C092: a conta real recebeu a primeira credencial Argon2id. A imagem reconstruída foi provada em `127.0.0.1` e o contêiner saiu. O desenho publicado não mudou. Sem corte.
- 2026-11-01 — C091: cadastro real copiado para o BancoFlorescerPP e arquivo fora de `public/`. A flag passou a ser argumento de build, com padrão vazio. Sem corte.
- 2026-11-01 — C090: jsonb uma vez, lista de orientações completa e portões de `/app/finance` e `/app/admin/users`. A imagem isolada foi removida. Sem corte.
- 2026-10-31 — C090: a previsão do término clínico deixou de exigir o cliente no modo da casa. Sem prova HTTP nova e sem corte.
- 2026-10-31 — C089: inventário e matriz em `docs/c089-auditoria.md`. Código com ramo da casa não foi tratado como homologado. Sem corte.
- 2026-10-31 — C086: a ficha passou a responder pela rota, com 401, 403 e 404 distintos. “Salvando…” pintou na cópia. A imagem `casa-hml-web:c086c` foi removida. Sem corte.
- 2026-10-31 — C086 complementar: a rota de agenda rodou na cópia `casa_hml` e o contêiner `casa-hml-web:c086b` foi removido. A ficha sem sessão respondeu 500. O Florescer Web não recebeu o modo. Sem corte.
- 2026-10-31 — C086: imagem `casa-hml-web:c086` falou com `casa_hml` em `127.0.0.1:3017` e foi removida. O Florescer Web não a recebeu. A etapa segue bloqueada. Sem corte.
- 2026-10-31 — C086: backup restaurado e cópia `casa_hml` criada. Sem processo Next e sem corte. A aplicação publicada não aponta para a cópia.
- 2026-10-31 — C088: a prova SQL foi repetida no BancoFlorescerPP, terminou em `ROLLBACK` e deixou organizações em 0. Sem gravação HTTP e sem corte.
- 2026-10-31 — C088: o agente deste processo continuou sem chave. O SSH não foi aberto. A prova SQL não rodou. Sem gravação HTTP e sem corte.
- 2026-10-31 — C088, nova tentativa: o SSH deste processo foi recusado de novo. A prova SQL não rodou. Sem gravação HTTP e sem corte.
- 2026-10-31 — C088: linha do tempo, vínculo de gestação na tela, vínculo de prática e organizações no ramo do servidor. A conferência por SSH foi recusada. Sem gravação HTTP e sem corte.
- 2026-10-31 — C087.1: queixa, anamnese, exame físico, retorno, feedback, gravação, auxílio de IA, contratos, salas, especialidades, políticas e auditoria no ramo do servidor. Sem migration e sem corte.
- 2026-10-31 — C087: a prova C084 passou no BancoFlorescerPP. Busca de estoque, orientações e documentos do atendimento entram no ramo do servidor. O corte não foi executado.
- 2026-10-31 — C086: pedidos de exame, itens de modelo, busca de audiência e painel de resultados no ramo do servidor. A saída do console da C084 não chegou. Sem corte.
- 2026-10-31 — C086: estoque, locação, relacionamento, portal, gravação, compositor de receitas e catálogo de exames no ramo do servidor. A prova SQL da C084 não chegou. Sem corte.
- 2026-10-31 — C085: gravações do modo da casa, volume privado em `/api/casa/files` e tela `/app/finance` sobre as policies já existentes. Sem variáveis da casa na produção. A prova SQL da C084 continua pendente.
- 2026-10-31 — ramo servidor da C084 para pacientes, agenda, prontuário, gestação, exames, receitas, repasse e relatórios. Produção sem as variáveis da casa. A prova SQL ainda não rodou.
- 2026-10-31 — `0059` e C074 aplicadas no BancoFlorescerPP. `casa_login` provado sem superusuário e sem `BYPASSRLS`. A URL da casa continua desligada.
- 2026-10-31 — complemento da C083: a aba selecionada ainda era o Mac. A `0059` segue sem apply. A senha de `casa_login` segue sem definição.
- 2026-10-31 — schema `0000`–`0058` aplicado no BancoFlorescerPP, com `casa_login` e sessão revogável. A conexão de produção e a API não foram trocadas.
- 2026-10-31 — caminho da casa no Next, com prelúdio e isolamento no repositório. Produção segue no Auth e na API.
- 2026-10-21 — produção definida como Next standalone e Supabase self-hosted atrás do Caddy.
