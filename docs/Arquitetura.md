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
- Parcial: a conversão que cria uma gestação nova a partir do atendimento continua no cliente publicado.
- Pendente: nenhuma função nova foi criada. O que não tinha função ou policy continua no cliente publicado.
- Legado: não há chamada de Realtime. O SDK permanece porque a produção ainda depende dele.

## C089 — auditoria, sem corte

O inventário e a matriz estão em `docs/c089-auditoria.md`. Ter ramo no servidor não é homologação. A prova HTTP da cópia cobre autenticação, criação de usuário, agenda, ficha, visibilidade de fatura e de despesa compartilhada, e o arquivo autorizado. Na C090, a remoção da foto e a conversão de gestação nova passaram a ter ramo sem cliente Supabase. Realtime não é chamado pelo app. O Florescer Web não recebeu a flag. Nenhuma fase do corte foi executada.

## C086 — revalidação da ficha e do “Salvando…”

A imagem `casa-hml-web:c086c` foi construída no clone da VPS, escutou em `127.0.0.1:3017` e falou só com `casa_hml`. O prontuário passou a chamar `GET` e `POST /api/casa/clinical`. Ausência de sessão, cookie inválido, sessão vencida e sessão revogada responderam 401. A secretária recebeu 403. A outra médica recebeu 404. A médica da prática leu e gravou com 200, e o autor foi a sessão. O formulário da agenda, com o pedido de criação segurado, mostrou “Salvando…”, deixou o botão desabilitado e manteve um único envio pendente. Depois da resposta, “Agendamento criado.” apareceu, a paciente ficou na lista e o botão voltou a “Novo atendimento”. O contêiner foi removido. As linhas fictícias saíram: 4 agendamentos e 1 ficha antes; 0 depois. O Florescer Web continuou sem as variáveis da casa. O corte não foi executado. A C089 não começa.

## C086 complementar — rota de agenda na cópia

A imagem `casa-hml-web:c086b`, construída no clone da VPS depois do código de criar agendamento, escutou em `127.0.0.1:3017` e falou só com `casa_hml`. `POST`, `GET`, `PATCH` e `DELETE` de `/api/casa/appointments` rodaram. O `DELETE` cancelou e a linha ficou. A ficha foi criada, lida e alterada pela ação já existente; o autor gravado foi a sessão. A outra médica não viu o agendamento nem a alergia. A secretária agendou e não leu a alergia. A agenda sem cookie respondeu 401. A ação da ficha sem cookie respondeu 500. O contêiner foi removido, as linhas fictícias saíram e o Florescer Web continuou sem `CASA_DATABASE_URL` e sem `NEXT_PUBLIC_CASA_AUTH`. O corte não foi executado. A etapa permanece bloqueada. A C089 não começa.

## Histórico

- 2026-10-31 — C090: foto e conversão de gestação deixaram de exigir o cliente no modo da casa. Sem prova HTTP nova e sem corte.
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
