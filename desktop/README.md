# AX Code Desktop

AX Code Desktop is the desktop UI for [AX Code](https://github.com/defai-digital/ax-code). It gives AX Code users a workspace for chat sessions, file review, diffs, Git operations, terminals, project notes, and multi-agent workflows.

Install, update, and platform support for the signed app are in the repository [README](../README.md).

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://download.automatosx.com/ax-code-desktop/install.ps1 | iex"
```

The macOS and Ubuntu command is the same. Windows uses the PowerShell command and supports x64 only.
The signed app includes the pinned AX Code runtime. Close **AX Code** before installing. User data
and credentials are kept.

Releases are published from this repository as `v*` tags:
[defai-digital/ax-code-desktop](https://github.com/defai-digital/ax-code-desktop/releases).

## First run

1. Open **AX Code**.
2. Add a project folder.
3. Start or select a chat session.
4. Use the Git, Files, Diff, Terminal, and Plan views as needed.

The app runs sessions on the current machine and can open a mini-chat window for an active session.
Install the AX Code CLI only when you also want the terminal UI.

## Updates

**AX Code → Check for Updates** on macOS, or **AX Code → Check for Updates** in the application menu
on Windows and Linux. The check uses the newest stable `v*` release and waits for you to download
and install.

You can also run the install command again. Close the app first.

## What you can do

### Chat and sessions

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

### Files and terminal

- Browse and edit workspace files.
- Inspect large diffs without loading the whole workspace at once.
- Run integrated terminal sessions by project directory.
- Keep project actions and dev servers close to the chat context.

### Desktop

- Native desktop shell for macOS Apple Silicon, Windows x64, and Ubuntu Desktop 24.04+ amd64/arm64.
- Multi-window workflows.
- Deep links and desktop menu actions.
- Local runtime management for the web UI.

## Platform support

| Platform               | Support       | Install                                                         |
| ---------------------- | ------------- | --------------------------------------------------------------- |
| macOS Apple Silicon    | Supported     | Release installer or DMG                                        |
| macOS Intel/x64        | Not supported | No current installer                                            |
| Windows x64            | Supported     | Release installer, EXE, or portable ZIP                         |
| Windows ARM64          | Not supported | No current installer                                            |
| Ubuntu 24.04+ amd64    | Supported     | Release installer, `.deb`, or AppImage                          |
| Ubuntu 24.04+ arm64    | Supported     | Release installer, `.deb`, or AppImage                          |
| Mobile/tablet browsers | Not supported | Blocked to reduce data-leakage risk                            |

AX Engine local models run on eligible Apple Silicon Macs through the bundled runtime. Windows and
Ubuntu sessions use hosted providers or an OpenAI-compatible endpoint.

## Security notes

Install from the repository [README](../README.md) or the official
[Releases page](https://github.com/defai-digital/ax-code-desktop/releases). Release assets include
detached `.minisig` signatures that can be verified with this pinned public key:

```text
RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO
```

Windows installers are Authenticode-signed by **DEFAI Private Limited**. macOS releases are signed
by Developer ID Application: DEFAI PRIVATE LIMITED (team `N5ZUZDUJS6`) and notarized. A missing,
invalid, or unexpected publisher is a reason to stop.

The UI, managed server, SDK HTTP helpers, and native bridge servers are restricted to loopback
addresses. SSH instance access, remote host switching, LAN binding, mDNS discovery, reverse-proxy
deployment, and public tunnels are unsupported and disabled at runtime.

## Development web UI

The web package is the local UI substrate used by development and desktop packaging. It is not a
supported end-user distribution mode.

From a development checkout, at the repository root:

```bash
pnpm install
pnpm run build
pnpm --filter ax-code-desktop run start -- --ui-password your-password
```

The web UI prefers `http://localhost:3100` by default. If that port is busy, it scans upward and
uses the next safe free port.

## Development

Run development commands from the repository root. Requirements, the development port range, and
launch-animation switches are in the repository [README](../README.md).

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run check:boundaries
pnpm run build
pnpm run dev
```

Package layout:

| Package             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `packages/ui`       | Shared React UI, stores, hooks, and components              |
| `packages/web`      | Local web runtime used by development and desktop packaging |
| `packages/electron` | Desktop shell (Electron)                                    |

In `pnpm run dev`, the Electron main process spawns and supervises the ax-code runtime by default
(`AX_CODE_DESKTOP_SUPERVISE_RUNTIME=0` restores web-supervised mode). The Vite dev server routes
renderer API calls with the same longest-prefix table as the packaged `app://` handler:
runtime-shaped paths go to the ax-code runtime, and desktop-owned paths go to the web server.
See [CONTRIBUTING.md](./CONTRIBUTING.md#desktop-electron).

## Legacy compatibility notes

AX Code Desktop is the user-facing product name. The installed application name is **AX Code**.
Some internal package names, storage keys, environment variables, endpoint paths, and config
directories still use `openchamber` so existing installs and migrated data continue to work.

Treat those names as legacy compatibility details, not as the public product identity for new
docs, releases, or UI copy.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[Apache License 2.0](./LICENSE). AX Code Desktop is maintained by DEFAI Private Limited.

This project includes software derived from OpenChamber; those portions remain under the
[MIT License](./LICENSE-MIT). Upstream attribution is kept in [NOTICE](./NOTICE).
