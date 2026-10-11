# Development composer loading repair

## Failure and cause

The running Electron development renderer at `http://127.0.0.1:5173` kept the
composer's agent/model data in its loading state. Its preload bridge advertised
the web server at `http://127.0.0.1:58850` as the API origin. Requests to `/health`,
`/api/agent`, and `/api/config/providers` bypassed Vite's existing proxies and
failed browser CORS checks. Direct HTTP inspection returned 200 from both ports;
the backend was available. The web server intentionally grants renderer CORS to
`app://ax-code`, while the development renderer uses Vite's HTTP origin.

The `npm run dev` wrapper had launched the expected Electron/Vite processes.
The workspace's prescribed command remains `pnpm run dev`.

## Repair

`buildRendererApiOrigin` accepts the development renderer URL and uses its
validated loopback HTTP origin. The main, additional, and mini-chat window
creation paths pass that URL when preparing the preload environment. The
packaged protocol's backend proxy continues to resolve the web server port.

## Validation

- Electron tests: 56 files, 407 tests passed, including six added regression
  cases covering Vite/custom-port/IPv6 origins, no-development fallback, and
  rejected external or unsupported URLs.
- Workspace typecheck, Electron lint, all boundary checks, and main/preload/
  server bundling passed.
- A separate hidden Electron 45 beta window used the real bundled preload,
  context isolation, sandboxing, and enabled web security against the running
  Vite server. With the previous API origin, all three browser fetches failed
  with `Failed to fetch`. With the corrected API origin, all returned 200:
  health ready, 18 agents, six providers, and 25 models for the selected project.
  The probe logged only response counts and readiness, without credentials or
  provider configuration. Probe files are local under
  `.internal/reviews/dev-loading-2026-10-11/`.

The user's existing development process was preserved. Restarting development
is required to load the corrected main-process configuration; the existing
window was not claimed to have reloaded the fix.
