# Verify Desktop UI changes with WebMCP

AX Code Desktop can expose its own UI as native WebMCP tools in an explicitly enabled, unpackaged development
instance. This is separate from [WebMCP page tools](webmcp-page-tools.md) (which let the agent use your web app in the
project browser).

These tools operate the rendered UI and its event handlers so agents can inspect controls, click them, fill ordinary
fields and capture DOM state and screenshots.

## Quick start: isolated development lab

Build the renderer and shell, then start the isolated lab:

```sh
pnpm --dir desktop/packages/web run build
pnpm run build
pnpm run dev:webmcp
```

The lab uses a temporary project/profile and a stub AX Code runtime (no model account required). It prints a
connection-file path and keeps the window open. In another terminal:

```sh
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json list
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_get_ui_state '{}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_click '{"ref":"REF_FROM_LATEST_STATE"}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_fill '{"ref":"REF_FROM_LATEST_STATE","value":"search text"}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json screenshot /tmp/desktop-ui.png
```

`Ctrl+C` in the lab terminal (or quitting its app) removes the temporary profile and stops its processes. Normal
startup leaves UI WebMCP tools off, and packaged builds always disable them. You can set `AX_CODE_DESKTOP_UI_WEBMCP=1`
for an unpackaged launch against your own profile/runtime, but the isolated lab is the default; never point browser
tools at an unrelated running Desktop instance.

## How the UI tools work

- **Read state first** and use its exact control references; every state read or successful action replaces those
  references.
- **Pagination** — controls are bounded to 100 rendered items per page (this is not a full accessibility tree). If
  `nextOffset` is non-null, pass it as `offset` to read the next page. An action preserves the current page.
- **Menus and selects** — open a select or menu and read state again to discover its ARIA options/menu items.
- **Input rules** — ordinary email, URL, telephone and number inputs support fill; read-only shortcut inputs support
  click-to-focus only; password, credential, payment and file fields cannot be filled; hidden, disabled, removed or
  renamed controls cannot be acted on. Fill leaves focus in the edited field; click another control to test blur
  validation.
- **Snapshots** include `configurationOverlayVisible` (reflects the rendered configuration notice; a dismissed notice
  reports `false` even if the operation is still pending) and `documentFocused` (check this before qualifying
  focus/blur behavior, as an inactive document can change `activeElement` without firing `blur`/`focusout`).
- **Async verification** — a successful click means the event was dispatched, not that the feature passed; read state
  again to verify asynchronous rendering. Native OS pickers, shadow trees, trusted user gestures, live model execution
  and pixel accuracy require separate checks.
- **Credential filtering** — Bearer/Basic schemes, `Authorization` headers and keys named `code`, `token`, `sig`,
  `password`, `secret` or `api_key` are filtered regardless of length. Use `status` rather than `code` for visible
  diagnostic status values.
- **Landing recap** — computes call totals, failures and uncalled page tools over all messages and calls in the latest
  turn; only the displayed step list is capped at 50 calls.

## Repeatable verification journeys

All journeys below run after `pnpm run build` using an isolated profile and stub/fixture runtime (no live model account
required, no user files modified). The Node client for additional journeys lives in
`desktop/packages/electron/scripts/e2e/ui-webmcp-client.mjs`.

### Core smoke and navigation

