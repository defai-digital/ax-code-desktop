# Open bug hunt and fixes — 2026-10-16

Work requested as "find and fix bug, until cannot find new bug, then test and
commit", using independent reviewers (Muse CLI, Grok CLI and AX Code's own
models) to back the search. This record lists what was reviewed, what was found,
what was fixed with which evidence, and what was deliberately left alone.

Baseline before any change: `pnpm run typecheck`, `pnpm run lint` and
`pnpm run test` were green (ui 2 472 tests, web 1 038, electron 563).

## Method

Ten read-only reviews of disjoint source areas, plus external reviewers on the
same areas and on the surfaces the sub-reviews did not cover:

| Reviewer | Area |
| --- | --- |
| read-only review | `web/server/lib/git`, `web/server/lib/github` |
| read-only review | `web/server/lib/fs`, `security`, `preview`, `text` |
| read-only review | `web/server/lib/terminal`, `event-stream` |
| read-only review | `web/server/lib/ax-code` |
| read-only review | `ui/src/sync` |
| read-only review | `ui/src/stores` |
| read-only review | `ui/src/hooks`, `ui/src/lib` |
| read-only review | `ui/src/components/views`, `layout`, `terminal`, `contexts`, `api` |
| read-only review | `ui/src/components/{session,projects,supervision,multirun}` |
| read-only review | `electron/src` |
| Muse CLI, Grok CLI | `ui/src/components/sections`, `update`, mixed UI, `script` |
| AX Code `glm-5.3`, `MiniMax-M3`, `qwen3.8-flash`, `mimo-v2.6-pro`, `deepseek-flash` | server libraries, chat, files, projects/session trees |

What the external reviewers contributed, stated plainly: the Muse CLI run was
refused the project rules because it treated the workspace as untrusted and
returned nothing; the Grok CLI run stopped on a permission prompt for a command
its headless mode could not ask about; several AX Code runs ended without a final
report after exhausting their turn, leaving only a tool trace. The findings that
became fixes came from the read-only reviews, and every one of them was re-checked
in the source before any fix. Three external invocations were refused by the
upstream provider (HTTP 403 `upstream_permission_error` for `grok-4.7` and
`k3-256k`; "upstream rejected the request" for `claude-sonnet-5-5`) and their
scopes were reassigned to another model.

The comparison method: every fix's regression test was run against the pre-fix
source and observed to fail, then against the fixed source and observed to pass.
Where the file had already been committed in this series, the pre-fix source was
read back from that commit's parent rather than stashed, so the comparison covers
the original code and not a later edit of it.

## Fixes

Each entry: commit · symptom · cause · evidence.

### `b4680e54` fix(ui): find the first changed line inside a diff hunk

`toolPartFormat.extractFirstChangedLineFromDiff` still treated `+++…`/`---…` as
file headers inside a hunk, so an added line whose text starts with `++` was
skipped and the scan fell back to the hunk start. Clicking an edit tool row
opened the file at the wrong line. The same rule had just been fixed in
`parseDiffStats` beside it (`f1789f55`); this sibling was missed. The scan now
tracks whether it is inside a hunk and resets it at a file break.

Evidence: new cases fail before (`expected 10 to be 11`) and pass after.

### `e1123fb9` fix(ui): report a superseded command or skill load as a failure

`useCommandsStore` and `useSkillsStore` returned `true` from a load whose result
was discarded because a later load for another directory won. The slash-command
path reads that as "the catalog holds this directory", so a `/deploy …` the
store did not know was sent to the model as plain text — the outcome that call
site's own comment says must never happen. Matches the sibling fix in
`useAgentsStore` (`711d5cab`).

Evidence: the directory-switch tests fail before (`expected true to be false`)
and assert `false` after.

### `313093ae` fix(web): read a staged deletion's diff and a rename's stats

