# Memória

## 2026-11-01 — C090 na cópia

- Um array JavaScript passado a `$1::jsonb` precisa de `JSON.stringify` uma vez. String que já é JSON passa direto. A frase antiga dizia que a previsão seria gravada na próxima carga mesmo quando a escrita tinha falhado.
- `clinical_orientation_versions_list` é `SETOF`. `to_jsonb` devolve uma linha por versão. Ficar só com `rows[0]` fazia a tela tratar a lista como vazia e soltar o rascunho. `appointment_predictions_append` continua no caso de mais de uma linha.
- `/app/finance` não tinha regra de caminho, então o menu aparecia e o servidor mandava todo mundo para `/unauthorized`. A regra é owner, admin ou caixa. A secretária fica de fora.
- O layout de `/app/admin` exigia owner ou admin e escondia a tela de usuários do administrador principal, mesmo com a regra de caminho permitindo `/app/admin/users`. A exceção é só esse caminho.
- A sessão SSH caía depois de cerca de dois minutos em silêncio. `ServerAliveInterval` no cliente e o tmux `c090` seguraram a sessão. O `sshd` não foi alterado.
- `pregnancies_forbid_delete` e `pregnancy_events_forbid_mutation` impedem apagar a gestação de prova. No PostgreSQL 17, o RESTRICT de chave estrangeira vem como `restrict_violation`, não como `foreign_key_violation`. `audit_events.id` é `bigint`, então uma limpeza que só segue tabelas com `id uuid` deixa a trilha segurando `profiles`.
- A cópia `casa_hml` foi esvaziada das linhas fictícias. O contêiner, as imagens `casa-hml-web:c090*` e o volume saíram. A porta 3017 fechou. O BancoFlorescerPP e o backup não foram mexidos.

## 2026-10-31 — C090 modo da casa

- `createClient()` devolve nulo quando a flag é `1`. Tela que faz `if (!supabase) return` impede o ramo já existente. O furo da previsão era `if (bounds && supabase)`: o término gravava e o recálculo não rodava. Agora `listAppointments`, durações, amostras, bloqueios e `appointment_predictions_append` aceitam cliente nulo. A função SQL continua exigindo `auth.uid()`, então o autor é a sessão. `callCasaRpc` devolve a lista só em `appointment_predictions_append` quando a função emite mais de uma linha. As demais funções continuam na primeira linha. O prompt da VPS não estava aberto, então a C090 não repetiu HTTP e não está homologada.

## 2026-10-31 — C089 auditoria

- Ramo `isCasaBrowserAuth()` no código não é homologação. A prova HTTP está limitada ao que `docs/Infraestrutura.md` registrou na cópia. `removePatientPhoto` ainda exige o cliente Supabase. Não há `.channel(` de Realtime no app. O estado vivo do banco não foi relido.

## 2026-10-31 — C086 publicada

- O commit `53b452682c0b04d12cad18e9c55586adcded47fb` subiu para `origin/main` em fast-forward, a partir de `fcad447`. O `tsconfig.tsbuildinfo` local ficou de fora. Não houve deploy.

## 2026-10-31 — C086 revalidada na cópia

- No Next 14, uma ação de servidor que lança “Sem sessão.” vira HTTP 500. O status real sai de um route handler. A ficha do navegador passou a usar `GET` e `POST /api/casa/clinical`.
- “Salvando…” só pinta se o estado ocupado for aplicado com `flushSync` antes do `await`. Um segundo envio é barrado pelo botão desabilitado e por uma ref. O clique forçado do teste, que ignora o desabilitado, não vale como segundo envio do usuário.
- A imagem isolada desta rodada é `casa-hml-web:c086c`. O hash de senha dentro dela usa o pacote `argon2`, não `@node-rs/argon2`. O contêiner foi removido. A limpeza tirou 4 agendamentos e 1 ficha e deixou a prova em 0. O backup continuou com 1343810 bytes e o mesmo SHA-256. A C089 não começa.

## 2026-10-31 — C086 imagem isolada e homologação incompleta