| Journey | Command | What it qualifies |
| --- | --- | --- |
| UI WebMCP smoke | `pnpm run e2e:desktop:webmcp -- --artifacts /tmp/ax-desktop-ui-webmcp` | Invokes all three native tools, opens Settings, filters navigation via WebMCP fill, verifies DOM, CSP and renderer errors. |
| Settings audit | `pnpm run e2e:desktop:settings-webmcp -- --artifacts /tmp/ax-desktop-settings-webmcp` | Inventories all 15 Settings tabs and paged controls, selects, numeric editing/reset, reversible preferences, shortcut search/focus, Hooks error/retry, light/dark/narrow views. |
| Workspace layout & navigation | `pnpm run e2e:desktop:workspace-ux -- --artifacts /tmp/ax-workspace-ux` | Projects before bounded starter list, starter disclosure, Files/sidebar handoffs, focused review and return, Portfolio, composer preservation, 1280/800px light/dark layouts. |
| Portfolio identity | `node desktop/packages/electron/scripts/e2e/portfolio-identity-webmcp.mjs --artifacts /tmp/ax-portfolio-identity` | Two same-name projects: distinct Needs You actions, Live sidebar (default/minimal), responsive sidebar at 800/600px, light/dark. |
| Projects Home | `node desktop/packages/electron/scripts/e2e/project-home-webmcp.mjs --artifacts /tmp/ax-project-home` | Same-name cards, project/draft selection, attention conversations, pin/reload persistence, narrow light/dark views. |
| Project switch | `node desktop/packages/electron/scripts/e2e/project-switch-session-webmcp.mjs --artifacts /tmp/ax-project-switch-session` | Switching active project from Settings clears stale session, polls new directory, reopens original conversation. |
| Supervision & review | `node desktop/packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs --artifacts /tmp/ax-supervision-workspace` | Mission Control, Workspace and repo review across two disposable Git repos: search, filters, Details, narrow Review layout (600–2800px light/dark). |
| Dashboard version routing | `node desktop/packages/electron/scripts/e2e/dashboard-version-webmcp.mjs --artifacts /tmp/ax-dashboard-versions` | Malformed runtime version uses legacy route; valid version + Refresh selects current route. |
| Git remote capability | `node desktop/packages/electron/scripts/e2e/git-remote-capability-webmcp.mjs --artifacts /tmp/ax-git-remote-capability` | Requests directory remote URL and offers matching identity in light/dark themes without mutating Git. |

### Settings, config and scheduled tasks

| Journey | Command | What it qualifies |
| --- | --- | --- |
| Settings navigation | `node desktop/packages/electron/scripts/e2e/settings-navigation-webmcp.mjs --artifacts /tmp/ax-settings-navigation` | Group/item order, exact-group and response-style search, empty/clear states, close/reopen, Hooks & Behavior shared Agents entry, narrow light/dark. |
| Config editors | `node desktop/packages/electron/scripts/e2e/config-editors-webmcp.mjs --artifacts /tmp/ax-config-editors` | Scope labels, command selectors, required-template validation, agent numeric clamping/clearing, narrow bounds (foregrounds window for blur validation). |
| Config update overlay | `node desktop/packages/electron/scripts/e2e/config-update-webmcp.mjs --artifacts /tmp/ax-config-update` | Compares native observations with DOM/center-hit testing during delayed accepted/rejected/retried saves and overlay dismissal. |
| Numeric focus | `node desktop/packages/electron/scripts/e2e/numeric-focus-webmcp.mjs --artifacts /tmp/ax-numeric-focus` | Compares foreground/background focus/blur event delivery with numeric read-back. |
| Shortcut capture | `node desktop/packages/electron/scripts/e2e/shortcut-capture-webmcp.mjs --artifacts /tmp/ax-shortcut-capture` | CDP keyboard events for Escape/Tab navigation, draft preservation, Tab capture, conflict overwrite, reload persistence. |
| Agent permissions | `node desktop/packages/electron/scripts/e2e/agent-permissions-webmcp.mjs --artifacts /tmp/agent-permissions` | Add/edit/reset unsaved rule overrides, restore global default, custom-rule bounds at 800px. |
| Hooks targets | `node desktop/packages/electron/scripts/e2e/hooks-targets-webmcp.mjs --artifacts /tmp/ax-hooks-targets` | Same-name Settings project targets, long-command expansion, scoped refresh/error/retry, late response handling. |
| AX Trust provider | `node desktop/packages/electron/scripts/e2e/ax-trust-provider-webmcp.mjs --artifacts /tmp/ax-trust-provider` | AX Trust category/setup with empty runtime catalog, URL/token form in light/dark (no credentials submitted). |
| MCP create | `node desktop/packages/electron/scripts/e2e/mcp-create-webmcp.mjs --artifacts /tmp/ax-mcp-create` | In-memory MCP HTTP interception: default/renamed creates, URL edits across inventory refresh, translated unsaved notice, narrow light/dark. |
| MCP save | `node desktop/packages/electron/scripts/e2e/mcp-save-webmcp.mjs --artifacts /tmp/ax-mcp-save` | Delayed save while switching projects, dirty-state readback, unchanged saves, narrow light/dark. |
| MCP delete | `node desktop/packages/electron/scripts/e2e/mcp-delete-webmcp.mjs --artifacts /tmp/ax-mcp-delete` | Delayed inventories, failed-load retry, scoped deletion (`--unselected` and `--replacement` modes). |
| Editor & catalog boundaries | `node desktop/packages/electron/scripts/e2e/editor-catalog-boundaries-webmcp.mjs --artifacts /tmp/ax-editor-catalog` | Command selection in scheduled-task editor, malformed Skills catalog read refusal before writes. |
| Project archive all | `node desktop/packages/electron/scripts/e2e/project-archive-all-webmcp.mjs --artifacts /tmp/ax-project-archive-all` | Project menu Archive all, cancel, archive + Undo, cross-project isolation, disabled empty-project state. |
| Project schedule targets | `node desktop/packages/electron/scripts/e2e/project-schedule-targets-webmcp.mjs --artifacts /tmp/ax-project-schedule-targets` | Two same-name projects with same-title tasks: collapse isolation, distinct editor prompts, new-task picker, narrow light/dark. |
| Scheduled task UX | `pnpm run e2e:desktop:scheduled-ux -- --artifacts /tmp/ax-scheduled-ux` | Empty guidance, task-intent order, pause/resume, weekly/one-time schedules, unchanged cron preservation, narrow light/dark. Also `scheduled-startup-webmcp.mjs` (startup error/retry), `scheduled-webmcp.mjs` (history/DST-gap refusal) and `scheduled-create-webmcp.mjs` (`--lost-ack`). |

