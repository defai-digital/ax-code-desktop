"""Disposable real-Python/Streamlit qualification; no global installs or containers."""
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile
import time
import urllib.request

REPO = Path(__file__).resolve().parents[3]
RUNNER = REPO / "desktop/packages/ui/src/lib/streamlitRunner.py"
PYTHON = "/opt/homebrew/bin/python3.12"
ROOT = Path(tempfile.mkdtemp(prefix="ax-streamlit-project-run-"))
PROCESSES = []
RESULTS = {}


def start(project, **options):
    options = dict(version=1, entrypoint="app.py", token="native-test", **options)
    process = subprocess.Popen([PYTHON, str(RUNNER), json.dumps(options)], cwd=project,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    PROCESSES.append(process)
    lines, pending, events = [], b"", []
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        readable, _, _ = select.select([process.stdout], [], [], 1)
        if not readable:
            continue
        chunk = os.read(process.stdout.fileno(), 8192)
        if not chunk:
            break
        pending += chunk
        while b"\n" in pending:
            raw, pending = pending.split(b"\n", 1)
            line = raw.decode(errors="replace")
            lines.append(line)
            if line.startswith("AX_CODE_STREAMLIT "):
                events.append(json.loads(line[18:]))
            if line.strip().startswith(("URL:", "Local URL:")):
                url = next(e["url"] for e in events if e["stage"] == "launching")
                with urllib.request.urlopen(url + "_stcore/health", timeout=5) as response:
                    assert response.status == 200
                return process, events, url
    (ROOT / (project.name + "-last.log")).write_text("\n".join(lines))
    if process.poll() is None:
        raise AssertionError("No startup before deadline: " + str(ROOT))
    return process, events, None


def stop(process, url=None):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGINT)
        process.wait(timeout=10)
    if url:
        try:
            urllib.request.urlopen(url + "_stcore/health", timeout=1)
            raise AssertionError("Listener survived stop")
        except OSError:
            pass


try:
    project = ROOT / "project with spaces"
    project.mkdir()
    (project / "app.py").write_text("import streamlit as st\nst.title('Project tool')\nst.slider('Threshold', 0, 100, 50)\n")
    (project / ".streamlit").mkdir()
    (project / ".streamlit/config.toml").write_text('[server]\nbaseUrlPath = "tools"\n')
    p, events, url = start(project)
    assert events[-1]["stage"] == "setup-required" and not (project / ".venv").exists()
    RESULTS["normal_run_never_creates_environment"] = True
    started = time.monotonic()
    p, events, url = start(project, setup=True)
    assert url and url.endswith("/tools/") and any(e["stage"] == "installing" for e in events)
    RESULTS["explicit_local_setup_seconds"] = round(time.monotonic() - started, 2)
    stop(p, url)
    python = project / ".venv/bin/python"
    freeze = subprocess.check_output([str(python), "-m", "pip", "freeze"])
    started = time.monotonic()
    p, events, first_url = start(project)
    assert [e["stage"] for e in events] == ["preparing", "launching"]
    assert freeze == subprocess.check_output([str(python), "-m", "pip", "freeze"])
    RESULTS["repeat_run_seconds"] = round(time.monotonic() - started, 2)
    second = ROOT / "second-project"
    second.mkdir()
    (second / "app.py").write_text((project / "app.py").read_text())
    p2, events2, second_url = start(second, interpreter=str(python))
    assert first_url != second_url and second_url
    RESULTS["two_projects_distinct_ports"] = True
    from urllib.parse import urlparse
    occupied = int(urlparse(second_url).port)
    failed, errors, _ = start(project, port=occupied)
    assert errors[-1]["code"] == "port"
    with urllib.request.urlopen(second_url + "_stcore/health", timeout=5) as response:
        assert response.status == 200
    RESULTS["fixed_port_never_kills_owner"] = True
    stop(p, first_url)
    stop(p2, second_url)
    RESULTS["stop_frees_listeners"] = True
    locked_project = ROOT / "locked-project"
    locked_project.mkdir()
    (locked_project / "app.py").write_text((project / "app.py").read_text())
    manifest = locked_project / "pyproject.toml"
    manifest.write_text('[project]\nname = "runner-fixture"\nversion = "0.0.0"\nrequires-python = ">=3.12,<3.13"\ndependencies = ["streamlit==1.66.0"]\n')
    subprocess.run(["uv", "lock", "--python", PYTHON, "--no-python-downloads"], cwd=locked_project, check=True)
    lock_before = (locked_project / "uv.lock").read_bytes()
    p3, progress, _ = start(locked_project)
    assert progress[-1]["stage"] == "setup-required" and not (locked_project / ".venv").exists()
    p3, progress, locked_url = start(locked_project, setup=True)
    assert locked_url and (locked_project / "uv.lock").read_bytes() == lock_before
    stop(p3, locked_url)
    p3, progress, locked_url = start(locked_project)
    assert locked_url and [e["stage"] for e in progress] == ["preparing", "launching"]
    stop(p3, locked_url)
    manifest.write_text(manifest.read_text().replace('"streamlit==1.66.0"', '"streamlit==1.66.0", "tomli==2.2.1"'))
    p3, progress, locked_url = start(locked_project, setup=True)
    assert locked_url is None and progress[-1]["code"] == "install"
    assert (locked_project / "uv.lock").read_bytes() == lock_before
    RESULTS["locked_uv_setup_repeat_and_stale_lock_refusal"] = True
    requirements_project = ROOT / "requirements-project"
    requirements_project.mkdir()
    (requirements_project / "app.py").write_text((project / "app.py").read_text())
    (requirements_project / "requirements.txt").write_text("streamlit==1.66.0\n")
    p4, progress, req_url = start(requirements_project, setup=True)
    assert req_url and any(e.get("source") == "requirements" for e in progress)
    stop(p4, req_url)
    RESULTS["requirements_setup"] = True
    RESULTS["python"] = subprocess.check_output([str(python), "--version"], text=True).strip()
    RESULTS["streamlit"] = subprocess.check_output([str(python), "-m", "streamlit", "version"], text=True).strip()
    RESULTS["runner_sha256"] = hashlib.sha256(RUNNER.read_bytes()).hexdigest()
    RESULTS["fixture_root"] = str(ROOT)
finally:
    for process in PROCESSES:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
    (Path(__file__).parent / "runner-receipt.json").write_text(json.dumps(RESULTS, indent=2) + "\n")
print(json.dumps(RESULTS, indent=2))
