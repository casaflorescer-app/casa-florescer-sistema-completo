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

A prova SQL da C084 rodou no BancoFlorescerPP em 2026-10-31. A transação terminou em `ROLLBACK` e a contagem de organizações ficou 0. A aplicação publicada continua na API antiga. O corte não foi executado.

Dependências do Supabase:

- Já migrado, com a variável exatamente `1`: login da casa, agenda, prontuário, gestação, exames, receitas, repasse, relatórios, usuários, estoque, locação, relacionamento, portal, gravação, arquivos privados, financeiro, busca de item de estoque, orientações, documentos do atendimento, queixa, anamnese, exame físico, retorno clínico, feedback, auxílio de IA, contratos, salas, especialidades, políticas e auditoria.
- Parcial: a linha do tempo do atendimento e o vínculo de gestação na mesma tela ainda leem pelo cliente publicado. A edição de vínculo de prática e a tela de organizações da plataforma também.
- Pendente: nenhuma função nova foi criada. O que não tinha função ou policy continua no cliente publicado.
- Legado: não há chamada de Realtime. O SDK permanece porque a produção ainda depende dele.

## Histórico

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
