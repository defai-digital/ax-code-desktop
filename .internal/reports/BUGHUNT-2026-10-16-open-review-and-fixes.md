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
scopes were reassigned to another model. Both obstacles were cleared for the later
rounds — the Muse CLI runs with `--trust-workspace`, and the Grok CLI's prompt tells it
to read and grep only, since its plan mode cannot approve a shell command — and those
rounds' findings are recorded in their own sections below, led by the reviewer table
that produced them.

The comparison method: every fix that has a regression test was verified by running
that test against the pre-fix source and observing the expected failure, then
against the fixed source and observing it pass. Where the file had already been
committed in this series, the pre-fix source was read back from that commit's
parent rather than stashed, so the comparison covers the original code and not a
later edit of it. Four fixes have no regression test; each says so where it is
listed, and why (no render harness for that component, or a harness that would
have to be invented for it).

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

## Second round

The two reviewer invocations that the upstream provider had refused were re-run on
the CLIs the user asked for, and the surfaces whose external reviewers had returned
nothing got read-only reviews of their own.

| Reviewer | Area |
| --- | --- |
| Grok CLI (`--sandbox read-only --permission-mode plan`) | `ui/src/components/chat` |
| Claude Code CLI (`--allowedTools Read Glob Grep -p`) | `ui/src/components/{terminal,views,layout}`, `contexts`, `api` |
| read-only review | `ui/src/components/{ui,model-picker,onboarding,comments,mini-chat}` |
| read-only review | `ui/src/apps`, `constants`, `types`, `electron/scripts`, `script` |

Both CLIs returned findings this time. Every one acted on below was re-checked in
the source first, and every fix was verified against its pre-fix source.

### `e1cd91e7` fix(electron): refuse a native file search rooted at a credential store

`desktop_search_files` walks whatever absolute root the renderer names — which its
comment says is deliberate — and applied none of the policy `desktop_read_file`
applies, so a search rooted at HOME listed the names inside `.ssh`, `.aws`,
`.config/ax-code` and `.local/share/ax-code`: a name oracle for exactly the paths
the read path refuses. The credential denylist is now a shared helper and the
search refuses a root it denies. The open-root policy is unchanged.

Evidence: helper cases for the denied roots and for a project outside HOME, plus a
source assertion that the handler applies the check. Verified against the pre-fix
source.

### `d1c9a047` fix(ui): keep the typed text in a bounded number field

`handleChange` committed every keystroke through clamp/step normalization and the
value returned through the `value` prop into the effect that rewrites the draft, so
typing `75` into a min-50/step-5 field became `50`, then `505` → 200. Only a value
the field can keep as typed is committed now; the blur path already forces an
out-of-range or off-step entry into range.

Evidence: a render test types `7` then `75`; it fails before (`expected '50' to be
'7'`).

### `48050c42` fix(ui): render a JSON document whose top-level value is null

`null` parses to `null`, and the guard that returned nothing for a null parse result
read it as a failure the `parseError` branch already reports: a file containing
`null` opened as a blank pane.

Evidence: a render test asserts the pane is not empty; it fails before.

### `d71b6056` fix(ui): handle a refused mini-chat hand-off

"Open main app" chained `desktop_focus_main_window` into
`desktop_close_current_window` with no rejection handler; the command refuses a
non-local sender or non-main frame, so the rejection escaped as an unhandled one
while the click did nothing. The mount-time pin read had the same hole. The
hand-off is now one function — which is also what makes the refusal testable — and
the mini-chat stays open when it is refused.

### `7c6b902d` fix(ui): report a failed settings write in onboarding

Both onboarding screens applied a custom binary path with `try/finally` and no
catch, so a failed write was silent (the busy flag cleared a second later) and the
rejection escaped. LocalSetupScreen uses the error banner it already renders;
ChooserScreen, which had none, gained one.

Evidence: a render test on each screen with a rejecting settings write; both fail
before.

### `6efdbaf6` fix(ui): do not cache a failed Ghostty runtime load

The runtime is fetched once per app run and the promise was cached whether it
resolved or rejected, so one transient failure made every later terminal fail with
it until the process restarted — Hard Restart only reloads the view. The loader
moved into its own module so the retry is testable.

Evidence: a loader test rejects once then resolves; against the caching version it
fails.

### `d7bf1087` fix(ui): bound the question reply so the card cannot stay locked

PermissionCard bounds its reply with `withTimeout` because a promise that never
settles leaves `submittingRef` true for good, and QuestionCard replies and
dismisses through the same path with no bound — only a rejection resets its guard,
so the card stayed locked and the agent stayed blocked on the question.

Evidence: a render test replies with a never-settling promise, advances 20s and
asserts the buttons are usable again; it fails before.

### `8d649d7c` fix(ui): put consumed review comments back when the submit did not go through

Both submit paths take the session's inline-comment drafts out of the store before
building the payload. A full message queue returns early and the failed-send catch
restores only the composer text — which is the text from *before* the comments were
appended, and is skipped entirely when the composer was empty. The comments were
lost with no trace on both paths.

Evidence: the store's restore mapping is covered field by field in its test
(a dropped field fails it). The two call sites are not covered: ChatInput has no
render harness.

### `3a1b2e66` fix(ui): retry a hash target that was not loaded yet, and keep the follow

`applyHash` recorded the hash before running the scroll, so when the target turn was
not in the model yet the later pass — the effect depends on `turnIds.length` for
exactly that reason — returned early and the view never navigated. Both scroll
helpers also released the auto-follow before checking the target existed, so a
navigation that did nothing had already stopped the reader from being followed.

Evidence: a hook test renders with the hash and an empty turn list, then re-renders
with the turn; it fails before. The controller half has no test (no timeline render
harness).

### `2b2bb845` fix(ui): end a file navigation whose target cannot be opened in the editor

The pending-navigation effect bails out when the target is not editable but left the
request in the store, unlike the load-error and image branches above it. The store
entry is what the effect keys on, so selecting a different file re-ran it against
the stale target and selected that one instead.

Evidence: the effect has no render harness, so this one has no test.

## Third round

Areas neither earlier round had read: the sync internals, the AX Code client, the
settings surfaces, the preview/security server libraries, layout and the Electron main
process. Six reviewers ran in parallel; each finding was re-checked in the source before
anything was changed, and every fix was run against its pre-fix source to confirm the
new test fails without it.

| Reviewer | Area |
| --- | --- |
| Claude Code CLI (`--allowedTools Read Glob Grep -p`) | `ui/src/sync`, `ui/src/components/chat/lib/turns` |
| Grok CLI (`--permission-mode plan`) | `ui/src/components/layout` |
| `deepseek-flash` (ax-code, read-only) | `ui/src/lib/ax-code`, `ui/src/lib/api` |
| `qwen3.8-flash` (ax-code, read-only) | `ui/src/components/sections` |
| `MiniMax-M3` (ax-code, read-only) | `web/server/lib/{quota,security,preview,text}`, `ui/src/contexts` |
| `mimo-v2.6-pro` (ax-code, read-only) | `electron/src`, `electron/scripts` |

`mimo-v2.6-pro` returned nothing usable: it spent its budget re-issuing identical greps
and reported no confirmed bug. `k3-256k` had been refused by the upstream provider with an
HTTP 403 permission denial, not a rate limit, and `glm-5.3` was not needed this round. No
reviewer reported a rate limit or a truncated answer.

### `3aa60f9c` fix(sync): keep a failed reply, read and send from looking like a success

Four cases of the generated SDK's `{ error }` result being applied as data:

- **A refused auto-accept dropped a pending permission.** The permission resync
  answered an auto-accepting session's pending permissions and then dropped the session
  from the snapshot whether or not the reply succeeded. A refusal left the request pending
  server-side while the store lost it and the toast loop never saw it, so the agent stayed
  blocked with no dialog. The live event path already re-surfaces that case
  (`skipPermissionAutoAccept`); now only the answered requests are dropped.
  (`sync-context-impl.tsx`; no test — the resync runs inside the sync context, which has no
  harness that stops at it.)
