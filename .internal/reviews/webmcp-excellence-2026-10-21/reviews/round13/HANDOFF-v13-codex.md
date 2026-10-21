# WX-15 steps 1–6 handoff

Date: 2026-10-21. Branch: `wx15-view-pool`. Base: `cbb21705`.
Status: local implementation; no commit, push, packaging or publication performed.

## Scope and source verification

The controlling record is `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md`,
“WX-15 design”. `WX15-PLAN.md` was treated as a read-only draft and left unchanged.
The implementation follows steps 1–6. No page switcher, waiting chips, Needs you integration,
session-grid surfaces, LRU unloading/reloading, W7 journey or three-platform qualification was added.
Existing Mission Control and review-recap readers were adapted to keyed data without adding surfaces.

Verified draft corrections:

- The old main-process registry was keyed by sender/window and closing a page cleared its window profile.
  The new pool uses normalized absolute project paths plus session IDs. UUIDs remain the only IPC handles.
- LRU belongs to the deferred step 8. The pool instead rejects a new identity with `pool-full` at its live limit.
  `maxLiveViews` is a constructor option, defaults to 4, and accepts integers from 1 through 8.
- Electron profiles remain one per visited project for the application lifetime, rather than one per open/session.
  No profile is automatically cleared on close, session switching or revocation. Clearing cannot reclaim an Electron Session.
  The draft's suggestion to clear evicted projects was not adopted.
- Enrollment ownership validation does not require a new runtime endpoint: the pinned SDK exposes authenticated
  `GET /session/{sessionID}` and its `id`, `directory`, and `projectID` response fields. These are checked before POSTing
  enrollment, and the returned provider must match that authoritative project ID. No SDK/runtime pin changed.
- The wire request has `projectID`, not a directory/project-key field. Dispatch checks that project ID against both
  the enrolled connection and the project resolved from the session, in addition to provider ID, epoch and session ID.

## Implemented steps

1. **Pool and ownership.** Multiple project/session entries coexist, including two enrolled sessions in one window.
   A window has one selected view and at most one attached child. Native initialization temporarily detaches the
   selected page, attaches the initializing view at zero size, then restores the selection. Creates are serialized
   across windows and reuse an existing identity owned by the same sender. Cross-window handle access is rejected.
   Closing a window or losing its renderer closes its entries and removes their owner/sender listeners.
2. **Project storage.** An in-memory partition is derived from the SHA-256 hash of the normalized project identity.
   Same-project sessions share it; different projects do not. Hardened permission, download, navigation and popup
   handlers remain in force and are installed once per project profile. `clearProject` closes that project's guests
   before wiping storage. Clears and creates use the same serialized mutation queue; clear failures propagate.
3. **Additive IPC.** The existing local-only `desktop_webmcp_browser` channel supports `list` and `show`.
   Status adds `directory`, `sessionID`, `visible`, `waiting`, and `lastUsed` while retaining its old fields.
   `list` returns `{ views: [...] }` for the owning sender. `create` followed by `bounds` still works for an old renderer.
   The JSON action contract, generated renderer argument types, native action allowlist, IPC checks and argument tests agree.
4. **Visible-to-act gate.** After validating identity, a hidden view holds one request, stops polling and exposes `waiting`.
   Showing a different view cannot release it. Its own shown page must have nonzero bounds in a visible, unminimized window.
   The original deadline is retained. Expiry replies with `status: "Error"` and
   `output.reason: "waiting-for-visible-timeout"`; an already-expired visible call uses `request-deadline-exceeded`.
   `output` is an existing SDK reply field, avoiding an invented runtime schema. Hide does not revoke page references
   or enrollment; it cancels in-flight page work. Explicit pause/disconnect/revocation abort waiting work and remove its timer.
5. **Session enrollment and revocation.** `revokeSession { directory, sessionID }` disconnects only that identity.
   Other providers, document generations, pages and project storage remain intact. The surviving provider can still
   execute its own request. Explicit `pause` retains the page but revokes access; `resume` performs fresh validation/enrollment.
   Runtime changes still revoke all providers. No approval policy, origin policy or standing grant was introduced.
