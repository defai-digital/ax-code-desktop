# Desktop end-to-end harness v1

Status: Accepted for implementation on 2026-10-19.
PRD: PRD-2026-10-19-competitive-quality-v1.

## 1. Decision on tooling

The harness drives Electron over the Chrome DevTools Protocol (CDP) with Node's built-in `fetch` and `WebSocket`. It adds
no dependency. Playwright is not installed in this workspace, the lockfile is frozen in CI, and the existing smoke scripts
and manual verification already use CDP. Adopting Playwright later needs only a new driver behind the same journey API.

## 2. Command and layout

- `pnpm run e2e:desktop` runs `desktop/packages/electron/scripts/e2e/run.mjs`.
- Default target: the unpackaged build (`desktop/packages/electron` after `pnpm run build`). `--app <path>` targets a
  packaged macOS `.app`, which exercises the `app://` renderer protocol.
- Modules under `scripts/e2e/`: `cdp.mjs` (CDP client), `launch.mjs` (isolated launch and teardown), `stub-runtime.mjs`
  (stub `ax-code serve` reporting the pinned runtime version), `journeys.mjs` (checks), `csp.mjs` (header parsing) and
  `run.mjs` (entry). `harness.test.mjs` covers the pure helpers and runs with the Electron package's Vitest suite.

## 3. Isolation

- Temporary `--user-data-dir` and `AX_CODE_DESKTOP_DATA_DIR`; `--use-mock-keychain` on macOS;
  `AX_CODE_DESKTOP_DISABLE_AUTO_UPDATE=1`. A packaged target is copied with a unique bundle identifier (the packaged
  smoke's helper), so it runs beside an installed AX Code. Inherited renderer-URL and runtime-path variables are removed.
- `AX_CODE_BINARY` points at the stub runtime, so no real sessions, models or credentials are touched.
- A free `--remote-debugging-port` bound to `127.0.0.1`. The harness never attaches to another instance.
- Teardown kills only the processes it started, by PID, and removes the temporary directory.

## 4. Journeys (v1)

1. **Boot:** the main page target renders the app shell: `#root` has a child other than the `#initial-loading` gate.
2. **Preload bridge:** the sandboxed preload exposes its bridge in the main world, and Node globals (`require`, `process`
   with `versions.node`) are absent from the main world.
3. **CSP clean:** the main document's CSP has no `'unsafe-eval'` (and, for `app://`, no `'unsafe-inline'` scripts), and
   no `securitypolicyviolation` event or CSP console message occurs. A recorder installed with
   `Page.addScriptToEvaluateOnNewDocument` sees the whole load: the harness waits for main's first load, then reloads.
4. **Settings:** the `mod+comma` shortcut opens the settings view (`[data-settings-view]`).

Each journey returns `{ name, ok, detail }`. The run exits non-zero if any journey fails and writes stdout, stderr,
console messages and a screenshot to `--artifacts <dir>` when given.

## 5. CI

The `packaged-macos-smoke` job in `desktop-ci.yml` already builds and packages the app. After the packaged smoke it runs
the harness twice, against the unpackaged build (loopback web-server CSP) and the packaged `.app` (`app://` CSP), as
`continue-on-error` steps, and uploads artifacts when either fails. It is not a required check in v1. Promotion to a
required check, and to a release gate under ADR-012, follows two weeks of flake data.

## 6. Out of scope for v1

Real model calls, permission approval against a live runtime, worktree creation (moves to the runtime under Phase 2),
visual baselines and update installation. They are planned journeys once the stub runtime grows the needed routes.