- **A failed follow-up read wiped the session.** A rollback refetches the session's
  messages, and an empty record list is legitimate after one, so the error is the only way
  to tell a failed read from an empty session — unchecked, it emptied the conversation on
  screen while the rollback toast said success. (`session-actions.ts`, covered by a test
  that fails with `expected [] to deeply equal ['msg-kept']` on the pre-fix source.)
- **A refused shell-mode send looked delivered.** The shell branch discarded the result,
  so the composer cleared and the command never ran. (`session-ui-store.ts`, covered.)
- **A failed create lost the draft's target.** The new-session draft is closed before the
  create request and was not put back when it failed, so the retry started in whatever
  directory the app was on instead of the project, worktree, parent session and folder the
  user chose. (`session-ui-store.ts`, covered.)

### `f615c851` fix(preview): block the IPv4 an IPv6 address carries, and keep the CSP it sends

- **SSRF: the mapped-address check was textual.** `host.includes("::ffff:")` does not
  match the expanded form, so `http://[0:0:0:0:0:ffff:7f00:1]/` passed as an external host.
  Measured on this machine: connecting to that address reaches a listener on 127.0.0.1,
  while `::7f00:1` (the deprecated IPv4-compatible form) gives `EHOSTUNREACH`. The address
  is expanded to its eight groups now and the IPv4 rules decide, which blocks every
  mapped form of a private address, still refuses the compatible form (so no reader has to
  know which of the two the kernel routes), and lets a mapped public address through
  instead of refusing it for its spelling. (`proxy-runtime.js`; two tests fail on the
  pre-fix source.)
- **The patched `addEventListener` leaked.** Adding a callback that was already
  registered inserted a second entry into the listener set while the callback map kept only
  the newest, so the page's single `removeEventListener` could not reach the first one: the
  orphan kept firing, and kept its closure and the page's DOM alive, for the life of the
  preview. Re-adding is a no-op now, as on the platform. (`.test.js`-less: the bridge is an
  injected script string with no harness.)
- **An upstream's CSP was replaced, not extended**, when it sent the policy as repeated
  headers: Express hands that over as an array and only the string form was read.
  (`mergeExternalPreviewSandboxCsp` is a module-level function now so the merge is
  covered; the four tests fail on the pre-fix source.)

### Reviewed and not changed

- **`formatPromptSendError` maps any failure carrying `details.resource: "providerModel"`
  to "The selected model is no longer available"**, without looking at the status, so a
  429/5xx envelope with that resource would be reported as a stale model. The envelope's
  status is the backend's to define and a `status === 400` guard could regress the case the
  message exists for, so the mapping is left as it is.
- **The provider circuit breaker counts to the threshold from the first failure** rather
  than needing a recorded success first, and `recordProviderSuccess` no-ops for a provider
  that never failed. Both are how the tracker is written; nothing user-visible follows from
  it.
- **`locationMatchesHost` treats a bare-origin host as matching every path on that
  origin.** Cosmetic (window title, header label), and it reads as intentional.
- **A stale HTTP snapshot can revert a `completed` tool part to `running`** in
  `materializeSessionSnapshots`, where the live reducer has `shouldPreserveExistingPart`.
  The reviewer could not establish that the ordering window is reachable, and guessing at
  snapshot ordering is worse than the current behaviour.
- **`disconnectProviderAuth` builds a `new URL(baseUrl, origin)` whose second argument is
  already absolute**, so the fallback is dead code. The reviewer's own note is that the
  result is correct today; nothing to fix without a behaviour change.

### `dff3a3c2` fix(ui): close the remaining leads from this round

- **A preview probe that read a 403 or 404 as the proxy's own refusal re-registered the
  target forever** (`layout/ContextPanel-impl.tsx:773`), over an application's own 404 page,
  and the frame never mounted. The proxy marks its own refusals
  (`PREVIEW_REFUSAL_HEADER`, `web/server/lib/preview/proxy-runtime.js`) so the probe can tell
  them apart; an application's answer is reachable. No test: the probe lives in a component
  that renders the whole panel.
- **The address bar missed in-page navigation** (`layout/ContextPanel-impl.tsx:1772`):
  Electron reports the URL on the event itself, as `readDesktopBrowserLoadFailure` and
  `readDesktopBrowserNewWindowNavigation` already read theirs, and the handler read only the
  compatibility `detail`. `readDesktopBrowserInPageNavigation` reads both; three tests cover
  it, and the event-field case fails on the pre-fix reader.
- **A command reply that landed after the agent browser unmounted restored the closed
  browser** (`layout/EmbeddedWebMcpBrowser.tsx:197`): `lifecycleRef` is retired on unmount
  now, so the reply fails the lifecycle check instead of writing `phase: "ready"` with the
  `browserId` the cleanup had cleared. Covered; the test fails with `expected 'ready' to be
  'idle'` on the pre-fix source.
- **The non-Electron iframe could be left behind its loading overlay**
  (`layout/ContextPanel-impl.tsx:1677`): the iframe's `load` waits for every subresource, so
  one that never finished kept the click-taking overlay over a usable page. It carries the
  same 30 s safety timeout the desktop pane has. No test: the pane is not exported.
- **`EnvEditor` keyed its reveal state by row position** (`sections/mcp/McpPage.tsx:278`):
  removing a row above a revealed one printed the next row's secret in plain text and
  re-masked the revealed one. `revealedRowsAfterRemoval` moves the positions with the rows;
  five tests cover it.
- **`SnippetsPage` re-populated the form from a background reload**
  (`sections/snippets/SnippetsPage.tsx:60`): deleting another snippet re-fetches the list,
  every snippet object is new, and the effect overwrote unsaved edits and reset the
  baseline. A run that is not a selection change leaves unsaved edits alone now. No test:
  the page needs the whole settings surface.
- **`removeSelectedCatalog` had no `catch`**
  (`sections/skills/catalog/SkillsCatalogPage.tsx:143`): a refused settings write escaped as
  an unhandled rejection, the dialog stayed open and nothing said the catalog was still
  there. It reports through the page's existing catalog error banner
  (`useSkillsCatalogStore.reportCatalogError`), so no new user-visible string was needed.

### `0d6377fb` fix(mcp): the two suspected leads, both confirmed

- **The resource preview's staleness guard compared the uri alone**
  (`sections/mcp/McpResourceBrowser.tsx:64`), while the read is parameterized by its client,
  uri *and* directory: the same resource read under another project arrived as the new
  project's preview and cleared its loading state while it was still reading. The read
  carries a token, retired when the target changes. Two tests fail on the pre-fix guard.
- **The MCP OAuth callback page exchanged its code from an effect with no once-guard**
  (`sections/mcp/McpOAuthCallbackPage.tsx:120`): an authorization code is single-use, and the
  second exchange — React's development StrictMode invokes the effect twice, and the page can
  remount — fails at the provider and replaced the success the page had just shown with that
  failure. A code is exchanged once; a failed exchange releases it so a retry can try again.
  Three tests cover it; the StrictMode case reports two exchanges on the pre-fix page.

## Fourth round

The surfaces left after three rounds: the filesystem and terminal server libraries, the AX Code
proxy routes, the worktree and message libraries, chat, the Electron main process and the packaging
scripts. Six reviewers ran in parallel; two produced nothing usable (see below), and every finding
acted on was re-checked in the source and run against its pre-fix source.

| Reviewer | Area |
| --- | --- |
| Claude Code CLI | `web/server/lib/{fs,terminal,event-stream}` |
| `deepseek-flash` (ax-code, read-only) | `web/server/lib/ax-code` |
| `qwen3.8-flash` → `MiniMax-M3` (ax-code, read-only) | `script`, `desktop/scripts`, `electron/scripts` |
| Muse CLI (`--trust-workspace`) | `ui/src/lib/{http,persistence,worktrees,messages}` |
| `glm-5.3` (ax-code, read-only) | `ui/src/components/chat` |
| Grok CLI | `electron/src/main.js` |