Two git-service misreports. A staged deletion (`git rm`) has no index entry, so
`git show :<path>` fails with `path ... does not exist (neither on disk nor in
the index)`; simple-git's `GitError` carries no `code` for the ENOENT/EISDIR
guard to match, so the diff endpoint answered 500 for a diff that was fully
available. Separately `diffStats` was keyed by the raw numstat field, which git
writes as `old => new` or `dir/{old => new}`, so every lookup by the file's
destination path missed and the row rendered `+0 -0`.

Evidence: new `getFileDiff` and `getStatus` tests fail before (500 /
`undefined`) and pass after.

### `13857779` fix(web): refuse an option-like branch name in the rename route

`git branch` keeps parsing options past `-m`: `git branch -m -a <new>` (verified
against git 2.39+ here) consumes `-a`, renames the *current* branch and exits 0,
so the route answered a successful rename of a branch that was never named. The
delete route guards the same position (`f60bf386`); rename did not.

Evidence: a route test expects 400 and no `renameBranch` call; it fails before.

### `e27b77a3` fix(web): make a download name and a rename destination safe

`/api/fs/raw?download=true` interpolated a raw basename into
`Content-Disposition`. Node only accepts code points up to 0xFF in a header
value, so any name above Latin-1 threw `ERR_INVALID_CHAR`
(verified on this machine), no catch case matched, and the 500 JSON body was
saved as the user's download. The quoted name is now an ASCII fallback with the
real name in an RFC 5987 `filename*`.

`/api/fs/rename` called `fs.rename`, which replaces an existing destination, so
renaming onto an existing file destroyed it and answered `{success:true}`.
Neither UI caller checks the destination. It now refuses with 409 unless the
destination resolves to the source entry (a case-only rename), which also had to
act on the requested spelling — it previously renamed the file to the name it
already had and reported success for changing nothing.

Evidence: three new route tests; the header case is asserted with Node's own
`validateHeaderValue`, so it reproduces the real failure. All three fail before.

### `4cad9c8c` fix(github): act on the pull request repo the caller names

Merge, mark-ready and edit resolved the repo from the directory's git remote and
ignored which repo the pull request lives in. A fork's PR normally lives in the
upstream repo — `pr/status` expands the network to find it and computes
`canMerge` against that repo — so pressing Merge posted only
`{directory, number, method}` and GitHub merged pull request *N* in the origin
repo: an unrelated PR that happens to share the number. The reads had the same
hole. The calls now carry the repo from the status response and resolve through
`resolveRepoForRequest`, which refuses a repo outside the directory's network
instead of falling back to origin.

Evidence: a route test asserts an out-of-network repo is refused with 400 and no
merge; it fails before (the origin repo was merged).

### `7df3c43f` fix(ax-code): release the watcher claim when the port wait fails

`start()` claims its abort controller before waiting for the runtime so `stop()`
can cancel a waiting start, but nothing released the claim when the wait
rejected. The guard reads the claim as "a start is in flight", so every later
`start()` returned immediately and the SSE stream answered 200 while never
delivering an upstream event for the rest of the process.

Evidence: a watcher test starts after a rejected port wait and asserts the hub
subscription happened; it fails before.

### `71b693ee` fix(ui): seed the unseen baseline when the session changes

The unseen baseline was seeded once, at mount. Opening a second session whose
viewport was already released in this run kept the first session's baseline, so
"N new messages" was that session's history minus the other session's total (57
for a session the reader had seen nothing of).

Evidence: a hook test drives the release, switches session and asserts
`unseenCount` is 0; it fails before.

### `12c32c29` fix(ui): pick the newest store's status for a session, not the first

`getGlobalSyncSessionStatus` returned the first child store holding an entry for
a session. After a move between projects two stores can hold one, and the first
can be a stale `idle` — which the queued-message sender reads as "the turn
finished" and sends into a busy one. It now uses the priority/recency rule the
live aggregate already applies to the same question.

Evidence: a new test with `idle` in the first store and `busy` in the second
expects `busy`; it fails before.

### `53dee42c` fix(ui): request a snapshot when a delta lands past the local text

