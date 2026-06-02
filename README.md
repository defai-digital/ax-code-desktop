# AX Code App

A rich GUI interface for [AX Code](https://ax-code.ai). Review diffs, manage agents, run dev servers, and keep the big picture while your AI codes.

AX Code App is a fork of the open-source [OpenChamber](https://github.com/openchamber/openchamber) project, rebranded and tailored specifically for the AX Code CLI. It ships as a desktop app, a web server you can access from any browser, and a VS Code extension.

---

## What's different from OpenChamber?

| | AX Code App | OpenChamber |
|---|---|---|
| **Target CLI** | [AX Code](https://ax-code.ai) | Claude Code |
| **Branding** | AX Code App / DEFAI | OpenChamber |
| **CLI command** | `ax-code-app` | `openchamber` |
| **Config dir** | `~/.config/ax-code-app/` | `~/.config/openchamber/` |
| **Env vars** | `AX_CODE_*` | `OPENCHAMBER_*` |

> `OPENCHAMBER_*` environment variables and the `openchamber` CLI alias are kept for backwards compatibility.

---

## Quick Start

**Prerequisite:** [AX Code CLI](https://ax-code.ai) installed.

### Desktop (macOS)

Download from [Releases](https://github.com/openchamber/openchamber/releases).

### VS Code Extension

Search **AX Code App** in the Extensions panel.

### Web / PWA

```bash
curl -fsSL https://raw.githubusercontent.com/openchamber/openchamber/main/scripts/install.sh | bash
ax-code-app --ui-password your-password
```

<details>
<summary>More CLI options</summary>

```bash
ax-code-app --port 8080                  # Custom port
ax-code-app startup enable               # Start at login as a native service
ax-code-app tunnel start --provider cloudflare --mode quick --qr
ax-code-app tunnel start --provider cloudflare --mode managed-remote --hostname app.example.com --token <token>
ax-code-app logs                         # Follow latest instance logs
ax-code-app stop                         # Stop server
ax-code-app update                       # Update to latest

# Connect to an existing AX Code server
AX_CODE_PORT=4096 AX_CODE_SKIP_START=true ax-code-app
AX_CODE_HOST=https://myhost:4096 AX_CODE_SKIP_START=true ax-code-app
```

</details>

<details>
<summary>Docker</summary>

```bash
docker compose up -d
```

Available at `http://localhost:3000`.

```yaml
environment:
  UI_PASSWORD: your_secure_password
  OPENCHAMBER_TUNNEL_MODE: quick          # quick | managed-remote | managed-local
  OPENCHAMBER_TUNNEL_PROVIDER: cloudflare
```

</details>

<details>
<summary>systemd service (VPN / LAN access)</summary>

**`~/.config/systemd/user/ax-code.service`**
```ini
[Unit]
Description=AX Code Server

[Service]
Type=simple
ExecStart=ax-code serve --port 4095
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

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

</details>

---

## Features

### Chat & Interaction

- Branchable chat timeline with `/undo`, `/redo`, and one-click forks from any turn
- Multi-agent runs from one prompt with isolated worktrees for safe side-by-side comparisons
- Voice mode with speech input and read-aloud responses
- Plan/Build mode with a dedicated plan view for drafting and iterating steps
- Inline comment drafts on diffs, files, and plans
- Token usage, cost breakdowns, and raw message inspection

### Git & GitHub

- Full Git sidebar: staging, commits, push/pull, branch management, rebase/merge
- PR creation with AI-generated descriptions, status checks, and merge actions
- Start sessions from GitHub issues and pull requests with context attached
- Worktree integration with isolated sessions per branch

### Files, Diff & Terminal

- Workspace file browser with inline editing and syntax highlighting
- Diff viewer with stacked/inline modes and lazy loading for large changesets
- Integrated terminal with per-directory sessions and tabbed interface

### Web / PWA

- Cloudflare tunnel with quick, managed-remote, and managed-local modes
- QR code onboarding for mobile devices
- Mobile-optimized chat controls and keyboard-safe layouts
- Installable as a PWA

### Desktop (macOS)

- Connect to remote AX Code App instances over SSH
- Multi-window support for parallel project workflows
- Native macOS menu and deep-link handling

### VS Code Extension

- Open files from tool output, keep sessions beside your code
- Agent Manager for parallel multi-model runs
- Right-click actions: add context, explain selections, improve code in-place

### Customization

- 18+ built-in themes with light/dark variants
- Custom themes via JSON in `~/.config/openchamber/themes/`
- Configurable keyboard shortcuts, font size, spacing, and layout

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
