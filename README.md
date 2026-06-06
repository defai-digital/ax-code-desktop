# AX Code App

AX Code App is the desktop UI for [AX Code](https://github.com/defai-digital/ax-code). It gives AX Code users a full workspace interface for chat sessions, file review, diffs, Git operations, terminals, project notes, and multi-agent workflows.

The easiest way to use it is the desktop app from GitHub Releases.

## Download

Get the latest release from:

https://github.com/defai-digital/ax-code-app/releases

Current direct downloads:

- [Download macOS Apple Silicon DMG](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop-0.6.6-arm64.dmg)
- [Download Windows x64 portable ZIP](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop-0.6.6-win.zip)
- [Download Windows x64 installer](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop.Setup.0.6.6.exe)

### Which file should I use?

| Platform | Recommended download | Use when |
| --- | --- | --- |
| macOS Apple Silicon | [`.dmg`](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop-0.6.6-arm64.dmg) | Normal install. Open the DMG, drag AX Code Desktop to Applications, then launch it. |
| macOS Apple Silicon | [`.zip`](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop-0.6.6-arm64-mac.zip) | Alternative manual install or update artifact. Extract it, move the app to Applications, then launch it. |
| Windows x64 | [`.exe` installer](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop.Setup.0.6.6.exe) | Normal install. Runs the setup wizard and creates Start Menu/Desktop shortcuts. |
| Windows x64 | [`.zip` portable build](https://github.com/defai-digital/ax-code-app/releases/download/v0.6.6/AX.Code.Desktop-0.6.6-win.zip) | No installer. Extract the whole folder and run `AX Code Desktop.exe` from the extracted folder. |
| Linux | Not supported | There is no Linux desktop binary in this release line. |

macOS Intel/x64 is not supported. Use an Apple Silicon Mac for the desktop build.
Mobile and tablet browsers are not supported for AX Code Desktop.

## Before You Start

Install and sign in to the AX Code CLI first:

```bash
ax-code --version
```

If `ax-code` is not found, install AX Code before launching AX Code App. The desktop app manages the local UI runtime, but it still needs the AX Code CLI available for coding sessions.

## Install On macOS

1. Download the latest Apple Silicon `.dmg` from Releases.
2. Open the DMG.
3. Drag **AX Code Desktop** into **Applications**.
4. Launch **AX Code Desktop** from Applications.
5. Choose or add a project folder.

If macOS shows a security warning, the build may be unsigned or not notarized. Use **Right click -> Open** on the app, or approve it in **System Settings -> Privacy & Security**. Signed and notarized releases open normally.

## Install On Windows

### Installer

1. Download the latest `.exe` installer from Releases.
2. Run the installer.
3. Choose the install location if prompted.
4. Start **AX Code Desktop** from the Start Menu or Desktop shortcut.

### Portable ZIP

1. Download the latest Windows `.zip` from Releases.
2. Extract the entire ZIP folder.
3. Run `AX Code Desktop.exe` inside the extracted folder.

Do not run the executable directly from inside the ZIP viewer. Extract the ZIP first so the app can find its bundled resources.

If Windows SmartScreen warns that the app is from an unknown publisher, the release may be unsigned. Click **More info -> Run anyway** only if you downloaded it from the official GitHub release page.

## First Run

On first launch:

1. Confirm AX Code CLI is detected.
2. Add a project folder.
3. Start or select a chat session.
4. Use the Git, Files, Diff, Terminal, and Plan views as needed.

The app can run local AX Code sessions, connect to existing AX Code servers, and open focused mini-chat windows for active sessions.

## Updates

Desktop releases are published on GitHub. The release can include:

- macOS `.dmg` and `.zip`
- Windows installer `.exe`
- Windows portable `.zip`
- update manifests such as `latest-mac.yml` and `latest.yml`

When desktop auto-update metadata is available, the app can check GitHub releases for updates. If auto-update is not available in your environment, download the newest installer or archive manually from Releases.

## Development Web UI

The web package is kept as the local UI substrate used by development and desktop packaging. It is not a supported end-user distribution mode, and it is not a PWA/mobile product.

From a development checkout:

```bash
bun install
bun run build
bun run --cwd packages/web start -- --ui-password your-password
```

Common options:

```bash
ax-code-app --port 8080
ax-code-app --ui-password your-password
AX_CODE_HOST=http://localhost:4095 AX_CODE_SKIP_START=true ax-code-app
```

The web UI is available at `http://localhost:3000` by default.

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

## Security Notes

Only download desktop builds from the official Releases page:

https://github.com/defai-digital/ax-code-app/releases

Unsigned builds can still run, but macOS Gatekeeper or Windows SmartScreen may warn before launch. Code signing improves trust prompts, but the app can still be distributed as DMG, installer, and ZIP without certificates.

AX Code Desktop is intended for trusted desktop workstations. Do not expose the development web UI publicly, and do not use mobile or tablet browsers for enterprise workspace access.

## Platform Support

| Platform | Desktop support | Notes |
| --- | --- | --- |
| macOS Apple Silicon | Supported | DMG and ZIP release artifacts. |
| macOS Intel/x64 | Not supported | No desktop artifact is built. |
| Windows x64 | Supported | Installer and portable ZIP release artifacts. |
| Linux | Not supported | No desktop artifact is built. |
| Mobile/tablet browsers | Not supported | Blocked to reduce enterprise data-leakage risk. |

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
| `packages/docs` | Documentation source |

## OpenChamber Compatibility

AX Code App is based on the open-source [OpenChamber](https://github.com/openchamber/openchamber) project and is tailored for AX Code.

Some internal package names, storage keys, environment variables, and config paths still use `openchamber` for compatibility with existing data and upstream code. New user-facing releases are branded as **AX Code App** / **AX Code Desktop**.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
