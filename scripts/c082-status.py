#!/usr/bin/env python3
"""Lê o estado estrutural do BancoFlorescerPP, sem gravar."""

import subprocess
import time

COMMAND = (
    "C=$(docker ps --format '{{.Names}}' | grep bancoflorescer | grep -v florescerweb | grep -v florescerapi); "
    "docker exec \"$C\" sh -c 'psql -U \"$POSTGRES_USER\" -d BancoFlorescerPP -X -P pager=off -tA -v ON_ERROR_STOP=1 -c \""
    "select extname || chr(32) || extversion from pg_extension where extname in (chr(99)||chr(105)||chr(116)||chr(101)||chr(120)||chr(116), chr(98)||chr(116)||chr(114)||chr(101)||chr(101)||chr(95)||chr(103)||chr(105)||chr(115)||chr(116), chr(112)||chr(103)||chr(99)||chr(114)||chr(121)||chr(112)||chr(116)||chr(111)) order by 1; "
    "select nspname from pg_namespace where nspname in (chr(97)||chr(117)||chr(116)||chr(104), chr(115)||chr(116)||chr(111)||chr(114)||chr(97)||chr(103)||chr(101), chr(101)||chr(120)||chr(116)||chr(101)||chr(110)||chr(115)||chr(105)||chr(111)||chr(110)||chr(115)) order by 1; "
    "select rolname || chr(32) || rolsuper::text || chr(32) || rolbypassrls::text || chr(32) || rolcanlogin::text from pg_roles where rolname = chr(99)||chr(97)||chr(115)||chr(97)||chr(95)||chr(108)||chr(111)||chr(103)||chr(105)||chr(110); "
    "select count(*) from public.organizations; "
    "select count(*) from pg_tables where schemaname = chr(112)||chr(117)||chr(98)||chr(108)||chr(105)||chr(99);\"'; "
    "echo C082_STATUS"
)


def terminal(command: str) -> None:
    escaped = command.replace("\\", "\\\\").replace('"', '\\"')
    script = (
        'tell application "Terminal" to do script "'
        + escaped
        + '" in selected tab of front window'
    )
    subprocess.run(["osascript", "-e", script], check=True)


def tail() -> str:
    source = r"""
tell application "Terminal"
  set t to contents of selected tab of front window
end tell
set paras to paragraphs of t
set n to count of paras
set start to n - 25
if start < 1 then set start to 1
set out to ""
repeat with i from start to n
  set out to out & (item i of paras) & linefeed
end repeat
return out
"""
    result = subprocess.run(["osascript", "-e", source], check=True, capture_output=True, text=True)
    return result.stdout


def main() -> None:
    terminal(COMMAND)
    deadline = time.time() + 40
    while time.time() < deadline:
        time.sleep(0.8)
        text = tail()
        if "C082_STATUS" in text:
            print(text)
            return
    print(tail())
    raise SystemExit(1)


if __name__ == "__main__":
    main()
