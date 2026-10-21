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

## Histórico

- 2026-10-21 — produção definida como Next standalone e Supabase self-hosted atrás do Caddy.
