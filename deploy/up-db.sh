#!/usr/bin/env bash
# Sobe só o Postgres do Supabase e aplica as migrations. Não publica o site.
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

mem_mb="$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)"
if [[ "$mem_mb" -lt 3500 ]]; then
  echo "Esta máquina tem ${mem_mb} MB de RAM. Pare e aumente a VPS para pelo menos 4 GB." >&2
  exit 1
fi

if ss -lnt | grep -E '0\.0\.0\.0:5432|\[::\]:5432' >/dev/null; then
  echo "A porta 5432 já está aberta para a internet. Feche antes de continuar." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/deploy/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

python3 - "$ENV_FILE" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
replacements = {
    "APP_HOST=": "APP_HOST=sistema.thvp.cloud\n",
    "API_HOST=": "API_HOST=api.thvp.cloud\n",
}
for key, line in replacements.items():
    if f"{key}\n" in text or text.endswith(key):
        text = text.replace(f"{key}\n", line, 1)
path.write_text(text)
path.chmod(0o600)
PY

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
  echo "deploy/.env contém a chave de demonstração do Supabase. Apague esse arquivo e rode de novo." >&2
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

for key in APP_HOST API_HOST ANON_KEY JWT_SECRET POSTGRES_PASSWORD; do
  if [[ -z "${!key:-}" || "${!key}" == CHANGE_ME* ]]; then
    echo "Variável $key vazia ou ainda em CHANGE_ME." >&2
    exit 1
  fi
done

ln -sfn "$ENV_FILE" "$DOCKER_DIR/.env"

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

"${COMPOSE_SUPABASE[@]}" up -d db

echo "Aguardando Postgres..."
ready=0
for _ in $(seq 1 60); do
  if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "O Postgres não ficou pronto." >&2
  exit 1
fi

"$ROOT/deploy/apply-migrations.sh"

if ss -lnt | grep -E '0\.0\.0\.0:5432|\[::\]:5432' >/dev/null; then
  echo "A porta 5432 ficou aberta para a internet." >&2
  exit 1
fi

orgs="$(docker exec supabase-db psql -U postgres -d postgres -tA -c 'select count(*) from public.organizations')"
orgs="$(printf '%s' "$orgs" | tr -d '[:space:]')"
echo "Banco criado. Organizações: ${orgs}. A clínica ainda não foi cadastrada."
echo "A porta 5432 não está aberta na internet."
