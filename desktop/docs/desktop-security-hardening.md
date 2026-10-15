# Desktop Security Hardening Plan

AX Code Desktop is moving toward a thin Electron shell. The renderer should stay a browser client for the local AX Code Desktop server, with Electron privileges exposed only through small, typed preload APIs.

## Current First Slice

- Main-window popup navigation is restricted to the local desktop server or the dev renderer origin.
- Main-window top-level navigation is now blocked with the same trusted-origin check; external URLs are opened with `shell.openExternal`.
- Startup diagnostics use a dedicated `recordStartupEvent` preload method instead of adding another generic renderer capability.

## Next Slices

1. Register a privileged `app://ax-code` protocol for packaged renderer assets.
2. Keep API, SSE, and WebSocket traffic on the loopback server until the protocol migration has parity tests.
3. Add a CSP for packaged renderer pages:
   - default to self
   - allow loopback `connect-src` for local API/SSE/WS
   - keep images/fonts/styles limited to local packaged assets and explicit data/blob cases already used by the app
4. Replace the Tauri-compatible generic Electron IPC shim with a typed allowlist once every Electron-supported command has a main-process handler or an explicit unsupported response.
5. Keep `contextIsolation: true` and `nodeIntegration: false`; do not expose Node or Electron modules to the renderer.
6. Add regression coverage for:
   - external navigation opens outside the trusted window
   - untrusted `window.open` is denied
   - preload rejects unknown Electron commands after the allowlist lands
   - packaged app loads under `app://ax-code` with CSP enabled

## macOS Keychain use

macOS may show this dialog on first run:

> "AX Code" wants to use your confidential information stored in "AX Code Safe Storage" in your keychain.

It is Chromium's own key, not the user's data:

- The item is `AX Code Safe Storage` / account `AX Code Key`, created by Chromium's
  OSCrypt the first time the app stores a cookie or local storage entry on disk.
  It holds a random string that encrypts that store at rest.
- The application never calls Electron's `safeStorage` API, so no setting,
  credential or file content of the user's is written to the Keychain.
- The item name follows the product name, which `config/desktop-identity.json`
  freezes. The wording of the dialog itself belongs to macOS and cannot be changed.
- `desktop/packages/electron/src/desktop-read-file-policy.js` separately refuses to
  read `~/.ssh`, `~/.aws`, keyrings, `Library/Keychains`, `.env*`, `*.pem` and `*.key`.

What to expect:

- The item exists once per machine and per app name. macOS asks whenever the
  binary that wants it is not the one that created it, which is the case for the
  first launch after an update that changed the code signature. "Always Allow"
  records the current signature, so it does not return for later updates signed by
  the same Developer ID. "Deny" is also safe: the app keeps running with an
  unencrypted store.
- Development passes `--use-mock-keychain`
  (`desktop/packages/electron/scripts/dev.mjs`), the same switch the headless smoke
  scripts already use, so a local run never reads or creates the app's Keychain item
  and never asks for the login password. It is a development-only argument and never
  reaches a packaged build.
- The release-signing Keychain items are `ax-minisign` / `ax-release` and the
  `notarytool` profile used by `desktop/scripts/minisign-artifacts.sh`. A prompt for
  those means a signing or packaging script is running, never the app.
