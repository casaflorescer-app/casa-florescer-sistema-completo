#!/usr/bin/env bash
# Cria a clínica e o primeiro administrador. Rode na VPS, com o gateway em 127.0.0.1:8000.
# A senha sai uma vez no terminal e não é gravada.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta deploy/.env." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${SERVICE_ROLE_KEY:-}" || "$SERVICE_ROLE_KEY" == CHANGE_ME* ]]; then
  echo "SERVICE_ROLE_KEY ausente. Rode deploy/generate-keys.mjs." >&2
  exit 1
fi

read -r -p "E-mail do administrador: " ADMIN_EMAIL
read -r -p "Nome completo: " ADMIN_NAME
read -r -p "CNPJ (14 dígitos, sem pontuação): " ADMIN_CNPJ
read -r -p "Razão social: " ADMIN_LEGAL
read -r -p "Nome fantasia: " ADMIN_TRADE
read -r -p "Especialidade da prática da casa [Ginecologia e Obstetrícia]: " ADMIN_SPECIALTY
ADMIN_SPECIALTY="${ADMIN_SPECIALTY:-Ginecologia e Obstetrícia}"

if [[ ! "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "E-mail inválido." >&2
  exit 1
fi
if [[ ! "$ADMIN_CNPJ" =~ ^[0-9]{14}$ ]]; then
  echo "CNPJ precisa ter 14 dígitos." >&2
  exit 1
fi
if [[ ${#ADMIN_NAME} -lt 3 || ${#ADMIN_LEGAL} -lt 3 || ${#ADMIN_TRADE} -lt 2 ]]; then
  echo "Nome, razão social e nome fantasia são obrigatórios." >&2
  exit 1
fi

existing="$(docker exec -i supabase-db psql -U postgres -d postgres -tA -c "select count(*) from public.organizations")"
existing="$(printf '%s' "$existing" | tr -d '[:space:]')"
if [[ "$existing" != "0" ]]; then
  echo "Já existe organização no banco. Este bootstrap não roda de novo." >&2
  exit 1
fi

ADMIN_PASSWORD="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(18))
PY
)"
export ADMIN_EMAIL ADMIN_PASSWORD SERVICE_ROLE_KEY

RESP="$(mktemp)"
chmod 600 "$RESP"
cleanup() {
  rm -f "$RESP"
  unset ADMIN_PASSWORD
}
trap cleanup EXIT

set +e
python3 - "$RESP" <<'PY'
import json, os, sys, urllib.error, urllib.request
dest = sys.argv[1]
body = json.dumps({
    "email": os.environ["ADMIN_EMAIL"],
    "password": os.environ["ADMIN_PASSWORD"],
    "email_confirm": True,
}).encode()
req = urllib.request.Request(
    "http://127.0.0.1:8000/auth/v1/admin/users",
    data=body,
    headers={
        "apikey": os.environ["SERVICE_ROLE_KEY"],
        "Authorization": "Bearer " + os.environ["SERVICE_ROLE_KEY"],
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        open(dest, "w").write(response.read().decode())
except urllib.error.HTTPError as error:
    detail = error.read().decode()
    sys.stderr.write(f"Auth recusou o cadastro ({error.code}).\n")
    sys.stderr.write(detail[:500] + "\n")
    sys.exit(1)
PY
status=$?
set -e
if [[ $status -ne 0 ]]; then
  exit "$status"
fi

USER_ID="$(python3 - "$RESP" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
user_id = data.get("id") or ""
if len(user_id) < 30:
    sys.exit("Resposta do Auth sem id de usuário.")
print(user_id)
PY
)"

if ! docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v user_id="$USER_ID" \
  -v email="$ADMIN_EMAIL" \
  -v full_name="$ADMIN_NAME" \
  -v cnpj="$ADMIN_CNPJ" \
  -v legal_name="$ADMIN_LEGAL" \
  -v trade_name="$ADMIN_TRADE" \
  -v specialty="$ADMIN_SPECIALTY" <<'SQL'
begin;
with org as (
  insert into public.organizations (legal_name, trade_name, cnpj)
  values (:'legal_name', :'trade_name', :'cnpj')
  returning id
),
practice as (
  insert into public.practice_units (
    organization_id, kind, code, name, specialty, isolation_label
  )
  select id, 'house', 'HOUSE', :'trade_name', :'specialty', 'prontuario-casa'
  from org
  returning id, organization_id
),
profile as (
  insert into public.profiles (id, organization_id, full_name, email)
  select :'user_id'::uuid, organization_id, :'full_name', :'email'
  from practice
  returning id
),
admin as (
  insert into public.system_admins (user_id, granted_by, reason)
  select id, id, 'Bootstrap inicial da hospedagem'
  from profile
  returning user_id
)
insert into public.user_practice_roles (user_id, practice_id, role, clinical_access)
select admin.user_id, practice.id, 'owner', 'none'
from admin
cross join practice;
commit;
SQL
then
  echo "O usuário entrou no Auth, mas o vínculo da clínica falhou. Apague esse usuário no Studio (túnel SSH) antes de rodar de novo." >&2
  exit 1
fi

printf '\nAdministrador criado.\nE-mail: %s\nSenha inicial (anote agora; ela não fica salva): %s\nTroque a senha no primeiro acesso.\n' \
  "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