- A imagem é `casa-hml-web:c086`, só na VPS. O build precisou de `python3`, `make` e `g++` no estágio de dependências de `/root/casa-hml-src/Dockerfile.hml`: o pacote `argon2` compila código nativo e a imagem `node:20.19.5-alpine` não traz Python. O `Dockerfile` do Git não ganhou esses pacotes.
- O contêiner escutou em `127.0.0.1:3017`, com 1 GB, na rede do projeto, sem rótulo de proxy, e usou `casa_hml`. Foi parado e removido. A porta 3017 fechou. A 5432 continuou fechada. O Florescer Web seguiu sem `CASA_DATABASE_URL` e sem `NEXT_PUBLIC_CASA_AUTH`.
- O backup permanece em `/root/casa-backups/`, 1343810 bytes. O BancoFlorescerPP não foi alterado nesta etapa. `casa_hml` ficou sem as linhas fictícias. O volume de arquivos foi apagado.
- A C086 permanece bloqueada. Não há ação HTTP no modo da casa para criar ou apagar agendamento, nem para apagar a ficha. A atualização da agenda não rodou porque a criação não existe. A leitura da agenda devolveu lista vazia. A ficha foi criada, lida pela médica da prática e alterada; a outra médica recebeu paciente vazio. O host não tem navegador. A C089 não começa.
- Inserir em `professionals` depois da C074 exige `display_name`, `category` e `is_active`. O insert antigo, só com conselho, falha.

## 2026-10-31 — C086 backup restaurado

- O arquivo está em `/root/casa-backups/` no host, modo 600, diretório 700. Tamanho 1343810. SHA-256 `7a4fc75468e59fb7c6cfa97cdd58072f107ca32f3cd21132ccd339b2f9af8eb6`. PostgreSQL 18.6. Fora do Git.
- `casa_restore_proof` repetiu 0 organizações, 0 profissionais, 103 tabelas e 1580 constraints, e foi apagado. `casa_hml` ficou com 0 organizações, 0 profissionais e 103 tabelas. O BancoFlorescerPP continuou com 0 organizações. A porta 5432 do host seguiu fechada.
- A homologação HTTP não rodou. O host não tem Node. A imagem `casa-florescer-app:local` não traz `NEXT_PUBLIC_CASA_AUTH`. O Florescer Web não tem `CASA_DATABASE_URL` nem essa variável. `main` foi clonado em `/root/casa-hml-src`. A sessão fechou antes do `docker build`. A C086 permanece bloqueada. A C089 não começa.

## 2026-10-31 — C088 sem gravação HTTP

- O SSH desta máquina para `root@2.25.151.136` voltou `Permission denied (publickey,password)` com `BatchMode`. A prova SQL e as contagens desta etapa não rodaram. Não repetir por outro caminho.
- Depois da reconexão, o agente local não tinha chave carregada e uma nova sessão deste processo recebeu a mesma recusa. A prova desta etapa rodou depois, no prompt da VPS, não por este processo.
- `eval "$(ssh-agent -s)"` sobe um agente só naquela janela. Este processo não o vê. `ssh-add -l` aqui devolveu agente vazio. Sem chave nesse agente, o SSH não abre. A frase da chave não entra no chat nem no documento.
- No prompt da VPS, as organizações estavam em 0. A prova `c084_module_isolation.sql` rodou como `postgre`, terminou em `ROLLBACK` e a contagem voltou a 0. Este processo não autenticou no SSH; a confirmação veio desse prompt.
- Não há backup restaurável confirmado. Login, CRUD pela aplicação, upload e um processo Next apontado ao banco gravariam sessão, linha ou arquivo que outra conexão não desfaz. Essas ações ficam fora.
- A linha do tempo, o vínculo de gestação na tela, o vínculo de prática e as organizações passam ao servidor só com a policy já existente. A gravação de organização depende de `organizations_system_admin`. A conversão que cria gestação nova continua no cliente.
- `CASA_DATABASE_URL`, `NEXT_PUBLIC_CASA_AUTH`, `CASA_SESSION_SECRET` e `CASA_FILES_ROOT` estavam ausentes neste processo. Onze testes locais passaram. O build passou sem a URL da casa. A etapa segue bloqueada.

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

## 2026-10-31 — C084 ainda sem prova no console

O código do modo da casa não liga a produção. `npm run build` sem `CASA_DATABASE_URL` continua no caminho Supabase. A prova `supabase/tests/c084_module_isolation.sql` só conta depois de rodar no Bash do BancoFlorescerPP e terminar em `ROLLBACK`, com organizações em 0.

