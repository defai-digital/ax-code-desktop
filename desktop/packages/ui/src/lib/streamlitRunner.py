"""Prepare a project recipe and exec Streamlit inside the existing owned terminal.

Normal runs never install. Setup is a transient explicit user action. This helper
does not supervise processes, download Python, or change dependency manifests.
"""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys


def main(options):
    token = options["token"]

    def emit(stage, **details):
        print("AX_CODE_STREAMLIT " + json.dumps(dict(token=token, stage=stage, **details)), flush=True)

    def fail(code):
        emit("failed", code=code)
        return 1

    emit("preparing")
    if sys.version_info < (3, 11):
        return fail("python")
    import tomllib

    root = Path.cwd()
    entry = root / options["entrypoint"]
    if not entry.is_file() or not entry.resolve().is_relative_to(root.resolve()):
        return fail("file")

    def read_toml(path):
        return tomllib.loads(path.read_text()) if path.is_file() else {}

    try:
        project = read_toml(root / "pyproject.toml")
        config = read_toml(Path.home() / ".streamlit/config.toml")
        local_config = read_toml(root / ".streamlit/config.toml")
        if not isinstance(config.get("server", {}), dict) or not isinstance(local_config.get("server", {}), dict):
            return fail("config")
        base = local_config.get("server", {}).get("baseUrlPath", config.get("server", {}).get("baseUrlPath", ""))
        base = os.environ.get("STREAMLIT_SERVER_BASE_URL_PATH", base)
        if not isinstance(base, str) or any(c in base for c in "?#\\\r\n"):
            return fail("config")
    except (ValueError, OSError):
        return fail("config")

    environment = root / ".venv"
    if not environment.exists() and (root / "venv/pyvenv.cfg").is_file():
        environment = root / "venv"
    python = environment / "bin/python"
    explicit = options.get("interpreter")
    if explicit:
        resolved = shutil.which(explicit)
        if not resolved:
            return fail("python")
        python = Path(resolved).absolute()

    # External environments can run, but never receive automatic package changes.
    local_env = python.exists() and (environment / "pyvenv.cfg").is_file() and environment.resolve().is_relative_to(root.resolve())
    if python.exists():
        probe = subprocess.run([str(python), "-c", "import sys; print(sys.prefix)"], capture_output=True, text=True)
        local_env = local_env and probe.returncode == 0 and Path(probe.stdout.strip()) == environment

    locked = (root / "uv.lock").is_file()
    requirements = (root / "requirements.txt").is_file()
    managed_elsewhere = any((root / name).exists() for name in ("poetry.lock", "Pipfile", "environment.yml", "environment.yaml"))
    source = "uv" if locked else "requirements" if requirements else "simple"
    supported_setup = not explicit and not managed_elsewhere and (locked or requirements or not project)
    uv = shutil.which("uv") if locked else None
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    env["UV_PROJECT_ENVIRONMENT"] = str(environment)
    env["UV_NO_PYTHON_DOWNLOADS"] = "1"

    def installed():
        return python.exists() and subprocess.run(
            [str(python), "-c", "import streamlit"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        ).returncode == 0

    needs_setup = not installed()
    if locked and not explicit:
        if not uv:
            return fail("uv")
        # --check is read-only; --locked refuses to create or rewrite a lock.
        check = subprocess.run([uv, "sync", "--check", "--locked", "--offline", "--no-python-downloads"], env=env)
        needs_setup = needs_setup or check.returncode != 0

    if options.get("setup"):
        if not supported_setup:
            return fail("unsupported")
        if environment.exists() and not local_env:
            return fail("environment")
        emit("installing", source=source)
        if locked:
            command = [uv, "sync", "--locked", "--no-python-downloads"]
            if local_env:
                command += ["--python", str(python)]
        else:
            if not local_env:
                if subprocess.run([sys.executable, "-m", "venv", str(environment)]).returncode:
                    return fail("environment")
            command = [str(python), "-m", "pip", "--isolated", "install", "--no-user", "--prefix", str(environment)]
            command += ["-r", "requirements.txt"] if requirements else ["streamlit==1.66.0"]
        if subprocess.run(command, env=env).returncode:
            return fail("install")
        if not installed():
            return fail("dependency")
    elif needs_setup:
        if not supported_setup:
            return fail("unsupported")
        emit("setup-required", source=source)
        return 0

    try:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", options.get("port") or 0))
            port = sock.getsockname()[1]
    except OSError:
        return fail("port")

    from urllib.parse import quote
    url = "http://127.0.0.1:" + str(port) + "/" + quote(base.strip("/"), safe="/")
    if not url.endswith("/"):
        url += "/"
    emit("launching", url=url)
    # Preserve terminal ownership and signals. Readiness still requires Streamlit's
    # startup URL; selecting a free port does not guarantee the subsequent bind.
    if local_env or options.get("setup"):
        env["VIRTUAL_ENV"] = str(environment)
    env["PATH"] = str(python.parent) + os.pathsep + env.get("PATH", "")
    os.execve(str(python), [str(python), "-m", "streamlit", "run", str(entry),
                           "--server.address=127.0.0.1", "--server.port=" + str(port),
                           "--server.headless=true", "--browser.gatherUsageStats=false"], env)


if __name__ == "__main__":
    opts = json.loads(sys.argv[1])
    try:
        sys.exit(main(opts))
    except KeyboardInterrupt:
        sys.exit(130)
    except (OSError, ValueError):
        print("AX_CODE_STREAMLIT " + json.dumps(dict(token=opts["token"], stage="failed", code="environment")), flush=True)
        sys.exit(1)
