# Round 14a handoff: sessions you can see and control

Date: 2026-10-21. Branch: `r14-sessions`. Base: `7cd2d38323aea2f6ab8214261dd275520bfeeb07`.
Status: local, uncommitted implementation. No push, release, installation or publication.
The pre-existing `JUDGE-r13-codex.md` and `JUDGE-r13-deepseek.md` are unchanged.

Controlling record: `.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md`, WX-15 design items 3–6,
WX-09 and W7. The accepted PRD and earlier review records were not changed.
No new judge ballot was requested or produced; this handoff does not claim the two-judge score gate.

## Implemented surfaces

- `WebMcpPages.tsx` and `useWebMcpPages.ts` provide the pane's page switcher, read-only trust summary,
  per-session page action and hidden-waiting list. Each page names its session, origin, project and access
  state (on, paused, off or waiting). Project paths disambiguate duplicate project labels. Waiting has a
  separate badge; unloaded pages explicitly say that access returns off.
- The switcher uses native disclosure and button semantics, normal Tab/Enter navigation, `aria-current`,
  explicit action names and focus recovery after revoke. Choosing a page selects its owning project/session
  through the existing supervision navigation and opens the browser without requesting enrollment.
- Revoke calls `revokeSession` with the clicked page's directory and session ID, independent of the shown page.
  It clears only that view's projected access state after acknowledgment and reports failures instead of
  claiming success. Native ownership enforcement remains authoritative.
- One Page trust disclosure names the shown origin, session and state, explains shared storage within a
  project, separate access across sessions, Pause/Resume, Disconnect/Revoke and remaining permission checks.
  It contains no grant control and does not imply rollback of page changes.
- The window's read-only pool projection now includes capacity, idle and unloaded state. A full pool is
  named in the switcher summary, lists held pages and offers Close idle page for an idle hidden page.
  A blocked create explains recovery; closing an idle page retries the blocked pane.
- Hidden waiting pages appear in the titlebar Needs you count/popover and project-home queue. Mission
  Control rows and session-grid slots read their exact directory/session view and expose Show page.
  The Needs you count deduplicates a waiting page against a runtime exception for that same identity.

## Native LRU behavior

`desktop-webmcp-browser.js` keeps the existing configurable 1–8 live-view limit (default 4).
At capacity, a serialized create/reload unloads the least recently shown hidden idle view owned by the
requesting window. A visible or paused page, held request, active runtime call, active manual invocation, load or
enrollment is not an eviction candidate. If no candidate exists, the fixed `pool-full` error remains.

Unloading disconnects the provider, cancels its work, closes the native adapter/webContents and removes
its live listeners. At most 32 dormant records per window, trimmed by oldest last-use, keep the opaque identity, project/session, origin,
last-use time and full address. The unloaded list does not expose the full address. No query, fragment,
cookie or credential is added to persistence. Reopening through either `create` or `show` reconstructs
that page at its retained address with access off and no inherited provider or tool references. Project
storage remains in the existing in-memory project partition. Close, project storage clear, owner death,
renderer loss and pool shutdown forget the relevant records. Cross-window and supplied identity checks
also apply to unloaded entries.

## Behavioral and mutation evidence

UI tests cover named ownership/states, a hidden-session revoke while another project is shown (including
identical session IDs), failure acknowledgment, focus, display-only trust, no-grant navigation, full-pool
recovery, and the actual Needs you, Mission Control and session-grid components. Existing pane lifecycle,
pool projection and supervision tests continue to run in the full UI suite.

Native tests cover LRU ordering among multiple hidden pages; retained full query/fragment addresses;
access-off reload through create and show; surviving providers/storage; rejecting a full busy pool;
manual-call protection; foreign handles; mismatched session identity; and teardown of unloaded records.
The existing 200-switch owner/sender listener and timer regression is retained.

| Deliberate mutation | Behavioral result |
| --- | --- |
| Switcher sends the shown directory instead of the clicked directory | Killed by the switcher scope test |
| LRU closes the candidate without remembering it | Killed by the unload/reload test |
| Reload uses the caller's shortened address instead of the retained address | Killed by the retained-address test |
| Reload restores an active connection | Killed by the access-off assertion |

