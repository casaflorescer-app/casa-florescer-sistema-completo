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

O processo Next, quando a conexão for ligada, entra como `casa_login`. Esse papel faz login, não é superusuário e não tem `BYPASSRLS`. Ele herda `casa_app`, que chama o hash e as funções de sessão, e herda `authenticated` para o pedido. Cada pedido grava `app.user_id`, faz `SET LOCAL ROLE authenticated` e, ao devolver a conexão, `RESET ROLE`. `0056` e `0057` apertam o isolamento das duas práticas. `0058` guarda a sessão revogável em `public.casa_sessions`. `0059` cria o usuário só pelo administrador principal e a redefinição de senha. Essa migration ainda não foi aplicada. `CASA_DATABASE_URL` continua ausente. Enquanto ela existir, o servidor não usa o cliente Supabase. Com `NEXT_PUBLIC_CASA_AUTH=1`, o browser também não usa. Nenhuma das duas variáveis foi ligada.

## Histórico

- 2026-10-31 — complemento da C083: a aba selecionada ainda era o Mac. A `0059` segue sem apply. A senha de `casa_login` segue sem definição.
- 2026-10-31 — schema `0000`–`0058` aplicado no BancoFlorescerPP, com `casa_login` e sessão revogável. A conexão de produção e a API não foram trocadas.
- 2026-10-31 — caminho da casa no Next, com prelúdio e isolamento no repositório. Produção segue no Auth e na API.
- 2026-10-21 — produção definida como Next standalone e Supabase self-hosted atrás do Caddy.