6. **Renderer projection.** `views`, `order`, per-view request counters, `updateView` and `resetView` live in the browser store.
   `lib/webMcpViewKey.ts` contains the pure identity helper. The store imports no other store. Existing top-level fields
   project the selected pane for compatibility; keyed selectors read the correct project/session snapshot.
   Async pane/capability writes capture their key and retired pane responses cannot overwrite another view.
   A live pooled page is hidden on departure and reused on return, preserving its page, full in-memory address and enrollment.
   An older main without `list` retains the close/recreate fallback. Only an unconsumed explicit draft enable click transfers
   into a session created in that same project; clicks from existing sessions do not transfer.

A window-level read-only list poll keeps hidden snapshots current. Chrome-bridge coordination is held per project until its
last locally projected enrolled session revokes, rather than being undone when one pane unmounts. Activity-feed comparisons
also use per-view snapshots, avoiding artificial access-off events during selection changes. Tool forms remount per view key.
Saved address history continues stripping query strings, fragments and credentials; full live addresses are not persisted.
Packaged-app development-WebMCP restrictions and native origin/credential rules were not changed.

## Regression and mutation evidence

The native fixture covers coexisting sessions, sender isolation, old create/bounds compatibility, independent revocation,
continued dispatch to the surviving provider, session/project enrollment mismatch, provider/epoch/session/project request
mismatches, hidden wait/show/expiry, serialized explicit storage clearing and project profile reuse.

The leak test switches 200 times with two enrolled sessions, asserts unchanged owner/sender listener counts and timer count,
then closes a waiting request and asserts zero remaining timers/listeners. Twenty subsequent create/close cycles still use
one project profile. Pool counters confirm no remaining live views, selected windows, pending creates, pending clears or
initializing views. A separate test verifies that closing the pool aborts an unfinished first load and drains its timer/create.
The fixture asserts at most one attached child in each window. Renderer tests cover keyed isolation, per-key counters,
capability-seeded identity, pool reuse, old-main fallback, and a stable window poll timer across 200 selections.

Three probes temporarily changed native source and ran the corresponding behavioral test:

| Probe | Deliberate mutation | Result |
| --- | --- | --- |
| Project identity | Remove both request/project comparisons | Killed: project mismatch test fails |
| Revoke scope | Disconnect every pooled entry when revoking one session | Killed: surviving session test fails |
| Hidden wait | Bypass the visibility wait loop | Killed: hidden call no longer waits for its own page |

All mutations were restored before final verification. Probe logs are in `/tmp/wx15-mutation-*.log`.
The expanded UI run also identified an incomplete hook mock in the existing browser-error-action tests;
that mock now preserves real module exports while replacing only the open action.

## Verification

| Command | Final result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed, including store boundaries, IPC contract parity and source-text ratchet |
| `pnpm --dir desktop/packages/electron exec vitest run` | 93 files; 836 passed, 1 skipped |
| `pnpm --dir desktop/packages/ui exec vitest run src/components/layout src/hooks src/stores src/components/mcp` | 100 files; 752 passed |
| `pnpm --dir desktop/packages/ui exec vitest run` | 637 files; 4,422 passed |
| `git diff --check` | Passed |

Local validation logs use `/tmp/wx15-*.log`. These are deterministic source/fixture checks, not packaged-app,
real sign-in, W7 or cross-platform native qualification. The live view limit is enforced without eviction in this slice.
The explicit project-clear IPC exists; adding a UI control for it remains outside this handoff's surface work.

## English UI strings

Only the existing `webmcp.browser.explanation` value in
`desktop/packages/ui/src/lib/i18n/messages/en.ts` changed. No new locale key was introduced.
Its new English value is:

> The agent can call tools this page exposes. Each call still asks you first. Sessions in this project share sign-ins. Closing a page keeps project storage; only an explicit project storage clear removes it.

Other locale files were left unchanged as requested.

## Review fixes

The non-blocking findings in `REVIEW-WX15-deepseek.md` and `REVIEW-WX15-kimi.md` are addressed
in this worktree. This section supersedes the earlier hide-cancels-work description and storage copy.
No commit, push, packaging or publication was performed.

- **Sender-owned clearing.** Project profile ownership survives closing its last view. A clear must come
  from an owning window and is rejected if another live window owns that shared profile, including when
  that window's views have already closed. Ownership checks execute inside the pool mutation queue,
  before any close or wipe. Clearing, cleared and failure notifications go only to the owning renderer.
  The selected pane retains explicit storage feedback outside `views`/`order`; old status and list replies
  cannot restore the cleared view or replace the feedback with a false disconnection. A create reply that
  arrives after its clear notification also retains the terminal feedback. A failed wipe
  reports failure rather than claiming success.
