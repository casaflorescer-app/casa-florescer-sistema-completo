# Memória

## 2026-10-31 — C083 pelo Bash do container

- O usuário de console do Postgres no container é `postgre`, não `postgres`. Sem `-d "BancoFlorescerPP"`, o `psql` procura um database com o nome do usuário e falha.
- A `0059` entrou. A C074 entrou com profissionais e organizações em 0. `CREATE OR REPLACE` da view `professional_labels` falha porque `category` ocuparia o lugar de `full_name`. O arquivo agora faz `DROP VIEW` antes de criar.
- Colar um script longo no console do EasyPanel corta o meio e pode deixar a transação aberta (`*`) ou abortada (`!`). Nesse prompt, o próximo comando é só `rollback` se houver `!`. Blocos curtos, cada um com ponto e vírgula, gravaram.
- A senha de `casa_login` foi definida e a prova em `127.0.0.1` devolveu `casa_login|false|false`. Não colocar `PGPASSWORD` no texto colado: o console deformou esse nome e o valor apareceu no erro. O arquivo `/tmp/casa-login.secret` fica no container, modo 600, e some se o container for recriado. O valor não vai para o Git nem para o chat.
- `CASA_DATABASE_URL` e `NEXT_PUBLIC_CASA_AUTH` continuam desligados. O teste `c083_login_and_staff.sql` rodou por arquivo no container, devolveu `DO` e `ROLLBACK`, e `organizations` ficou em 0. O arquivo do teste pode ser apagado. A senha continua só em `/tmp/casa-login.secret`.

## 2026-10-31 — C083 o Terminal local recebeu o comando

- O schema `0000`–`0058` continua no BancoFlorescerPP. A `0059` não foi aplicada. A senha de `casa_login` não foi criada e não foi impressa.
- Em 2026-10-31, de novo, a aba selecionada do Terminal era o zsh do Mac (`Gabrieles-MacBook-Air`), não `root@srv2083061`. Nenhum comando foi enviado nessa conferência.
- `do script` na aba selecionada do Terminal executou no zsh do Mac (`Gabrieles-MacBook-Air`), não em `root@srv2083061`. Sem a aba da VPS na frente, o apply não segue.
- Com `CASA_DATABASE_URL`, o servidor não usa o cliente Supabase. Com `NEXT_PUBLIC_CASA_AUTH=1`, o browser também não. As duas continuam desligadas. Agenda, prontuário e financeiro ainda estão no cliente antigo enquanto o modo está desligado.
- A redefinição responde a mesma frase e não grava token sem e-mail. Só `SYSTEM_ADMIN` cria usuário. O primeiro administrador não nasce pela função.

## 2026-10-31 — C082 schema aplicado

- O BancoFlorescerPP recebeu papéis, `0000`–`0058` e o `GRANT`, direto, sem backup e sem database temporário. A `0020` precisa retornar quando a organização fixa da casa não existe; na primeira passagem ela levantava `ORGANIZATION_NOT_FOUND` depois que o DDL anterior da mesma migration já tinha ficado. A retomada começa no prefixo `0020`, sem repetir `0000`–`0019`.
- Escrever no dispositivo do terminal pinta o texto e não vira comando. O comando entra com `osascript` em `do script` na aba já logada. A senha do SSH não vai para o chat nem para o comando.
- A receita do teste só passa se `app.user_id` for a médica da prática antes do `INSERT`. A retaguarda nomeada não lê a gestação só por estar na coluna: a policy da `0012` exige linha ativa em `pregnancy_backup_grants`.
- Depois dos testes desfeitos: extensões instaladas, schemas `auth`, `storage` e `extensions`, `casa_login` com login e sem superusuário nem `BYPASSRLS`, 102 tabelas, 0 organizações. A API de produção não foi trocada.

## 2026-10-31 — C081 catálogo fechado

- No SSH do host `srv2083061`, o administrador leu o BancoFlorescerPP no container `cap-romao_bancoflorescer.1.ztmjkauvhnvygcuyck02n14sy`. `citext` 1.8, `btree_gist` 1.8 e `pgcrypto` 1.4 estão disponíveis e não instaladas. Só existem os schemas de sistema e `public`, com 0 tabelas. `auth`, `storage` e `extensions` não existem.
- `deploy/backup.sh` não serve para esse database. A ordem então prevista era papéis fora de transação, `0000`, `0001`–`0057`, `GRANT` explícito sem reabrir `staff_credentials`, e o teste da C077 em transação desfeita. Antes disso, dump custom, checksum, `pg_restore -l` e ensaio num database descartável. Nada disso rodou neste momento. A C082, no mesmo dia, aplicou o schema sem esse backup e sem o ensaio.

## 2026-10-31 — C080 SSH recusado

- `ssh -o BatchMode=yes` para `deploy@2.25.151.136` e para `root@2.25.151.136` devolveu `Permission denied (publickey,password)`. Não há `~/.ssh/config`. Nenhuma senha foi enviada e o console do EasyPanel não foi usado. O `docker exec` não chegou ao BancoFlorescerPP. Schemas e extensões seguem sem lista.

## 2026-10-31 — C079 comando que não entrou