No reviewer reported a rate limit or a truncated answer. The Grok CLI run for the Electron main
process was first blocked by a shell command its plan mode would not approve; told to read and grep
only, it returned five confirmed findings on `main.js`. The `qwen3.8-flash` run failed with a
provider error and its re-run on `MiniMax-M3` ended in a model output loop, so the packaging scripts
were not reviewed by a machine.

### `7120e97a` fix(fs): act on the entry the user named, not what it points at

- **Delete and rename acted on the realpath**, which resolves a symlink in the final position to
  its target: deleting a link removed the target (a linked directory took the whole directory with
  it) and renaming one renamed the target and left the link dangling. The directory chain is still
  resolved through the same cache the containment check used, so an intermediate component that
  became a link is still followed; the final entry is acted on as written.
- **The realpath cache cached its misses** for 60 s, so a directory that did not exist when it was
  first listed answered "Directory not found" after it was created. A successful mkdir, write,
  delete or rename invalidates the cache.
- **The terminal input WebSocket's heartbeat only pinged**: a peer that stopped answering kept its
  session binding and interval until the operating system noticed. Two silent intervals end it now.
  (No test: the runtime exposes only its shutdown.)

### `84d610ed` fix(ax-code): set the credential file's mode, and stop inventing agents

- **`writeAuthFile`'s `mode: 0o600` only applies when the file is created** (and only as far as the
  umask allows), so an `auth.json` restored from a backup kept looser permissions while the log line
  reported success. It is chmodded like every other credential file here.
- **`deleteAgent` wrote `disable: true` for any name it could not find**, so deleting a name that
  existed nowhere answered "deleted successfully", appended a marker that would suppress a later
  agent of that name, and restarted the runtime for nothing. The route asks the runtime whether it
  knows the agent; a name it does not know is answered as not found, and a built-in agent is still
  disabled as before.

### `be7fbe50` fix(ax-code): bound a runtime call so a wedged runtime cannot hang the request

- **The prompt and command forwards had no timeout**: a runtime that accepted the connection and
  stopped answering left the request pending for as long as the client waited, so the 503 that would
  have told the client to retry never ran. The long-request timeout the server already defines — and
  passed to `registerAxCodeProxy`, which never read it — covers them now.

### Reviewed and not changed

- **The project icon's `immutable` year-long cache** is not a defect: the client appends
  `?v=<iconImage.updatedAt>` (`ui/src/lib/projectMeta.ts:75`), so a replaced or deleted icon is a
  different URL. The reviewer read the route without its caller.
- **An over-limit body on the prompt path** does reach the client: the streamed read rejects with a
  413 and Express 5 hands it to the final error handler, which keeps the status
  (`lib/final-error-handler.js`), and the JSON path is capped by the body parser first. A test now
  covers that contract.

### `343b0e52` fix(ui): keep a stale answer, save or fence from winning over the newer one

- **A worktree listing already on its way when a create or removal invalidated the cache** was
  written into it anyway: the new worktree stayed missing from the list — or the removed one came
  back — for the whole 30 s TTL. Listings carry a generation now, and a caller arriving after the
  invalidation is not handed the obsolete answer the dedup map held.
- **Clearing a worktree's bootstrap state left its running poll behind**: the poll wrote its answer
  back, and a stale `ready` let a worktree re-created at the same path pass its own wait before its
  setup commands had run, while a stale `failed` was answered to every later caller instead of
  asking the runtime. A retired poll leaves the state alone, and a replaced wait no longer drops the
  new one's entry.
- **Two overlapping settings flushes** let the older response land last and put the value it carried
  back into the store, the cache and the interface while the server held the newer one.
- **A selected code block that itself contains a fence** closed the block early, so the code after
  it became prose and the user's comment was swallowed by the block.
- **A `step-finish` part with all-zero usage is a placeholder, not a measurement**, and taking it as
  the answer left the context meter at nothing for the rest of the turn.

### `4b3425ed` fix(chat): keep a rendered part's file references alive when the stream ends

The markdown renderer's memo comparator left `enableFileReferences` out, so a part that finished
streaming kept the dead links it had rendered while streaming — the prop changes exactly at that
point, and the skipped re-render left the reader with links that do nothing. The comparator moved to
its own module (the lint rule forbids exporting a function from a component file), covers every prop
the render reads, and a test pins that contract.

### `b56c5f39` fix(electron): honour the app that was chosen, and the window that is ready

- **`desktop_search_files` checked the root it was given, not what it resolves to**: a symlink to a
  credential store is not the string that names the denied directory, and `stat`/`readdir` both
  follow the link, so the search listed the names `desktop_read_file` refuses. The root is resolved
  first, as the read path does.
- **A notification click** only focused a window that existed and then sent the session to every
  window: with every window closed it opened nothing, and with one still loading the event was
  dropped before the app had mounted its listener.
- **A menu action for a renderer that is not listening** was dropped, so the quick-dispatch shortcut
  focused a freshly created window and opened no panel.
- **An install that never started** left the app torn down — services stopped, `isQuitting` set,
  `window-all-closed` refusing to quit and `activate` refusing to open a window. It relaunches.
- **On Windows, `desktop_open_path` ignored the `app` name** the caller fell back with and opened the
  path through the default handler while answering success.

### `52aa1693` fix(chat): a command is not a queue entry, and a diagram follows its setting

- **The composer's own commands could be queued**, where the queue's two dispatch paths disagreed
  about one: the chip ran it through the command-aware submit while auto-send delivered it to the
  model as text. A command runs when it is sent, so queueing one sends it, and the queue can no
  longer hold one — which is also what let a flush beginning with a command clear the rest of the
  queue and the composer draft before running it.
- **The mermaid block's rendering mode was read with `getState()`** where the block was created, so
  flipping the setting never re-rendered a diagram already on screen.

### One unresolved flake

Occasional full-run flakiness in the web package: five different test files that pass every time in
isolation have failed six times across these rounds with a response they cannot produce — `expected
200, got 401` five times (the last on a `GET /api/config/plugins` whose app carries no auth
middleware at all), `socket hang up` once, and once a body of `{}` where the route answers `{ok:true}`
or `{error:"Forbidden"}`. Nothing in the affected apps answers 401, and running the web
package alone (125 files, 1097 tests) passes on every attempt, including three consecutive runs
after the last failure.

One mechanism was tested and ruled out: Node 19+ keeps sockets alive in the default HTTP agent, so a
socket could in principle be reused for a recycled port and answered by whichever server took it. A
probe that closes a server and binds another to the same port shows the pooled socket dying with its
server (`ECONNRESET`) and the port not being reused immediately, so that is not it. The remaining
lead is the socket-level 401 in `lib/security/request-security.js`, which is the only code in the
server that writes that status without a route.

Two more full runs failed once each in a web file that passes alone — `server/lib/ax-code/core-routes.test.js`
("should parse JSON bodies for MCP auth pending routes") and `openchamber-routes.test.js` — both times
while the only source changes were in the ui package.

