#!/usr/bin/env bash
# Sobe Supabase (pinado), aplica migrations e publica o app atrás do Caddy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env"
DOCKER_DIR="$ROOT/deploy/supabase-docker/docker"
COMPOSE_SUPABASE=(
  docker compose
  --project-directory "$DOCKER_DIR"
  -f "$DOCKER_DIR/docker-compose.yml"
  -f "$ROOT/deploy/supabase/override.yml"
  --env-file "$ENV_FILE"
)
SERVICES=(db imgproxy auth rest realtime storage meta studio api-gw)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Copie deploy/.env.example para deploy/.env e preencha APP_HOST, API_HOST e ACME_EMAIL." >&2
  exit 1
fi

run_node() {
  if command -v node >/dev/null 2>&1; then
    node "$@"
    return
  fi
  docker run --rm -v "$ROOT:/work" -w /work -u "$(id -u):$(id -g)" node:20.19.5-alpine node "$@"
}

compose_version="$(docker compose version --short | sed 's/^v//')"
major="${compose_version%%.*}"
rest="${compose_version#*.}"
minor="${rest%%.*}"
if [[ "$major" -lt 2 || ( "$major" -eq 2 && "$minor" -lt 24 ) ]]; then
  echo "Docker Compose $compose_version é antigo. Instale 2.24 ou mais novo." >&2
  exit 1
fi

if grep -q 'InJvbGUiOiAiYW5vbiI' "$ENV_FILE"; then
  echo "deploy/.env contém a chave anônima de demonstração do Supabase. Rode generate-keys.mjs." >&2
  exit 1
fi

"$ROOT/deploy/fetch-supabase.sh"
(
  cd "$ROOT"
  run_node deploy/generate-keys.mjs --env deploy/.env
  run_node deploy/generate-keys.mjs --env deploy/.env --sync-public
)

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for key in APP_HOST API_HOST ACME_EMAIL ANON_KEY JWT_SECRET POSTGRES_PASSWORD; do
  if [[ -z "${!key:-}" || "${!key}" == CHANGE_ME* ]]; then
    echo "Variável $key vazia ou ainda em CHANGE_ME." >&2
    exit 1
  fi
done

ln -sfn "$ENV_FILE" "$DOCKER_DIR/.env"

echo "Conferindo portas do compose do Supabase..."
"${COMPOSE_SUPABASE[@]}" config --format json | python3 -c '
import json, sys
data = json.load(sys.stdin)
sensitive = {"5432", "6543", "8000", "8443"}
bad = []
for name, service in data.get("services", {}).items():
    for port in service.get("ports") or []:
        published = str(port.get("published", ""))
        host_ip = port.get("host_ip") or "0.0.0.0"
        if published in sensitive and host_ip != "127.0.0.1":
            bad.append(f"{name} {host_ip}:{published}")
if bad:
    sys.stderr.write("Porta publicada fora de localhost:\n")
    sys.stderr.write("\n".join(bad) + "\n")
    sys.exit(1)
'

"${COMPOSE_SUPABASE[@]}" up -d "${SERVICES[@]}"

echo "Aguardando Postgres..."
for _ in $(seq 1 60); do
  if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec supabase-db pg_isready -U postgres -h localhost

"$ROOT/deploy/apply-migrations.sh"

if [[ -z "${SMTP_HOST:-}" ]]; then
  echo "SMTP_HOST vazio: o login do admin funciona; o e-mail de redefinição de senha não sai."
fi

docker compose --project-directory "$ROOT/deploy" -f "$ROOT/deploy/docker-compose.yml" --env-file "$ENV_FILE" up -d --build
echo "Stack no ar. Rode deploy/bootstrap-admin.sh se esta for a primeira vez."
