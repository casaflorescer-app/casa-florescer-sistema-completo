#!/bin/sh
# Aplica no BancoFlorescerPP. Sem backup e sem outro database.
# Para se public.organizations já tiver linha.
set -eu

hits=$(docker ps --format '{{.ID}} {{.Names}}' | awk 'BEGIN{IGNORECASE=1} $0 ~ /bancoflorescer/ && $0 !~ /florescerweb/ && $0 !~ /florescerapi/')
count=$(printf '%s\n' "$hits" | awk 'NF{n++} END{print n+0}')
if [ "$count" -ne 1 ]; then
  echo "Esperado 1 container bancoflorescer, veio $count"
  printf '%s\n' "$hits"
  exit 1
fi
CID=${hits%% *}
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

psql_q() {
  docker exec "$CID" sh -c "psql -U \"\$POSTGRES_USER\" -d BancoFlorescerPP -X -P pager=off -v ON_ERROR_STOP=1 -tA -c \"$1\""
}

db=$(psql_q "select current_database()")
tables=$(psql_q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'")
has_org=$(psql_q "select to_regclass('public.organizations') is not null")
orgs=0
if [ "$has_org" = "t" ]; then
  orgs=$(psql_q "select count(*) from public.organizations")
fi
echo "database=$db tabelas=$tables organizations=$orgs"
if [ "$db" != "BancoFlorescerPP" ]; then
  echo "Database inesperado"
  exit 1
fi
if [ "$orgs" != "0" ]; then
  echo "public.organizations já tem linha. Aplicação parada."
  exit 1
fi

if [ "$tables" = "0" ]; then
  docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$ROOT/scripts/c076-roles.sql"
  docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$ROOT/scripts/c082-login-role.sql"
  for file in "$ROOT"/supabase/migrations/*.sql; do
    echo "migration $(basename "$file")"
    docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$file"
  done
  docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$ROOT/scripts/c082-grants.sql"
else
  echo "Schema já existe e não há organização. Só os testes."
fi

echo "teste c077"
docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$ROOT/supabase/tests/c077_practice_isolation.sql"
echo "teste c082"
docker exec -i "$CID" sh -c 'psql -U "$POSTGRES_USER" -d BancoFlorescerPP -X -v ON_ERROR_STOP=1' < "$ROOT/supabase/tests/c082_sessions_and_gaps.sql"
echo "C082_OK tabelas=$(psql_q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'") orgs=$(psql_q "select count(*) from public.organizations")"
