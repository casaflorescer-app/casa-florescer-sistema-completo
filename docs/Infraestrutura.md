# Infraestrutura

Guia para publicar o Casa Florescer na VPS `2.25.151.136`. O app e o Supabase (Postgres, login e arquivos) sobem nessa máquina. Você executa os comandos. Segredos ficam só em `deploy/.env`, que não entra no Git.

Antes de começar, tenha dois nomes no seu domínio, os dois com registro A para `2.25.151.136`:

- `APP_HOST` — o site, por exemplo `sistema.seudominio.com.br`
- `API_HOST` — a API, por exemplo `api.seudominio.com.br`

Troque os exemplos pelo domínio real em todo comando que usar esses nomes.

## 1. Conferir a máquina

Entre por SSH como root só nesta primeira vez.

```bash
. /etc/os-release && echo "$PRETTY_NAME"
free -h
df -h /
```

O guia assume Ubuntu. Com menos de 4 GB de RAM, pare e aumente a VPS. 8 GB é o tamanho confortável. Com 4 GB, crie 2 GB de swap:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Usuário, SSH e firewall

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

Abra outro terminal e confirme que `deploy` entra com a chave: `ssh deploy@2.25.151.136`. Só então feche a senha e o root.

Em `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

```bash
systemctl reload ssh
apt update
apt install -y ufw fail2ban
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

Não libere 5432, 6543, 8000 nem 8443.

## 3. Docker

Instale o Docker Engine pelo repositório oficial da Docker para Ubuntu (não use uma imagem `latest` solta e não use o pacote `docker.io` antigo se ele vier com Compose anterior a 2.24).

Depois:

```bash
usermod -aG docker deploy
docker compose version
```

A linha do Compose precisa ser 2.24 ou mais nova. Saia e entre de novo para o grupo `docker` valer. Daqui em diante, use o usuário `deploy`.

Limite de log do daemon em `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

```bash
sudo systemctl restart docker
```

## 4. DNS

No painel do domínio, crie os dois A para `2.25.151.136`. Espere responderem assim antes de subir o Caddy. Se o certificado for pedido cedo demais, o Let's Encrypt aplica limite de tentativas.

```bash
getent hosts sistema.seudominio.com.br
getent hosts api.seudominio.com.br
```

Os dois têm de mostrar `2.25.151.136`.

## 5. Código e segredos

```bash
sudo apt install -y git
git clone ENDERECO_DO_REPOSITORIO casa-florescer
cd casa-florescer
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Edite `deploy/.env` e preencha só isto, sem `https://`:

```text
APP_HOST=sistema.thvp.cloud
API_HOST=api.thvp.cloud
ACME_EMAIL=voce@thvp.cloud
```

Gere o resto. O comando grava o arquivo e não imprime a chave `service_role`.

```bash
node deploy/generate-keys.mjs
```

Se `node` não existir:

```bash
docker run --rm -v "$PWD:/work" -w /work -u "$(id -u):$(id -g)" node:20.19.5-alpine node deploy/generate-keys.mjs
```

Para ver só os nomes das variáveis, sem valores:

```bash
grep -o '^[A-Za-z_][A-Za-z0-9_]*=' deploy/.env
```

## 6. SMTP

Ainda em `deploy/.env`, preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` e `SMTP_SENDER_NAME`. É o que envia a redefinição de senha. Sem isso o primeiro login funciona e o e-mail não sai.

Senha com espaço ou `#` fica entre aspas simples: `SMTP_PASS='a senha'`.

## 6.1. Só o banco

O e-mail do passo 6 não entra nesta etapa. O script sobe apenas o Postgres, aplica as migrations e recusa seguir se a porta 5432 aparecer na internet. A clínica e o primeiro usuário continuam para o `deploy/bootstrap-admin.sh`.

```bash
bash deploy/up-db.sh
```

A saída esperada termina com `Organizações: 0`.

## 7. Subir

```bash
bash deploy/up.sh
```

Esse comando baixa o Supabase no commit de `deploy/SUPABASE_PIN`, recusa chave de demonstração, sobe Postgres, Auth, API, Storage e Studio interno, aplica `supabase/migrations/`, constrói a imagem do Next e publica o Caddy.

Na primeira vez, com o stack no ar:

```bash
bash deploy/bootstrap-admin.sh
```

