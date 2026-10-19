# Supervision pop-out window v1

Status: Accepted for implementation on 2026-10-19.
PRD: PRD-2026-10-19-supervision-v3. Amends SPEC-2026-09-02-desktop-process-model by adding one renderer window type.

## 1. Window

- New renderer entry `desktop/packages/web/supervision.html` with `src/supervision-main.tsx`, added to the Vite
  `build.rollupOptions.input` beside `miniChat`. It renders `renderElectronSupervisionApp` from
  `@openchamber/ui/apps/renderElectronSupervisionApp`, which mirrors the mini-chat app shell (locale, theme, auth gate,
  runtime API provider, sync provider) and renders Mission Control in pop-out mode.
- Main process: `createSupervisionWindow()` in its own module `electron/src/supervision-window.js` (not inlined into
  `main.js`). It uses `rendererWebPreferences()`, the shared window chrome, the webview policy, a deny-all window-open
  handler and the renderer navigation guards, exactly like the mini-chat window. Default size 960×720, minimum 640×480.
  It loads `${localRendererOrigin()}/supervision.html` with `loadUrlWithTimeout`; a failed load destroys the window.
- Single instance: a module-level reference; if a live window exists, `restore()`/`show()`/`focus()` it instead.
- The packaged `app://` protocol and the web server already serve any built HTML file; no route change.

## 2. IPC

- New command `desktop_open_supervision_window`, args `none`, `safeForRemote: false`, added to
  `desktop-ipc-contract.json`, the preload allowlist policy if it enumerates commands, and `main.js` via `handleCommand`.
- Opening a session from the pop-out calls the existing `desktop_focus_main_window` with `{ sessionId, directory }`.

## 3. Renderer

- `MissionControl` accepts `variant?: "embedded" | "popout"` (default `embedded`). In `popout`:
  - the open-session action calls `desktop_focus_main_window` instead of `openSupervisedSession`;
  - "open beside chat" and "close board" controls are hidden; the pop-out button is hidden;
  - the board fills the window.
- `MissionControlHeader` shows a pop-out button (embedded variant only, Electron only) that invokes
  `desktop_open_supervision_window`. A command-palette entry does the same.
- The pop-out keeps working when the main window is closed; opening a session then recreates the main window through the
  existing handoff.
- New i18n keys go into `en.ts` and every locale catalog.

## 4. Tests

- `supervision-window.test.mjs`: preferences use the shared factory (sandboxed), single-instance focus, load failure
  destroys the window, URL is `supervision.html`.
- UI tests: pop-out variant routes open-session through the desktop command and hides embedded-only controls; header
  button invokes the open command; command palette entry exists.
- IPC contract check passes. End-to-end: a journey invokes the command and finds a page target at `supervision.html`
  whose DOM renders the board.