A delta whose offset is beyond the local text was dropped with a bare `false`
while the comment claimed a snapshot would heal the gap. Nothing requests one
(the resync paths run on `server.resync_required`, a reconnect or a status poll),
so the text stayed missing. The two sibling branches that cannot apply a delta
both return a materialization request, which coalesces per session behind a
cooldown.

Evidence: the reducer test now asserts the returned materialization; it fails
before.

### `f6ce7e54` fix(ui): honour the length budget for a name with no directory prefix

`truncatePathMiddle` returned the value unchanged when it had no `/`, which is
exactly what its callers pass (`file.relativePath || file.name`), so the budget
was ignored and the label overflowed.

Evidence: new cases assert the length is within budget and the extension is
kept; both fail before.

### `36f2271c` fix(ax-code): give every boot its own bootstrap retry budget

The retry counters live in the lifecycle runtime, a process-wide singleton; the
in-process restart path resets the shutdown flags, the watcher promise and the
session runtime, but not these. A second boot whose backend failed took the
exhausted branch on its first failure and reported
`{restarting:false, error:"ax-code failed to start"}` where it should have
retried.

Evidence: the existing budget test now starts a second boot and asserts the
budget is fresh; it fails before (`expected true to be false`).

### `79a4f4ca` fix(ax-code): report the activity reset so the busy count is re-read

`resetAllSessionActivityToIdle` writes every phase to idle directly instead of
through the setter that notifies `onActivityChange`, and `resume()` is its only
caller. Consumers re-read the busy count only when told (the runtime-busy
reporter dedupes by count), so main kept the pre-restart count and its
wedged-kill honoured the busy restart grace indefinitely — the outcome
`resume()`'s own comment says it exists to prevent.

Evidence: the transition test now asserts a change fires on `resume()`; it fails
before (`expected 4 to be 5`).

### `5acb32a2` fix(electron): deliver the tray's hand-offs through the readiness gate

The tray's session, new-session and approval actions sent straight at the window
after `revealMainWindow()`. A window that call just created has loaded but has
not signalled `ax-code:renderer-app-ready`, so nothing was listening: the window
appeared while the session never opened and the approval was never answered,
leaving the agent blocked. The `desktop_focus_main_window` command already
refuses to send in that state and queues for the ready signal; the tray path
used neither.

Evidence: `main.js` cannot be imported by a test, so the contract is asserted the
way the repo already asserts it in `renderer-handoff-readiness.test.mjs`; the two
new cases fail against the pre-fix source.

### `be044c11` fix(electron): capture the window geometry before the settings chain defers it

`writeWindowState` read the bounds up front but then re-checked the window inside
the mutator, which the settings chain runs later. The final persist is triggered
by the window's own close, and on macOS that close destroys the window, so the
guard returned the root unchanged and the bounds were dropped — the app reopened
with its previous geometry.

Evidence: a source-contract test asserts the geometry is read before the
mutator and that the destroyed-window guard is gone; it fails before.

### `626a09aa` fix(ui): keep the rendered directory's child store alive

The eviction plan and the dispose check both honour a pin, and
`ChildStoreManager` exposes ref-counted `pin`/`unpin`/`pinned` — with no caller
in production, so the pinned set was always empty and a directory whose store
had no event for `DIR_IDLE_TTL_MS` (20 min) was evicted even while the views
under its provider were still subscribed to it. The provider now pins the
directory it renders for as long as it is mounted.

Evidence: a provider render test asserts `pinned` while mounted and not after
unmount; it fails before.

### `b029aa71` fix(ui): never prune a folder scope this snapshot cannot account for

The folder cleanup ran `cleanupSessions(scopeKey, idsByScope.get(scopeKey) ??
new Set())` for every manual scope, so "no ids were computed for this scope"
was treated as "this scope has no live sessions". The projects, sessions and
archived-sessions stores hydrate in separate updates, so a snapshot can hold a
project's sessions while missing its project: the scope then lost every session
from every folder and persisted that, destroying manual folder organisation for
good. The archived-scope skip above exists for the same reason.

