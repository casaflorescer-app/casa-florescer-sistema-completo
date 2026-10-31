#!/bin/bash
# Aplica a 0059 e prova casa_login. Não imprime senha. Para se houver organização.
set -euo pipefail
trap 'echo C083_FAIL' ERR

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
umask 077
mkdir -p /root/casa-c083

mapfile -t CONTAINERS < <(docker ps --format '{{.Names}}' | grep bancoflorescer | grep -v florescerweb | grep -v florescerapi || true)
if [ "${#CONTAINERS[@]}" -ne 1 ]; then
  echo "container bancoflorescer: ${#CONTAINERS[@]}"
  exit 1
fi
C="${CONTAINERS[0]}"

DB="$(docker exec "$C" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -tA -v ON_ERROR_STOP=1 -c "select current_database()"')"
if [ "$DB" != "BancoFlorescerPP" ]; then
  echo "database inesperado"
  exit 1
fi

ORGS="$(docker exec "$C" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -tA -v ON_ERROR_STOP=1 -c "select count(*) from public.organizations"')"
if [ "$ORGS" != "0" ]; then
  echo "organizations=$ORGS"
  exit 1
fi

docker exec -i "$C" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -v ON_ERROR_STOP=1' \
  < "$ROOT/supabase/migrations/0059_c083_staff_and_reset.sql"

if [ ! -s /root/casa-c083/login.secret ]; then
  python3 - <<'PY'
import secrets
from pathlib import Path
path = Path("/root/casa-c083/login.secret")
path.write_text(secrets.token_urlsafe(32))
path.chmod(0o600)
PY
fi

python3 - <<'PY'
from pathlib import Path
password = Path("/root/casa-c083/login.secret").read_text().strip().replace("'", "''")
path = Path("/root/casa-c083/alter.sql")
path.write_text("alter role casa_login password '" + password + "';\n")
path.chmod(0o600)
check = Path("/root/casa-c083/check.sh")
check.write_text(
    "#!/bin/sh\n"
    "set -eu\n"
    "export PGPASSWORD=$(cat /tmp/casa-login.secret)\n"
    "rm -f /tmp/casa-login.secret\n"
    "psql -h 127.0.0.1 -U casa_login -d BancoFlorescerPP -X -P pager=off -tA -v ON_ERROR_STOP=1 "
    "-c \"select current_user || chr(124) || (select (not rolsuper and not rolbypassrls)::text from pg_roles where rolname = current_user);\"\n"
)
check.chmod(0o700)
PY

docker exec -i "$C" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -v ON_ERROR_STOP=1' \
  < /root/casa-c083/alter.sql
rm -f /root/casa-c083/alter.sql

docker cp /root/casa-c083/login.secret "$C":/tmp/casa-login.secret
docker cp /root/casa-c083/check.sh "$C":/tmp/casa-check.sh
LINK="$(docker exec "$C" sh /tmp/casa-check.sh)"
docker exec "$C" rm -f /tmp/casa-check.sh
printf '%s\n' "$LINK"
if [ "$LINK" != "casa_login|true" ]; then
  echo "papel da aplicação recusado"
  exit 1
fi

docker exec -i "$C" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -P pager=off -v ON_ERROR_STOP=1' \
  < "$ROOT/supabase/tests/c083_login_and_staff.sql"

echo "C083_OK orgs=0"
