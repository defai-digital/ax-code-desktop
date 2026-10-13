# WebMCP runtime repin and project-first UX

Date: 2026-10-13. Status: implemented locally and verified; publication is a separate gate.

## Why

The native WebMCP backend (Electron `WebContentsView` plus the CDP `WebMCP.*` adapter) was complete,
and the renderer already had an "Agent browser · WebMCP" toggle inside the context panel's browser
tab. The pinned runtime, however, was `7.24.4`, which predates the desktop browser provider. Every
"Enable agent access" click therefore failed with the compatibility error. The owner also asked for
MCP and WebMCP to be presented together, for adding a project to be obvious, and for the app to look
less like its OpenChamber ancestor.

Six reviewers (Codex, Grok, Muse, DeepSeek, GLM and MiniMax, all run headless in read-only mode
against this repository) critiqued the plan and then the implementation. Their consensus shaped the
scope: repin first with a real capability receipt, make the OS folder picker the primary way to add
a project, show real project activity instead of a decorative "Ready" dot, surface browser tools next
to MCP servers but keep the only on/off control inside the browser pane, and restyle only the touched
surfaces rather than the layout skeleton.

## Runtime pin: 7.24.4 to 7.25.1

- Release `v7.25.1` of `defai-digital/ax-code` (published 2026-10-13) is the first signed runtime whose
  tagged source contains `packages/ax-code/src/mcp/desktop-browser.ts`; `v7.24.4` does not.
- All four artifacts were downloaded with the GitHub CLI and verified with `minisign` against the
  committed public key `resources/keys/ax-minisign.pub` (SHA-256
  `41de2e31510ccfc6f3450d8de1e8ed59481413d00f8a58d65bddbc05042397b2`, identical to the release's
  `ax-minisign.pub`). Each trusted comment carried the matching SHA-256.

| Target | Size | SHA-256 |
| --- | --- | --- |
| darwin-arm64 | 157688854 | `e9a74aa600720e574a391a50b4d132ddbec3db02ad4ee3cb8a05d93c6c4ee181` |
| linux-arm64 | 85219180 | `f9eca2072e1aa8ec1a9679617116f478de0a551f9cdab7e68fa02ccd40bd9d6e` |
| linux-x64 | 86949908 | `0cf97eee74e75c5b80f11466aec7aa18fe9d3a81a3118f0d738fc8e8da8566f3` |
| win32-x64 | 93433444 | `89e0a67300ce418f4f31dd934d98c8a3d04c8c1d4c0d5c6a38beaf78738c8303` |

- Live receipt: the verified darwin-arm64 `7.25.1` binary was started in an isolated temporary home with
  a fresh Basic password, a random loopback port and a random 43-character
  `AX_CODE_DESKTOP_BROWSER_TOKEN`. `GET /desktop/browser/capability?directory=…` with the token
  returned `{"capability":"desktop.webmcp.v1"}` (HTTP 200). The same request with a wrong token, and
  with a correct token plus an `Origin` header, returned HTTP 403 "Desktop provider authorization
  required". No model requests were made.
- `pnpm run check:runtime-pin` and `pnpm run check:release-contract` pass; version-asserting tests
  were updated.
- The native engine smoke (`pnpm run smoke:native-webmcp`) passed on this host for Electron 44.7.0 /
  Chromium 152.0.7977.130 (disabled, enabled, enabled-repeat).

## What changed

Electron main
- `desktop-webmcp-browser.js`: a read-only `capability` command (absolute directory required) lets
  the renderer explain an old runtime before any browser exists. The renderer still cannot reach
  the provider token, the debugger or arbitrary commands.

Renderer
- `stores/useWebMcpBrowserStore.ts` holds the single projection of the native browser (phase,
  engine availability, runtime compatibility, agent access, origin, tool count, error code) plus an
  "agent mode requested" counter. `lib/webMcpSummary.ts` collapses it into one tone, state label
  and detail line used by every surface.
- `components/layout/EmbeddedWebMcpBrowser.tsx`: localized toolbar and status strip, explanation
  line ("The agent can call tools this page exposes. Each call still asks you first."), actionable
  error banner, capability probe, and Preview / Agent browser tabs that answer requests from the MCP
  surfaces. Agent access remains off for every fresh browser and is only switched here.
- `components/mcp/WebMcpBrowserTools.tsx`: the "Browser tools (WebMCP)" row above the server list in
  Services → MCP, the "This app" entry and card in Settings → MCP, and the shared open action.
