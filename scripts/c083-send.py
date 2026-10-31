#!/usr/bin/env python3
"""Envia a C083 em pedaços e roda na VPS. Não imprime senha."""

import base64
import subprocess
import tarfile
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHUNK = 4000


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
set start to n - 30
if start < 1 then set start to 1
set out to ""
repeat with i from start to n
  set out to out & (item i of paras) & linefeed
end repeat
return out
"""
    result = subprocess.run(["osascript", "-e", source], check=True, capture_output=True, text=True)
    return result.stdout


def wait_for(marker: str, seconds: int) -> str:
    deadline = time.time() + seconds
    last = ""
    while time.time() < deadline:
        time.sleep(0.4)
        last = tail()
        if marker in last:
            return last
    raise TimeoutError(last[-800:])


def interrupt() -> None:
    subprocess.run(
        [
            "osascript",
            "-e",
            'tell application "Terminal" to activate',
            "-e",
            'tell application "System Events" to keystroke "c" using control down',
        ],
        check=True,
    )
    time.sleep(0.4)
    terminal("echo C083_READY")
    wait_for("C083_READY", 25)


def main() -> None:
    interrupt()
    with tempfile.TemporaryDirectory() as tmp:
        bundle = Path(tmp) / "bundle.tgz"
        with tarfile.open(bundle, "w:gz") as tar:
            tar.add(
                ROOT / "supabase/migrations/0059_c083_staff_and_reset.sql",
                arcname="supabase/migrations/0059_c083_staff_and_reset.sql",
            )
            tar.add(
                ROOT / "supabase/tests/c083_login_and_staff.sql",
                arcname="supabase/tests/c083_login_and_staff.sql",
            )
            tar.add(ROOT / "scripts/c083-remote.sh", arcname="scripts/c083-remote.sh")
        payload = base64.b64encode(bundle.read_bytes()).decode("ascii")

    terminal("mkdir -p /root/casa-c083 && rm -f /root/casa-c083/bundle.b64 && echo C083_DIR_OK")
    wait_for("C083_DIR_OK", 20)
    part = 0
    for index in range(0, len(payload), CHUNK):
        part += 1
        piece = payload[index : index + CHUNK]
        marker = f"C083_PART_{part}"
        terminal(f"printf '%s' '{piece}' >> /root/casa-c083/bundle.b64 && echo {marker}")
        wait_for(marker, 25)
    terminal(
        "base64 -d /root/casa-c083/bundle.b64 > /root/casa-c083/bundle.tgz"
        " && tar -xzf /root/casa-c083/bundle.tgz -C /root/casa-c083"
        " && bash /root/casa-c083/scripts/c083-remote.sh"
    )
    for _ in range(40):
        time.sleep(8)
        text = tail()
        if "C083_OK" in text or "C083_FAIL" in text:
            print(text)
            raise SystemExit(0 if "C083_OK" in text else 1)
    print("C083_TIMEOUT")
    print(tail())
    raise SystemExit(1)


if __name__ == "__main__":
    main()