All mutations were restored. `/tmp/r14a-mutations.json` and `/tmp/r14a-mutation-*.log` contain results.
The first address probe survived a show-only test because show already supplied the retained URL. The
regression was strengthened to reopen through create with a shortened caller URL; the probe then failed.

## Native W7 journey

`project-browser-webmcp.mjs` still runs W1/W2/W5 and now invokes `project-browser-sessions.mjs` for W7.
It serves the public quickstart twice on two loopback ports and uses two actual project/session fixtures.
The second page is prepared through IPC; user enrollment, showing, Needs you and revoke use rendered controls.
The model-free stub supplies bound provider read requests and records their replies.

W7 checks distinct native targets, per-project localStorage and same-host cookies (cookies ignore ports),
a hidden request that cannot execute until shown from Needs you, independent enrollment/revocation,
continued dispatch by the surviving provider, correct page contents, retained generations and storage,
and 50 page switches. Twenty-five stress switches use native keyboard Enter events. Counts distinguish
fixture setup, task actions, warm-up, disclosures and stress switches.

Memory checks collect the app renderer and both guests' JS heaps after GC and native DOM listener counts.
The gate allows at most 16 MiB heap growth and 30 added listeners per target after the 50 switches;
the live pool must remain at two views and document generations must remain unchanged. These measurements
are not whole-process RSS or Electron-main listener measurements; main listener/timer bounds are covered
by the native unit fixture. Cookie markers simulate signed-in storage; this is not a real external login test.

The existing three-platform CI loop already runs `project-browser-webmcp.mjs`, so W7 runs in that job without
another workflow entry. That job remains advisory (`continue-on-error: true`). Local native evidence is
macOS arm64 only; Windows/Linux execution and new judge scores remain unclaimed.

## Verification

Native project-browser run: W1 **5 actions**, W2 **5 actions**, W5 keyboard idle takeover,
W7 **7/12 task actions**, **4 warm-up switches**, **50 stress switches** (25 keyboard),
and **0 extra stress disclosures**. Fresh native state and runtime replies verify the outcomes.
The ordinary Desktop journey also passed boot, preload isolation, settings, supervision pop-out/reuse,
reload, approve/deny synchronization, goal updates, CSP and renderer-error checks.

| Measured target | DOM listeners before → after | JS heap bytes before → after (GC) |
| --- | --- | --- |
| App renderer | 721 → 726 | 60,582,132 → 63,048,120 |
| Project A guest | 1 → 1 | 1,383,924 → 1,383,924 |
| Project B guest | 1 → 1 | 1,378,932 → 1,378,932 |

The final pool holds two live views with unchanged identities/generations. Native evidence:
`/tmp/r14a-project-browser/w7-sessions.json`, `w7-sessions.png`, `results.json`; baseline results:
`/tmp/r14a-desktop/results.json`. The main-renderer screenshot was visually inspected for the switcher. CDP omits native child views
from that image; `w7-page-a.png` and `w7-page-b.png` capture the guests separately.

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed |
| Electron suite | 94 files, 874 passed, 1 existing skip |
| UI suite | 642 files, 4,474 passed |
| Localization validator regressions | 7 passed |
| `pnpm run check:locales` | Passed: 14 locales, 5,311 keys; strict catalogs (the earlier fallback mechanism has since been removed) |
| `pnpm run build` | Passed |
| Native project-browser W1/W2/W5/W7 | Passed on macOS arm64 |
| Native Desktop baseline journeys | Passed on macOS arm64 |
| `git diff --check` | Passed |

Logs use `/tmp/r14a-{typecheck,lint,boundaries,electron,ui,locale-tests,locales,build}.log`.
Native artifacts are under `/tmp/r14a-project-browser/` and `/tmp/r14a-desktop/`.

## English strings

