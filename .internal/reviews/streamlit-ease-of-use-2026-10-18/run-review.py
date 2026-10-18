"""Run bounded, isolated CLI design reviews using an explicit source packet."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

base = Path(__file__).resolve().parent
reviewer = sys.argv[1]
phase = sys.argv[2] if len(sys.argv) > 2 else "initial"
label = f"{reviewer}-{phase}"
cwd = Path(tempfile.mkdtemp(prefix=f"ax-streamlit-ux-{label}-"))
prompt = base / f"{label}-prompt.txt"
if reviewer == "grok":
    command = [
        "/Users/akiralam/.grok/bin/grok", "--cwd", str(cwd),
        "--prompt-file", str(prompt), "--tools", "", "--no-subagents",
        "--disable-web-search", "--permission-mode", "plan",
        "--max-turns", "2", "--output-format", "plain",
    ]
elif reviewer in ("deepseek", "qwen", "glm", "minimax"):
    model = json.loads((base / "reviewer-models.json").read_text())[reviewer]
    command = [
        "/Users/akiralam/.ax-code/bin/ax-code", "run", "--dir", str(cwd),
        "--model", model,
        "--sandbox", "read-only", "--disallowed-tools",
        "bash,write,edit,apply_patch,task,webfetch,websearch",
        "--prompt-file", str(prompt), "--format", "json", "--timeout", "180",
        "--title", "Streamlit ease of use design review",
    ]
else:
    raise SystemExit("Unsupported reviewer")

start = time.monotonic()
with (base / f"{label}-raw.txt").open("w") as stdout, (base / f"{label}-stderr.txt").open("w") as stderr:
    process = subprocess.Popen(command, cwd=cwd, stdout=stdout, stderr=stderr, start_new_session=True)
    timed_out = False
    try:
        returncode = process.wait(timeout=200)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            returncode = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            returncode = process.wait()

receipt = {
    "reviewer": reviewer, "phase": phase, "command": command,
    "returncode": returncode, "timedOut": timed_out,
    "durationSeconds": round(time.monotonic() - start, 1),
    "workingDirectory": str(cwd),
    "assessment": "Availability must be confirmed from substantive final output, not exit status alone.",
}
(base / f"{label}-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
