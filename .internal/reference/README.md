# Reference Projects

Shallow clones of open-source projects consulted while designing AX Code Desktop.
Read-only references; do not import, vendor, or depend on any of these.

| Directory | Repo | GUI surface | What to learn from it |
| --- | --- | --- | --- |
| `openchamber/` | https://github.com/btriapitsyn/openchamber | **Native desktop (Electron)** — `packages/electron` | The upstream foundation this desktop was forked from. `desktop-v*` releases of AX Code Desktop are derived from this (NOTICE file). |
| `opencode/` | https://github.com/sst/opencode | **Multi-surface**: TUI (`packages/tui`, Solid-in-terminal), Web app (`packages/app`, Vite + Solid), Desktop (`packages/desktop`, Electron 44), Console (`packages/console`, Next.js) | Terminal-first AI coding agent with parallel web/desktop/console surfaces. Architecture for a single-binary agent with provider-agnostic LLM and tool execution; useful for worker-runtime patterns. |
| `continue/` | https://github.com/continuedev/continue | **Multi-surface, no native desktop**: Web GUI (`gui/`, Vite + React), VS Code extension (`extensions/vscode`), JetBrains extension (`extensions/intellij`), CLI (`extensions/cli`) | Open-source AI code assistant. Reference for cross-surface UX consistency and provider/model abstraction. |
| `goose/` | https://github.com/block/goose | **Native desktop (Electron)** — `ui/desktop` (Electron 43) on top of a Rust core (`crates/goose`) | Block's open-source AI agent desktop app. Strong reference for desktop agent UX, session/permission model, and extension points. |
| `cline/` | https://github.com/cline/cline | **Multi-surface, no native desktop**: VS Code extension (`apps/vscode`, the main product), CLI (`apps/cli`) | Largest installed base among AI coding agents. Reference for the agent/tool loop, prompt structure, and provider-agnostic tool calling. |
| `openhands/` | https://github.com/All-Hands-AI/OpenHands | **Native desktop (Electron)** — `electron/` (Electron 43) + React/TypeScript + Python backend | Autonomous multi-agent software engineer with a desktop shell over a Python backend. Reference for running coding work across projects and surfaces. |
| `aider/` | https://github.com/Aider-AI/aider | **None (terminal-only CLI)** — Python | Established AI pair-programming tool. Reference for repo-mapping, git-aware change application, and CLI-driven agent ergonomics. |
| `orca/` | https://github.com/stablyai/orca | **Native desktop (Electron 43)** — `src/main`, `src/renderer` (React), plus `mobile/` | Desktop for a fleet of coding agents. Each task runs in its own git worktree, with side-by-side sessions, diff review, and a terminal. Closest public precedent for multi-project supervision. |
| `codex/` | https://github.com/openai/codex | **TUI** — `codex-rs/tui` on a Rust core (`codex-rs/core`); `codex-rs/app-server` is the protocol a desktop shell consumes | OpenAI's local coding agent (Apache-2.0). `codex app` launches a separately installed desktop shell; that GUI is not in this tree. Reference for the agent loop, permissions, and app-server boundary. |
| `pi/` | https://github.com/earendil-works/pi | **TUI** — `packages/tui` and `packages/coding-agent` | Minimal extensible agent harness: unified provider API (`packages/ai`), agent loop, and terminal UI. Reference for packaging extensions, skills, and prompt templates. |

## How these are kept up to date

- All clones are shallow (`--depth=1`); no history beyond the latest commit on the default branch.
- Refresh manually when starting a new spike:
  `git -C .internal/reference/<repo> pull --depth=1 --ff-only`
- Treat these as read-only study material. Never run their tests or builds from this tree; clone fresh elsewhere if you need a buildable copy.

## Selection rationale

Filtered to projects that overlap AX Code Desktop on at least one of:
1. **AI coding desktop UX** (openchamber, goose, opencode desktop, openhands, orca)
2. **Multi-agent / portfolio orchestration** (openhands, orca)
3. **Agent loop and tool-calling patterns** (cline, aider, opencode, codex, pi)
4. **Cross-surface provider abstraction** (continue, opencode, pi)

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
| orca | — | — | — | — | Electron (React) + mobile |
| codex | Rust TUI | — | IDE extension (separate install) | — | desktop shell installs separately; not in this tree |
| pi | TypeScript TUI | — | — | — | — |

Five of these ten ship an in-tree native desktop — openchamber, opencode, goose, openhands, and orca — and AX Code Desktop sits in that camp. Codex and Pi are terminal agents with a study-worthy agent loop. Codex also defines the app-server a desktop shell talks to.

Notable adjacent projects intentionally NOT cloned (would need a different angle to be useful):
- Cursor / Windsurf (closed source)
- Devin / Factory Droid (closed source)
- Claude Code (public repo is under Anthropic commercial terms, not an open agent implementation)
- LangChain / LangGraph / AutoGen / CrewAI (general agent frameworks, not coding-specific)