The initial session strings below now live in the normal English dictionary and have translations in all
13 non-English catalogs. The locale loader and checker are strict. Review-fix strings are listed separately
below and remain English-only for the follow-up translation task; neither the loader nor checker was changed.

```ts
"webmcp.pages.title": "Pages ({count})",
  "webmcp.pages.fullLabel": "Browser pool full",
  "webmcp.pages.list": "Pages held by this window",
  "webmcp.pages.waiting": "Waiting for you",
  "webmcp.pages.full": "Browser pool full: {count} live pages. The pages below show their owners. Opening another page unloads the least recently used idle hidden page; its address stays in memory and agent access returns off. You can also close an idle page below.",
  "webmcp.pages.blocked": "Browser pool full. No hidden idle page can be unloaded. Open Pages to see the live pages; finish or revoke a waiting call, then close an idle page and retry.",
  "webmcp.pages.draft": "Session draft",
  "webmcp.pages.blank": "No supported origin",
  "webmcp.pages.showNamed": "Show page: {page}",
  "webmcp.pages.show": "Show page",
  "webmcp.pages.access.on": "Access on",
  "webmcp.pages.access.paused": "Access paused",
  "webmcp.pages.access.off": "Access off",
  "webmcp.pages.access.waiting": "Access waiting",
  "webmcp.pages.unloaded": "Unloaded; reloads with access off",
  "webmcp.pages.revokeNamed": "Revoke agent access: {page}",
  "webmcp.pages.revoke": "Revoke access",
  "webmcp.pages.closeNamed": "Close idle page: {page}",
  "webmcp.pages.close": "Close idle page",
  "webmcp.pages.failed": "The page action failed. Check its current state and try again.",
  "webmcp.trust.title": "Page trust",
  "webmcp.trust.scope": "Access belongs only to this project and session. Other sessions have separate access. Sessions in this project share browser storage; other projects do not. This summary creates no grants. Each agent call still follows the session permission policy.",
  "webmcp.trust.controls": "Pause keeps the page and session connection, stops active calls and holds new calls until Resume. Disconnect or Revoke access removes this session’s connection and stops its waiting calls. Other sessions keep their access. Changes already made on the page stay.",
```

## Review fixes

Implemented locally, 2026-10-21. This section supersedes the earlier verification snapshot for the review changes.
Read `REVIEW-R14A-deepseek.md` in this worktree. The audit record is absent here; its original was read at
`/Users/akiralam/code/ax-code-desktop/.internal/reviews/webmcp-excellence-2026-10-21/AUDIT-2026-10-21-p1-glm-round13.md`.

- Windows and UNC ownership uses shared `projectKeyFor` / `viewKeyFor` for project labels, session titles,
  project IDs and navigation. Regression fixtures cover drive-letter and UNC identities.
- Dormant addresses are capped at 32 per window, oldest last-use first. One dormant-owner listener group
  handles window close, sender destruction and renderer loss, and is removed when its last record is forgotten.
  Tests churn 100 evictions for each teardown event and verify flat listener counts and retained identities.
- Global capacity exposes other owner windows with page counts and an explicit focus action. The native
  action restores/shows/focuses an existing app window; close/revoke retain their existing ownership checks.
  Cross-window full-pool copy directs the person to those controls instead of claiming foreign pages are listed.
- Paused pages are excluded from automatic unloading. Destroyed guests do not receive `getURL()` calls.
  Accessible action names include the session ID. Waiting/full-pool/interruption announcements live outside
  the closed Pages disclosure. The home Needs you header includes waiting pages, including an otherwise empty
  queue; null-directory runtime rows deduplicate by session identity.
- Provider `/next` attempts have a 20-second independent deadline (runtime idle polls answer after 15 seconds),
  with a one-second retry delay. Failed/expired attempts project access as interrupted and disabled. A healthy
  response restores access automatically on the same enrollment; late expired batches cannot dispatch work.
  Disconnect cancels the attempt/retry. The pane retains Pause/Disconnect and bridge exclusion while interrupted.
  If the native view itself disappears, three failed status reads clear interruption and expose the normal
  disconnected recovery instead of continuing to claim automatic reconnection.