Another full run failed once in `server/lib/ax-code/config-entity-routes.test.js` ("still reports 500
for an unexpected mutation failure") while its neighbours passed; the file passed alone immediately
after, and re-running the file alone then failed a *different* case in it, which is the same signature
seen from the other side. The source changes in that run were all in the ui package.

Later the same flake hit three cases in one file, `server/lib/github/routes.test.js` (credential
clearing, and two about the repo the caller names), on a full run whose only source changes were in
the ui package; the package passed alone immediately afterwards and the full suite passed on the next
run. Same signature, different file.

## Fifth round

The surfaces the earlier rounds read once or not at all: `ui/src/lib` minus the files already
fixed, the packaging scripts and workflows, the settings pages, the server services, the supervision
and multi-run surfaces, the hooks and the stores. Seven reviewers ran in parallel with the same
prompts; this round produced more confirmed findings than any before it, so the list below is split
between what has been fixed and what is still waiting for a first re-check against the source.

| Reviewer | Area |
| --- | --- |
| Claude Code CLI | `ui/src/lib/**` minus the files already fixed |
| Muse CLI (`--trust-workspace`) | `sections/{providers,models,ax-code}` |
| Grok CLI | `script/**`, `.github/workflows/**` |
| `deepseek-flash` (ax-code, read-only) | `web/server/lib/{github,magic-prompts,session-folders,proxy}` |
| `glm-5.3` (ax-code, read-only) | `components/{supervision,multirun}`, `apps` |
| `qwen3.8-flash` (ax-code, read-only) | `ui/src/hooks/**` |
| `MiniMax-M3` (ax-code, read-only) | `ui/src/stores/**` |

No reviewer reported a rate limit or a truncated answer; the Grok CLI run had not finished when this
was written.

### Fixed from this round

- **`171145cb`** — the three GitHub *issue* routes answered 500 when the stored token had been
  revoked, and the list route's per-repo handler swallowed the failure into an empty list, so the
  app looked connected with an empty tab; every PR route and `auth/status` already clear the
  credentials on a 401. The search fallback's 403 memo is account-scoped state and was not cleared
  with the caches it belongs to, so a switch to a properly scoped account kept answering "no pull
  request" for the whole retry window. The skills catalog store's load sequence guarded the loading
  flag and the error, not the page it writes, so an older load that answered last replaced the newer
  source list (`930c770d`).
- **`30a16fb6`** — the git status TTL cache (1.2 s) was never evicted by a mutation and the UI
  refreshes right after one, so the refresh returned the pre-mutation status and a second click on
  the stale row acted on the wrong state; every request in that module now goes through one wrapper
  that drops the cached status of a successful non-GET. `substituteCommandVariables` injected a path
  as a string replacement, mangling `$` patterns in it and substituting a path that itself looked
  like the variable. The loopback URL pattern had no boundary after the host or port, so
  `http://localhost.evil.example/x` was offered as `http://localhost/`. Removing a plan entry deleted
  whatever path the config named, which a config cloned into a repository can point anywhere.

### More fixed from this round

- **`db1d7741`** — both boundary checkers had a reachable hole: an alias specifier that walked out of
  its source tree (`@/../electron/src/…`) was normalized before the web-alias rule looked at it, and
  the store checker walked imports and dynamic imports but not `export … from`, so a module could
  re-export the connection-state writers while R5 passed. The installer qualification's `finally`
  also let a failed unmount replace the signature failure it was unwinding.
- **`bcd580f2`** — a custom provider's ID came from the endpoint's hostname alone, so Ollama on
  `:11434` and LM Studio on `:1234` both derived `localhost` and the second save upserted over the
  first, dropping its endpoint, token and models.
- **`8c271256`** — the settings page cleared a saved `defaultVariant` while the provider list was
  still loading, where an empty list means "not known yet", and persisted the empty value.
- **`965d1059`** — a rejected worktree-root probe on every Git view mount, and a rejected tray IPC
  that kept repeating on every store change and poll.

- **`8f52bdaf`** — the OAuth Connect and Complete handlers were given a method's position among the
  OAuth entries while the server indexes the provider's whole method list, so with `[api, oauth]` the
  flow was started with index 0, the API method. The local models page's load guard only knew that
  something was in flight, so a project switch was swallowed by the previous project's request and
  that answer became the page's state while every action ran against the current directory.

- **`afd9783e`** — the session-retention cleanup's re-entry guard was a ref inside the hook while the
  hook is mounted twice (the app-wide run and the settings page's manual run), so two runs built the
  same candidate list and deleted every session twice, and the manual run reported the sessions it had
  just deleted as failures. The run in flight is shared now and a later call joins it, which also
  answers the second half of that finding: the manual click reports the run's real outcome instead of
  an empty one.

- **`711c34c0`** — three multi-run defects that each threw away input the UI had already collected.
  `MultiRunLauncher` listened for Escape on `window` in the *capture* phase and called
  `stopPropagation`, so the listener ran before the prompt autocompletes ever saw the event: Escape
  with a command, file or snippet popup open closed the whole launcher and dropped every typed prompt.
  It now listens on the bubble phase and returns early on `defaultPrevented`, which is the flag
  `handlePromptKeyDown` sets when a popup consumes Escape. `MultiRunWindow` handed the launcher
  `onCancel={() => onOpenChange(false)}`, walking past the `hasOpenFloatingMenu()` guard that its own
  base-ui `Dialog` handler and a comment above it exist to uphold; the launcher now receives
  `requestClose`, which honours the guard. `MultiRunFusionDialog` rebuilt its source list from the live
  sessions inside an effect that had the live session array in its dependency list and wrote the result
  back unconditionally, so any session event resurrected a source the user had dismissed with the ✕ and
  silently put it back into the fusion prompt; exclusions are now a session-id set, applied during the
  rebuild and cleared when the dialog closes. This round also gave the `multirun` surface its first
  test harness (jsdom + `createRoot`, stubbed stores): `MultiRunLauncher.test.tsx`,
  `MultiRunFusionDialog.test.tsx` and `MultiRunWindow.test.tsx`, each case confirmed failing against the
  previous code.

- **`84d281ca`** — the manual "run cleanup now" button forces the run, which bypasses the disabled and
  cooldown skips but not the `isLoading` guard: the "keep the newest N" protection cannot pick a correct
  set from a partially loaded session list, so the run is refused. That refusal returned empty
  completed/failed lists and the settings page read an empty result as "no sessions eligible for
  deletion" — it told the user their sessions had been checked and had passed when none had been
  evaluated. The page now reads the `skippedReason` the hook already returned and says the sessions are
  still loading; the neighbouring outcomes (genuinely none eligible, and a counted success) are pinned
  too. The new string is in English and all 14 catalogs, each in that file's own escaping style, so
  `pnpm run check:locales` stays green (4 691 keys, 60 983 translated entries).

- **`e5fb2707`** — two ways the multi-run launcher's run count disagreed with what happened. The start
  button counted every group's models, but `handleSubmit` drops a group with an empty prompt, so filling
  one group and leaving a second group's prompt blank showed "Start (5 runs)" for a submission that
  created two; the count now uses the same predicate as the submit path, through one shared
  `isSubmittableGroup` helper. The store creates runs one at a time, logs a run whose session or
  worktree could not be created, cleans up its worktree, and still returns a non-null result — the
  launcher closed on that partial success as if every lane had started and the only trace was a console
  warning, so the user had to notice the missing lanes themselves; the launcher now compares created
  sessions against the requested count and reports how many started.

- **`778f7929`** — the mini-chat window's "session unavailable" screen never arrived while a sibling
  session was active. The wait was an effect whose dependency list included the directory's session
  array; that array gets a fresh identity on every session event, so each run cleared and recreated the
  five-second timer, turning "no sign of this session for five seconds" into "five seconds without any
  session activity at all". The deadline is anchored when the wait starts now, and the hook moved to
  `apps/useMiniChatSessionUnavailable.ts` next to `miniChatPresence.ts` so it can be tested without
  mounting the whole app.

- **`68aa6de1`** — two defects around the project config file. Every config save reads the whole file,
  merges one key and writes it back, so two overlapping saves each started from the file as it was
  before the other; creating a plan while another save was in flight kept the plan's markdown file but
  lost its link, leaving the plan invisible and the file orphaned. Saves for one project now run
  through a queue, and the read a save is built from happens inside it, including the link append and
  the link removal in the plan routes. `readProjectPlanFile` also read whatever path a stored link
  named — the delete path already refused to act outside the plans directory, but this read had no
  check at all, so a config cloned into a repository could point a plan at any file on the machine and
  the panel showed that file's first line as the plan's title. Both checks compared the written strings
  by prefix, which `<plans>/../../…/etc/passwd` passes while the filesystem resolves it above the root;
  the new `projectPathIsInsideRoot` collapses `.` and `..` the way a filesystem does before comparing.

- **`8b319302`** — the providers page tracked the authorization flow awaiting a code in a single slot, so
  starting a second flow replaced the first: the first method's paste field and Complete button
  disappeared while its verification URL and user code stayed on screen, and the browser flow it had
  already opened could no longer be finished from the app. Each flow keeps its own slot now, and
  completing one removes only that one. The list block's Complete button also compared its busy state
  against the method's position among the OAuth entries rather than its position in the provider's whole
  method list, so with `[api, oauth]` it could never match the busy key it had set and never showed that
  it was saving — a residual instance of the index bug fixed in `8f52bdaf`. This page had no component
  test until now; the new render case starts both OAuth methods and asserts both code fields exist, and
  fails against the previous code.

- **`e0d5a225`** — of the two `stores/**` leads left in the waiting list, one turned out to be a defect
  in the store the others were reported against. `loadAgents` marks a project's selection as the user's
  (`"manual"`) or the inherited default (`"auto"`), and a later run lets a still-selectable manual pick
  win over the settings default. With an empty provider list nothing can be resolved — both the
  last-resort and settings-default paths need a model from that list — so the snapshot keeps its
  provider and model, but its source was written as `"auto"`, and the next run then applied the settings
  default over the user's pick. An empty list is reachable for a project whose agent name is unset: a run
  with an empty agents list clears that name, and auth connect/disconnect empties every provider snapshot
  while AX Code restarts. The other lead — an epoch check for `loadAgents` against
  `invalidateAllProviderCaches` — is closed under *Reviewed and deliberately not changed*.

- **`d3aef642`** — `PullRequestSection`'s body-hydration flag was left in the waiting list as suspected,
  because it depended on React flushing a passive effect's cleanup before a promise chain's `.finally`
  continues. That ordering was settled by experiment rather than by argument: it does — when the chain's
  own store update is what re-rendered the component. The cleanup cancels the attempt, so `.finally`
  returned early without clearing the flag, and the re-run returned early because `pr.body` was already
  filled in, with the empty string the request returned. A pull request with no description is the
  reachable case, and it left "Loading description…" where "No description" belongs, permanently. The
  attempt's cleanup clears the flag now, and a test renders the section for exactly that case and fails
  against the previous code.

### Waiting for a first re-check

Everything the reviewers of this round reported has been read against the source. The items closed
under *Reviewed and deliberately not changed* below, the ones fixed above, and the `script/**` /
`.github/workflows/**` run — which finished after the fix it was about to report had been written, see
below. Where a reviewer's lead reached a surface that had no test harness, the harness is noted with
the fix: the `multirun` components, the mini-chat's unavailability wait and the providers page gained
their first component tests in this round.

The `script/**` and workflows reviewer finished at 09:02 with three findings, and `db1d7741` was
committed at 09:08 with all three already fixed — it had read the tree as it was when the assertion
about the alias was still open:

- `check-desktop-boundaries.ts:141` — an alias that walks out of its tree (`@/../electron/src/x.js`)
  was normalized before the web-alias rule looked at it. The rule now judges the specifier as written
  and resolves the alias for the sibling-source rule (`script/check-desktop-boundaries.test.ts:75-81`).
- `check-desktop-store-boundaries.ts:363` — the walker saw imports and dynamic imports but not
  `export … from`, so a module could re-export the connection-state writers while R5 passed. It visits
  export declarations now (`script/check-desktop-store-boundaries.test.ts:166,187`).
- `native-installer-qualification.mjs:197` — a failed `hdiutil detach` inside `finally` replaced the
  signature or copy failure being unwound. The detach has its own `catch` that warns.

## Sixth round

The surfaces no earlier round read, plus a second pass over two of them. Eight reviewers, again the same
prompt; two runs ended in a transport failure and produced nothing, and are listed as needing a re-run.

| Reviewer | Area | Outcome |
| --- | --- | --- |
| Claude Code CLI | `components/{auth,desktop,update,ui,icon,icons}` | 5 findings, 4 confirmed |
| Muse CLI (`--trust-workspace`) | `components/views/**` | 5 findings, 3 confirmed (2 fixed, 1 verified) |
| `deepseek-flash` (ax-code) | server `{desktop,notifications,projects,scheduled-task-convergence,skills-catalog,ui-auth}`, `desktop-owned-routes.js`, `index.js` | 2 findings, 1 confirmed |
| `glm-5.3` (ax-code) | `components/{dashboard,comments,model-picker,notifications,mcp,onboarding}` | finished, not yet read |
| `qwen3.8-flash` (ax-code) | `components/{session,files,projects,terminal}` | **failed**: transport error after reading |
| `MiniMax-M3` (ax-code) | `sync/**` | **failed**: transport error after reading |
| Grok CLI | `desktop/shared/**`, `config/**`, `tools/**`, `lib/{i18n,theme}` | still running |
| `mimo-v2.6-pro` (ax-code) | server `{git,projects,notifications}` | still running |

### Fixed from this round

- **`c20fa7dc`** — four defects, each with a test that fails against the previous code. The overlay
  scrollbar cancelled its pending metrics frame on teardown but left the id in the ref, and only the
  frame's own callback cleared it, so the guard skipped every later request and the thumb stopped
  following content growth and resizes for the life of that instance. The release-note decoder passed an
  entity such as `&#x110000;` to `String.fromCodePoint` behind a `Number.isFinite` guard, which throws a
  RangeError while the update dialog renders, so the notes and the buttons with them never appeared.
  `useConfirmDialog` replaced a pending request without settling it, so the first caller awaited a
  promise nothing could settle — and anything it meant to do afterwards, a busy flag for one, never ran.
  The passkey setup button stayed `disabled` while the register ceremony ran inside the password unlock,
  so it showed "Cancel passkey setup" with that cancel short-circuited by the same flag: the user could
  not dismiss an OS prompt from the app.
- **`396feb78`** — the migration's fan-out title reserved room for its ` (i/N)` suffix and cut the name
  with `slice` before clamping. The sliced value is always short enough for the clamp's early return, so
  the surrogate-pair check never ran on that path: a name with a non-BMP character on the cut boundary
  produced a title ending in a lone high surrogate, which the runtime stores as a replacement character.
  The UI's `truncateToCodeUnits`, which the comment says must stay in sync, already behaved this way.
- **`2e7b1456`** — New File, New Folder, Rename and Delete all closed their dialog after the Files API
  resolved, and `finishDialogOperation` only closes the dialog. The API reports failure by resolving
  `{ success: false }` — the editor save and the hunk revert both treat that as a failure — so the
  dialog closed with no toast at all: the user believed the file had been created, renamed or deleted
  when nothing had happened, and the rejection path this API does not use was the only error branch.
  Each branch reports the failure and leaves the dialog open now. This view had no test harness; it has
  one now, and the refused-creation case fails against the previous code.
- **`a23a8519`** — two more from the views reviewer. The pull request section's focus and visibility
  handlers decided whether to refresh from a value computed when the effect last ran, and that effect
  re-runs when the entry's `lastRefreshAt` changes — so once any refresh had happened the answer was
  "not stale" and stayed there: refocusing the window after any amount of time never refreshed again.
  The branch-name sanitizer, which promises a name git accepts, left a dot-leading component alone, so
  `feature/.hidden` came back unchanged and the create failed against git's own check, and it returned
  `@`, which is not a ref name on its own.

- **`58755e76`** — committing a selection while other files are staged temporarily unstages them with
  `restore --staged` and then restored them with `git add`, which stages the *worktree* content. For a
  file that was staged and then edited again (the `MM` state) the edits the user deliberately left
  unstaged were folded into the index and would have been swept into the next commit, a staged state
  that differs from the file could not be restored at all, and a failed restore was only logged while
  the commit reported success. The index entry of each file — mode and blob, read with
  `ls-files --stage -z` — is captured before the unstage and put back with `update-index --cacheinfo`
  on both paths of the commit, so no worktree content is involved.
- **`623bea47`** — the permission-notification debounce flush deleted its session entry before it
  started awaiting, and each ask's flush then walks settings, template variables and the emitters over
  hundreds of milliseconds to seconds. A `permission.replied` arriving in that window found no entry to
  remove and nothing recorded the answer, so the prompt was announced after the user had already
  approved or denied it — the exact case the "drop only the replied ask" rule exists for. Answered keys
  are remembered now and the flush checks them once more immediately before emitting.
- **`2246cac3`** — `git stash apply --help` prints usage and exits 0, so nothing was applied, popped or
  dropped while the route answered success. This is the leading-`-` argv hazard the branch, rename and
  log routes guard with `isOptionLikeRevision`; the three stash routes never applied it.

- **`a58f3042`** — the standalone language save (no desktop bridge) took only the stored *revision*
  into account and wrote this tab's in-memory fields back with it. A tab that had not applied another
  tab's newer record yet therefore wrote its stale field over the newer one, under a revision that then
  made the other tab's value lose too: changing the interface language in one tab reset the conversation
  language the other tab had just chosen. The stored record is read as a whole now.
- **`3e9e1ef6`** — Vitesse Light carried `interactive.cursor: #CECDC3` on `#ffffff`, 1.6:1, below the 3:1
  WCAG asks of a non-text indicator. That colour is the editor caret and the terminal cursor, so in that
  theme neither could be seen; every other bundled theme sits at 6.2:1 or better. The cursor is the
  theme's own foreground now, and the contrast audit checks the cursor pair as a *hard* rule so the next
  theme that ships an invisible caret fails the bundled-theme audit.
- **`a61353c3`** — the bootstrap reload treats its page of root sessions as authoritative, which holds
  only for sessions that existed when the page was read: a session created while the request was in
  flight is legitimately absent from it, and dropping it hid the session the user had just created until
  the runtime's next update for it (the sidebar lost it, `useEnsureSessionMessages` refused to fetch for
  it, and the mini-chat's availability check counted it as gone). The merge is told which sessions the
  client already knew when the request went out and carries over any root it did not.
- **`65ecb6e7`** — `updateStreamingState` derives the streaming map from one directory's state and
  rebuilt two of its three maps from empty, so a session belonging to another directory was not
  completed — it was dropped — every time the active directory's store ticked for any reason. The
  directory the user was watching lost its streaming indicator until its own store happened to tick
  again.
- **`0ea4ff20`** — a file read that finished after the composer moved to another draft was discarded: the
  generation check returned without putting it anywhere, and the list the draft switch stashed was the
  one from before the read finished. A late read now lands in the draft it was started from, and still
  disappears when that draft's files were cleared or replaced.

- **`24742167`** — the MCP dropdown toggles a server through `connect` (which re-throws on failure) and
  `disconnect` (which asks for errors), and it is the only caller of either that reads neither the
  diagnostics the store records for them nor anything else the user can see: with no catch the switch
  snapped back in silence and the rejection escaped the handler. The failure is reported now, with the
  same message the dropdown's own status tooltip uses.
- **`cdcb9d27`** — both recovery-screen actions end in a write or a restart that can reject — a Tauri
  invoke that fails, or a reload request against the server that is already unreachable, which is
  usually what put the user on that screen. Neither had a catch: the click did nothing at all (no
  restart, no reload, and not even the `onRetry` the handler still owed its caller) and the rejection
  escaped the handler. The sibling onboarding screens carry the same fix and say so in a comment. The
  fallback string is in English and all 14 catalogs.
- **`7e3a192f`** — the delete-worktree dialog inspects the worktree asynchronously and only then renders
  the uncommitted-changes warning, while the removal itself is forced. The confirm button waited only
  on the in-flight flag, so a click in that window removed the worktree — and the uncommitted work with
  it — before the user could see any warning at all. The button waits for the check now, and the
  handler refuses the same case.
- **`b59b5840`** — the model picker's highlight reset listed `onActiveEntryChange` among its
  dependencies and every call site passes an inline arrow, so any parent re-render (a thinking-variant
  key, a window resize) re-ran it although the list was unchanged: the highlight jumped back to the
  first row and the next Enter selected a different model than the one the user had navigated to and
  configured. The reset is keyed on the list itself now.
- **`f3c43ba3`** — the todo send dialog guards against a second confirm with the `submitting` prop,
  which the handler sets only after two awaited prompt renders. Two confirms in the same tick (a click
  and Cmd+Enter) both passed it, and each created a session and sent the same message. The handler
  takes an in-flight ref before the prompts, and the prompts moved inside its `try`.

### Verified from this round, not yet fixed

Read against the source and confirmed, waiting for a fix rather than a re-check:

- **`IntegrateCommitsSection.tsx:307`** (suspected) — `handleAbort` toasts "aborted" and clears the
  persisted conflict state, but `abortIntegrate` swallows both exec failures it performs, so a failed
  worktree removal leaves the half-finished cherry-pick on disk while the UI reports success.
- **`PlanView.tsx:453`** (suspected) — the autosave effect has no dirty check against the content it
  loaded, so merely opening a plan schedules a write of the just-loaded text ~350 ms later; an external
  write landing in that window is overwritten by content the user never edited.
- **`d4671753`** — the suspected bracketed-paste lead was real. Pasting into the touch hidden input
  wrapped the clipboard text in the bracketed paste markers without looking at the text: a payload that
  contains the closing marker — copied out of a terminal, or crafted — ends the paste there, and
  everything after it is read as ordinary input, newlines included, which is what the wrapper exists to
  prevent. Both markers are stripped from the text before it is wrapped, in the 7-bit and 8-bit
  spellings; `buildPastedInput` holds that rule with a test.
- **`1ecb7d31`** — the chooser screen's CLI probe and the write that records the local choice shared one
  try/catch, so a reachable CLI whose write failed was swallowed and the poll retried the same write
  every couple of seconds, silently and endlessly, with the user behind the "watching" spinner of a
  screen that had already verified the CLI. The manual "check now" button had no catch at all. The probe
  retries now; a failed announce is reported and ends the poll, and the manual check reports it too.
- **`6fd4fa79`** — both remaining session-export findings. The export read messages from the store
  keyed by the session's own directory but loaded them through `useSync()`, which follows the directory
  that is open: exporting a session from another project wrote an empty file, or whatever event
  fragments that store happened to hold. `useSync` takes an optional directory now. And the export read
  the snapshot straight after the initial page load, so a session longer than 150 messages exported
  short, silently, with the UI reporting success; `loadAllSessionRecords` drains the remaining pages and
  stops when a page adds nothing, so a repeating cursor cannot spin it.
- **`sync/soft-removal.ts:223`** (confirmed by the sync reviewer) — the undo window's timer commits the
  removal on its own 7-second clock while the toast pauses its own countdown on hover, so Undo after the
  timer fired only rewrites a record the commit already took: the session stays hidden and the delete
  still goes out. Cancelling work that is already in flight needs a decision about what the server half
  of it should do, which is more than a local fix.
- **`69aff63a`** — the snapshot-materialization cooldown was a timestamp in a map and every request
  cleared its own key on the way out, so a request that outlived the cooldown let a second start and
  then, finishing last, cleared the second's registration while it was still running (and the next gap
  started a third alongside it). The first request also wrote the snapshot it had fetched *before* the
  second published anything, and a snapshot replaces the message list, so parts and messages could
  regress to their older state. Each request takes a claim now and a newer claim supersedes it.
- **`notifications/runtime.js:505`** (suspected, from the same reviewer as the flush fix above) — the
  `question.asked` path still replaces a pending question notification instead of coalescing it in a
  map the way the permission path does, so a burst of questions may announce only the last one. It
  stays suspected because the opposite reading is plausible: if a question keyed by session is re-emitted
  on every update, replacing is the correct debounce and announcing each would duplicate.

### Reviewed and not changed from this round

- **`AxCodeUpdateToast` does not re-announce after notifications are switched off and on**
  (`components/update/AxCodeUpdateToast.tsx:226,335`). The dedup module documents its own intent
  (`components/update/axCodeUpdateDedup.ts`): the seen set means "already surfaced in this tab session",
  and a version the user dismissed is tracked separately in `dismissedVersion`. Re-announcing on a
  settings toggle would contradict that record rather than complete it, and no user-visible loss was
  established beyond the toast not returning until a reload.
- **`permission.asked` and `permission.replied` resolve their request id with inverted field precedence**
  (`web/server/lib/notifications/runtime.js:435,462`). Each handler prefers the field its own event
  carries (`replied` → `requestID`, `asked` → `id`) and falls back to the other spellings, so the two
  orders disagree only for a payload that carries both fields with different values, which the record of
  the event shapes does not describe. Left as written.

## Limit audit

Prompted by the caps that produced the findings above, the hard limits in the
client, the web server and the Electron main process were audited for caps that
drop user data or user intent without saying so. The caps that are fine, and why:

- **Notes, to-do text and plan titles** (`openchamberConfig`): the editor enforces
  the same limit with a visible `length/max` counter and truncates as you type, so
  the sanitiser's cut is a second line of defence, not the only one.
- **Runtime supervisor diagnostics** (`CAPTURED_OUTPUT_TAIL_LINES = 20`): the text
  is attached to the failure as an explicitly labelled "Recent output:", not passed
  off as the whole log.
- **Delete tombstones** (`DELETE_TOMBSTONE_CAP = 200`, 15 min TTL): deliberate and
  commented; the worst case is a session whose delete predates the window showing
  up again if the server still lists it.
- **Session materialization** (`SESSION_MATERIALIZATION_MESSAGE_LIMIT = 30`): the
  call registers the server's cursor with `complete: !cursor`, so the rest of the
  history is known to be missing rather than assumed complete.
- **New-file line counts** (`MAX_NEW_FILE_STATS = 200`, 1 MB per file): a commented
  perf bound; files past it simply carry no estimate.
- **Virtual-list thresholds** (`CHANGE_LIST_VIRTUALIZE_THRESHOLD`,
  `ARCHIVED_VIRTUALIZE_THRESHOLD`): the two other virtualizers in the repo already
  read `getVirtualItems()` inline with a comment explaining why a memo would return
  stale rows, so `ChangesPanel` was the outlier this series fixed rather than one
  instance of a pattern.
- **Cache caps** (`DIFF_CACHE_*`, `MAX_PR_STATUS_ENTRIES`, `CONFIG_CACHE_MAX_ENTRIES`,
  `EXPANDED_TOOLS_CACHE_MAX`, `FILE_REFERENCE_STAT_CACHE_MAX`): bounded by count or
  bytes with eviction, not silently overgrown.

One gap remains, recorded rather than fixed:

- **A full message queue refuses the entry silently.** `addToQueue` returns false at
  `MESSAGE_QUEUE_MAX_PER_SESSION` (50) and the caller keeps the composer — which this
  series made sure it does without also eating the review comments — but nothing
  tells the user why Enter did nothing; the queue's own panel is the only way to
  find out. Telling them needs a new string, and the i18n contract requires every
  one of the 13 locale files to carry it (plus the shared-spelling allowlist, since
  the others would hold the English text), which is 15 files for one toast. Left
  for a change that is already touching that catalogue.

## Reviewed and deliberately not changed

- **`useConfigStore.loadAgents` has no epoch check against `invalidateAllProviderCaches`** (suspected,
  `stores/useConfigStore-impl.ts:1245` and `:675`). Investigated and left alone as a *race*: it does not
  write the agents list at all (that lives in `useAgentsStore`, loaded through the shared source), and
  the provider snapshot it writes is read from the store in the same synchronous block as the write
  (`get().providers` where the list is captured, `set` a few statements later, no `await` between), so
  it cannot install a list older than the store's. What the lead did turn up is fixed in `e0d5a225`:
  with an empty provider list the snapshot kept its provider and model but had its `selectionSource`
  written as `"auto"`, which handed a manual pick to the settings default on the following run.
- **`useSnippetsStore`'s module-level "active cache key"** (`stores/useSnippetsStore.ts:47,76,101`) was
  reported as weaker than the per-key monotonic sequence the other config stores use, with a scenario
  where a load for a directory the user has left still publishes. It does not: the guard compares the
  settled result's *own* cache key against the key named by the most recent call, so a result can only
  be published for the directory that was requested last, and the version counter already covers a
  re-fetch of one key. The join case the report described — A in flight, B started, A requested again —
  joins A's in-flight load instead of starting a third request, which is exactly what makes A the
  requested directory again; publishing A's answer is then correct. `c2ec9a4f` pins that case; removing
  the guard fails it and the neighbouring cross-directory case.
- **`PermissionNotifications` notifies once per pending batch, not once per request**
  (`components/notifications/PermissionNotifications.tsx:111-127`). `notifiedRef` latches after the first
  notification for a session and re-arms when the session's pending set empties, so a second request
  arriving while the first is pending is not announced by this watcher. That is coherent with what this
  watcher is: it fills the gap the *server* leaves (its tag is `permission:<sessionId>`, and its
  condition is "app focused while another session is on screen"), and the server path — the one fixed in
  `623bea47` — is per request key, with its own debounce. A second notification from here would duplicate
  the server's.
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
- **`useDiffHunkRevert` reconstructs the whole file from the cached diff** and
  writes it back, so an edit made after that diff was cached — an agent working
  while the reader looks at the diff — is overwritten by the reconstruction. The
  write goes through the same endpoint as the editor's save, and the editor's save
  has no on-disk check either, so the guard has to be a deliberate rule rather than
  a local one: either re-fetch the diff before rebuilding, or compare the file on
  disk against the diff's modified side (which two different server read paths
  produce, so a false refusal has to be ruled out first). The reviewer ranked it
  below their reported limit, and a comparison I cannot validate end to end is the
  wrong thing to ship in its place.
