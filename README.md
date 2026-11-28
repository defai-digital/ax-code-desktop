<h1 align="center">AX Code Desktop</h1>

<p align="center"><strong>See what needs you. Review the change. Send the next instruction.</strong></p>
<p align="center">The desktop workspace for <a href="https://github.com/defai-digital/ax-code">AX Code</a>.</p>

<p align="center">
  <a href="https://github.com/defai-digital/ax-code-desktop/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/defai-digital/ax-code-desktop?label=Release"></a>
  <a href="https://github.com/defai-digital/ax-code-desktop/releases/latest"><img alt="macOS Apple Silicon" src="https://img.shields.io/badge/macOS-Apple%20Silicon-000000?logo=apple&logoColor=white"></a>
  <a href="https://github.com/defai-digital/ax-code-desktop/releases/latest"><img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows&logoColor=white"></a>
  <a href="https://github.com/defai-digital/ax-code-desktop/releases/latest"><img alt="Ubuntu 24.04+ amd64/arm64" src="https://img.shields.io/badge/Ubuntu%2024.04%2B-amd64%20%2B%20arm64-E95420?logo=ubuntu&logoColor=white"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://discord.gg/gf9UyPxaN2"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white"></a>
</p>

AX Code Desktop is the graphical app for local AX Code sessions. Add a project, talk to the agent, review the diff,
and use Git, files and a terminal in the same window. The signed app bundles the pinned AX Code runtime, so a normal
install needs neither a separate CLI nor Node.js.