- `psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -v ON_ERROR_STOP=1 -tA -c 'select current_database()'` foi escrito no textarea do console e não apareceu no prompt, nem depois de alguns segundos nem depois de um clique na tela. Enter não foi enviado, para não repetir a linha colada da C078. Schemas, extensões, `organizations` e a contagem de tabelas continuam sem esta leitura.
- `casa_login` e a lista de sessões revogáveis foram só descritos. Nenhum papel foi criado e o cookie não mudou.

## 2026-10-31 — C078 console e versão

- O `psql` no console do `bancoflorescer` abriu em `BancoFlorescerPP` e o prompt `#` é superusuário. `select current_database()` devolveu esse nome. `select version()` devolveu PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) e o pager (`less`) escondeu o restante até `q`.
- O comando seguinte entra no textarea do xterm e só aparece no prompt com atraso, ou não aparece. Enter com o texto só no textarea limpa o campo e não executa. Dois comandos colados na mesma linha geraram `select ... 1echo`, um erro de sintaxe, sem gravação. A lista de schemas e de extensões não voltou. Isso não prova que `citext`, `btree_gist` ou `pgcrypto` faltem.
- `AGENTS.md` ainda diz PostgreSQL 17. O database lido é 18.6. A sequência `0000`–`0057` não foi aplicada.

## 2026-10-31 — C077 ficha e catálogo

- A ficha `patient_clinical_data` nascia uma linha por paciente, sem `practice_id`. Com a paciente nas duas práticas, as duas médicas liam a mesma alergia e a mesma DUM. A `0057` torna a linha única por paciente e prática. A `0056` não foi editada.
- O índice `pregnancies_one_in_care_per_patient` impedia duas gestações em acompanhamento da mesma paciente na casa. Passa a valer por prática.
- No console do `bancoflorescer`, `echo c077-catalog-ready` apareceu no shell. O `SELECT` de `auth`, `storage`, `extensions` e de `citext`, `btree_gist` e `pgcrypto` não voltou. Não há prova de que a imagem tenha ou não tenha essas extensões. O apply continua começando por esse `SELECT`. Sem `citext` ou `btree_gist`, a `0001` para.

## 2026-10-31 — C076 BancoFlorescerPP

- O nome `BancoFlorescerPP` é um database dentro do serviço EasyPanel `bancoflorescer`, ao lado do database `postgres`. A leitura só de `organizations` e de nomes com `practice` ou `organ` voltou vazia. A API que responde em `api.thvp.cloud` não é esse banco. Os schemas `auth`, `storage` e `extensions` não foram listados por nome: o console recusou o `SELECT` nesta sessão. Antes de aplicar, repetir essa lista.
- `CREATE ROLE` não roda dentro de transação nem de `DO`. Por isso os papéis estão em `scripts/c076-roles.sql` (`\gexec`) e `0000` só segue se eles já existirem. `deploy/apply-migrations.sh` não aponta para este banco.
- Superusuário ignora RLS. `withCasaUser` recusa `rolsuper` e `rolbypassrls`, grava `app.user_id` e faz `SET LOCAL ROLE authenticated`.
- `NEXT_PUBLIC_CASA_AUTH` entra no build. Sem ela, o login de produção continua no Auth. Ligar a variável sem o schema aplicado quebra a entrada.

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
- `app/template.tsx` entra no HTML de produção, mas o Next desmonta e monta esse arquivo de novo em toda navegação interna. Recriar `<html>` e `<body>` apaga a página: o primeiro HTML tem texto e, depois do JavaScript, a tela fica branca. A casca persistente é o layout de grupo `app/(shell)/layout.tsx` (`data-casa="layout-9"`). O layout raiz continua de fora do HTML no ar. Conferir o próximo deploy por `layout-9`, não por `layout-8`.

## Histórico

- 2026-10-31 — no Bash do container, `postgre` aplica no BancoFlorescerPP; a view de profissionais exige `DROP` antes de recriar; não colar `PGPASSWORD` no console.
- 2026-10-31 — a conferência do complemento viu de novo o prompt do Mac; nenhum comando foi enviado a essa aba.
- 2026-10-31 — o schema do BancoFlorescerPP foi aplicado sem backup e sem database temporário; a `0020` vazia de clínica precisa retornar, e a retaguarda só lê a gestação com grant.
- 2026-10-31 — o catálogo do BancoFlorescerPP fechou por SSH do administrador; a implantação não rodou.
- 2026-10-31 — a chave deste computador continua sem autorização na VPS; as consultas do BancoFlorescerPP não saíram daqui.
- 2026-10-31 — o `psql -c` não interativo também ficou no textarea; `casa_login` não foi criado.
- 2026-10-31 — BancoFlorescerPP é PostgreSQL 18.6; o catálogo de schemas e extensões continua sem resposta porque o console não entrega o comando ao `psql`.
- 2026-10-31 — o catálogo de extensões do BancoFlorescerPP não voltou; a ficha clínica única por paciente vaza entre as duas práticas até a `0057`, que ainda não foi aplicada.
- 2026-10-31 — BancoFlorescerPP não tem o schema da clínica; a casa no Next fica no repositório até autorização de apply e de conexão.
- 2026-10-22 — a casca do documento saiu do template, que remontava a página, e foi para o grupo `(shell)`.
- 2026-10-21 — registros da preparação da VPS.
