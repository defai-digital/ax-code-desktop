# Desktop Security Hardening

AX Code Desktop runs a thin Electron shell where the renderer stays a browser client for the local AX Code Desktop
server and `ax-code` runtime, with Electron privileges exposed only through typed preload APIs.

## Implemented controls

- **Privileged packaged scheme & CSP** (`desktop/packages/electron/src/desktop-renderer-protocol.js`):
  - Packaged renderer assets are served from the privileged `app://ax-code` scheme (`PACKAGED_RENDERER_SCHEME` /
    `PACKAGED_RENDERER_HOST`).
  - Packaged pages receive a strict `Content-Security-Policy` (`buildPackagedRendererCsp`) restricting scripts, styles,
    fonts, and images to local packaged assets (with explicit inline script hashes and `data:`/`blob:` cases needed by
    the UI) and restricting `connect-src` to loopback origins.
- **Navigation and popup guards** (`desktop/packages/electron/src/renderer-navigation-policy.js`, `main.js`):
  - Main-window popup navigation is restricted to the local desktop server or the dev renderer origin.
  - Main-window top-level navigation is blocked with the same trusted-origin check; external URLs open via
    `shell.openExternal`.
- **Preload IPC allowlist & isolation** (`desktop/packages/electron/src/preload.js`, `preload-ipc-policy.js`):
  - `contextIsolation: true`, `nodeIntegration: false`, and sandboxed renderer/webview policies (`webview-policy.js`,
    `desktop-webmcp-browser.js`).
  - `DESKTOP_INVOKE_COMMANDS` in `preload-ipc-policy.js` enforces an explicit allowlist of main-process IPC handlers;
    unknown commands are rejected rather than forwarded.
  - Startup diagnostics use a dedicated `recordStartupEvent` preload method rather than a generic capability.
- **Sensitive path read policy** (`desktop/packages/electron/src/desktop-read-file-policy.js`):
  - Refuses to read `~/.ssh`, `~/.aws`, keyrings, `Library/Keychains`, `.env*`, `*.pem`, and `*.key`.

## macOS Keychain use

macOS may show this dialog on first run:

> "AX Code" wants to use your confidential information stored in "AX Code Safe Storage" in your keychain.

It is Chromium's own key, not the user's data:

- The item is `AX Code Safe Storage` / account `AX Code Key`, created by Chromium's OSCrypt the first time the app
  stores a cookie or local storage entry on disk. It holds a random string that encrypts that store at rest.
- The application never calls Electron's `safeStorage` API, so no setting, credential or file content of the user's is
  written to the Keychain.
- The item name follows the product name, which `config/desktop-identity.json` freezes. The wording of the dialog itself
  belongs to macOS and cannot be changed.

What to expect:

- The item exists once per machine and per app name. macOS asks whenever the binary that wants it is not the one that
  created it, which is the case for the first launch after an update that changed the code signature. **Always Allow**
  records the current signature, so it does not return for later updates signed by the same Developer ID. **Deny** is
  also safe: the app keeps running with an unencrypted store.
- Development on macOS passes `--use-mock-keychain` (`desktop/packages/electron/scripts/dev.mjs`), the same switch
  the headless smoke scripts use, so a local run never reads or creates the app's Keychain item and never asks for
  the login password. It is a development-only argument and never reaches a packaged build.
- Release-signing Keychain items are `ax-minisign` / `ax-release` and the `notarytool` profile used by
  `desktop/scripts/minisign-artifacts.sh`. A prompt for those means a signing or packaging script is running, never the
  app.