- `components/chat/PermissionCard.tsx`: `webmcp` requests show the website first, then tool and
  operation, and say whether they came through this app's project browser. The card's hardcoded
  header and button labels were localized.
- `lib/projectOpen.ts`: one "open a folder" path for the home screen, sidebar, command palette, app
  menu, composer and Settings → Projects. On the desktop app it opens the OS picker directly, then
  registers the folder and opens a draft in it; elsewhere it falls back to the in-app dialog.
  `Cmd/Ctrl+O` is the new `open_project_folder` shortcut.
- `components/session/DirectoryExplorerDialog.tsx`: "Choose folder…" is the primary footer action;
  the dialog can open in clone mode through `sessionEvents.requestDirectoryDialog({ mode: "clone" })`.
- `components/projects/ProjectsHome.tsx` and `ChatEmptyState.tsx`: hero plus single-column inset list;
  rows derive activity from live sessions (`lib/projectStatus.ts`: running, waiting for approval,
  idle, session counts) and support arrow-key navigation. Because the app auto-opens a session
  draft, the same list also renders under the draft composer (`ChatContainer.tsx`), where picking a
  row retargets the draft to that project.
- `styles/design-system.css`: `.surface-inset`, `.surface-inset-row`, `.status-dot` utilities with a
  half-pixel ring and soft shadow, applied only to the touched surfaces.
- 67 new or changed strings in English and all 14 translated catalogs.

## Review rounds

Round one (plan) and round two (diff) each collected six independent reviews. Round two found
real defects that the green test suite had not caught, all fixed before the commit:

- Clone mode never opened because the dialog's open-reset effect overwrote the requested mode.
- The browser pane's 1 s status poll erased operation errors within a second, and a failed
  action was summarized as a healthy status; errors now persist on every surface until the next
  attempt, and three consecutive poll failures are needed before a disconnect is reported.
- Late replies from a previous browser lifecycle could write into the new browser's projection;
  every asynchronous write now checks a lifecycle counter.
- The preview pane persisting its URL on unmount recreated the native view and dropped agent
  access; the initial URL is now read through a ref.
- An unreachable runtime was cached as "incompatible" for a minute; the Electron probe now
  reports `reachable: false`, which the renderer treats as unknown and does not cache.
- Keyboard activation of the pin and new-session buttons also opened the row; rows now ignore
  keys that originate from their inner buttons, use a single roving tab stop and button semantics.
- The Settings card's own unmount effect cleared its selection under React StrictMode; the MCP
  sidebar owns that reset now.
- The Services menu stayed open over the focused browser; it closes after "Open project browser".
- The capability probe only ran once the pane mounted; the dropdown row and the Settings card
  probe too, so an old runtime is explained before any browser exists.
- Sessions in managed worktrees outside the project folder were attributed to no project; the
  worktree's recorded project root now wins, and path identity reuses `projectResolution`.
- Remaining hardcoded English in the permission card (header, buttons, replace-all, response
  format, always-allow prefix) was localized, and the native picker title is localized.
- "Browser tools (WebMCP)" was renamed "Project browser (WebMCP)" so it is not confused with AX
  Code's pre-registered `webmcp` MCP server (the Chrome bridge) listed right below it.

## Verification

- `pnpm run typecheck`, `pnpm run lint` (UI), `pnpm run check:boundaries` (all eleven checks),
  `pnpm run check:locales` (14 locales, 4,394 keys): passed.
- Electron WebMCP tests: 15 passed (10 existing, 5 new capability-probe tests).
- UI test suite: 1,718 tests passed, including the new `webMcpSummary`, `projectStatus` and
  permission-presentation tests.
- Visual probe: a plain Electron window loaded the running dev UI and captured the home with the
  live project list under the composer, the add-project dialog in browse and clone modes, the
  Services → MCP row and the Settings → MCP card. Outside the desktop shell those surfaces correctly
  report "Available in the AX Coder desktop app".
- Full `pnpm run test` and `pnpm run build` results are recorded in the commit message.

## Limits

- The capability receipt proves the pinned runtime accepts the desktop provider; it is not a signed
  packaged installation, upgrade or rollback qualification, and it does not change the release
  policy state.
- Agent-mode enrollment still requires an active coding session; the draft state cannot enroll a
  browser, and the pane says so.
- "Recently closed" projects and drag-and-drop folder adding were deliberately left out: there is no
  closed-project model, and a window-level drop collides with the composer's file attachment drop.
- Internal `openchamber:*` event names, storage keys and configuration paths are unchanged to preserve
  user-data continuity.