## 2026-10-31 — C086 sem saída do console

A prova `supabase/tests/c084_module_isolation.sql` não voltou do console do BancoFlorescerPP. Sem `ROLLBACK` e sem organizações em 0, o relatório fecha bloqueado. Não repetir SSH desta máquina para obter essa saída. O modo da casa no código não aponta para o banco de produção enquanto `NEXT_PUBLIC_CASA_AUTH` não for `1`.

## 2026-10-31 — C085 não alcançou o banco desta máquina

A tentativa de SSH para `2.25.151.136` não abriu sessão. Não repetir esse acesso para “confirmar” a prova. O comando fica no console do container, com `psql -U postgre -d "BancoFlorescerPP"`. Arquivo clínico do modo da casa não vai para `public/` nem para URL estática: só `CASA_FILES_ROOT`, e essa variável não entra no Florescer Web neste ciclo.

## 2026-10-31 — C086 complementar

A imagem que rodou a rota nova é `casa-hml-web:c086b`, não a `c086`. O identificador da ação de servidor fica no texto imediatamente antes de `()=>`; uma janela para a frente pega a ação errada. O cookie da casa é `Secure` quando `NODE_ENV` é `production`, e o Chromium em HTTP o descarta. Profissional, depois da C074, exige `display_name`, `category` e `is_active`. A limpeza da cópia tirou 3 agendamentos e 1 ficha e deixou a organização da prova em 0. O backup conferido de novo tem 1343810 bytes e SHA-256 `7a4fc75468e59fb7c6cfa97cdd58072f107ca32f3cd21132ccd339b2f9af8eb6`.

## 2026-11-01 — C091, o banco publicado não estava vazio

O Postgres do `supabase-db`, database `postgres`, tinha 1 organização, 1 prática, 1 perfil, 1 paciente, 4 papéis na mesma conta, 1 administrador ativo, 8 auditorias e 1 foto. Agendamentos, gestações e faturas estavam em 0. O BancoFlorescerPP estava em 0 e recebeu essa cópia. A conta não tem `staff_credentials`. `NEXT_PUBLIC_CASA_AUTH` é argumento de build; variável só no processo não liga o modo. O ambiente antigo da cópia aponta para `casa_hml`, não para o BancoFlorescerPP. A imagem publicada do Florescer Web não foi trocada.

## 2026-11-02 — C092, a primeira credencial não nasce das funções de senha

`casa_password_replace` só atualiza uma linha e responde “Credencial inexistente.” quando `staff_credentials` está vazia. `casa_staff_create` insere o hash, mas também cria outro `auth.users`, outro perfil e novos papéis. A primeira linha da conta já migrada é um `insert` direto, feito pelo console, do retorno de `hash()` do pacote `argon2` dentro da imagem candidata, sem parâmetros extras. O verificador aceita qualquer `$argon2id$` e lê memória, tempo e paralelismo de dentro do hash.

A imagem etiquetada e sem contêiner pode sumir do host. A etiqueta `casa-web:c091` sumiu durante a espera da senha e foi reconstruída do commit `972d8c0`. O identificador deixou de ser `sha256:960e1bfdb70ef23cf9e4a51975e438e7ee6a3a387a9816f14ea2916cd7f13109` e passou a `sha256:493cb8e34e576d485d5a74153f64a12e86d1f24b64a0edd388903f69e63afae2`.

`docker run --entrypoint id -u node IMAGEM` não pede o uid numérico: o `-u` é a opção `--user` do Docker. O argumento do `id` tem de vir depois do nome da imagem. O usuário `node` também não atravessa o `/root` da imagem, modo 700. Montar o volume em `/root/casa-files` dentro do contêiner não deixa o processo ler a foto. O caminho que funcionou foi `CASA_FILES_ROOT=/casa-files` com `-v /root/casa-files:/casa-files:ro`, dono 1000 e modos 700/600. O nome da rede não pode ser a concatenação de todas as redes do contêiner; a prova usou `easypanel-cap-romao`.

## 2026-11-02 — C092, parar o contêiner não troca o serviço