### State, streaming and memory

| Journey | Command | What it qualifies |
| --- | --- | --- |
| Persistence boundaries | `node desktop/packages/electron/scripts/e2e/persistence-boundaries-webmcp.mjs --artifacts /tmp/ax-persistence-boundaries` | Seeds stale action fields, malformed preferences and obsolete navigation; verifies startup, Config metadata, Settings and clean reload. |
| Context panel state | `node desktop/packages/electron/scripts/e2e/context-panel-state-webmcp.mjs --artifacts /tmp/ax-context-panel-state` | Plain vs trailing-space project roots and literal filenames on POSIX: tab restore, select, close and reload. |
| Markdown streaming | `node desktop/packages/electron/scripts/e2e/markdown-stream-webmcp.mjs --artifacts /tmp/ax-markdown-stream` | Large CRLF message, incremental append and finalization through the Markdown Worker (40 unique headings, light/dark). |
| Markdown trace | `node desktop/packages/electron/scripts/e2e/markdown-trace-webmcp.mjs --runs 3 --sizes 100000,300000,500000 --artifacts /tmp/ax-markdown-trace` | Cold-document timing: last painted heading, Worker round trips, long tasks, finalization, re-theme, JS heap (`--fence-size` supported). |
| Chat reader scroll | `node desktop/packages/electron/scripts/e2e/chat-reader-scroll-webmcp.mjs --artifacts /tmp/ax-chat-reader-scroll` | Chromium wheel, `Shift+Space` and scrollbar drag during streaming append; verifies scroll hold and `End` re-pin. |
| Memory retention | `node desktop/packages/electron/scripts/e2e/memory-retention-webmcp.mjs --artifacts /tmp/ax-memory-retention` | Debug Panel retained-session budget and post-GC renderer heap across 5×200 background sessions (`AX_MEMORY_EXPECT_UNBOUNDED=1` for pre-fix comparison). |

### Notes on viewport and focus checks

- Viewport fixtures foreground the native main window, select reduced motion, deliver a resize notification after
  DevTools metric changes and wait for the left sidebar's rendered width to settle. They qualify settled layout, not
  animation timing.
- Narrower emulated viewports (such as 600px) are rendering stress cases, not a new native minimum-window-size promise.
- `Page.bringToFront` alone may not activate a different Electron native window; `numeric-focus-webmcp.mjs` uses the
  internal native main-window focus command (not exposed by WebMCP UI tools) for setup and restoration.
