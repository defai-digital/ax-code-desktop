# Desktop UI WebMCP development verification

Date: 2026-10-19. Scope: local, uncommitted development implementation; no publication or installed-app changes.
Contract: `../spec/SPEC-2026-10-19-desktop-ui-webmcp-v1.md`.
Developer instructions: `../../docs/development-webmcp.md`.

## Implemented behavior

The main renderer registers `ax_desktop_get_ui_state`, `ax_desktop_click` and `ax_desktop_fill` through native
`document.modelContext.registerTool` only after main-process developer opt-in. The packaged-app gate always disables
this surface. The existing website WebMCP consumer and runtime authority are not changed.

`dev:webmcp` runs the existing isolated-profile/stub-runtime launcher, keeps the app alive and prints a connection file.
Separate CLI processes can discover tools, read UI state, act on the latest control references and capture screenshots.
The CLI selects the exact recorded main renderer and native main-frame tools. No direct store, runtime, IPC or arbitrary
JavaScript action is exposed as a WebMCP tool. Defaults and unrelated in-progress runtime-pin/reference edits were preserved.

## Passing checks

- `pnpm --dir desktop/packages/ui run type-check`.
- `pnpm --dir desktop/packages/ui run test src/lib/desktopUiWebMcp.test.tsx`: 7 tests passed, including React controlled-input
  updates, stale/changed/disabled controls, sensitive input rejection, output bounds, opt-in gating and lifecycle cleanup.
- Focused Electron tests (`scripts/e2e/ui-webmcp-client.test.mjs`, `scripts/e2e/harness.test.mjs`,
  `src/webview-policy.test.mjs`): 29 tests passed. Covers default-off/inherited-env handling, packaged denial, main-frame
  catalog filtering, native response-before-ack races, tool failures and navigation invalidation.
- ESLint for all changed UI and Electron source/scripts/tests; `git diff --check`.
- Web renderer build and `pnpm run build` (Electron shell and native modules).
- `pnpm run check:boundaries`, including IPC, source ownership, source-text ratchet, runtime pin and release contract.

## Native and interactive evidence

`pnpm run e2e:desktop:webmcp -- --artifacts /tmp/ax-desktop-ui-webmcp-20261019` passed all five checks: boot, sandbox preload,
UI WebMCP journey, CSP and renderer exceptions. The journey uses native `WebMCP.enable` / `WebMCP.invokeTool` and response
events against the real built Electron renderer. All three tools were discovered and invoked. A tool click opened Settings;
filling its search field filtered React's actual navigation items; clearing the field restored them. Independent DOM
assertions checked the changes. Screenshot, console, stdout/stderr and results are in the artifacts directory.

An interactive `pnpm run dev:webmcp` session was also verified using separate CLI invocations. Reading UI returned current
control references; clicking Settings dispatched its real handler; a subsequent independent read reported
`settingsOpen: true` and the Settings heading. The immediate action snapshot could still show `false`, confirming why
asynchronous transitions must be checked with a later observation. The CLI screenshot was visually inspected at
`/tmp/ax-desktop-ui-webmcp-cli.png`.

The first interrupt check exposed incomplete cleanup when repeated process-group signals removed a one-shot signal handler
before teardown completed. The launcher now retains signal handlers through teardown. A new interrupt check confirmed its
temporary profile was removed and its processes exited. The first check's retained temporary profile was explicitly removed.

## Broader E2E qualification remains incomplete

Two ordinary `pnpm run e2e:desktop` runs were not fully green:

- `/tmp/ax-desktop-ui-webmcp-default-regression-20261019`: supervision-popout observed zero matching targets after a second
  open, and reload timed out waiting for Settings. The other journeys and CSP/renderer checks passed.
- `/tmp/ax-desktop-ui-webmcp-default-recheck-20261019`: pop-out and reload passed, but the permission-deny journey timed out
  waiting for its permission card. Other journeys and CSP/renderer checks passed.

These results establish intermittent failures in the current checkout's broader harness, not their baseline provenance.
No baseline checkout comparison was performed, and no unrelated supervision/permission behavior was changed to hide them.
Do not report the complete E2E suite as passing. The new development WebMCP journey passed; live model/runtime policy,
packaged release, native installation, upgrade and rollback were not qualified by this work.

## API reference

[Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) documents native registration.
The existing pinned Electron 44.9.0 native probe and actual app invocation were used to verify the local API behavior.
