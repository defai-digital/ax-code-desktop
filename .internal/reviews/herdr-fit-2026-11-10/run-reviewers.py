"""Run the explicitly requested tool-free CLI consultations; keep raw transport in a temporary directory."""

import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parent
RAW = Path("/tmp/ax-desktop-herdr-fit-20261110")
RAW.mkdir(exist_ok=True)
ROUND = sys.argv[1] if len(sys.argv) > 1 else "independent"
PROMPT = ROOT / ("review-input.md" if ROUND == "independent" else f"{ROUND}-input.md")
SYSTEM = (
    "You are an independent product and architecture reviewer. Read only the supplied evidence and answer directly "
    "in English. No tools, planning preamble, filesystem changes, delegation, or web research. "
    "State uncertainties and preserve dissent. This is advisory, not approval."
)
COMMANDS = {
    "claude": [
        "claude", "--print", "--model", "claude-opus-5-5", "--effort", "high",
        "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
        "--no-session-persistence", "--output-format", "json", "--system-prompt", SYSTEM,
    ],
    "grok": [
        "grok", "--model", "grok-4.7", "--prompt-file", str(PROMPT),
        "--tools", "", "--no-subagents", "--disable-web-search", "--max-turns", "3",
        "--output-format", "json", "--verbatim", "--system-prompt-override", SYSTEM,
    ],
    "muse": [
        "muse", "exec", "--model", "muse-wonder-1.0", "--prompt-file", str(PROMPT),
        "--preset", "empty", "--disable-write", "--disable-shell", "--disable-web-tools",
        "--disable-reminders", "--disable-request-user-input", "--no-foreign-personal-context",
        "--no-session-log", "--max-model-steps", "3", "--json",
    ],
}


def run(name, command):
    started = time.monotonic()
    stem = RAW / f"{ROUND}-{name}"
    with stem.with_suffix(".stdout").open("w") as out, stem.with_suffix(".stderr").open("w") as err:
        process = subprocess.Popen(
            command, stdin=subprocess.PIPE if name == "claude" else subprocess.DEVNULL,
            stdout=out, stderr=err, cwd=RAW, start_new_session=True,
        )
        try:
            process.communicate(input=PROMPT.read_bytes() if name == "claude" else None, timeout=420)
            status = "completed"
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            status = "timeout"
    receipt = {
        "reviewer": name, "round": ROUND, "status": status, "exit_code": process.returncode,
        "elapsed_seconds": round(time.monotonic() - started, 2), "command": command,
        "input": PROMPT.name, "raw_stdout": str(stem.with_suffix(".stdout")),
        "raw_stderr": str(stem.with_suffix(".stderr")),
        "scope": "Tool-free advisory consultation on supplied evidence; no product execution or approval.",
    }
    (ROOT / f"{ROUND}-{name}.receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({key: receipt[key] for key in ["reviewer", "round", "status", "exit_code", "elapsed_seconds"]}), flush=True)


if __name__ == "__main__":
    selected = sys.argv[2:] or list(COMMANDS)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda name: run(name, COMMANDS[name]), selected))