O script pede e-mail, nome, CNPJ (14 dígitos), razão social e nome fantasia. A senha aparece uma vez. Anote e troque no primeiro acesso.

## 8. Conferir

```bash
curl -fsS "https://api.seudominio.com.br/auth/v1/health"
curl -fsS -o /dev/null -w "%{http_code}\n" "https://sistema.seudominio.com.br/login"
curl -s -o /dev/null -w "%{http_code}\n" "https://api.seudominio.com.br/"
```

O health da API responde. O login responde 200. A raiz da API responde 404 (o Studio não está nesse nome).

Abra `https://sistema.seudominio.com.br/login` no navegador e entre com o administrador. O cadeado tem de ser o do seu domínio.

Cadastro público, com a chave anon que está em `ANON_KEY` (não cole a `service_role`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://api.seudominio.com.br/auth/v1/signup" \
  -H "apikey: COLE_A_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"email":"nao-criar@example.com","password":"uma-senha-longa-de-teste"}'
```

A resposta não pode ser 200.

Na VPS:

```bash
ss -lnt | grep -E ':5432|:6543|:8000|:8443' || true
```

`8000` só pode aparecer em `127.0.0.1`. `5432` não deve aparecer. De outra rede, `nc -vz 2.25.151.136 5432` e `nc -vz 2.25.151.136 8000` têm de falhar.

Studio, no seu computador:

```bash
ssh -L 8000:127.0.0.1:8000 deploy@2.25.151.136
```

Abra `http://127.0.0.1:8000` e use `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.

## 9. Backup

```bash
bash deploy/backup.sh
```

Isso gera `deploy/backups/postgres-*.sql.gz` e `storage-*.tar.gz`, com retenção local de 14 dias. São dados clínicos. Copie o diretório para fora da VPS (outro disco seu) no mesmo dia. Um cron do usuário `deploy`:

```cron
15 3 * * * /home/deploy/casa-florescer/deploy/backup.sh
```

Upgrade do Supabase é manual: troque o commit em `deploy/SUPABASE_PIN` de propósito, apague `deploy/supabase-docker` e rode `bash deploy/up.sh` de novo. Não acompanhe a branch `master` sozinha. O volume `deploy/supabase-docker/docker/volumes/db/data` é o banco; não apague esse diretório num upgrade sem backup.

## O que fica de fora da internet

- Postgres e o pooler
- Studio e o gateway, salvo o `127.0.0.1:8000` usado pelo túnel
- a chave `service_role`
- `deploy/.env`

O Next sobe com o usuário `node`. Várias imagens oficiais do Supabase ainda rodam como root dentro do container; a contenção é a rede, não o usuário delas.

O `npm run build` avisa que `next@14.2.15` tem uma atualização de segurança publicada. A imagem usa a versão que já está no `package.json`. Trocar o Next fica para uma tarefa própria, com teste do app.

## C076 — BancoFlorescerPP

O banco de destino é o nome `BancoFlorescerPP` no serviço EasyPanel `bancoflorescer`. Em 2026-10-31, `select current_database()` devolveu esse nome e `select version()` devolveu PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2). A API `api.thvp.cloud` não usa esse banco: na mesma data, `/auth/v1/health` e `/rest/v1/` responderam 401 e `/storage/v1/version` respondeu `1.81.0`, atrás de Caddy e Envoy. O catálogo lido antes da C082 dizia que `citext` 1.8, `btree_gist` 1.8 e `pgcrypto` 1.4 estavam disponíveis e não instaladas, que `auth`, `storage` e `extensions` não existiam e que `public` tinha 0 tabelas. A C082 instalou as três e criou esses schemas. `deploy/backup.sh` permanece o script do Postgres `supabase-db` / database `postgres`. Não usar esse script nem `deploy/apply-migrations.sh` no BancoFlorescerPP.

Ainda não há usuário, troca de `CASA_DATABASE_URL` nem deploy. O schema `0000`–`0058`, os papéis e os testes desfeitos estão na seção C082. `deploy/apply-migrations.sh` não serve para esse banco: ele entra no container `supabase-db` e abre transação, e `CREATE ROLE` não aceita transação. Os papéis estão em `scripts/c076-roles.sql` e `scripts/c082-login-role.sql`.