- **`PullRequestSection`'s body-hydration flag** — recorded here as suspected, then settled by experiment
  and fixed; see the note below and `d3aef642`.

### Fixed after this list was written

Three commits fixed five leads that were recorded here rather than fixed, and this list was still showing
them as open. Each is gone from the source now, with the fix's own test:

- `19471557`
  - the agent browser consumed its one-shot enable request when it armed the delay, so a dependency that
    changed inside that window cancelled the timer with the request already spent — the user's enable
    never reached the browser and nothing armed another attempt;
  - the project actions button left its terminal streams and preview-wait timers running on unmount,
    leaving a subscription on the shared socket;
  - the git panel's post-bootstrap wait kept one timer with no directory of its own, so a switch inside
    its 1.2 s could clear the waiting flag for whichever directory was open when it fired.
- `930c770d` — the skills catalog store's load sequence guarded the loading flag and the error but not
  the page it writes, so an older load that answered last replaced the newer source list. The UI hid the
  refresh affordance while loading, which is why this was recorded as a lead; the ordering is now pinned
  by a test that holds a response back.
- `d3aef642` — `PullRequestSection`'s body-hydration flag, recorded above as suspected because it
  depended on React flushing a passive effect's cleanup before a promise chain's `.finally` continues.
  It does, when the chain's own store update is what re-rendered the component, so a pull request with no
  description showed "Loading description…" where "No description" belongs, permanently.