- **Temporary visibility.** Dialogs, palettes, minimizing and hiding stop new requests at the visibility
  gate. Already executing navigation and native tool calls retain their original completion/deadline.
  Explicit pause, Disconnect and session revocation still cancel both forms of work. Tests cover completion,
  timeout, a second request waiting until visibility returns, and all explicit cancellation paths.
- **Shared identity.** `desktop/shared/webmcp-view-key.mjs` is the single lexical project/session key
  implementation consumed by main and renderer. Native status directories use that normalization too.
  Tests cover trailing separators, dot segments, POSIX case, Windows drive case/root and UNC share roots.
- **Projection lifecycle and polling.** Resetting a closed view deletes its `views` and `order` entries;
  releasing it or switching away cannot reinsert it. A 200-session regression checks bounded retained
  snapshots. Equivalent snapshot writes preserve store references, including catalogs and bridge-server
  arrays received as fresh objects. Five unchanged 1 Hz polls produce zero store notifications and zero
  additional activity-recorder renders; a changed access state still renders. Missing native views are
  pruned, and storage notifications invalidate outstanding list/status responses.
- **Mutation serialization.** Revoke now uses the same queue as create and clear. Tests cover revoke waiting
  for a held clear and a queued create, and a held revoke blocking the next create.
- **INFO fixes.** Mission Control's legacy enabled fallback requires the row's session ID. Transferring a
  draft enable request consumes both its enable and agent-mode request counters. `pendingGuestClears` is
  documented as diagnostic tracking; the serialized pool queue supplies the exclusion guarantee.
- **Known memory bound.** Live views are capped by `maxLiveViews`, but Electron's in-memory profile registry
  remains **one profile per visited project per app run**, not one per currently live view. Profiles and
  hardened handlers survive view close and explicit storage clear; Electron does not reclaim the Session.
  Ownership metadata also tracks windows that visited each profile; dead owners are pruned on clear.
  This is not a constant memory bound across arbitrarily many visited projects. App quit releases these
  in-memory profiles and sign-ins. No disk-persistent partition was introduced.

### Review mutation probes

| Finding | Deliberate mutation | Result |
| --- | --- | --- |
| 1: clear ownership | Remove the sender/profile ownership rejection before closing/wiping | Killed: the cross-window clear test observes an unexpected successful clear |
| 1: cleared-pane feedback | Omit the renderer storage-event reset | Killed: the pane no longer displays its expected storage feedback |
| 2: transient visibility | Restore navigation aborts and native-request cancellation in `hide()` | Killed: all 8 selected navigation/native-tool cases detect premature cancellation |

All three probes restored the original source in a `finally` block. Logs:
`/tmp/wx15-review-mutation-ownership.log`, `/tmp/wx15-review-mutation-storage-feedback.log` and
`/tmp/wx15-review-mutation-hide-cancellation.log`.
The restored native source SHA-256 is
`a9a761a6d2146f9320b78c59197ee3952e20af5657da25891dea4684963da701`.

### New or changed English strings

User-facing copy in `desktop/packages/ui/src/lib/i18n/messages/en.ts` and the 13 packaged JSON catalogs
(the same English values, preserving the strict catalog key contract):

- `webmcp.browser.explanation` (changed): “The agent can call this page’s tools with your approval. Project
  sessions share sign-ins until the app quits or project storage is cleared. Closing the pane keeps this
  session’s agent access; Disconnect ends it.”
- `webmcp.detail.storageClearing` (new): “Clearing project browser storage…”
- `webmcp.detail.storageCleared` (new): “Project browser storage cleared. Reopen the page to continue.”

Native rejection in `desktop/packages/electron/src/desktop-webmcp-browser.js`:

- “This browser storage belongs to another window” (new).

All new source, tests, comments and this appended handoff are English. The JSON catalogs received only
the same three English values above; their other translations were preserved. The first full UI run caught
the missing catalog keys (8 failures); adding the English entries fixes strict dictionary validation.

### Final review-fix verification

