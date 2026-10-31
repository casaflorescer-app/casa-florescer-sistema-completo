#!/usr/bin/env python3
"""Reenvia os testes e roda só a prova, sem repetir as migrations."""

import base64
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
set start to n - 40
if start < 1 then set start to 1
set out to ""
repeat with i from start to n
  set out to out & (item i of paras) & linefeed
end repeat
return out
"""
    result = subprocess.run(["osascript", "-e", source], check=True, capture_output=True, text=True)
    return result.stdout


def ship(remote: str, local: Path, marker: str) -> None:
    payload = base64.b64encode(local.read_bytes()).decode("ascii")
    terminal(f"printf '%s' '{payload}' | base64 -d > {remote} && echo {marker}")
    deadline = time.time() + 30
    while time.time() < deadline:
        time.sleep(0.4)
        if marker in tail():
            return
    raise TimeoutError(marker)


def main() -> None:
    ship(
        "/root/casa-c082/supabase/tests/c077_practice_isolation.sql",
        ROOT / "supabase/tests/c077_practice_isolation.sql",
        "C082_C077_FILE",
    )
    ship(
        "/root/casa-c082/supabase/tests/c082_sessions_and_gaps.sql",
        ROOT / "supabase/tests/c082_sessions_and_gaps.sql",
        "C082_C082_FILE",
    )
    terminal("bash /root/casa-c082/scripts/c082-remote.sh")
    for _ in range(40):
        time.sleep(8)
        text = tail()
        if "C082_OK" in text or "C082_FAIL" in text:
            print(text)
            raise SystemExit(0 if "C082_OK" in text else 1)
    print("C082_TIMEOUT")
    print(tail())
    raise SystemExit(1)


if __name__ == "__main__":
    main()
