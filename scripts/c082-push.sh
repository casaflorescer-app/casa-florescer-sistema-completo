#!/bin/bash
# Envia o pacote pelo SSH já aberto em /dev/ttys000 e espera o resultado.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
TTY=/dev/ttys000
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar -czf "$WORK/bundle.tgz" -C "$ROOT" \
  supabase/migrations \
  supabase/tests/c077_practice_isolation.sql \
  supabase/tests/c082_sessions_and_gaps.sql \
  scripts/c076-roles.sql \
  scripts/c082-login-role.sql \
  scripts/c082-grants.sql \
  scripts/c082-remote.sh
base64 < "$WORK/bundle.tgz" > "$WORK/bundle.b64"

{
  printf '\n'
  printf '%s\n' "mkdir -p /root/casa-c082"
  printf '%s\n' "base64 -d > /root/casa-c082/bundle.tgz << 'END_C082_BUNDLE'"
  cat "$WORK/bundle.b64"
  printf '%s\n' "END_C082_BUNDLE"
  printf '%s\n' "rm -rf /root/casa-c082/supabase /root/casa-c082/scripts"
  printf '%s\n' "tar -xzf /root/casa-c082/bundle.tgz -C /root/casa-c082"
  printf '%s\n' "sh /root/casa-c082/scripts/c082-remote.sh > /root/casa-c082/run.log 2>&1"
  printf '%s\n' 'echo C082_EXIT:$?'
  printf '%s\n' "tail -n 60 /root/casa-c082/run.log"
  printf '%s\n' "echo C082_END"
} > "$TTY"

read_tail() {
  osascript <<'APPLESCRIPT'
tell application "Terminal"
  set t to contents of selected tab of front window
end tell
set paras to paragraphs of t
set n to count of paras
set start to n - 70
if start < 1 then set start to 1
set out to ""
repeat with i from start to n
  set out to out & (item i of paras) & linefeed
end repeat
return out
APPLESCRIPT
}

for _ in $(seq 1 40); do
  sleep 15
  text="$(read_tail || true)"
  if printf '%s\n' "$text" | grep -q 'C082_END'; then
    printf '%s\n' "$text"
    exit 0
  fi
done

echo "C082_TIMEOUT"
read_tail || true
exit 1