The entries left above were re-checked against the source while correcting this list: the per-directory
maps in `useGitStore` still have no eviction beyond each directory's own diff cache, the two event
branches still receive no callbacks from their only production caller, and the rest are policy or design
questions rather than local fixes.

## Seventh round

A second pass over the core with reviewers the first pass did not use there: `sync/**` (Claude Code CLI),
`components/chat/**` (MiniMax-M3), server `{git,fs,terminal}/**` (mimo-v2.6-pro), server
`{projects,scheduled-task-convergence,skills-catalog,ui-auth,quota}/**` (glm-5.3), `stores/**` and
`hooks/**` (Muse CLI), `electron/src|scripts/**` (Grok CLI), and the terminal/files libraries plus two
views (qwen3.8-flash). One run (the git/fs/terminal server one) ended in the same transport failure the
sixth round saw twice and produced nothing.

Fixed from this round so far:

- **`99ebf2f1`** — the reverted-message dock guarded its restore, redo and fork handlers with React
  state, so two clicks in the same tick both passed the guard and each sent its own revert: the session
  came back reverted past the row the user asked for, and a second fork could be created the same way.
  `QuestionCard` and `PermissionCard` guard that same class of click with a ref written synchronously;
  the dock has the same refs now.
- **`8f97dfe3`** — the pipeline coalesces `session.status` by replacing the earlier event at its slot,
  which moves the later one ahead of anything queued between them. `session.idle` and `session.error`
  write the same status slice, so one frame holding the end of a turn and the start of the next was
  applied as busy-then-idle even though the server was busy: the working indicator and Stop button went
  away and the queued-message auto-send saw a busy→idle edge and sent early. The delta/updated pair
  already refuses to coalesce across an interrupting event; the status slice does too now.
