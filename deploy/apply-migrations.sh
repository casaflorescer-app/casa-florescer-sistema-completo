#!/usr/bin/env bash
# Aplica supabase/migrations em ordem, uma vez cada, no Postgres do container supabase-db.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"

if ! docker inspect supabase-db >/dev/null 2>&1; then
  echo "Container supabase-db não está no ar." >&2
  exit 1
fi

docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists casa_deploy;
revoke all on schema casa_deploy from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema casa_deploy from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema casa_deploy from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on schema casa_deploy from service_role';
  end if;
end $$;
create table if not exists casa_deploy.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
revoke all on table casa_deploy.schema_migrations from public;
SQL

shopt -s nullglob
files=("$MIGRATIONS"/*.sql)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "Nenhuma migration em supabase/migrations." >&2
  exit 1
fi

IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for file in "${sorted[@]}"; do
  base="$(basename "$file")"
  already="$(docker exec supabase-db psql -U postgres -d postgres -tA -v ON_ERROR_STOP=1 -v fn="$base" \
    -c "select 1 from casa_deploy.schema_migrations where filename = :'fn'")"
  already="$(printf '%s' "$already" | tr -d '[:space:]')"
  if [[ "$already" == "1" ]]; then
    echo "ok  $base"
    continue
  fi
  echo "sql $base"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < "$file"
  docker exec supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v fn="$base" \
    -c "insert into casa_deploy.schema_migrations (filename) values (:'fn')"
done

echo "Migrations aplicadas."
