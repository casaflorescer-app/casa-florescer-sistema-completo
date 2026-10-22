# Memória

## 2026-10-21 — Hospedagem self-hosted

- O diretório oficial `supabase/docker` no commit `9b4a47c6dc6a82cec945fc38d59477970cbe8afa` usa Envoy (`api-gw`) com alias de rede `kong`. O Studio não tem porta 54323; ele fica atrás do gateway.
- `docker compose` 2.24+ é obrigatório por causa de `!override` em `deploy/supabase/override.yml`. Sem isso o merge de portas soma em vez de substituir, e a API ou o Postgres podem ficar em `0.0.0.0`.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são gravadas no `npm run build`. Trocar domínio ou chave exige `bash deploy/up.sh` de novo (ele reconstrói a imagem).
- As chaves JWT de demonstração do Supabase (emissor `supabase-demo`, JSON do payload com espaços) não servem com um `JWT_SECRET` novo. `deploy/up.sh` aborta se encontrá-las.
- Depois das migrations o banco não tem organização nem usuário. O login só passa a ter clínica depois de `deploy/bootstrap-admin.sh`.
- O build da imagem avisa que `next@14.2.15` tem atualização de segurança publicada (aviso do npm em dezembro de 2025). A versão do Next não foi trocada nesta preparação.
- Em 2026-10-21, SSH para `deploy@2.25.151.136` e `root@2.25.151.136` recusou a chave deste computador (`Permission denied (publickey,password)`). O banco não foi criado daqui. No servidor, o comando é `bash deploy/up-db.sh`.
- No EasyPanel, `GET /login` dentro do container `cap-romao_florescerweb` respondia 307 com `location: /login`. O Next faz isso quando a página foi gerada estática e o middleware grava cookie. `export const dynamic = "force-dynamic"` no layout raiz evita o ciclo. A imagem do painel só muda depois de um novo deploy a partir do GitHub.
- O build `cWgs9-6n4LyMzxeB3Pwda` já tinha `force-dynamic` e mesmo assim `/login` respondia 307 com `NEXT_REDIRECT;replace;/login;307`, sem `?next=`. O mesmo commit em standalone local respondia 200. O ciclo no VPS não era só página estática.
- A imagem com `x-casa-rev: 3` confirmou o middleware novo no ar e o 307 continuou em `/`, `/login` e `/login/criar`, sem `?next=`. O middleware passou a não rodar nessas rotas.
- A imagem com "entrada 5" tirou o 307 e passou a responder HTTP 500. O payload RSC tem o formulário, mas não inclui `AuthProvider`. `RedirectIfSession` chama `useAuth()` e estoura "precisa do AuthProvider", que o Next mostra como exceção de cliente.
- A imagem com "entrada 6" responde 200 e pinta o formulário, mas o HTML não abre `<html>` nem `<body>`: só fecha `</body></html>`. O navegador mostra o login e o JavaScript apaga a página, deixando a tela branca. Com o layout estático, `useSearchParams()` no formulário troca o HTML pelo texto "Carregando…" e o campo não volta. O destino `next` passa a ser lido de `window.location.search` no envio.
- O mesmo commit, em render dinâmica local, inclui `<!DOCTYPE html><html` e `data-casa="layout-7"`. No ar (build `YQjf0r35XJDU9mc3-eLs3`) o payload RSC não tem esse `<html>`: a raiz é o router e o template só embrulha os providers. Por isso a casca foi para `app/template.tsx`. Conferir o próximo deploy pelo texto "entrada 8" e por `data-casa="layout-8"`.
- A imagem com "entrada 8" liga só `5cfa64860e6dc996.css` (fonte Playfair, 4 KB). O arquivo do Tailwind, com `min-h-screen` e a cor do cartão, nasce do `import` de `globals.css` no layout, e esse layout não entra no HTML de produção. O import precisa estar em `app/template.tsx`: no build, o CSS grande aparece em `templateStyles`.
- `deploy/bootstrap-admin.sh` faz `source` de `deploy/.env`. Um valor com espaço e sem aspas, como `SMTP_SENDER_NAME=Casa Florescer`, vira o erro `Florescer: command not found` na linha citada. O mesmo vale para `STUDIO_DEFAULT_ORGANIZATION` e `STUDIO_DEFAULT_PROJECT`. O valor precisa ficar entre aspas simples.
- Depois do login, `router.replace("/app")` junto com a página interna devolvendo `null` deixava o documento em branco. A entrada autenticada usa `window.location.assign`. O layout de `/app` sempre monta `AppWorkspace`. O middleware não redireciona `/app` para `/login` quando não vê cookie: quem faz isso é o gate do cliente, senão as duas telas entram em ciclo.
- `POST /api/encounters/transcribe` e `POST /api/orientations/transcribe` recebiam o caminho do áudio do browser e baixavam esse objeto com a sessão, sem comparar com o caminho gravado no segmento ou na versão. Quem podia ler outro áudio da prática conseguia transcrever o arquivo de outro atendimento. A rota agora exige igualdade com `audio_storage_path` e só baixa depois que a RPC autoriza.
- `ENABLE_EMAIL_SIGNUP=false` no `deploy/.env` desliga o provedor de e-mail do GoTrue. Quem já tem conta recebe HTTP 422 `email_provider_disabled`, e a tela mostra “Não foi possível entrar”. O cadastro público é `DISABLE_SIGNUP=true`. Para corrigir no ar, grave `ENABLE_EMAIL_SIGNUP=true` e recrie só o container `auth`. Não rode `deploy/up.sh`.
- O domínio `api.thvp.cloud` no EasyPanel aponta para o serviço Compose `porta-api` na porta 80. Na porta 3000 o Traefik mostra “Service is not reachable” e o login vira “Não foi possível conectar”. O Caddy desse serviço escuta só HTTP na porta 80; o aviso de HTTPS automático é esperado. Com a porta certa, `/auth/v1/health` responde 401 e o CORS libera `https://sistema.thvp.cloud`.

## Histórico

- 2026-10-21 — registros da preparação da VPS.
