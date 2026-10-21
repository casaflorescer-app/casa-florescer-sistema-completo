# Autenticação em produção

O app continua com Supabase Auth e cookie de sessão (`middleware.ts`, `lib/supabase/server.ts`). A hospedagem muda onde isso roda, não o contrato da tela de login.

## O que fica desligado

`deploy/supabase/override.yml` força, no serviço `auth`:

- cadastro público desligado
- login por telefone desligado
- usuário anônimo desligado

A tela `app/login/criar/page.tsx` já informa que a clínica libera o acesso. A API também recusa `POST /auth/v1/signup`.

## URLs

`deploy/up.sh` grava, a partir de `APP_HOST` e `API_HOST`:

- `SITE_URL=https://APP_HOST`
- `SUPABASE_PUBLIC_URL=https://API_HOST`
- `API_EXTERNAL_URL=https://API_HOST/auth/v1`
- `ADDITIONAL_REDIRECT_URLS` com a origem do app, `/auth/callback` e `/auth/reset-password`

O pedido de nova senha em `app/login/esqueci-senha/page.tsx` usa `redirectTo` em `/auth/reset-password`. Sem essas URLs o Auth recusa o redirecionamento.

## Chaves

- `ANON_KEY` é pública e vai no build do Next. A proteção dos dados é o RLS.
- `SERVICE_ROLE_KEY` ignora o RLS. Ela não entra na imagem nem no browser. Serve o script de bootstrap, na própria VPS, contra `127.0.0.1:8000`.
- Não use as chaves de demonstração do `.env.example` oficial do Supabase. `deploy/generate-keys.mjs` recusa esse material.

## Primeiro administrador

As migrations não criam clínica nem usuário. `deploy/bootstrap-admin.sh` pede e-mail, nome, CNPJ, razão social e nome fantasia, cria o usuário pela Admin API (isso funciona com o cadastro público desligado) e grava:

- `organizations`
- prática `house`
- `profiles`
- `system_admins`
- papel `owner` nessa prática, para a gestão da clínica abrir em `/app/admin`

A senha é aleatória, aparece uma vez no terminal e não é gravada. Se o Auth criar o usuário e o SQL falhar, apague esse usuário no Studio antes de repetir.

## SMTP

Preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_ADMIN_EMAIL` em `deploy/.env` para o e-mail de redefinição de senha. Sem SMTP o primeiro login ainda funciona. Se a senha tiver espaço ou `#`, grave o valor entre aspas simples.

## Studio

O Studio acompanha o gateway. Não há porta 54323 neste pin. O acesso é `ssh -L 8000:127.0.0.1:8000 usuario@2.25.151.136` e, na sua máquina, `http://127.0.0.1:8000`. O gateway pede o usuário e a senha `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.

## Histórico

- 2026-10-21 — signup público desligado, URLs de redirect e bootstrap do primeiro admin e da clínica.
