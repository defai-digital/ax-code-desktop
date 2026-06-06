# AX Code Desktop

AX Code Desktop is the desktop UI for [AX Code](https://github.com/defai-digital/ax-code). It gives AX Code users a full workspace interface for chat sessions, file review, diffs, Git operations, terminals, project notes, and multi-agent workflows.

## Install On macOS

The recommended way to install on macOS is via Homebrew:

```bash
brew install --cask defai-digital/ax-code-desktop/ax-code-desktop
```

To update:

```bash
brew upgrade --cask ax-code-desktop
```

### Manual DMG (alternative)

If you prefer not to use Homebrew, download the latest DMG from the [Releases page](https://github.com/defai-digital/ax-code-desktop/releases):

1. Open the `.dmg` file.
2. Drag **AX Code Desktop** into **Applications**.
3. Launch **AX Code Desktop** from Applications.

If macOS says the app is damaged, run this in Terminal after installing:

```bash
xattr -cr "/Applications/AX Code Desktop.app"
```

## Install On Windows

### Installer (recommended)

1. Download the latest `.exe` installer from the [Releases page](https://github.com/defai-digital/ax-code-desktop/releases).
2. Run the installer.
3. Start **AX Code Desktop** from the Start Menu or Desktop shortcut.

### Portable ZIP

1. Download the latest Windows `.zip` from Releases.
2. Extract the entire ZIP folder.
3. Run `AX Code Desktop.exe` from the extracted folder.

Do not run the executable directly from inside the ZIP viewer — extract first so the app can find its bundled resources.

If Windows SmartScreen warns about an unknown publisher, click **More info → Run anyway** only if you downloaded from the official [Releases page](https://github.com/defai-digital/ax-code-desktop/releases).

## Before You Start

Install and sign in to the AX Code CLI first:

```bash
ax-code --version
```

If `ax-code` is not found, install AX Code before launching AX Code Desktop. The desktop app manages the local UI runtime but needs the AX Code CLI available for coding sessions.

## First Run

On first launch:

1. Confirm AX Code CLI is detected.
2. Add a project folder.
3. Start or select a chat session.
4. Use the Git, Files, Diff, Terminal, and Plan views as needed.

The app can run local AX Code sessions, connect to existing AX Code servers, and open focused mini-chat windows for active sessions.

## Updates

**macOS (Homebrew):**

```bash
brew upgrade --cask ax-code-desktop
```

**Windows / manual installs:** Download the latest installer or archive from the [Releases page](https://github.com/defai-digital/ax-code-desktop/releases). When auto-update metadata is available, the app can also check GitHub releases for updates automatically.

## What You Can Do

### Chat and Sessions

- Run AX Code chat sessions in a full workspace UI.
- Branch, fork, undo, and redo conversation turns.
- Queue messages and keep long-running sessions visible.
- Use plan/build workflows and project notes.
- Open mini-chat windows for focused work.

### Git and GitHub

- Stage files, commit, push, pull, merge, and rebase.
- Review diffs with inline or stacked views.
- Manage branches and worktrees.
- Create pull requests with generated descriptions.
- Recover from merge/rebase conflicts with guided UI state.

### Files and Terminal

- Browse and edit workspace files.
- Inspect large diffs without loading the whole workspace at once.
- Run integrated terminal sessions by project directory.
- Keep project actions and dev servers close to the chat context.

### Desktop

- Native desktop shell for macOS Apple Silicon and Windows x64.
- Multi-window workflows.
- Deep links and desktop menu actions.
- Local runtime management for the web UI.

## Platform Support

| Platform | Support | Install |
| --- | --- | --- |
| macOS Apple Silicon | Supported | Homebrew (recommended) or DMG |
| macOS Intel/x64 | Not supported | No artifact is built |
| Windows x64 | Supported | Installer or portable ZIP |
| Linux | Not supported | No artifact is built |
| Mobile/tablet browsers | Not supported | Blocked to reduce data-leakage risk |

## Security Notes

macOS users installing via Homebrew bypass Gatekeeper automatically — no extra steps needed.

For manual downloads, only use the official [Releases page](https://github.com/defai-digital/ax-code-desktop/releases). Windows SmartScreen may warn about unsigned builds; click **More info → Run anyway** if you trust the source.

AX Code Desktop is intended for trusted desktop workstations. Do not expose the development web UI publicly.

## Development Web UI

The web package is the local UI substrate used by development and desktop packaging. It is not a supported end-user distribution mode.

From a development checkout:

```bash
bun install
bun run build
bun run --cwd packages/web start -- --ui-password your-password
```

The web UI is available at `http://localhost:3000` by default.

## Development

Requirements:

- Bun 1.3.x
- Node.js 20+
- AX Code CLI

Useful commands:

```bash
bun install
bun run type-check
bun run lint
bun run test
bun run electron:dev
bun run electron:build
```

Package layout:

| Package | Purpose |
| --- | --- |
| `packages/ui` | Shared React UI, stores, hooks, and components |
| `packages/web` | Local web runtime used by development and desktop packaging |
| `packages/electron` | Current desktop shell |
| `packages/desktop` | Legacy Tauri shell, maintenance only |

## OpenChamber Compatibility

AX Code Desktop is based on the open-source [OpenChamber](https://github.com/openchamber/openchamber) project and is tailored for AX Code.

Some internal package names, storage keys, environment variables, and config paths still use `openchamber` for compatibility with existing data and upstream code. New user-facing releases are branded as **AX Code Desktop**.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