Variáveis do processo, quando a ligação for autorizada: `CASA_DATABASE_URL` (papel `casa_login`, sem superusuário e sem `BYPASSRLS`), `CASA_SESSION_SECRET` (32 caracteres ou mais), `CASA_FILES_ROOT` e, no build, `NEXT_PUBLIC_CASA_AUTH=1`. Nenhuma delas foi gravada no ambiente de produção.

## C081 — ordem escrita e depois dispensada

Esta ordem foi escrita e não foi a que rodou. O operador dispensou o backup e o database temporário. O que foi aplicado está na C082.

`deploy/backup.sh` permanece o script do Postgres `supabase-db` / database `postgres`. Não usar esse script nem `deploy/apply-migrations.sh` no BancoFlorescerPP.

O container lido em 2026-10-31 foi `cap-romao_bancoflorescer.1.ztmjkauvhnvygcuyck02n14sy`. Se o EasyPanel recriar o serviço, o nome muda. Achar de novo o único container cujo nome contém `bancoflorescer` e não contém `florescerweb` nem `florescerapi`.

A ordem que ficou só no papel era: conferir as extensões disponíveis, dump custom com checksum, ensaio num database descartável, papéis, `0000`–`0057`, `GRANT` e o teste da C077. Não há script inverso das migrations. A API em `api.thvp.cloud` não entra num rollback desta etapa, porque a conexão dela não foi trocada. A VPS avisou restart pendente; esta etapa não reinicia o servidor.

## C082 — schema no BancoFlorescerPP vazio de clínica

Em 2026-10-31, no SSH do host `srv2083061`, sem backup e sem database temporário. A condição de parada era `public.organizations` com alguma linha. A contagem era 0 antes e continuou 0.

O que rodou, nesta ordem:

1. `scripts/c076-roles.sql` e `scripts/c082-login-role.sql`, fora de transação.
2. Migrations `0000`–`0058`, um arquivo por vez, `ON_ERROR_STOP=1`. A `0020` parou na primeira passagem porque a organização fixa da casa não existe. O bloco passou a retornar sem erro nesse caso. A retomada começou em `0020`, sem repetir `0000`–`0019`.
3. `scripts/c082-grants.sql`. `authenticated` recebe uso das tabelas de `public`, com `REVOKE` em `staff_credentials` e `casa_sessions`.
4. `supabase/tests/c077_practice_isolation.sql` e `supabase/tests/c082_sessions_and_gaps.sql`, cada um em transação desfeita.

A receita do teste só entra com `app.user_id` da médica daquela prática. A retaguarda nomeada só lê a gestação depois da linha em `pregnancy_backup_grants`. As duas correções ficaram nos testes. Nenhuma linha de prova permaneceu.

Leitura depois dos testes: `citext` 1.8, `btree_gist` 1.8 e `pgcrypto` 1.4 instaladas. Schemas `auth`, `storage` e `extensions` presentes. `casa_login` faz login, `rolsuper` falso e `rolbypassrls` falso. `public` tem 102 tabelas. `organizations` tem 0 linhas. A saída final foi `C082_OK tabelas=102 orgs=0`.

Não houve `CASA_DATABASE_URL`, deploy, organização real, usuário real nem reinício da VPS. `florescerweb`, `florescerapi` e os serviços vizinhos não foram alterados.

## C083 — 0059 e C074 no BancoFlorescerPP

A `0059` cria a redefinição de senha e a função que só o administrador principal usa para criar usuário. O script `scripts/c083-bootstrap.sql` recusa a execução e não tem senha nem pessoa real.

Em 2026-10-31 o Bash do container do serviço `bancoflorescer` aplicou a `0059` e a C074 no `BancoFlorescerPP`, com o usuário de console `postgre`. A função `casa_staff_create(text,text,text,uuid,jsonb)` existe. A coluna `professionals.display_name` e a função `professional_upsert(jsonb)` existem. Organizações e profissionais continuam em 0. A view `professional_labels` precisou ser apagada e criada de novo: o `CREATE OR REPLACE` recusou trocar a coluna `full_name` por `category`. O arquivo da migration ficou com esse `DROP VIEW`.

