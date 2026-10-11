# Reference Projects

Shallow clones of open-source projects consulted while designing AX Coder.
Read-only references; do not import, vendor, or depend on any of these.

| Directory | Repo | GUI surface | What to learn from it |
| --- | --- | --- | --- |
| `openchamber/` | https://github.com/btriapitsyn/openchamber | **Native desktop (Electron)** — `packages/electron` | The upstream foundation this desktop was forked from. `desktop-v*` releases of AX Code Desktop are derived from this (NOTICE file). |
| `opencode/` | https://github.com/sst/opencode | **Multi-surface**: TUI (`packages/tui`, Solid-in-terminal), Web app (`packages/app`, Vite + Solid), Desktop (`packages/desktop`, Electron 44), Console (`packages/console`, Next.js) | Terminal-first AI coding agent with parallel web/desktop/console surfaces. Architecture for a single-binary agent with provider-agnostic LLM and tool execution; useful for worker-runtime patterns. |
| `continue/` | https://github.com/continuedev/continue | **Multi-surface, no native desktop**: Web GUI (`gui/`, Vite + React), VS Code extension (`extensions/vscode`), JetBrains extension (`extensions/intellij`), CLI (`extensions/cli`) | Open-source AI code assistant. Reference for cross-surface UX consistency and provider/model abstraction. |
| `goose/` | https://github.com/block/goose | **Native desktop (Electron)** — `ui/desktop` (Electron 43) on top of a Rust core (`crates/goose`) | Block's open-source AI agent desktop app. Strong reference for desktop agent UX, session/permission model, and extension points. |
| `cline/` | https://github.com/cline/cline | **Multi-surface, no native desktop**: VS Code extension (`apps/vscode`, the main product), CLI (`apps/cli`) | Largest installed base among AI coding agents. Reference for the agent/tool loop, prompt structure, and provider-agnostic tool calling. |
| `openhands/` | https://github.com/All-Hands-AI/OpenHands | **Native desktop (Electron)** — `electron/` (Electron 43) + React/TypeScript + Python backend | Autonomous multi-agent software engineer. Closest published precedent for the "multiple coding projects, exception-driven supervision" vision. |
| `aider/` | https://github.com/Aider-AI/aider | **None (terminal-only CLI)** — Python | Established AI pair-programming tool. Reference for repo-mapping, git-aware change application, and CLI-driven agent ergonomics. |

## How these are kept up to date

- All clones are shallow (`--depth=1`); no history beyond the latest commit on the default branch.
- Refresh manually when starting a new spike:
  `git -C .internal/reference/<repo> pull --depth=1 --ff-only`
- Treat these as read-only study material. Never run their tests or builds from this tree; clone fresh elsewhere if you need a buildable copy.

## Selection rationale

Filtered to projects that overlap AX Coder on at least one of:
1. **AI coding desktop UX** (openchamber, goose, opencode desktop, openhands)
2. **Multi-agent / portfolio orchestration** (openhands)
3. **Agent loop and tool-calling patterns** (cline, aider, opencode)
4. **Cross-surface provider abstraction** (continue, opencode)

## GUI surface summary

| Project | TUI | Web | VS Code ext | JetBrains ext | Native desktop |
| --- | --- | --- | --- | --- | --- |
| openchamber | — | — | — | — | Electron |
| opencode | Solid TUI | Vite/Solid + Next.js console | — | — | Electron |
| continue | — | Vite/React | yes | yes | — |
| goose | — | — | — | — | Electron (Rust core) |
| cline | — | — | yes (main product) | — | — |
| openhands | — | — | — | — | Electron + Python |
| aider | CLI only | — | — | — | — |

So 3 of 7 are native desktop (Electron) — openchamber, goose, openhands — and AX Coder/AX Code Desktop sits in that same camp. The other 4 are split between extensions, web apps, and terminal CLIs.

Notable adjacent projects intentionally NOT cloned (would need a different angle to be useful):
- Cursor / Windsurf (closed source)
- Devin / Factory Droid (closed source)
- LangChain / LangGraph / AutoGen / CrewAI (general agent frameworks, not coding-specific)