O Florescer Web publicado é o serviço Swarm `cap-romao_florescerweb`. `docker stop` faz o Swarm recriar a imagem antiga. A troca que ficou de pé foi `docker service update --no-resolve-image`, porque `casa-web` não existe em registro público e um pull derruba a atualização. `casa_sessions` não tem `revoked_at`: o logout apaga a linha. Uma consulta a essa coluna fez o script devolver a imagem antiga mesmo com o HTTP aprovado; a segunda atualização, sem essa coluna, ficou.

## 2026-11-02 — C093, o middleware antigo derruba o site se a API morre

A imagem `casa-web:c091` chama `getUser()` sem tratamento quando não há cookie da casa e as variáveis públicas do Supabase existem. Com Auth, REST e Storage parados, essa chamada pode responder 500. `skipLegacyAuth` corta esse caminho quando `CASA_DATABASE_URL` existe. A função fica em `lib/supabase/config.ts` porque o middleware não pode importar `lib/db/casa.ts`, que puxa `pg`. O nome da função some no bundle; a prova da imagem é a ocorrência de `CASA_DATABASE_URL` em `/app/.next/server/middleware.js`.

`--mount-rm` e `--mount-add` no mesmo `docker service update` trocaram a imagem e deixaram o volume ausente. Um segundo update, só com `--mount-add`, recolocou `/casa-files` gravável. O volume somente leitura impedia a escrita. A prova no domínio criou e apagou um arquivo ao lado da foto; não fez `POST` da foto do paciente real.

O dump `bancoflorescerpp-20261101T230539Z.dump` tem as seções COPY vazias. `pg_restore` por pipe também não semeia um arquivo customizado, porque esse formato precisa de busca. A cópia que alimentou a prova isolada foi um `pg_dump -Fc` do BancoFlorescerPP vivo, restaurado com `--no-owner` e sem `--no-acl`. `--no-acl` tira os `GRANT` e o papel `authenticated` recebe permissão negada. Esse database temporário foi apagado. O paciente publicado permaneceu em 1.

## 2026-11-02 — C094, o dump de 1º de novembro não é o backup vivo