- **`4b33ec68`** — the seen-directory LRU (over 30 directories) evicted the oldest directory's session
  caches without asking which of them the user is waiting on, so a session that was working or waiting on
  an approval lost its status, permission and question slices: the dialog it was blocked on vanished
  while the agent stayed blocked, and the reconnect and poll candidates read from those same slices no
  longer listed it. The per-session path protects those ids; the directory-level path does now.

- **`6ba7b35e`** — `clearSessions` invalidated the in-flight rollback refreshes of the sessions it was
  clearing, with a comment saying a late answer must not repopulate them; `clearSession` pruned the
  points, loading and error maps but left those request ids alone, so a refresh already in flight applied
  its answer after the clear and a deleted session showed rollback points again.
- **`eceefefe`** — `refreshStatus` hands every later call the promise it already holds, and the read it
  wraps had no timeout: a bridge call or fetch that never settles wedged GitHub auth for the life of the
  app — every later refresh returned that promise, `isLoading` stayed true, and nothing recovered short
  of a restart. The read is bounded like the rollback and update stores, and its timeout takes the
  ordinary failure path so the entry is replaced.
- **`6c8a92e1`** — `selectApp` applied the selection and then awaited the shared-settings write with no
  catch. The write rejects its waiters, so the rejection escaped the store and reached its only caller,
  which awaits `selectApp` before opening the project: the user picked an app and nothing opened. The
  write is best effort now, since the selection is already local.
