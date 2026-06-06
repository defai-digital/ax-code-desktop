# <img src="../../logo/apple-icon.png" width="32" height="32" align="absmiddle" /> AX Code App Web

[![GitHub stars](https://img.shields.io/github/stars/openchamber/openchamber?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0iI2YxZWNlYyIgdmlld0JveD0iMCAwIDI1NiAyNTYiPjxwYXRoIGQ9Ik0yMjkuMDYsMTA4Ljc5bC00OC43LDQyLDE0Ljg4LDYyLjc5YTguNCw4LjQsMCwwLDEtMTIuNTIsOS4xN0wxMjgsMTg5LjA5LDczLjI4LDIyMi43NGE4LjQsOC40LDAsMCwxLTEyLjUyLTkuMTdsMTQuODgtNjIuNzktNDguNy00MkE4LjQ2LDguNDYsMCwwLDEsMzEuNzMsOTRMOTUuNjQsODguOGwyNC42Mi01OS42YTguMzYsOC4zNiwwLDAsMSwxNS40OCwwbDI0LjYyLDU5LjZMMjI0LjI3LDk0QTguNDYsOC40NiwwLDAsMSwyMjkuMDYsMTA4Ljc5WiIgb3BhY2l0eT0iMC4yIj48L3BhdGg%2BPHBhdGggZD0iTTIzOS4xOCw5Ny4yNkExNi4zOCwxNi4zOCwwLDAsMCwyMjQuOTIsODZsLTU5LTQuNzZMMTQzLjE0LDI2LjE1YTE2LjM2LDE2LjM2LDAsMCwwLTMwLjI3LDBMOTAuMTEsODEuMjMsMzEuMDgsODZhMTYuNDYsMTYuNDYsMCwwLDAtOS4zNywyOC44Nmw0NSwzOC44M0w1MywyMTEuNzVhMTYuMzgsMTYuMzgsMCwwLDAsMjQuNSwxNy44MkwxMjgsMTk4LjQ5bDUwLjUzLDMxLjA4QTE2LjQsMTYuNCwwLDAsMCwyMDMsMjExLjc1bC0xMy43Ni01OC4wNyw0NS0zOC44M0ExNi40MywxNi40MywwLDAsMCwyMzkuMTgsOTcuMjZabS0xNS4zNCw1LjQ3LTQ4LjcsNDJhOCw4LDAsMCwwLTIuNTYsNy45MWwxNC44OCw2Mi44YS4zNy4zNywwLDAsMS0uMTcuNDhjLS4xOC4xNC0uMjMuMTEtLjM4LDBsLTU0LjcyLTMzLjY1YTgsOCwwLDAsMC04LjM4LDBMNjkuMDksMjE1Ljk0Yy0uMTUuMDktLjE5LjEyLS4zOCwwYS4zNy4zNywwLDAsMS0uMTctLjQ4bDE0Ljg4LTYyLjhhOCw4LDAsMCwwLTIuNTYtNy45MWwtNDguNy00MmMtLjEyLS4xLS4yMy0uMTktLjEzLS41cy4xOC0uMjcuMzMtLjI5bDYzLjkyLTUuMTZBOCw4LDAsMCwwLDEwMyw5MS44NmwyNC42Mi01OS42MWMuMDgtLjE3LjExLS4yNS4zNS0uMjVzLjI3LjA4LjM1LjI1TDE1Myw5MS44NmE4LDgsMCwwLDAsNi43NSw0LjkybDYzLjkyLDUuMTZjLjE1LDAsLjI0LDAsLjMzLjI5UzIyNCwxMDIuNjMsMjIzLjg0LDEwMi43M1oiPjwvcGF0aD48L3N2Zz4%3D&logoColor=FFFCF0&labelColor=100F0F&color=66800B)](https://github.com/openchamber/openchamber/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/openchamber/openchamber?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgZmlsbD0iI2YxZWNlYyIgdmlld0JveD0iMCAwIDI1NiAyNTYiPjxwYXRoIGQ9Ik0xMjgsMTI5LjA5VjIzMmE4LDgsMCwwLDEtMy44NC0xbC04OC00OC4xOGE4LDgsMCwwLDEtNC4xNi03VjgwLjE4YTgsOCwwLDAsMSwuNy0zLjI1WiIgb3BhY2l0eT0iMC4yIj48L3BhdGg%2BPHBhdGggZD0iTTIyMy42OCw2Ni4xNSwxMzUuNjgsMThhMTUuODgsMTUuODgsMCwwLDAtMTUuMzYsMGwtODgsNDguMTdhMTYsMTYsMCwwLDAtOC4zMiwxNHY5NS42NGExNiwxNiwwLDAsMCw4LjMyLDE0bDg4LDQ4LjE3YTE1Ljg4LDE1Ljg4LDAsMCwwLDE1LjM2LDBsODgtNDguMTdhMTYsMTYsMCwwLDAsOC4zMi0xNFY4MC4xOEExNiwxNiwwLDAsMCwyMjMuNjgsNjYuMTVaTTEyOCwzMmw4MC4zNCw0NC0yOS43NywxNi4zLTgwLjM1LTQ0Wk0xMjgsMTIwLDQ3LjY2LDc2bDMzLjktMTguNTYsODAuMzQsNDRaTTQwLDkwbDgwLDQzLjc4djg1Ljc5TDQwLDE3NS44MlptMTc2LDg1Ljc4aDBsLTgwLDQzLjc5VjEzMy44MmwzMi0xNy41MVYxNTJhOCw4LDAsMCwwLDE2LDBWMTA3LjU1TDIxNiw5MHY4NS43N1oiPjwvcGF0aD48L3N2Zz4%3D&logoColor=FFFCF0&labelColor=100F0F&color=205EA6)](https://github.com/openchamber/openchamber/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join.svg?style=flat&labelColor=100F0F&color=8B7EC8&logo=discord&logoColor=FFFCF0)](https://discord.gg/ZYRSdnwwKA)

Run [AX Code](https://ax-code.ai) in a trusted desktop browser. Install the CLI, open `localhost:3000`, done.

Full project overview, screenshots, and all features: [github.com/openchamber/openchamber](https://github.com/openchamber/openchamber)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/openchamber/openchamber/main/scripts/install.sh | bash
```

Or install manually: `bun add -g @openchamber/web` (or npm, pnpm, yarn).

> **Prerequisites:** [AX Code CLI](https://ax-code.ai) installed, Node.js 20+.

## Usage

```bash
ax-code-app                          # Start on port 3000
ax-code-app --port 8080              # Custom port
ax-code-app --ui-password secret     # Password-protect UI
ax-code-app startup enable           # Start at login as a native service
OPENCHAMBER_UI_PASSWORD=secret ax-code-app startup enable # Save service password env
ax-code-app startup status           # Show startup service status
ax-code-app startup disable          # Remove startup service
ax-code-app tunnel help              # Tunnel lifecycle commands
ax-code-app tunnel providers         # Show provider capabilities
ax-code-app tunnel profile add --provider cloudflare --mode managed-remote --name prod-main --hostname app.example.com --token <token>
ax-code-app tunnel start --profile prod-main
ax-code-app tunnel start --provider cloudflare --mode quick
ax-code-app tunnel start --provider cloudflare --mode managed-local --config ~/.cloudflared/config.yml
ax-code-app tunnel status --all      # Show tunnel state across instances
ax-code-app tunnel stop --port 3000  # Stop tunnel only (server stays running)
ax-code-app logs                     # Follow latest instance logs
AX_CODE_PORT=4096 AX_CODE_SKIP_START=true ax-code-app                    # Connect to external AX Code server
AX_CODE_HOST=https://myhost:4096 AX_CODE_SKIP_START=true ax-code-app  # Connect via custom host/HTTPS
ax-code-app stop                     # Stop server
ax-code-app update                   # Update to latest version
```

`startup enable` snapshots your current environment into the native service so startup behaves like you launched `ax-code-app` from the same shell. This preserves provider tokens, PATH, SSH agent settings, and other CLI auth/config env vars. Use `--no-env-snapshot` for a minimal service env.

### Tunnel behavior notes

- One active tunnel per running AX Code App instance (port).
- Starting a different tunnel mode/provider on the same instance replaces the active tunnel.
- Replacing or stopping a tunnel revokes existing connect links and invalidates remote tunnel sessions.
- Connect links are one-time tokens; generating a new link revokes the previous unused link.

<details>
<summary>Connect to external AX Code server</summary>

```bash
AX_CODE_PORT=4096 AX_CODE_SKIP_START=true ax-code-app
AX_CODE_HOST=https://myhost:4096 AX_CODE_SKIP_START=true ax-code-app
```

| Variable | Description |
|----------|-------------|
| `AX_CODE_HOST` | Full base URL of external server (overrides `AX_CODE_PORT`) |
| `AX_CODE_PORT` | Port of external server |
| `AX_CODE_SKIP_START` | Skip starting embedded AX Code server |
| `OPENCHAMBER_AX_CODE_HOSTNAME` | Bind hostname for managed AX Code server (default: `127.0.0.1`, use `0.0.0.0` for LAN/remote access — trusted networks only) |
| `OPENCHAMBER_HOST` | Bind hostname for the AX Code App web server (default: `127.0.0.1`; use `0.0.0.0` for LAN/remote access — trusted networks only) |
| `OPENCHAMBER_VERBOSE_REQUEST_LOGS` | Set to `true` to log every HTTP request; disabled by default to keep user logs small |
| `OPENCHAMBER_SKIP_API_COMPRESSION` | Set to `true` to disable gzip compression for `/api/*` responses |
| `OPENCHAMBER_COMPRESS_API` | Set to `true` to force `/api/*` compression, or `false` to disable it. Desktop runtime disables API compression by default to reduce local sidecar CPU use |

</details>

<details>
<summary>Bind managed AX Code to LAN / Tailscale</summary>

```bash
OPENCHAMBER_AX_CODE_HOSTNAME=0.0.0.0 ax-code-app --port 3000
```

**Security note:** binding to `0.0.0.0` exposes the server on all network interfaces — use only on trusted networks and protect with firewall rules or `--ui-password`.

</details>

**Optional env vars:**
```yaml
environment:
  UI_PASSWORD: your_secure_password
  OPENCHAMBER_TUNNEL_MODE: quick # quick | managed-remote | managed-local
  OPENCHAMBER_TUNNEL_PROVIDER: cloudflare
```

For `managed-remote` mode, also set:

```yaml
environment:
  OPENCHAMBER_TUNNEL_MODE: managed-remote
  OPENCHAMBER_TUNNEL_HOSTNAME: app.example.com
  OPENCHAMBER_TUNNEL_TOKEN: <token>
```

For `managed-local` mode, you can set:

```yaml
environment:
  OPENCHAMBER_TUNNEL_MODE: managed-local
  OPENCHAMBER_TUNNEL_CONFIG: /home/openchamber/.cloudflared/config.yml
```

Managed-local path note: `OPENCHAMBER_TUNNEL_CONFIG` must use a container path under `/home/openchamber/...`. If the config file references `credentials-file`, ensure that JSON path is also mounted and reachable inside the container.

**Data directory:** mount `data/` for persistent storage. Ensure permissions:
```bash
mkdir -p data/openchamber data/ax-code/share data/ax-code/config data/ssh
chown -R 1000:1000 data/
```

</details>

<details>
<summary>Background & daemon mode</summary>

```bash
ax-code-app             # Runs in background by default
ax-code-app stop        # Stop background server
```

</details>

<details>
<summary>systemd service (VPN / LAN access)</summary>

Use `--foreground` to keep the CLI process alive so systemd (or any other process manager) can track and restart it. Combine with `AX_CODE_HOST` to connect to an AX Code instance running as a separate service.

**`~/.config/systemd/user/ax-code.service`**
```ini
[Unit]
Description=AX Code Server

[Service]
Type=simple
ExecStart=ax-code serve --port 4095
Environment="PATH=/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/home/YOU/.local/bin:/home/YOU/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
Environment=SSH_AUTH_SOCK=%t/ssh-agent.socket
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

> **Why set `PATH` and `SSH_AUTH_SOCK`?**
> systemd user services start with a minimal environment — no shell profile is sourced.
> Without an explicit `PATH`, AX Code won't find tools installed via Homebrew, npm, or `~/.local/bin`.
> Without `SSH_AUTH_SOCK`, git operations over SSH (push, pull, clone) will fail.
> `%t` expands to `$XDG_RUNTIME_DIR` (e.g. `/run/user/1000`), where most SSH agents write their socket.

**`~/.config/systemd/user/ax-code-app.service`**
```ini
[Unit]
Description=AX Code App Web Server
After=ax-code.service

[Service]
Type=simple
ExecStart=ax-code-app serve --port 3000 --host 0.0.0.0 --ui-password your-password --foreground
Environment="AX_CODE_HOST=http://localhost:4095"
Environment="AX_CODE_SKIP_START=true"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now ax-code ax-code-app
```

`--host 0.0.0.0` is required to listen on all interfaces (the default is `127.0.0.1`). Use `--host <ip>` or `OPENCHAMBER_HOST=<ip>` to bind to a specific interface instead.

</details>

## What makes the web version special

- **Controlled remote access** - Cloudflare tunnel support with quick, managed-remote, and managed-local modes
- **Trusted workstation workflow** - browser UI for local development and controlled enterprise access
- **Self-update** - update and restart from the UI, server settings stay intact
- **Cross-tab tracking** - session activity stays in sync across browser tabs
- **Secure connect links** - one-time tunnel tokens with explicit TTLs and revocation on replacement

## License

MIT