| Command | Final result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed |
| `pnpm --dir desktop/packages/electron exec vitest run` | 93 files; 851 passed, 1 skipped |
| `pnpm --dir desktop/packages/ui exec vitest run` | 638 files; 4,435 passed |
| `git diff --check` | Passed |

Final logs are `/tmp/wx15-review-typecheck.log`, `/tmp/wx15-review-lint.log`,
`/tmp/wx15-review-boundaries.log`, `/tmp/wx15-review-electron.log` and `/tmp/wx15-review-ui.log`.
These are source/fixture suites, not packaged-app, real sign-in or cross-platform native qualification.
The two findings were covered by three killed mutation probes, with every mutation restored before final checks.

## Merge with main

Date: 2026-10-21. Resolved the in-progress merge of `main` into `wx15-view-pool`.
The merge preserves WX-15's pooled native views, project storage, ownership, visibility gates,
revocation, keyed renderer snapshots and request counters alongside main's WX-07 and WX-02/WX-04 work.

Reconciled behavior:

- `generation`, `catalogLimit` and `catalogRejection` belong to each view snapshot. Registration
  timelines, tool drafts and manual results also live under that view key, including their bounded
  retention, definition digests and stale-result marking. Both snapshot update APIs normalize catalog
  input and reconcile registration changes against the target view's previous catalog.
- Native `status` and `list` replies preserve each pooled page's generation, catalog, total count,
  truncation and rejection reason. The window-level list poll now reads the extended catalog shape
  and updates these fields for hidden views as well as the selected pane.
- `WebMcpToolPanel` reads the requested project/session view. Forms remount by view and definition,
  restore only that view's drafts/results, and capture the view key for asynchronous manual outcomes.
  Late outcomes cannot recreate a closed view; a definition changed during an invocation marks its
  result stale. The call strip reads generation by project/session and retains its legacy session guard.
- Main's inspectable definitions, schema/lint UI, registration truth, M12 manual outcomes,
  structured-error detection and translations remain intact. Tests from both parents were retained.
- Added regressions for pooled native status/list metadata, independent page generations, hidden
  catalog polling, per-view timeline/draft/result/reset behavior, stale late results, tool panel
  selection/restoration, and call-strip generation isolation across projects sharing a session ID.

The first locale check found 39 identical-English entries: WX-15 already placed
`webmcp.browser.explanation`, `webmcp.detail.storageClearing` and `webmcp.detail.storageCleared`
in all 13 non-English catalogs. In accordance with this task's English-only scope, those three
keys are now explicitly listed as intentional English fallbacks in `desktop/shared/shared-spelling.json`.
Their values and all other translations were preserved. These three messages still need translation
in a future localization task; passing the catalog check does not claim they are translated.

Verification on the resolved source:

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | Passed, Electron/UI/web |
| `pnpm run lint` | Passed, Electron/UI/web |
| `pnpm run check:boundaries` | Passed, including store, IPC, source-text, ownership and release contracts |
| `pnpm run check:locales` | Passed: 14 locales, 5,281 keys, 68,653 catalog entries; English fallbacks noted above |
| `pnpm --dir desktop/packages/electron exec vitest run` | Passed: 94 files; 862 tests passed, 1 skipped |
| `pnpm --dir desktop/packages/ui exec vitest run` | Passed: 641 files; 4,460 tests passed |
| `git diff --check` | Passed |

The staged diff additionally reports two trailing blank-line warnings inherited unchanged from main:
`.internal/plans/PLAN-2026-10-21-webmcp-excellence-v1.md` and
`.internal/reviews/webmcp-excellence-2026-10-21/scores/round12/judge-codex.md`.
Those upstream records were preserved; the resolution edits pass the whitespace check.

The focused regression runs also passed: 83 native browser tests and 60 UI store/panel/call-strip/pool
projection tests. Logs are `/tmp/wx15-merge-{typecheck,lint,boundaries,locales,electron,ui}.log`;
focused logs are `/tmp/wx15-merge-focused-{electron,ui}.log`.
These are source/fixture checks, not packaged-app or cross-platform native qualification.

Merge commit message: `Merge branch 'main' into wx15-view-pool`.
This section supersedes earlier uncommitted status statements for the merged implementation.
No push, release or changes to other worktrees were performed. The existing review notes and draft
plan remain untracked and unchanged.
