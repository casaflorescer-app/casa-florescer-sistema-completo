#!/usr/bin/env python3
"""Envia o pacote pelo Terminal já logado na VPS e espera o resultado."""

import base64
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHUNK = 8000


def terminal(command: str) -> None:
    escaped = command.replace("\\", "\\\\").replace('"', '\\"')
    script = (
        'tell application "Terminal" to do script "'
        + escaped
        + '" in selected tab of front window'
    )
    subprocess.run(["osascript", "-e", script], check=True)


def wait_for(marker: str, seconds: int = 60) -> str:
    deadline = time.time() + seconds
    last = ""
    while time.time() < deadline:
        time.sleep(0.4)
        last = tail()
        if marker in last:
            return last
    raise TimeoutError(last[-500:])


def tail() -> str:
    source = r'''
tell application "Terminal"
  set t to contents of selected tab of front window
end tell
set paras to paragraphs of t
set n to count of paras
set start to n - 40
if start < 1 then set start to 1
set out to ""
repeat with i from start to n
  set out to out & (item i of paras) & linefeed
end repeat
return out
'''
    result = subprocess.run(["osascript", "-e", source], check=True, capture_output=True, text=True)
    return result.stdout


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        bundle = Path(tmp) / "bundle.tgz"
        with tarfile.open(bundle, "w:gz") as tar:
            tar.add(ROOT / "supabase" / "migrations", arcname="supabase/migrations")
            tar.add(ROOT / "supabase" / "tests" / "c077_practice_isolation.sql", arcname="supabase/tests/c077_practice_isolation.sql")
            tar.add(ROOT / "supabase" / "tests" / "c082_sessions_and_gaps.sql", arcname="supabase/tests/c082_sessions_and_gaps.sql")
            for name in (
                "c076-roles.sql",
                "c082-login-role.sql",
                "c082-grants.sql",
                "c082-remote.sh",
            ):
                tar.add(ROOT / "scripts" / name, arcname=f"scripts/{name}")
        payload = base64.b64encode(bundle.read_bytes()).decode("ascii")

    terminal("mkdir -p /root/casa-c082 && rm -f /root/casa-c082/bundle.b64 && echo C082_DIR_OK")
    wait_for("C082_DIR_OK")
    part = 0
    for index in range(0, len(payload), CHUNK):
        part += 1
        piece = payload[index : index + CHUNK]
        marker = f"C082_PART_{part}"
        terminal(f"printf '%s' '{piece}' >> /root/casa-c082/bundle.b64 && echo {marker}")
        wait_for(marker, 30)
    start = sys.argv[1] if len(sys.argv) > 1 else ""
    terminal(
        "base64 -d /root/casa-c082/bundle.b64 > /root/casa-c082/bundle.tgz"
        " && rm -rf /root/casa-c082/supabase /root/casa-c082/scripts"
        " && tar -xzf /root/casa-c082/bundle.tgz -C /root/casa-c082"
        f" && bash /root/casa-c082/scripts/c082-remote.sh {start}"
    )
    for _ in range(80):
        time.sleep(10)
        text = tail()
        if "C082_OK" in text or "C082_FAIL" in text or "Aplicação parada" in text:
            print(text)
            return
    print("C082_TIMEOUT")
    print(tail())
    raise SystemExit(1)


if __name__ == "__main__":
    main()
