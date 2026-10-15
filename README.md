<h1 align="center">AX Code Desktop</h1>

<p align="center"><strong>See what needs you. Review the change. Send the next instruction.</strong></p>
<p align="center">The desktop workspace for <a href="https://github.com/defai-digital/ax-code">AX Code</a>.</p>

AX Code Desktop is the graphical app for local AX Code sessions. Add a project, talk to the agent,
review the diff, and use Git, files, and a terminal in the same window. The signed app includes the
pinned AX Code runtime, so a normal install does not need a separate CLI setup or a Node.js install.

Built by [DEFAI Digital](https://github.com/defai-digital).

[![Release](https://img.shields.io/github/v/release/defai-digital/ax-code-desktop?label=Release)](https://github.com/defai-digital/ax-code-desktop/releases/latest)
[![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon-000000?logo=apple&logoColor=white)](https://github.com/defai-digital/ax-code-desktop/releases/latest)
[![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?logo=windows&logoColor=white)](https://github.com/defai-digital/ax-code-desktop/releases/latest)
[![Ubuntu 24.04+ amd64/arm64](https://img.shields.io/badge/Ubuntu%2024.04%2B-amd64%20%2B%20arm64-E95420?logo=ubuntu&logoColor=white)](https://github.com/defai-digital/ax-code-desktop/releases/latest)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gf9UyPxaN2)

---

## Install

The release installer verifies the signed package, checks the platform, and keeps existing user data
and credentials. Close **AX Code** before you start. The installer stops if that app is still running.

This path does not require Node.js or Homebrew. On macOS and Ubuntu it asks for an administrator
password when it copies the app or installs the package.

### macOS (Apple Silicon)

macOS 13 or newer on Apple Silicon:

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

The app is installed at `/Applications/AX Code.app`. Open **AX Code** from Applications.

### Windows

Windows x64 (AMD64), PowerShell 5.1 or newer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://download.automatosx.com/ax-code-desktop/install.ps1 | iex"
```

The bootstrap checks the Authenticode signature, then opens the installer. Confirm the publisher is
**DEFAI Private Limited**. Start **AX Code** from the Start Menu under **DeFAI Digital**, or from the
desktop shortcut.

### Ubuntu 24.04+

Ubuntu Desktop 24.04 or newer, amd64 or arm64:

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

The package name is `ax-code-desktop`. Launch **AX Code** from the app menu, or run:

```bash
ax-code-desktop
```

### After install

1. Open **AX Code**.
2. Add a project folder.
3. Start or select a session.
4. Review the diff, Git state, files, and terminal from the same window.

Model providers are configured in the app. Install the [AX Code CLI](https://github.com/defai-digital/ax-code#install)
when you also want the terminal UI. The desktop app does not depend on that CLI being on `PATH`.

The installer follows the signed latest stable release. Release archives are checked with minisign
before they are installed. Pinned public key:

```text
RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO
```

## Manual packages

Download a specific release from
[GitHub Releases](https://github.com/defai-digital/ax-code-desktop/releases).
Each installer has a detached `.minisig`. The install commands above are the supported path: they
check the signature, size, and hash before anything is copied into place.

| Platform            | Installer                               | Portable                                      |
| ------------------- | --------------------------------------- | --------------------------------------------- |
| macOS Apple Silicon | `AX-Code-<version>-mac-arm64.dmg`       | `AX-Code-<version>-mac-arm64.zip`             |
| Windows x64         | `AX-Code-<version>-win-x64.exe`         | `AX-Code-<version>-win-x64.zip`               |
| Ubuntu amd64        | `AX-Code-<version>-linux-amd64.deb`     | `AX-Code-<version>-linux-x86_64.AppImage`     |
| Ubuntu arm64        | `AX-Code-<version>-linux-arm64.deb`     | `AX-Code-<version>-linux-arm64.AppImage`      |

**macOS.** Open the `.dmg` and drag **AX Code** into **Applications**. The release DMG is signed by
Developer ID Application: DEFAI PRIVATE LIMITED (team `N5ZUZDUJS6`) and notarized.

**Windows.** Run the `.exe`. Silent install:

```powershell
.\AX-Code-<version>-win-x64.exe /S
# Optional install directory. /D= must be the last argument.
.\AX-Code-<version>-win-x64.exe /S /D=C:\Program Files\AX Code
```

Uninstall from **Settings → Apps** or the Start Menu uninstall entry. For an extra signature check
in the download directory:

```powershell
$signature = Get-AuthenticodeSignature -LiteralPath ".\AX-Code-<version>-win-x64.exe"
$signature.Status
$signature.SignerCertificate.Subject
```

`Status` must be `Valid`, and the subject must contain `CN=DEFAI Private Limited`. Stop if the
signature is missing, invalid, or belongs to another publisher.

For the portable ZIP, extract the whole archive, then run `AX Code.exe` from the extracted folder.
Extract before launch so the app can find its bundled resources.

SmartScreen can still show **Windows protected your PC** for a newly released, correctly signed
build. Choose **More info → Run anyway** only after the file came from this repository's Releases
page and Windows shows **DEFAI Private Limited**. If Windows reports **Unknown publisher**, do not
run the file.

**Ubuntu.** Prefer the `.deb`:

```bash
sudo apt install ./AX-Code-<version>-linux-amd64.deb
```

AppImage, when you want the portable package:

```bash
chmod +x AX-Code-<version>-linux-x86_64.AppImage
./AX-Code-<version>-linux-x86_64.AppImage
```

If Ubuntu reports a missing FUSE library:

```bash
sudo apt install libfuse2t64
# or extract without FUSE:
APPIMAGE_EXTRACT_AND_RUN=1 ./AX-Code-<version>-linux-x86_64.AppImage
```

Alpine and other musl-based distributions are outside the supported set. macOS Intel and Windows
ARM64 have no current installer.

## Updates

On macOS, **AX Code → Check for Updates**. On Windows and Linux, the same item is in the **AX Code**
menu. The check looks up the newest stable `v*` release, then waits for you to download and install.

You can also run the install command for your platform again. Close **AX Code** first. The installer
replaces the app and leaves user data and credentials in place.

## What you can do

**Sessions.** Run AX Code chat in a full workspace, keep long-running work visible, branch a
conversation, and open a mini-chat window for one session.

**Git and review.** Stage, commit, push, pull, merge, and rebase. Read diffs inline or stacked,
switch branches and worktrees, and open a pull request from the review.

**Files and terminal.** Browse the project, inspect a large diff, and run a terminal in the project
directory next to the session.

**Desktop.** Native windows on macOS Apple Silicon, Windows x64, and Ubuntu Desktop 24.04+ (amd64
and arm64), with menu actions and a local runtime for the UI.

## Platforms

| Platform            | Desktop app | Installer                          | AX Engine local models                          |
| ------------------- | ----------- | ---------------------------------- | ----------------------------------------------- |
| macOS Apple Silicon | Supported   | Release installer or DMG           | On eligible Apple Silicon Macs                  |
| macOS Intel         | —           | No current installer               | —                                               |
| Windows x64         | Supported   | Release installer, EXE, or ZIP     | Use a hosted or OpenAI-compatible provider      |
| Windows ARM64       | —           | No current installer               | —                                               |
| Ubuntu 24.04+ amd64 | Supported   | Release installer, `.deb`, or AppImage | Use a hosted or OpenAI-compatible provider  |
| Ubuntu 24.04+ arm64 | Supported   | Release installer, `.deb`, or AppImage | Use a hosted or OpenAI-compatible provider  |

The UI, managed server, and native bridges listen on loopback. SSH instance switching, LAN binding,
and public tunnels are disabled.

## Languages

**Settings → Appearance → Language** sets the interface. The catalogs are English, Traditional
Chinese, Simplified Chinese, Japanese, Korean, French, German, Indonesian, Italian, Brazilian
Portuguese, Russian, Spanish, Turkish, and Vietnamese. Follow system language uses the OS preference
list and keeps its region for numbers and dates.

## Security

Install from the commands in this README or from
[defai-digital/ax-code-desktop releases](https://github.com/defai-digital/ax-code-desktop/releases).
Verify a manual download with the minisign public key above. See
[desktop/docs/MINISIGN.md](desktop/docs/MINISIGN.md) and [desktop/SECURITY.md](desktop/SECURITY.md).

Report vulnerabilities to [techsupport@defai.digital](mailto:techsupport@defai.digital). Do not open
a public GitHub issue for a security report.

## Development

Contributor checkouts need Node.js 24 or newer and pnpm 10.33.4 through Corepack. The workspace
does not build AX Code from a sibling checkout. Development uses `AX_CODE_BINARY` or an `ax-code`
binary on `PATH`. Packaged builds use the signed runtime pinned in `config/ax-code-runtime.json`.

```bash
corepack enable
pnpm install
pnpm run check:locales
pnpm run check:boundaries
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run dev
```

Quit any running AX Code desktop app before `pnpm run dev`. Development shares its single-instance
lock, so another running instance exits without opening a development window.

The renderer tries loopback ports **31440–31449**, starting at 31440. Vite reports the bound port
before Electron starts. If the whole range is busy, startup fails. To pin one port:

```bash
AX_CODE_DESKTOP_RENDERER_PORT=20000 pnpm run dev
```

That port is fixed. Startup fails when it is already taken. Defaults live in
`desktop/shared/dev-ports.json`.

### Launch and quit animations

The app picks one opening and ending pair per launch. Press Escape or **Skip animation** to dismiss
a clip. **Disable animations** persists the preference; the application menu can turn it back on.
Reduced-motion settings skip playback. For development or unattended runs:

```bash
AX_CODE_DESKTOP_ANIMATIONS=0 pnpm run dev
```

```bash
pnpm run check:launch-animations
pnpm run smoke:launch-animations
```

### Electron

Development and release builds pin Electron `44.7.0`. Package targets are macOS 13+ Apple Silicon,
Windows x64, and Ubuntu Desktop 24.04+ amd64/arm64. After an Electron upgrade, rebuild `node-pty`
and run the engine smokes:

```bash
pnpm --filter @ax-code/electron run rebuild:native
pnpm run smoke:electron-compatibility
pnpm run smoke:native-webmcp
```

`pnpm run release:preflight` prints a read-only release report. It does not publish or copy credentials.

Workspace notes for the UI, web runtime, and Electron shell are in [desktop/README.md](desktop/README.md).
Contribution setup is in [desktop/CONTRIBUTING.md](desktop/CONTRIBUTING.md).

## License

AX Code Desktop is licensed under the [Apache License, Version 2.0](LICENSE). Copyright (c) 2025-2026
[DEFAI Private Limited](https://github.com/defai-digital).

Portions derived from OpenChamber remain under the [MIT License](LICENSE-MIT). Upstream attribution
is in [NOTICE](NOTICE).