- **`d0825add`** — creating a run and starting it are two round trips, and the store dispatched the
  prompts in a detached task that returned success before they settled, so a run whose send failed sat as
  an empty session with its prompt gone and only a console warning to show for it. The dispatch is
  awaited, the result carries `startedRunCount`, and the launcher's shortfall toast counts that instead
  of created sessions.

- **`be60ad01`** — every passkey mutation is a load → (sometimes await) → persist cycle over the same
  JSON store, and the write replaces the whole credential list. The registration awaits the WebAuthn
  verification in the middle, so a revoke landing in that window was overwritten by the registration's
  older snapshot: the credential the user had just revoked came back and that device could sign in
  again. Mutations run one at a time now, through the same tail-promise shape the login rate limiter
  next door uses, and the registration re-reads the store after its await.
- **`e20b1f0d`** — `refreshGoogleAccessToken` returns null on an HTTP failure but *rejects* on a
  transport error or the timeout, and the per-source loop only handled the null: the rejection escaped
  and turned a two-source aggregate into a whole-provider failure, discarding the source that had not
  been attempted yet. The call is wrapped, treating a rejection like the null case.
- **`954dc531`** — overwriting an installed ClawdHub skill removed the installed copy *before*
  downloading the replacement, so a network error, a yanked version tag or a ZIP that failed validation
  left the user with no skill at all while the endpoint reported it as merely "skipped". The removal
  happens once the replacement is downloaded, extracted and validated, still before the rename.
- **`e38fbbe1`** — the boot migration read the project file, spent seconds on per-task runtime calls and
  then replaced the file's task list with the list computed from that first read, so a task the user
  saved in that window was silently deleted. `replaceScheduledTasks` accepts an updater now, handed the
  list as it stands inside the write lock, and the migration removes exactly the tasks it settled.

- **`39c1821d`** — two defects in the New File/Folder and Rename dialogs. The typed name was only
  checked for being non-empty and is joined onto the folder the dialog names, so `../../evil.txt` or
  `a/b.txt` wrote (or renamed) outside that folder — and, with enough `..`, outside the project, while
  every containment check in this view is a string-prefix matcher and still called it inside. The rename
  branch also never checked its target: `rename` replaces an existing file, so renaming onto a sibling's
  name destroyed it behind a "Renamed successfully" toast, where the create branch right above checks
  exactly that.
- **`733c5e5a`** — the terminal's viewport input transform built its payload from the first character of
  whatever arrived, so with CTRL or CMD armed a paste became that letter's control code and the rest was
  dropped: `echo hello` reached the shell as one 0x05 byte. The escape-sequence branch beside it passed
  everything through unchanged. The transform applies to a single character now.
- **`7cf02247`** — the Electron read policy names every major browser profile and `Library/Keychains`,
  but not `Library/Cookies` or `Library/Safari`: `desktop_read_file` returned the session-cookie jar as
  base64 while refusing Chrome's own copy of it.

- **`7237debf`** — the native name search resolved its root through the denied-path policy and then
  walked every child of it. A search rooted at an allowed directory — HOME, or `~/.config`, which the
  policy allows because only its longer denied prefixes are refused — therefore listed the credential
  stores `desktop_read_file` refuses (`gh/hosts.yml`, the runtime's auth files, browser profiles,
  keychains), which is the name oracle the root check's own comment says the policy exists to prevent;
  no hidden-file access was needed, since those directories are not dotfiles. The walk applies the same
  predicate to each entry now, and it moved into `desktop-file-search.js` so it can be driven against an
  in-memory tree.
- **`e3627b54`** — `readJsonFile` answered `{}` for a missing settings file and for an invalid or
  unreadable one alike, and every settings mutation reads through it before writing: a truncated or
  unreadable settings.json was therefore replaced by whatever the next change carried — a window
  geometry, most often — taking the user's theme, projects, runtime path and shortcuts with it. The read
  reports success now and a mutation refuses to write when it failed; the geometry persistence logs that
  refusal, and the renderer-facing path already reports a rejected write.

Round six and seven are complete: every confirmed finding is fixed. The three suspected leads in
`r7-sync` are unread, as is the `stores` run's remaining suspected lead and `sync/sync-context-impl.tsx`
earlier ones.

## Verification

- Final state, with each command's exit status captured rather than inferred from
  a pipeline: `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0.
- Test totals at the last run: ui 2 693, web 1 109 (+2 skipped), electron 577, root
  scripts 179 (+6 skipped). `pnpm run check:locales` reports 14 locales, 4 692 keys.
- `pnpm run check:boundaries` passes in full: desktop boundaries, store
  boundaries, electron runtime, endpoint contracts, IPC contracts, package test
  scripts, no sibling dependencies, source ownership, runtime pin, release policy
  and release contract.
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
