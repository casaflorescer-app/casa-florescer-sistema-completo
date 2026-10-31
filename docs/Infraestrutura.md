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

## Histórico

- 2026-10-21 — guia da VPS com Caddy, Supabase pinado e bootstrap do primeiro administrador.
- 2026-10-21 — passo só do banco em `deploy/up-db.sh`, com `sistema.thvp.cloud` e `api.thvp.cloud`.
