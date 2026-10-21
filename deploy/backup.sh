#!/usr/bin/env bash
# Backup do Postgres e do volume de arquivos. Retenção local de 14 dias.
# Copie o diretório de saída para fora da VPS. Os arquivos têm dados clínicos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/deploy/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STORAGE="$ROOT/deploy/supabase-docker/docker/volumes/storage"

mkdir -p "$OUT"
chmod 700 "$OUT"
docker exec supabase-db pg_dump -U postgres -d postgres --no-owner | gzip > "$OUT/postgres-$STAMP.sql.gz"
if [[ -d "$STORAGE" ]]; then
  tar -C "$ROOT/deploy/supabase-docker/docker/volumes" -czf "$OUT/storage-$STAMP.tar.gz" storage
fi
find "$OUT" -type f -mtime +14 -delete
chmod 600 "$OUT"/*
echo "Backup em $OUT"