A senha de `casa_login` foi definida. A prova em `127.0.0.1` devolveu `casa_login|false|false`. O valor não está no Git. Um valor gerado antes apareceu no console, porque o comando de teste foi deformado, e foi substituído. `CASA_DATABASE_URL` e `NEXT_PUBLIC_CASA_AUTH` não foram gravados. Não houve deploy. O teste `supabase/tests/c083_login_and_staff.sql` rodou e terminou em `ROLLBACK`. A contagem de organizações depois dele foi 0.

A C084 não gravou `CASA_DATABASE_URL` nem `NEXT_PUBLIC_CASA_AUTH`, não publicou a porta 5432 e não fez deploy. O arquivo `supabase/tests/c084_module_isolation.sql` espera execução no console do BancoFlorescerPP, com `BEGIN` e `ROLLBACK`. Essa execução ainda não aconteceu.

## C085 — prova ainda no console, variáveis fora do Florescer Web

Nesta máquina a sessão SSH para `2.25.151.136` não abriu. A prova continua pendente. O comando, no console do container do serviço `bancoflorescer`, depois de copiar o arquivo para dentro, é:

```bash
psql -U postgre -d "BancoFlorescerPP" -X -v ON_ERROR_STOP=1 -c "select current_database();"
psql -U postgre -d "BancoFlorescerPP" -X -v ON_ERROR_STOP=1 -f /caminho/c084_module_isolation.sql
psql -U postgre -d "BancoFlorescerPP" -X -c "select count(*) from public.organizations;"
```

O primeiro resultado precisa ser `BancoFlorescerPP`. O arquivo abre `BEGIN` e termina em `ROLLBACK`. A contagem seguinte precisa ser 0.

`CASA_DATABASE_URL`, `CASA_SESSION_SECRET`, `CASA_FILES_ROOT` e `NEXT_PUBLIC_CASA_AUTH` continuam ausentes no Florescer Web. A porta 5432 não foi publicada. Não houve deploy. A ordem futura, ainda bloqueada, é: prova com organizações em 0, testes de arquivo já aprovados neste repositório, imagem nova só com autorização, e só então as variáveis no processo. `CASA_DATABASE_URL` usa `casa_login`. `CASA_FILES_ROOT` fica fora da pasta pública. `NEXT_PUBLIC_CASA_AUTH=1` entra no build seguinte. A API antiga permanece até esse corte.

## C086 — a prova passou

A prova da C084 rodou no BancoFlorescerPP em 2026-10-31. O banco confirmado foi `BancoFlorescerPP`. A transação terminou em `ROLLBACK`. A contagem de organizações ficou 0. Nenhum cadastro de teste permaneceu.

`CASA_DATABASE_URL`, `CASA_SESSION_SECRET`, `CASA_FILES_ROOT` e `NEXT_PUBLIC_CASA_AUTH` continuam ausentes no Florescer Web. A porta 5432 continua fechada. Não houve deploy. A API `api.thvp.cloud` permanece.

## C087 — corte escrito, sem executar

A ordem continua bloqueada até autorização expressa:

1. Backup restaurável do BancoFlorescerPP e uma restauração de prova, fora do banco de uso.
2. Conferência de que as migrations `0000`–`0059` e a C074 já estão aplicadas. Não reaplicar.
3. Inventário dos arquivos do Storage, cópia para `CASA_FILES_ROOT` fora de `public/`, conferência do caminho gravado e reversão possível. A origem não é apagada nesta etapa.
4. Variáveis só no processo: conexão com `casa_login`, sem superusuário e sem `BYPASSRLS`; segredo de sessão; volume privado. Nenhuma delas entra no texto nem no Florescer Web agora.
5. Build seguinte com `NEXT_PUBLIC_CASA_AUTH=1`.
6. Postgres sem porta pública.
7. Depois da autorização, acompanhar o login e um fluxo de cada módulo. Se falhar, voltar a imagem anterior e manter a API antiga.
8. A API antiga só sai depois dessa autorização.

O procedimento de arquivos não foi executado. O bucket de origem permanece.

## C087.1 — homologação escrita, sem executar

O ambiente de homologação ainda não existe. Quando for autorizado, ele fica separado da aplicação publicada:

1. Processo próprio, sem alterar o Florescer Web.
2. Conexão com `casa_login`, sem superusuário e sem `BYPASSRLS`.
3. `CASA_DATABASE_URL`, `CASA_SESSION_SECRET` e `CASA_FILES_ROOT` só nesse processo. O volume fica fora de `public/`.
4. Postgres sem porta pública.
5. Dados sintéticos, com reversão ao fim. Nenhum dado clínico real.
6. `NEXT_PUBLIC_CASA_AUTH=1` só no build dessa homologação, nunca no site publicado nesta etapa.