New English keys in `desktop/packages/ui/src/lib/i18n/messages/en.ts`, awaiting translation:

```ts
"webmcp.pages.fullOtherWindows": "Other AX Code windows hold pages in the full browser pool. Open Pages and focus an owner window below. Close an unneeded owner window, or free a page using its Pages controls, then return here and reopen the browser.",
"webmcp.pages.focusWindow": "Focus owner window {window} ({count} pages)",
"webmcp.pages.access.interrupted": "Access interrupted",
"webmcp.detail.interrupted": "The coding runtime stopped answering. Agent access is interrupted; reconnecting automatically. You can still disconnect this session.",
```

Mutation probes for findings 1, 2 and 5 all failed their targeted behavioral tests as intended:

| Deliberate mutation | Detection |
| --- | --- |
| Compare project paths literally | Windows/UNC label regression |
| Compare session paths literally | UNC session-title regression |
| Remove the 32-record dormant cap | Retained identity/count regression after 100 evictions |
| Add one owner listener per dormant record | Flat listener-count regression |
| Extend the poll deadline beyond the test bound | Attempt signal remains un-aborted |
| Suppress interrupted status | Status incorrectly claims access enabled |
| Delay retries beyond the retry bound | Second poll never starts on time |

All mutations were restored. Evidence: `/tmp/r14a-review-mutations.json` and
`/tmp/r14a-review-mutation-*.log`. The deadline test uses a transport that ignores cancellation and also
proves that a late expired batch cannot navigate, a healthy response restores the same provider without
re-enrollment, and disconnect removes the pending poll timer.

| Check | Review-fix result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed, including generated IPC contract |
| Electron suite | 94 files passed; 881 tests passed, 1 existing skip |
| Focused UI regressions | 68 passed, followed by 31 pane tests including the added cross-window reopen test |
| Full UI suite | 640 files passed, 2 failed; 4,477 tests passed, 8 failed (translation dependency below) |
| `pnpm run check:locales` | Fails only for the four new keys above in 13 non-English catalogs (52 missing entries) |
| `pnpm run build` | Passed on the final source |
| Native W1/W2/W5/W7 | Passed on macOS arm64 against the final build |
| `git diff --check` | Passed |

The untranslated keys cause strict locale loading to reject the catalogs. The full UI run consequently
fails seven `src/lib/i18n/store.test.ts` cases and the translated Advanced search case in
`src/components/views/SettingsView.models.test.tsx`. This is pending translation, not a passing localization
gate. No fallback was introduced. `lib/i18n/store.ts`, the locale checker and the 13 translated catalogs
were not changed by this review-fix task.

Native evidence is under `/tmp/r14a-review-project-browser-verified/`, including `results.json`,
`w7-sessions.json`, `w7-sessions.png` and guest screenshots. The Pages layout was visually inspected.
W1 and W2 each took five actions; W5 preserved the page/address/result through keyboard Pause/Resume;
W7 used seven task actions, four warm-up switches and 50 stress switches (25 keyboard), with no extra
stress disclosures. This does not claim Windows/Linux native execution.

Logs: `/tmp/r14a-review-{typecheck,lint,boundaries,locales,electron,ui,build}.log`,
`/tmp/r14a-review-focused-final.log`, `/tmp/r14a-review-pane.log`, and
`/tmp/r14a-review-project-browser-verified.log`. No commit, push, release or publication.


Final-build W7 measurements (after GC; not whole-process RSS):

| Target | DOM listeners before → after | JS heap bytes before → after |
| --- | --- | --- |
| App renderer | 721 → 721 | 60,279,868 → 62,731,160 |
| Project A guest | 1 → 1 | 1,383,924 → 1,383,924 |
| Project B guest | 1 → 1 | 1,378,932 → 1,378,932 |

Final pool: two live views with unchanged document generations. All final harness results, including CSP
and uncaught-renderer-error checks, passed. The branch remains `r14-sessions`; changes remain uncommitted.
