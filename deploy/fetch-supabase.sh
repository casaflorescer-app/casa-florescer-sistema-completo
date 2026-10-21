#!/usr/bin/env bash
# Baixa só o diretório docker/ do Supabase no commit de deploy/SUPABASE_PIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(tr -d '[:space:]' < "$ROOT/deploy/SUPABASE_PIN")"
DEST="$ROOT/deploy/supabase-docker"

if [[ ! "$PIN" =~ ^[0-9a-f]{40}$ ]]; then
  echo "SUPABASE_PIN inválido." >&2
  exit 1
fi

if [[ -f "$DEST/.pin" && "$(tr -d '[:space:]' < "$DEST/.pin")" == "$PIN" && -f "$DEST/docker/docker-compose.yml" ]]; then
  echo "Supabase docker já está no commit ${PIN}."
  exit 0
fi

rm -rf "$DEST"
git clone --filter=blob:none --no-checkout https://github.com/supabase/supabase.git "$DEST"
git -C "$DEST" sparse-checkout init --cone
git -C "$DEST" sparse-checkout set docker
git -C "$DEST" fetch --depth 1 origin "$PIN"
git -C "$DEST" checkout --detach FETCH_HEAD
printf '%s\n' "$PIN" > "$DEST/.pin"
echo "Supabase docker fixado em ${PIN}."