Evidence: a new case renders with no projects and asserts the folder entry
survives; it fails before. The existing "drops the folder entry of a session
that is gone" case now registers the project, which is what makes its session
gone rather than merely unattributed.

### `b11cc998` fix(ui): mark every ancestor of a session that needs a person

The switcher promoted a parent in a single ordered pass, so it only marked one
whose child was already marked when the loop reached it: with a subagent whose
own subagent is blocked, the top session lost its badge whenever the middle
session came earlier in the list. The propagation is now a shared helper that
walks the parent chain from every marked session (verified: the old algorithm
yields `{grandchild, middle}` for the new test's input).

Evidence: two new cases cover order and depth.

### `4cd62ead` fix(ui): stop recording a failed notes write as saved

The notes autosave advanced `lastSavedNotesRef` before awaiting the write, and
the debounce effect compares the field against that ref to decide whether
anything is unsaved. A write that failed therefore read as saved, so no later
attempt carried the text and the edits were lost on reload while the panel still
showed them.

Evidence: not covered by a test — the panel has no test file, and standing one up
means mocking the runtime APIs and a dozen stores for a six-line change. This is
the one fix in this record without a regression test.

### `0de86603` fix(ui): keep the change list's virtual window following the scroll

`ChangesPanel` memoized `getVirtualItems()` on `shouldVirtualize`, the virtualizer
instance and `getTotalSize()` — none of which move with the scroll offset or the
measured viewport the window is a function of. The window was therefore computed
once, on the first render, where the scroll element is not attached yet, so it was
empty: at 1000+ changes the panel rendered no rows at all inside a full-height
scroll area, and the prefetch callback got an empty path list. It is read inline
during render now, as the repo's other virtualizers do, with the prefetch effect
comparing the paths it last reported instead of the array identity.

Evidence: a render test with 1200 entries (jsdom needs the viewport size stubbed)
asserts a row is present; it fails before (0 rows) and passes after.

### `22f7fc8f` fix(ui): restore the plan view's mounted flag on every mount

`mountedRef` was initialized once and only ever set false, by the cleanup that
also flushes a pending save. StrictMode runs that cleanup and re-runs the effect
without re-initializing refs, so in development the flag latched false for the
component's life. `isLatestEntry` then returned false for every entry, which
suppressed `onLatestError`: a failed plan write reported nothing, from both the
debounced save and the unmount flush.

Evidence: a source-guard test (the component needs a dozen stores to render);
it fails before.

### `a9a628ef` fix(ui): publish the terminal refs only once the terminal opened

`TerminalViewport` published `terminalRef`/`fitAddonRef` before
`terminal.open()`, which can throw — the catch beside it exists for a wasm or
renderer failure. The refs then pointed at a terminal whose every method throws:
the chunks effect read that ref as live and its `reset()` threw inside the effect,
swapping the pane for the crash screen, and `flushWrites` latched the write flag
before calling `write()`, so one throw silently dropped all later terminal output.
The refs are published after a successful open, a throwing write clears the latch,
and the key-probe timeout is cleared on unmount like every other deferred handle in
that effect.

Evidence: two source-guard cases in the component's existing source test file;
both fail before.

### `950303f8` fix(ui): clear the preview loading overlay when the proxy target fails

All three failure paths of the preview-target request set the error state but left
`isLoading` true. The error card renders instead of an iframe, so no load event can
clear it: the "Loading…" overlay stayed up over the card and swallowed clicks on
its recovery button — the one action that state exists to offer.

Evidence: a source-guard case in the context panel's existing source test file; it
fails before.

### `2fbcf6bc` test(web): cover naming the pull request's repo from the client

Completes `4cad9c8c`: the route-side refusal was covered, this covers the half that
carries the repo from the header the user is looking at. Against the pre-fix client
the case fails with `'/api/github/pr/merge' to contain 'owner=org'`.

## Reviewed and deliberately not changed

- **`useGitStore` per-directory state is never released.** `setActiveDirectory`
  and `fetchStatus` insert a `DirectoryGitState` for every directory seen, and
  nothing removes one; each holds `status`, `branches`, `log` and a diff cache
  bounded to 30 entries / 20 MB. Memory grows with the number of directories
  visited in a session. A bounded LRU has to be applied at every insert site
  (six, including in-flight fetches) and would drop state a mounted view can be
  reading; that is a design change, not a slice of a bug hunt.
- **Preview CSP.** The injected bridge is an inline `<script>`, which a proxied
  page's own `script-src 'self'` (or a nonce/hash policy) blocks by spec, so for
  a hardened site the bridge never installs — no console capture, no inspect, and
  clicks navigate the frame out of the proxy. Separately, the app's own CSP is
  left on proxied preview documents that send none, so their cross-origin images
  and frames are blocked. Both want a considered CSP rewrite (a per-response
  nonce added to the injected tag and to `script-src`), which cannot be verified
  here without a browser.
- **`lsp.updated` and `server.instance.disposed` are no-ops.** Their reducer
  branches call `onLoadLsp`/`onRefresh`, which the only production caller never
  passes, so `state.lsp` is only ever filled by the bootstrap HTTP read, and a
  per-directory instance disposal writes nothing. No current reader consumes
  `state.lsp`, and the correct recovery for a disposal is a runtime-contract
  question rather than a guess.
- **`useProjectKnowledge` caches a positive probe forever**, so the "knowledge
  loaded" chip can outlive the file (deleted, or a branch without it). Cosmetic,
  and a TTL or invalidation has to be reconciled with the create flow that relies
  on misses not being cached.
- **`desktop_search_files` accepts any absolute directory** and applies none of
  the confinement `desktop_read_file` applies (HOME-relative `.ssh`, `.aws`,
  `.config/ax-code`, `.env*`, `*.pem`…), so a compromised renderer can enumerate
  names the reader denies. The in-code comment says the open root is intentional,
  so this is a policy decision to confirm, not a silent fix.
- **`useSkillsCatalogStore.loadSource`** writes its page unconditionally on
  success, so two overlapping loads for one source can let the older land last.
  The UI hides the refresh affordance while loading, so no reachable path was
  found.
- **`GitView` leaves a 1 200 ms bootstrap-refresh timer running across a
  directory switch** and it then clears `isWaitingForGitRefreshAfterBootstrap`
  for the new directory. The reviewer could not establish a user-visible outcome
  (it also depends on the new directory's bootstrap status), so it is recorded
  here as a lead rather than fixed: a directory-scoped timer with no handle and no
  cleanup, next to a poll effect that does clear its own.

## Verification

- Every regression test listed above was run against the pre-fix source and
  observed to fail, then against the fixed source and observed to pass. Where a
  fix's file had already been committed in this series, the pre-fix source was
  read back from that commit's parent rather than stashed, so the comparison
  covers the original code and not a later edit of it.
- Final state, with each command's exit status captured rather than inferred from
  a pipeline: `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0.
- Test totals: ui 2 487, web 1 046 (+2 skipped), electron 563, root scripts 175.
- `pnpm run check:boundaries` passes in full: desktop boundaries, store
  boundaries, electron runtime, endpoint contracts, IPC contracts, package test
  scripts, no sibling dependencies, source ownership (3 160 files), runtime pin,
  release policy and release contract.
- `pnpm run build` passes (3/3 turbo tasks).
- One flake observed: `web/server/lib/ax-code/routes.test.js` "deduplicates
  concurrent prompt_async requests for the same session message" failed once
  during a run that overlapped a build, and passed both in isolation and on two
  later full runs. The test races two supertest requests against an in-flight
  fetch it releases by hand, so CPU contention can close its window; nothing in
  this series touches that dedupe path.
- Two follow-up commits fix defects in this series' own output rather than in the
  product: `1359da50` moves the change list's prefetch effect off a per-render
  array (a hooks-lint warning and a redundant parent notification), and `2b27bd59`
  types the github test's fetch mock (an unused-parameter lint error and a
  zero-length tuple that failed `tsc`).