Built by [DEFAI Digital](https://github.com/defai-digital).

**Contents:** [Install](#install) · [Updates](#updates) · [Features](#features) · [Platforms](#platforms) ·
[Security](#security) · [Development](#development) · [Documentation](#documentation) · [License](#license)

---

## Install

The release installer verifies the signed package, checks the platform and keeps existing user data and credentials.
It does not require Node.js or Homebrew.

> [!IMPORTANT]
> Quit **AX Code** before installing. The installer stops if the app is still running. On macOS and Ubuntu it asks
> for an administrator password when it copies the app or installs the package.

**macOS 13+ (Apple Silicon)** and **Ubuntu Desktop 24.04+ (amd64, arm64)**:

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

**Windows x64** (PowerShell 5.1 or newer):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm -UseBasicParsing https://download.automatosx.com/ax-code-desktop/install.ps1 | iex"
```

Where the app lands:

- **macOS** — `/Applications/AX Code.app`. Open **AX Code** from Applications.
- **Windows** — the bootstrap checks the Authenticode signature, then opens the installer. Confirm the publisher is
  **DEFAI Private Limited**. Start **AX Code** from the Start Menu under **DeFAI Digital** or from the desktop shortcut.
- **Ubuntu** — package `ax-code-desktop`. Launch **AX Code** from the app menu, or run `ax-code-desktop`.

### First run

1. Open **AX Code**.
2. Add a project folder.
3. Start or select a session.
4. Review the diff, Git state, files and terminal from the same window.

Model providers are configured in the app. Install the [AX Code CLI](https://github.com/defai-digital/ax-code#install)
only if you also want the terminal UI; the desktop app does not depend on it being on `PATH`.

### Manual packages

The install commands above are the supported path: they check the signature, size and hash before anything is copied
into place. To install a specific version, download it from
[GitHub Releases](https://github.com/defai-digital/ax-code-desktop/releases). Every installer has a detached
`.minisig` signature (see [Verify a download](#verify-a-download)).

| Platform            | Installer                           | Portable                                  |
| ------------------- | ----------------------------------- | ----------------------------------------- |
| macOS Apple Silicon | `AX-Code-<version>-mac-arm64.dmg`   | `AX-Code-<version>-mac-arm64.zip`         |
| Windows x64         | `AX-Code-<version>-win-x64.exe`     | `AX-Code-<version>-win-x64.zip`           |
| Ubuntu amd64        | `AX-Code-<version>-linux-amd64.deb` | `AX-Code-<version>-linux-x86_64.AppImage` |
| Ubuntu arm64        | `AX-Code-<version>-linux-arm64.deb` | `AX-Code-<version>-linux-arm64.AppImage`  |

<details>
<summary><strong>macOS</strong></summary>

Open the `.dmg` and drag **AX Code** into **Applications**. Release builds are signed by Developer ID Application:
DEFAI PRIVATE LIMITED (team `N5ZUZDUJS6`) and notarized.

</details>

<details>
<summary><strong>Windows</strong></summary>

Run the `.exe`. For a silent install:

```powershell
.\AX-Code-<version>-win-x64.exe /S
# Optional install directory. /D= must be the last argument.
.\AX-Code-<version>-win-x64.exe /S /D=C:\Program Files\AX Code
```

Check the signature before running a manual download:

```powershell
$signature = Get-AuthenticodeSignature -LiteralPath ".\AX-Code-<version>-win-x64.exe"
$signature.Status
$signature.SignerCertificate.Subject
```

`Status` must be `Valid` and the subject must contain `CN=DEFAI Private Limited`. Stop if the signature is missing,
invalid or belongs to another publisher.

- **Portable ZIP** — extract the whole archive, then run `AX Code.exe` from the extracted folder so the app can find
  its bundled resources.
- **SmartScreen** — a newly released, correctly signed build can still show **Windows protected your PC**. Choose
  **More info → Run anyway** only if the file came from this repository's Releases page and Windows shows
  **DEFAI Private Limited**. If Windows reports **Unknown publisher**, do not run the file.
- **Uninstall** — **Settings → Apps**, or the uninstall entry in the Start Menu.

</details>

<details>
<summary><strong>Ubuntu</strong></summary>

Prefer the `.deb`:

```bash
sudo apt install ./AX-Code-<version>-linux-amd64.deb
```

For the portable AppImage:

```bash
chmod +x AX-Code-<version>-linux-x86_64.AppImage
./AX-Code-<version>-linux-x86_64.AppImage
```

If Ubuntu reports a missing FUSE library:

```bash
sudo apt install libfuse2t64
# or run without FUSE:
APPIMAGE_EXTRACT_AND_RUN=1 ./AX-Code-<version>-linux-x86_64.AppImage
```

</details>

## Updates

Choose **AX Code → Check for Updates** (the **AX Code** menu on every platform). The app looks up the newest stable
`v*` release and waits for you to confirm the download and install.

You can also run the install command again. Quit **AX Code** first; the installer replaces the app and keeps user
data and credentials.

## Features

- **Sessions** — run AX Code chat in a full workspace, queue messages, keep long-running work visible, branch or fork
  a conversation and open a focused mini-chat window for one session.
- **Supervision** — Mission Control shows which sessions need you across projects; Review changes opens the current
  project's diff.
- **Git and review** — stage, commit, push, pull, merge and rebase; read diffs inline or stacked; switch branches and
  worktrees; open a pull request from the review.
- **Files and terminal** — browse and edit project files, inspect large diffs and run terminals in the project
  directory next to the session.
- **Scheduled tasks** — run prompts on a schedule on this computer while AX Code is running.
- **Project browser** — let the agent use the web app you are building through
  [WebMCP page tools](docs/webmcp-page-tools.md).

A fuller tour is in the [desktop workspace guide](desktop/README.md#features).

### Languages

**Settings → Appearance → Language** sets the interface language: English, Traditional Chinese, Simplified Chinese,
Japanese, Korean, French, German, Indonesian, Italian, Brazilian Portuguese, Russian, Spanish, Turkish and Vietnamese.
**Follow system language** uses the OS preference list and keeps its region for numbers and dates.

## Platforms

| Platform            | Desktop app   | Install options                        | AX Engine local models                     |
| ------------------- | ------------- | -------------------------------------- | ------------------------------------------ |
| macOS Apple Silicon | Supported     | Release installer, DMG or ZIP          | On eligible Apple Silicon Macs             |
| Windows x64         | Supported     | Release installer, EXE or portable ZIP | Use a hosted or OpenAI-compatible provider |
| Ubuntu 24.04+ amd64 | Supported     | Release installer, `.deb` or AppImage  | Use a hosted or OpenAI-compatible provider |
| Ubuntu 24.04+ arm64 | Supported     | Release installer, `.deb` or AppImage  | Use a hosted or OpenAI-compatible provider |
| macOS Intel         | Not supported | No current installer                   | —                                          |
| Windows ARM64       | Not supported | No current installer                   | —                                          |

Alpine and other musl-based distributions are not supported.

## Security

AX Code Desktop is **local-only**. The UI, managed server and native bridges listen on loopback. SSH instance
switching, LAN binding, reverse-proxy deployment and public tunnels are disabled at runtime.

### Verify a download

Install only from the commands above or from
[defai-digital/ax-code-desktop releases](https://github.com/defai-digital/ax-code-desktop/releases). Release
archives are checked with minisign before installation. To verify a manual download yourself:

```bash
minisign -V -P RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO \
  -m AX-Code-<version>-mac-arm64.dmg -x AX-Code-<version>-mac-arm64.dmg.minisig
```

Minisign proves integrity against the pinned key; it does not replace Apple notarization or Windows Authenticode.
See [Minisign](desktop/docs/MINISIGN.md) and the [security policy](desktop/SECURITY.md).

### Report a vulnerability

Email [techsupport@defai.digital](mailto:techsupport@defai.digital). Do not open a public GitHub issue for a security
report.

## Development

Contributor checkouts need **Node.js 26+** and **pnpm 10.33.4** (via Corepack). Development uses an `ax-code` binary
from `AX_CODE_BINARY` or `PATH`; packaged builds use the signed runtime pinned in
[`config/ax-code-runtime.json`](config/ax-code-runtime.json).

```bash
corepack enable
pnpm install
pnpm run dev      # quit any running AX Code app first
```

Setup details, the full check list, dev ports and Electron upgrade steps are in the
[contributing guide](desktop/CONTRIBUTING.md).

## Documentation

| Read this                                             | For                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [Documentation index](docs/README.md)                 | Every contributor, architecture, security and release guide |
| [Desktop workspace](desktop/README.md)                | Features, process model and package overview                |
| [Contributing](desktop/CONTRIBUTING.md)               | Development setup and submission checks                     |
| [Changelog](desktop/CHANGELOG.md)                     | Release history                                             |
| [User docs source](desktop/packages/docs/README.md)   | MDX source for the public documentation site                |

## License

AX Code Desktop is licensed under the [Apache License, Version 2.0](LICENSE). Copyright (c) 2025-2026
[DEFAI Private Limited](https://github.com/defai-digital).

Portions derived from OpenChamber remain under the [MIT License](LICENSE-MIT). Upstream attribution is in
[NOTICE](NOTICE).
