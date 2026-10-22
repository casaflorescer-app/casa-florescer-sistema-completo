# Autenticação em produção

O app continua com Supabase Auth e cookie de sessão (`middleware.ts`, `lib/supabase/server.ts`). A hospedagem muda onde isso roda, não o contrato da tela de login.

## O que fica desligado

`deploy/supabase/override.yml` força, no serviço `auth`:

- cadastro público desligado
- login por telefone desligado
- usuário anônimo desligado

A tela `app/login/criar/page.tsx` já informa que a clínica libera o acesso. A API também recusa `POST /auth/v1/signup`.

O layout raiz guarda `metadata` e `viewport` e só repassa os filhos. `<html>` e `<body>` ficam em `app/template.tsx`, junto com `AuthProvider`, `AlertProvider`, `PwaRegister` e o `import` de `globals.css`. No ar, o layout raiz não entra no HTML. Sem esse import no template, a produção só recebe o CSS da fonte e a tela de login fica sem o visual. O middleware só cobre rotas com sessão: `/app`, `/medica`, `/secretaria`, `/gestao`, `/paciente` e `/unauthorized`. `/`, `/login` e `/auth` não passam por ele.

`requireAppRouteAccess` e `requireSession` só chamam `redirect("/login")` quando o middleware informa um caminho protegido em `x-casa-pathname`. Sem esse caminho, o guard não redireciona. Assumir `/app` nesse caso fazia o Next responder 307 para `/login` na própria tela de login.

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

- 2026-10-22 — `globals.css` passou a ser importado em `app/template.tsx`. No ar, o CSS do layout não entra na página e o login ficava sem o Tailwind.
- 2026-10-22 — a casca `<html>`/`<body>` foi para `app/template.tsx` (`data-casa="layout-8"`). O layout raiz ficou só com metadata e viewport.
- 2026-10-22 — layout raiz voltou a ser só a casca `html`/`body`. Providers foram para `app/template.tsx`. `force-dynamic` saiu do layout raiz.
- 2026-10-22 — `/login` deixou o 307 e passou a responder 500. `useAuth()` sem provider derrubava a tela no navegador. Sem provider, o hook agora responde como sessão ausente.
- 2026-10-21 — middleware limitado às rotas com sessão. `/login` ficou de fora depois que `x-casa-rev: 3` no ar continuou em 307.
- 2026-10-21 — rotas públicas não passam pelo Auth no middleware; guards não redirecionam caminho público de volta a `/login`.
- 2026-10-21 — signup público desligado, URLs de redirect e bootstrap do primeiro admin e da clínica.
- 2026-10-21 — layout raiz dinâmico para o cookie de sessão não gerar ciclo 307 em `/login`.