O dump `bancoflorescerpp-20261101T230539Z.dump` continua com as seções COPY vazias. O backup que restaura o cadastro é o `pg_dump -Fc` de 2026-11-02, feito para um arquivo dentro do contêiner e copiado para fora. `pg_dumpall --globals-only` guarda os papéis, inclusive senha de papel, e não deve ser aplicado no cluster vivo nesta etapa: a conferência é a contagem de `CREATE ROLE`, não o texto. A imagem `mcr.microsoft.com/playwright` não traz o pacote Node `playwright`; o navegador da imagem só resolve o módulo depois de `npm install` com `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. O cookie `casa_session` é `Secure` em produção, então o Chromium em HTTP precisa receber o cookie sem esse atributo para abrir a tela. A conversão não vai para `sistema.thvp.cloud`.

O Compose do Supabase é compartilhado com `db`. Trocar `restart` só em `auth`, `rest`, `realtime` e `storage` não impede um `docker compose up` de subi-los uma vez. O arquivo do EasyPanel da porta da API também declara outros serviços; por isso não foi editado. `restart: "no"` impede a volta sozinha depois de `docker stop`, não um redeploy do painel.

## 2026-11-02 — C110, o perfil segura o compose up

`restart: "no"` não impede `docker compose up` nem um redeploy do painel de criar o serviço uma vez. `profiles: ["legado-off"]` tira o serviço do `up` padrão e não para o que já está no ar. A prova é `docker compose config --services`, com e sem `--profile legado-off`. A saída completa de `docker compose config` interpola o ambiente e não se imprime. No arquivo do EasyPanel, `casa-api` e `easypanel` são redes, não serviços; o único serviço era `porta-api`. `functions` e `supavisor` já estavam no perfil `manual` do override e continuam de fora dos dois `config --services`.

## 2026-11-02 — C111.1, a organização lê a casa e o cadastro ainda não tem os dados

A tela Organização, com a flag `1`, não pode usar `createClient()`: ele devolve nulo e a frase de autenticação. A leitura já existia em `listOrganizationsCasa`. O título só entra no DOM depois que a casca recebe a autorização. Uma leitura no `DOMContentLoaded` vê a página vazia.

O BancoFlorescerPP tem 1 perfil ativo, com os quatro papéis na única prática `house`. Não há profissional, nem sala ativa, nem nome Samara, nem nome Thais, nem `can_schedule_any_practice`. Para cadastrar as duas médicas e uma sala faltam, e não foram inventados: qual perfil é qual pessoa, ou dois perfis distintos; tipo, número e UF do conselho de cada uma; a prática de cada uma; código, nome e tipo da sala; e uma secretária que não seja a mesma conta da médica. Nada disso foi gravado na produção.

Na cópia, `SET LOCAL ROLE` dentro do `DO` ainda valia nas consultas seguintes. A contagem da secretária só fechou em 2 depois de `reset role`. A imagem `playwright` resolve o módulo quando o script está no diretório em que o `npm install` rodou. O cookie `Secure` não vai para o Chromium em HTTP; a prova entrega o mesmo valor sem esse atributo. O contêiner candidato escutou só em `127.0.0.1` e foi removido. A imagem publicada não mudou.

## 2026-11-02 — C111, a agenda nova precisa de profissional e de sala

O BancoFlorescerPP publicado tem 1 papel `physician`, 0 linhas em `professionals` e 0 salas `active`. O formulário da agenda exige profissional e sala. Sem esses cadastros, criar horário ou bloqueio não tem alvo. A função `agenda_block_create` gravou e o cancelamento marcou `cancelled` numa cópia que recebeu profissional e sala fictícios, dentro de uma transação desfeita. O índice `unique (organization_id, cpf)` recusou o segundo CPF igual. O painel de organização e os cartões da plataforma ainda chamam `createClient()`, que devolve nulo com a flag `1`, e mostram autenticação não configurada. A leitura da organização já existe em `listOrganizationsCasa`.

## 2026-11-02 — C112, a visão geral não desenha o que o banco não tem

Antes de mudar o desenho, o caminho da foto publicada já era conhecido: o arquivo real tem 496021 bytes e o `GET` sem variante responde `private, no-store` com `content-disposition: attachment`. A casca autenticada era trocada por `AppLoadingShell` enquanto a autorização não chegava. Não houve cronômetro de navegação num contêiner antes da alteração; esse número não é declarado.

A referência mostra `+8,2%` e outros selos. RN-CASA-014, confirmada, proíbe percentual novo. Por isso nenhum cartão calcula variação. Um zero real pode aparecer como `R$ 0,00`. Série sem ponto fica em estado vazio.

A miniatura é gerada na memória com `sharp`, 96 px, WebP. O teste local `scripts/c112-thumb-check.ts` conferiu que o resultado é menor que a origem e começa com o cabeçalho RIFF. Nenhum arquivo derivado é gravado ao lado da foto. A lista pede `variant=thumb`; o lightbox pede o arquivo inteiro só quando abre.

O Chromium em `127.0.0.1:3013`, com o CSS já compilado, mediu a sidebar em `rgb(87, 54, 110)` e o hero no degradê ameixa, lilás e rosa. Em 1280 px a ilustração ficou à direita do hero, com 191×255 e o arquivo carregado. Em 390 px o menu ficou oculto e a ilustração entrou no fluxo, 168×224. Não houve contêiner candidato nesta etapa: `ssh-add -l` não tinha identidade e o BatchMode recusou a chave. Sem esse contêiner, o tempo de navegação autenticada não foi medido.

## 2026-11-02 — Fonte da casca caía em Times

`font-sans` apontava para `var(--font-sans)` e o layout do grupo `(shell)` não definia essa variável. A declaração inteira era descartada e o navegador usava Times New Roman na agenda, nos exames e no título do painel. Nunito entra como `--font-sans`. O Playfair continua só no título do login.

## 2026-11-02 — Diretriz de agilidade, sem cópia automática

A C113 tinha começado um envio longo para restaurar o dump num database `casa_c113`. A diretriz nova manda usar o BancoFlorescerPP e só criar ambiente isolado quando a operação for destrutiva e a necessidade estiver comprovada. O envio foi interrompido antes de criar esse database. O BancoFlorescerPP não recebeu restauração nem teste destrutivo. Deploy continua dependendo de autorização expressa.

## 2026-11-02 — A gestante opaca não se funde ao fundo

`public/brand/gestante.webp` é RGB 864×1152, sem canal alfa. Os cantos medem cerca de rgb(118, 62, 95) e o centro cerca de rgb(188, 124, 127). O degradê da página ao lado fica perto de rgb(215, 154, 187). Máscara radial esconde o retângulo e desenha a área esfumada que a inspeção rejeitou. O arquivo a substituir é esse, com o mesmo enquadramento, fundo transparente e os anéis luminosos. `public/brand/logo-florescer.png` tem cantos transparentes; a flor visível é ameixa escura, perto de rgb(75, 31, 52). No menu ameixa ela some. O recorte da flor, invertido para branco, é o símbolo com contraste. O texto do PNG não entra no menu.

## 2026-11-02 — Poucas curvas apagam a gestante

O contorno do menu não se acerta enxugando o traço anterior. Com poucos Bézier a cabeça vira um laço, o cabelo cola no tronco e a mão vira zigue-zague. O traço precisa passar pela testa, pelo nariz, pelos lábios e pelo queixo, descer pelo pescoço até o ombro, e o antebraço precisa continuar numa concha sob a barriga. Coração e ondas ficam em caminhos separados.

## 2026-11-02 — A prévia preta da gestante do menu não é fundo

`public/brand/gestante-menu.png` é RGBA 682×1024. Os cantos medem alfa 0. O preto visto na prévia do anexo é a área transparente, não uma chapa opaca. Os traços fortes ficam em rosa, com alfa até 252. O arquivo foi copiado sem filtro.

## Histórico

- 2026-11-02 — A prévia da ilustração aprovada mostra preto onde o PNG é transparente. Os cantos têm alfa 0.
- 2026-11-02 — Poucas curvas transformam a cabeça em laço e a mão em zigue-zague. O contorno precisa passar pelo perfil e terminar a mão em concha.
- 2026-11-02 — Ampliar o recorte da referência manteve o serrilhado, a linha vertical e as ondas duplicadas. O contorno do menu precisa ser SVG desenhado, não o PNG ampliado.
- 2026-11-02 — O recorte por degradê de `gestante.webp` comeu o vestido e deixou halo. A versão transparente, com a mesma pose e os arcos, ainda não existe. O contorno do menu veio da região inferior esquerda da referência; o vestido encosta no corte da captura.
- 2026-11-02 — A gestante grande expunha o retângulo do arquivo opaco. No tamanho de cerca de 280 px, a máscara oval é o enquadramento pedido.
- 2026-11-02 — `gestante.webp` não tem transparência. A máscara recria o recorte esfumado. A flor do PNG é ameixa sobre ameixa; o contraste pede o recorte em branco.
- 2026-11-02 — `--font-sans` sem valor invalida `font-family` e o navegador cai em Times New Roman. A casca precisa definir a variável com uma fonte sem serifa.
- 2026-11-02 — C113: sem database novo. A candidata usa o BancoFlorescerPP. O Mac vê o contêiner por túnel, não pelo localhost da VPS. Samara, Thais e sala não foram gravados.
- 2026-11-02 — Diretriz de agilidade: o envio da cópia `casa_c113` foi interrompido. O banco de trabalho é o BancoFlorescerPP. Sem teste destrutivo e sem deploy.
- 2026-11-02 — C112: a foto inteira segue em 496021 bytes e `private, no-store`. A miniatura é outra resposta, privada, sem arquivo novo. Percentual não entra por causa da RN-CASA-014. Sem cronômetro de navegação anterior. A chave SSH não estava carregada, então o contêiner autenticado não abriu.
- 2026-11-02 — C111.1: a tela Organização usa `listOrganizationsCasa` com a flag `1`. Samara, Thais, conselho, prática de cada uma e sala não estão no banco; nada foi inventado nem gravado. A agenda completa foi provada só na cópia, com `rollback`.
- 2026-11-02 — C111: sem profissional e sem sala, a agenda publicada não tem o que selecionar. O bloqueio e o CPF duplicado foram provados só na cópia, com `rollback`.
- 2026-11-02 — C110: `restart: "no"` não segura o `compose up`; o perfil `legado-off` segura. O config completo não se imprime.
- 2026-11-02 — C094: o backup que restaura dados é o dump de 2026-11-02, não o de 2026-11-01. Globals não entram no cluster vivo. A conversão de navegador fica na cópia. `restart: "no"` não segura um redeploy do painel.
- 2026-11-02 — C093: middleware sem `getUser()` quando o banco da casa existe. Volume gravável exigiu um segundo `mount-add`. O dump de 2026-11-01 do BancoFlorescerPP não semeia dados. A API antiga foi parada; o banco antigo permanece.
- 2026-11-02 — C092: o corte é `service update` sem pull. Logout apaga `casa_sessions`. `api.thvp.cloud` ficou para o retorno.
- 2026-11-02 — C092: `casa_password_replace` não cria a primeira linha. O hash sai do `hash()` da imagem candidata. O volume da foto não pode ficar sob o `/root` da imagem. Sem corte.
- 2026-11-01 — C091: o database publicado tinha cadastro real; a cópia foi para o BancoFlorescerPP. A flag é de build. Sem corte.
- 2026-11-01 — C090: lista `SETOF`, porta do financeiro, layout de usuários, sessão SSH e limpeza da gestação de prova. A cópia foi esvaziada e o contêiner saiu. Sem deploy.
- 2026-10-31 — C090: a previsão do término saiu do cliente no modo da casa. Sem cópia isolada nesta etapa. A C090 não está homologada.
- 2026-10-31 — C089: matriz em `docs/c089-auditoria.md`. Sem corte e sem push desta auditoria no momento em que foi escrita.
- 2026-10-31 — C086 publicada em `main` no hash `53b452682c0b04d12cad18e9c55586adcded47fb`.
- 2026-10-31 — C086: a rota da ficha devolveu 401, 403, 404 e 200 na imagem `c086c`. “Salvando…” pintou. A cópia foi esvaziada e o contêiner saiu.
- 2026-10-31 — C086 complementar: a rota de agenda rodou na imagem `c086b`. O cookie seguro não gruda em HTTP. A ficha sem sessão respondeu 500. A cópia foi esvaziada e o contêiner saiu.
- 2026-10-31 — C086: clone em `/root/casa-hml-src`. A sessão caiu antes do build da imagem isolada. Homologação HTTP não executada.
- 2026-10-31 — C086: o dump de 1343810 bytes restaurou. `casa_hml` substituiu o database temporário. Sem túnel, a homologação HTTP não rodou. A etapa segue bloqueada.
- 2026-10-31 — C086: a sessão da VPS caiu antes do backup. Sem arquivo, sem restauração e sem homologação HTTP. A etapa segue bloqueada.
- 2026-10-31 — C088: a prova SQL foi confirmada no prompt da VPS, com `ROLLBACK` e organizações em 0. Sem gravação HTTP. A etapa segue bloqueada.
- 2026-10-31 — C088: o agente deste processo continuou vazio. O agente novo da janela do terminal não serve. SSH não aberto. Prova e contagens continuam não executadas. A etapa segue bloqueada.
- 2026-10-31 — C088, nova tentativa: SSH deste processo recusado de novo, sem chave no agente. A sessão interativa já aberta não foi usada. Prova e contagens continuam não executadas. A etapa segue bloqueada.
- 2026-10-31 — C088: SSH recusado e sem backup confirmado. Linha do tempo, vínculo de gestação, vínculo de prática e organizações passaram ao servidor. Sem gravação HTTP. A etapa segue bloqueada.
- 2026-10-31 — C087.1 ligou ao servidor o que já tinha função ou policy. A linha do tempo, o vínculo de gestação na tela, a edição de vínculo de prática e as organizações ficaram no cliente. O CRUD no BancoFlorescerPP não rodou. A etapa segue bloqueada.
- 2026-10-31 — a prova C084 passou no BancoFlorescerPP com `ROLLBACK` e organizações em 0. A C087 não liga a aplicação publicada. Contratos, salas, especialidades, políticas e plataforma seguem no cliente.
- 2026-10-31 — a autenticação própria foi conferida só no processo local; sem a saída do console a C086 permanece bloqueada e o SSH não se repete.
- 2026-10-31 — a saída do console da C084 de novo não chegou; o status permanece bloqueado e o SSH desta máquina não se repete.
- 2026-10-31 — a saída do console da C084 não chegou; o status da C086 fica bloqueado e o SSH desta máquina não se repete.
- 2026-10-31 — desta máquina a prova C084 não roda; o volume privado fica fora do Florescer Web até o corte autorizado.
- 2026-10-31 — a C084 fica pendente até o teste SQL rodar no console do BancoFlorescerPP; o build sem a URL da casa permanece no Supabase.
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