Nada disso foi criado nem usado.

## C088 — conferência recusada, sem gravação HTTP

Em 2026-10-31 a sessão SSH para o BancoFlorescerPP foi recusada (`Permission denied (publickey,password)`). A conferência de `casa_login`, a contagem de organizações e a repetição da prova que termina em `ROLLBACK` ficaram não executadas. Não houve nova tentativa por outro caminho. Não há backup restaurável confirmado. Por isso não houve login, CRUD pela aplicação, upload, download nem processo Next apontando para o banco. A porta 5432 não foi publicada. O Florescer Web e `NEXT_PUBLIC_CASA_AUTH` não mudaram. A API `api.thvp.cloud` permanece.

## Histórico

- 2026-10-31 — C088: SSH recusado. Prova SQL desta etapa não executada. Sem gravação HTTP, sem porta 5432 e sem variável da casa no Florescer Web.
- 2026-10-31 — C087.1: homologação descrita e não criada. Sem variável da casa no Florescer Web.
- 2026-10-31 — C087: a prova C084 passou no BancoFlorescerPP, com `ROLLBACK` e organizações em 0. O corte e a cópia de arquivos ficaram escritos e não foram executados.
- 2026-10-31 — C086: conferência local da autenticação, sem valores de variável. A saída do console da prova C084 não chegou. Organizações residuais sem prova. Deploy não feito.
- 2026-10-31 — C086: a saída do console da prova C084 de novo não chegou. Variáveis da casa ausentes, porta 5432 fechada, deploy não feito.
- 2026-10-31 — C086: a saída do console da prova C084 não chegou. Variáveis da casa ausentes, porta 5432 fechada, deploy não feito.
- 2026-10-31 — C085: a prova SQL da C084 continua no console do BancoFlorescerPP. Desta máquina a sessão não abriu. Nenhuma variável da casa entrou no Florescer Web. Sem deploy.
- 2026-10-31 — C084 no repositório. Sem variáveis da casa no Florescer Web, sem porta 5432 e sem deploy. A prova SQL da C084 ainda não rodou no console.
- 2026-10-31 — C083 no Bash do BancoFlorescerPP: `0059` e C074 aplicadas. `casa_login` provado sem superusuário e sem `BYPASSRLS`. O teste SQL rodou e foi desfeito. Organizações 0. Sem `CASA_DATABASE_URL` e sem deploy.
- 2026-10-31 — C083 complemento: o prompt selecionado continuou o do Mac. A `0059` e a senha de `casa_login` não foram aplicadas. Build e testes locais de cookie e redefinição passaram. Sem deploy.
- 2026-10-31 — C082: schema `0000`–`0058`, papéis e `GRANT` no BancoFlorescerPP. Testes C077 e C082 desfeitos. 102 tabelas, 0 organizações. Sem backup, sem database temporário, sem troca da API e sem deploy.
- 2026-10-31 — catálogo do BancoFlorescerPP lido: extensões disponíveis e não instaladas, schemas `auth`, `storage` e `extensions` ausentes, 0 tabelas. Backup, ordem e rollback escritos. Sem apply.
- 2026-10-31 — SSH com chave para `deploy` e `root` na VPS recusado de novo. Consultas do BancoFlorescerPP não rodaram. Sem apply.
- 2026-10-31 — o `psql -c` não interativo também não chegou ao BancoFlorescerPP. Extensões seguem sem lista. Sem apply e sem papel novo.
- 2026-10-31 — BancoFlorescerPP confirmado na sessão, PostgreSQL 18.6. Extensões e schemas `auth`, `storage` e `extensions` seguem sem lista. Sem apply.
- 2026-10-31 — prelúdio, papéis e isolamento preparados para o BancoFlorescerPP. Sem apply e sem troca da API.
- 2026-10-21 — guia da VPS com Caddy, Supabase pinado e bootstrap do primeiro administrador.
- 2026-10-21 — passo só do banco em `deploy/up-db.sh`, com `sistema.thvp.cloud` e `api.thvp.cloud`.
