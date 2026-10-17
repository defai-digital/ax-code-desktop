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
| Grok CLI, Claude Code CLI | rounds six to eight: views, server git and mcp, chat, hooks, scripts |
| Muse CLI, Claude Code CLI, Grok CLI *(audit)* | round nine: UI components and lib, session tree, packaging scripts; and the series' own diff |

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

By the ninth round the reviews of the source had reached the point where the
higher-yield half was auditing the series' own changes: three reviewers were handed
the round's unified diff (`git diff` over the commits) with the current source of
every file it touches and asked to look only for mistakes in *it*. Five defects
came back that way, all of them real — a selection guard reintroduced through its
own tolerance, a validator keyed on constants that did not match the map the
validated function looks up, a rollback that assumed a serialised writer, an entry
point check that failed on a symlinked path, and a comment overstating what a
reload achieves. They are listed in the ninth round section.

Rounds ten to twenty-two kept that rotation: each round runs three or four reviewers on disjoint scopes drawn from
the areas no round has read (or from the areas whose code has changed most since it did), one of which audits the
series' own previous fixes. The reviewers are the Claude Code CLI, the Grok CLI, Muse CLI, and AX Code's own
`glm-5.3`, `MiniMax-M3`, `qwen3.8-flash`, `mimo-v2.6-pro` and `deepseek-flash`; a reviewer that dies mid-report
(MiniMax-M3 looped on `proxy.js` in the seventeenth round) is recorded as having returned nothing rather than
counted as a clean pass. Every finding is re-checked against the current source before any fix, and fixes in the
series' own code are audited by the next round — which has caught a defect in its predecessor's fix every time it
has been run.

Coverage, for choosing the next round's scopes: `web/server/**` has been reviewed in full at least twice (with
`lib/ax-code/**` read file by file), `electron/src/**`, `desktop/scripts/**`, `script/**`, `.github/workflows/**`,
`ui/src/lib/**`, `ui/src/sync/**`, `ui/src/stores/**` and the `ui/src/components/**` trees have each had at least
one focused pass, and the patches under `patches/` and the release identity in `config/` have been read. The
twenty-third round is reading the `ui/src/lib` files the twenty-second named as unread, the settings sections and
the hooks/contexts trees.

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

Three root runs were repeated to capture one: the middle run failed two cases, and both are real
401s — `plugin-routes.test.js` "GET /registry rejects more than 100 unique specs" expected 400 and got
401, and `routes.test.js` "falls back to direct file removal when ax-code API is unreachable" expected
200 and got 401. That narrows the flake to a response neither app can produce: `registerPluginRoutes` has
no 401 path at all, and neither test file mounts an auth middleware.

Two mechanisms were tested and ruled out with probes rather than argument: (1) supertest requests do not
use Node's global agent — after a request its `freeSockets` and `sockets` are both empty, so keep-alive
socket pooling cannot carry a request to another server; and (2) an explicit rebind of a port whose
keep-alive connection is still established does succeed, but the request over that connection fails with
`ECONNRESET` rather than being answered by the old app, because Node closes idle connections when the
listener closes. The remaining direction is an identifier or environment shared between files in one
worker (the pool reuses workers with the module registry reset but not `process.env`), which the next
pass should test by running the failing file with a poisoned environment — and by running it with
file parallelism off.

Both were tried. The two failing files pass with `AX_CODE_SERVER_PASSWORD`, `AX_CODE_JWT_SECRET`,
`AX_CODE_DESKTOP_JWT_SECRET` and a rejected `AX_CODE_DESKTOP_DATA_DIR` set, so the environment is not what
turns them into 401s. Two runs with `--fileParallelism=false` passed as well, which leaves parallelism
itself — port pressure or resource contention rather than a single identifier — as the remaining suspect.
Two samples are not a conclusion; the honest summary is that the 401s are not produced by the apps under
test and have never reproduced in a serial or isolated run.

Three more full runs failed once each in a web file that passes alone — `server/lib/ax-code/core-routes.test.js`
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

The one gap this section recorded is fixed:

- **`86a3c917`** — a full message queue refused the entry silently: `addToQueue`
  returns false at `MESSAGE_QUEUE_MAX_PER_SESSION` (50) and the caller keeps the
  composer, but nothing said why Enter did nothing. The refusal reports it now,
  with the cap read from the store's own constant through the message's `{count}`
  placeholder. The new key is in all fourteen catalogs (the thirteen non-English
  ones carry the English text and are listed in `shared/spelling`, which the locale
  contract requires for an identical string), so `pnpm run check:locales` reports
  14 locales, 4 696 keys and 61 048 entries.

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
- **`PermissionCard.handleSaveWebMcpApproval`'s missing reset is not a defect**
  (`components/chat/PermissionCard.tsx:164-189`, reported confirmed by the chat reviewer of the eighth
  round). The divergence from `handleResponse` is real — the success path leaves `submittingRef` set —
  but the only production caller keys the card by `permission.id`, so a different permission is a
  different instance. And a reused instance would not work anyway: `hasResponded` is instance state that
  the prop change does not clear, so the card renders null for the next permission whatever the ref says.
  A two-line reset was written, tested and reverted: an experiment showed the second approval is dropped
  by the *null render*, not by the guard. Making instance reuse work is a component-contract change with
  no caller that needs it.
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
- **`useProjectKnowledge` caches a positive probe forever** — recorded here, then fixed in `b5fb92dd`:
  the hit expires after 30 seconds, so a knowledge file deleted (or a branch without it) stops being claimed
  by the chip, while the create flow's requirement — a *miss* is never cached — is untouched. That
  reconciliation was the recording's own question, and a TTL on hits only answers it.
- **`desktop_search_files` accepts any absolute directory** — recorded here when the confinement was
  missing, and stale by the time this list was re-checked: the credential denylist became a shared helper and
  the search refuses a root it denies (recorded in "Fixed after this list was written"), and `e1cd91e7`
  resolved the root through its symlinks before the policy sees it. The open-root policy itself is unchanged
  — a project outside HOME is still searchable — which is the part this entry was right about.
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

## Thirty-eighth round

A cross-check of the thirty-seventh round's fixes on a second reviewer (`deepseek-flash`, the same diff), after the
Grok CLI cell for the same diff ran for eighteen minutes and produced nothing but its banner; it was stopped. It
found two regressions and three test gaps; the regressions and the gaps are fixed in `251cf277`.

### Fixed

- **A transient empty permission list dropped the answered marker.** `useSessionPermissions` returns
  `EMPTY_PERMISSION_REQUESTS` when the session's directory is not resolved yet, and the round's prune-on-absence
  rule read that as "the server stopped listing it": the marker went, and the resync-republished request was
  mirrored again with live buttons. Nothing prunes the markers now — the set holds one small string per permission
  answered in the session's lifetime, and the watcher keeps it across remounts. This supersedes the
  "dropped when the server stops listing it" rule of the previous round.
- **A link whose prefix starts with a digit leaked its path.** `1abc:///Users/akira/secret/proj` matched no scheme
  (a scheme starts with a letter) and the path pass refuses `//` after a colon, so the absolute path reached the
  summary verbatim. The link pattern accepts a leading digit now, even though that is not a legal scheme: what
  matters is that nothing after `://` survives. Red: the token was unchanged, path included.
- **Test gaps closed:** `import type * as ns`, `export type * from`, an aliased mixed import and an aliased mixed
  export in R5; a scheme at the start of the string, a non-ASCII word before a link, and the digit-prefixed link in
  the summarizer.

### Examined and not fixed

- **Equal-timestamp copies in both session buckets** resolve to the row's own archived state. The row's session
  comes from the live list, which is the freshest source available; the cache copies cannot be ordered by anything
  more precise without a version. Recorded as a deliberate tie-break.
- **The per-session marker map is never deleted.** It is strings only, bounded by the permissions answered in the
  session; deleting it on unmount is exactly what reopened the remount hole.

### Follow-up audit of this round's fixes

Claude Code CLI read `git diff 1c398e0b 251cf277` and reported three things; the third full-suite run of the day
also lost `plugin-routes.test.js` twice in a row (different tests each time, passing alone and in the next run).

- **The "survives an empty permissions run" test cannot fail if pruning comes back.** It exercises
  `diffPermissionNotifications`, which treats the marker set as read-only; the fix was deleting a prune call inside
  the watcher effect. Pinning it needs a test that mounts `SessionPermissionWatcher` and drives the effect, which
  needs the sync context, the directory child store and the session actions. The gap is recorded rather than
  plumbed; the component-level harness this suite uses elsewhere does not cover `useSessionPermissions`.
- **Digit-led `://` prose is masked** (`12://30` → `a link`). That is the deliberate trade-off behind accepting a
  leading digit; the forms that could be confused with it (`12:30`, `3:1`, `50%:`) have no `//` and are pinned as
  untouched in `3bed167c`.
- **The marker comment said the watcher keeps the set for its lifetime.** It is module state and lives for the
  process; the comment is corrected in `3bed167c`.

## Thirty-seventh round

An audit of the thirty-sixth round's fixes (Claude Code CLI over `git diff 490d6db3 8e017639`), plus a check of the
same code while it ran. Four findings and one test gap; all fixed in `1c398e0b`. One of them corrects a decision the
previous round recorded as deliberate.

### Fixed

- **Pruning the answered markers by request-object identity reopened the double mirror.** The permission resync
  republishes the same pending request as a fresh object (`merged[sessionID] = permissions`), and a repeated
  `permission.asked` replaces the entry too; either dropped the marker while the request was still listed, so the
  settled request was mirrored again — the bug the marker exists to prevent. The marker is kept while the id is
  listed and dropped when the server stops listing it (the safer side of the re-prompt trade-off), and it stays at
  module scope so a watcher remount keeps it. Red: the identity case was written as a test and shows the marker
  surviving the replaced object now.
- **The scheme bound of 16 left longer reverse-DNS schemes whole, and the absolute path after `///` leaked into the
  summary** (`com.apple.dt.xcode:///Users/akira/secret/proj`). With the lookbehind, only the first character of a
  scheme-character run can start a match, so the quantifier is unbounded now and linear (2 ms for 400k characters);
  the whole link is masked. Red: the path survived verbatim.
- **The archived bucket was chosen from `archivedSessions` alone.** A stale archived copy dragged a live session's
  export into the archived tree, and an archived row whose root was missing from a paged cache found no children
  at all. The newest copy across both buckets decides now, falling back to the row's own state. Red: `[]` instead of
  `['active-child']` and `['archived-child']`.
- **R5 skipped type-only exports but still flagged type-only imports**, and a type-only import also set
  `importsWriteApi`, suppressing the stale-writer warning. Both the whole-clause `type` modifier and the inline one
  are skipped now. Red: a violation for `import type { markStreamConnected }`.
- **Test gap:** the guard had no case for `hasUiPassword: false` with a real stored password; it is covered now.

### The previous round's decision, corrected

The thirty-sixth round recorded identity-based pruning as a deliberate way to let a same-id re-prompt through. That
reading was wrong: a resync is indistinguishable from a re-prompt by object identity, and it fired on the common
path. The suppression of a genuine same-id re-prompt is the accepted cost, and it is noted in
`pruneAnsweredRequestIds`.

## Thirty-sixth round

An audit of the thirty-fifth round's fixes (`muse-wonder-full-1.0` over `git diff d288f1c0 490d6db3`). It reported
six items; all were real and fixed in `8e017639`, one of them a false positive the round had introduced.

### Fixed

- **The restart guard treated malformed records as "deliberately unprotected".** `hasUiPassword: "true"`, `1`, an
  array or a bare string all failed the `!== true` test, so the guard returned and the server started without a
  password. The record is raw `JSON.parse` output and is now judged as data: a usable password, an explicit
  `false`, or a legacy record with no `uiPassword` field explains itself; anything else needs the flag or the
  environment. Red: five malformed shapes passed the guard.
- **The answered-request markers died with the watcher mount.** The watcher unmounts and remounts with the
  live-session list while the server may still list a settled request (the same event the earlier re-mirror fix
  cites), so a remount mirrored it again. The markers are module state per session now, and they hold the request
  *object* that was answered: a re-prompt replaces the object and is mirrored again instead of being suppressed by
  id alone. Red: the prune helper did not exist; a replaced object now clears the marker, the same object keeps it.
- **The export tree deduped children but not the root.** The row's own object named the export and chose its
  bucket, so a stale copy could export a stale title or read the wrong bucket. The cache's copy wins now, and the
  archived bucket is chosen from it. Red: `'stale root'` instead of `'fresh root'`.
- **The bounded link pattern could start inside a longer scheme run.** `com.apple.dt.xcode://host/path` lost
  `xcode://host/path` and kept `com.`; the match also consumed a closing bracket (`[https://x]` in note mode became
  `[`). The match may no longer start inside a scheme-character run and stops before closing brackets, and the path
  pass no longer eats `//…` after a colon, so an unmatched scheme is left whole. Red: `'open com. a link now'` and
  `'['`.
- **R5 flagged type-only re-exports**, which carry no runtime value. R4 already skipped them; R5 now does too. Red:
  a violation for `export type { markStreamConnected }`.

### Examined and not fixed

- **A URL whose own path ends in `)` is truncated in note mode** (`https://x/_(bar)` → `a link)`). Excluding the
  closing parenthesis is what keeps `(https://x)` balanced; the two cases cannot be told apart without parsing the
  URL. Note mode also leaves a bare bracketed link as `[]` rather than eating one bracket, which is the balanced
  outcome for its remove-the-link policy.

## Thirty-fifth round

A second audit of the thirty-fourth round's fixes (Claude Code CLI, over `git diff 81ff4b7c d288f1c0`). It reported
six items; five were defects or gaps and were fixed in `490d6db3`. The full suite also lost the wiki layout's
wall-clock test once (it passes alone) — the sixth file in the flake family this record tracks.

### Fixed

- **R5 also missed `export * as ns from`.** Its `exportClause` is a `NamespaceExport` — neither absent nor a named
  export — so the whole-module reach the rule exists for passed unjudged. It is treated as a whole-module re-export
  now. Red: `importsWriteApi` false for the namespace re-export.
- **A settled answer could be mirrored again and answered twice.** The success path removed every mirror, but the
  permission watcher still listed the request as pending; its next effect run saw an unmapped request and mirrored
  it with fresh buttons while the answer claim was gone. The watcher now records answered request ids, skips them in
  the diff, and clears the record once the server stops listing the request. Red: `toAdd` contained the answered
  request.
- **Restart trusted a record that claimed a password it did not carry.** With `hasUiPassword: true` and a blank
  `uiPassword`, the guard returned and `serve` read the blank as unset: the instance started unprotected while the
  record said otherwise. A record must now either claim no password or carry a usable one; otherwise the explicit
  or environment password is required. Red: the guard did not throw.
- **The export tree kept the first of two copies of a session.** The project tree's `dedupeSessionsById` keeps the
  later copy, so a duplicated cache entry could export a stale title and timestamp. Red: `'stale'` instead of
  `'fresh'`.
- **The summary link pass dropped the punctuation after a link, and note mode still only knew http(s).** The link
  match now stops before trailing punctuation, the scheme name is bounded (a long run of scheme characters was
  rescanning from every offset), and `sanitizeForNote` uses the same pattern. Red: `'see a link then'` (comma lost);
  note mode returned the ssh URL unchanged.
- **The 500-node layout test sampled one wall-clock run.** It passed alone in 4 ms and failed inside the full
  suite; the assertion now takes the best of three, which still catches an algorithmic regression. This is the
  sixth file in the flake family, and the first of them fixed rather than only recorded.

### Reported, examined and not fixed

- **The scan guard checks only that the UI tree matched something, not each of `stores/` and `sync/`.** A rename of
  one subtree would leave R1/R2/R4/R5 silently scanning nothing for it. Renaming either tree breaks the build long
  before this check runs, so a per-subtree guard was judged not worth the extra failure mode. `assertFilesToScan`'s
  wiring is exercised by the collector test; the empty case is unit-tested directly.
- **The OAuth read-back reads the store's active provider snapshot but loads the page's directory.** After the
  invalidation both resolve to the active directory in the normal flow; the snapshot is the only signal available
  for "the reload's refresh failed quietly". Recorded rather than plumbed.

## Thirty-fourth round

Two follow-ups. The root `script/` review (Grok CLI) failed as a cell — three consecutive tool errors, then its
per-call timeout — but its partial narration named two holes in the store boundary check; both were verified in the
source and fixed in `47255168`. A second audit of the thirty-third round's fixes (AX Code `glm-5.3`) then reported
six findings; five were fixed in `d288f1c0`.

### Fixed

- **`47255168` — R5 passed an aliased writer re-export.** `export { markStreamConnected as connect } from
  …/connection-state` was judged on the exported alias, not on the name bound to the module, so a facade could hand
  the writer out while the check stayed green. The import path already resolved `propertyName ?? name`; the export
  path does now. Red: `importsWriteApi` false for the aliased re-export.
- **`47255168` — the store boundary check had no empty-scan guard.** A renamed tree or a typo would report a clean
  pass over nothing and exit 0; the source-boundary check already guards exactly this failure mode and says why.
  `assertFilesToScan` throws and `main`'s catch turns that into exit 1. Red: the helper did not exist.
- **`d288f1c0` — an answered request kept a second answerable notification.** The claim map is keyed by request, but
  the success path removed only the entry that answered; the watcher's re-mirror re-enabled itself and could answer
  a settled request again. Every notification for the request is removed now. Red: the sibling survived
  (`expected 0, got 1`) and its Deny ran.
- **`d288f1c0` — flat-row export read only the active bucket.** An archived root exported from a childless row
  resolved no subtasks, while the project tree nests children of the same archived state. The tree now picks the
  bucket the root belongs to, matches each child's archived state to its parent's, and exports a duplicated cache
  entry once. Red: `[]` instead of `['archived-child']`; `['child','child']` instead of `['child']`.
- **`d288f1c0` — the OAuth read-back duplicated the reload's own provider fetch.** `reloadAxCodeConfiguration` with
  the `providers` scope already loads the active directory; the third round's unconditional read added a second,
  sequential retrying fetch. It now runs only when the list is empty — the signal that the reload's refresh failed
  quietly. Red: `loadProviders` called on the success path.
- **`d288f1c0` — a non-http scheme URL was mangled.** The path pass accepts a colon before the slash, so
  `ssh://git@host/repo.git` lost `//git` and kept `ssh:@host/repo.git`. The link pass accepts any scheme now.
  Red: `'clone ssh:@host/repo.git now'`.
- **`d288f1c0` — restart kept a blank stored password over the environment one.** `??` treats `""` as present, while
  the server's `hasUiPasswordConfigured` treats it as unset: the instance started unprotected, the record claimed a
  password, and the environment password the guard accepted was ignored. The same predicate decides now.
  Red: `served.uiPassword` was `''`.

### Examined and not fixed

- **Export child order differs from the project tree's pinned-then-updated order.** The export lists the cache's
  order. Matching it needs the pinned-id set, which the export path does not receive; the order of subtasks in an
  exported document has no behavioural consequence beyond reading order, and duplicate entries are handled above.

## Thirty-third round

A third audit of the same ground: the thirteen fixes the thirty-second round made, over `git diff 5159a3c2 HEAD`
(3 217 lines), on the two reviewers the previous round used. It ran beside a fresh-scope review of the root
`script/` directory (Grok CLI), which had not reported before this record was written.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | the diff above, described finding by finding in the prompt |
| `muse-wonder-full-1.0` (ax-code) | the same diff and prompt |
| Grok CLI | `script/*.{ts,mjs,cjs}` and the `package.json` scripts that drive them (fresh scope) |

### Fixed from the audit — `63b647ef`

- **The bell's answer guard did not survive the panel's close.** The guard was a ref in `NotificationEntry`, and
  `NotificationCenter` returns `null` while closed: every close unmounted the entry, and the reopen mounted a fresh
  one with the guard reset while the first answer was still in flight, so Allow and then Deny were both submitted
  for one request. The claim is module state keyed by notification id now; the entry reads it on mount for
  `disabled`. Red: `expected "vi.fn()" to not be called at all, but actually been called 1 times` (onDeny).
- **An OAuth completion that failed to reload left the provider page empty.** The branch drops every project's
  provider snapshot first, then asks the runtime to reload; when that threw it showed a warning and stopped, so the
  list stayed `[]` with no error and no selection until something else loaded providers. The sibling API-key path
  already reloads the active project in its catch; this one does now too, and also after a reload that succeeded.
  Red: `expected "vi.fn()" to be called at least once` (loadProviders).
- **The worktree claim outlived a throw from its own refusal.** The flag is taken before the repository check to
  close the re-entrancy window, and the comment promises every early return releases it — but the not-a-repository
  return announced itself with a toast while still holding the claim, and a throw from that toast (the kind the
  comment cites) left the feature answering `null` for the life of the renderer. The release is in a `finally`.
  Red: `expected "vi.fn()" to be called 2 times, but got 1 times` (checkIsGitRepository).
- **The log tail's offset was measured on decoded text.** `fs.readFileSync(path, "utf8")` replaces a cut multibyte
  character with U+FFFD, so `Buffer.byteLength` of the result is larger than the file: the follower clamps such an
  offset to end-of-file and drops the lines written between the tail and the follow — the race the offset exists to
  close. It reads a `Buffer`, decodes for the lines, and reports the buffer's length. Red: `expected 5 to be 4`.
- **A restart accepted an environment password and did not carry it.** With the instance record missing, the guard
  passes on `AX_CODE_DESKTOP_UI_PASSWORD`, but `serve` received only the record's (absent) password: the new server
  was protected by inheritance alone and wrote `hasUiPassword: false`, so the next restart from a shell without the
  variable passed the guard on that record and came up unprotected, silently. The environment password is read once
  and handed to `serve` when the record has none. Red: `served.uiPassword` was `undefined`.
- **A summary kept paths attached to punctuation.** Stripping `[](){}` with nothing turned `[docs](/etc/hosts)` into
  `docs/etc/hosts`, which no path pattern can tell from prose, and a colon is not a boundary either, so
  `file:/etc/hosts` survived. The punctuation becomes a space, and a slash-run may follow a colon. Red:
  `'see docs/etc/hosts today'` and `'see file:/etc/hosts today'`.
- **Export Markdown offered no subtasks from a flat row.** Live and recent rows render a root without children, so
  `node.children.length === 0` skipped the dialog and exported the session alone, while the project tree offered the
  same session's subtasks. This is upstream openchamber `d3228344e`, ported: the tree is resolved from the global
  sessions cache when the user acts. Red: the module did not exist; the new test asserts a flat row resolves `child`
  and `grandchild` and that the walk stops at an archived child.
- **Two tests could not pass on Windows.** `terminateProcessTree` and `stopInstanceProcess` tests assert POSIX
  `[-pid, "SIGKILL"]` calls with no platform gate, while the sibling test in the same file skips on `win32`. Both
  are gated now. No red light is possible here: this machine is macOS, and the defect is visible by reading the
  win32 branch, which uses `taskkill` and never calls `process.kill` with a negative pid.

### Reported by this round's audits, examined and not fixed

- **Fusion refuses when any selected run has no output** (`MultiRunFusionDialog.tsx:170`). This is the guard the
  previous round added on purpose: dropping the empty sources from the payload while the dialog still listed them
  made the fused answer read as covering every run. Refusing is the deliberate choice; the message is the closest
  existing key, because saying "N of them had no output" needs a key in all fourteen locales and the localization
  check rejects one that only English has. The source list could mark the empty run, which is a UX change, not a
  defect.
- **The group receives SIGKILL as soon as the leader exits** (`cli.js:1345-1351`, and `stopInstanceProcess` passing
  `gracefulTimeoutMs: 0`). Also deliberate: the previous round added the group signal because children outlive the
  leader, and a child that ignores SIGTERM would otherwise keep a loopback port while `stop` reported success. A
  bounded group-drain wait would be gentler, but on POSIX it means probing `kill(-pid, 0)` against a pgid that may
  be recycled, and on Windows a tree kill is impossible once the leader is gone. Changing it reopens the leak it
  was written to close; the trade-off is recorded here instead.
- **The Windows tree kill early-returns when the leader is already gone** (`cli.js:1291-1306`). This is the same
  trade-off as the item above: Windows has no process-group id, so once the leader exits there is nothing to name
  its children by. The test gating is fixed; the behaviour cannot be verified in this environment.

### Fixed from the audit of this round's own fixes — `81ff4b7c`

- **The claim re-enabled only the instance that started the answer.** The reopened entry seeded its `responding`
  state from the claim, but the release ran in the *unmounted* instance's setter, so a failed answer left the live
  entry disabled for good while the permission stayed pending. The claim is a promise now and every mounted entry
  subscribes to it. Red: the reopened entry's Allow button stayed disabled.
- **The answer claim was keyed by notification id, not by request.** The permission watcher drops its notifications
  on unmount and adds a new one — with a new id — for the same request when it remounts, so the second notification
  answered again. The key is `requestId ?? id`. Red: two notifications for `req_same`, Allow then Deny, onDeny
  called once.
- **Brackets became spaces.** That fixed `[label](/path)` but put a space before every comma and period following a
  parenthesis: `Done (ok), then (maybe).` → `Done ok , then maybe .`. The path pass now runs before the brackets are
  removed and lets `(`, `[`, quotes and a colon stand in for the word boundary. Red:
  `expected 'Done ok , then maybe .' to be 'Done ok, then maybe.'`.
- **The export walk had no visited set.** A parent cycle in the merged cache recursed until the stack ran out, from
  the click handler. Red: `RangeError: Maximum call stack size exceeded`.

The fresh-scope UI-kit audit (deepseek-flash) reported six items; all were read against the source and rejected:

- `NumberInput`'s empty draft calling `onClear` is the component's clear contract, and the draft keeps `-5` while it
  is typed; the "minus is impossible" claim does not reproduce.
- `DropdownMenuItem.onSelect` is typed as base-ui's `onClick` and documented as such; base-ui's item has no
  `onSelect` event, so wiring it to the click is the adapter, not a bug.
- `ScrollShadow` deletes the key from `...rest`, which the rest destructuring already copied; React's props object
  is never touched.
- The dialog counter adds and removes the document class in the same effect pair React orders for one commit;
  the interleaving the report describes does not produce a stale count.
- The mobile `NumberInput` wrapper's `disabled:` classes cannot match, but the buttons carry real `disabled`, which
  is what blocks the action; the classes are dead styling, not a behaviour.
- The tooltip's long-press is cancelled by `pointercancel`, which scrolling fires; a stationary finger plus a second
  finger scrolling is a gesture the bridge does not model, and no observable click loss reproduces from it.

### Verification

`81ff4b7c`: `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
`pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 990, web 1 334 (+2 skipped),
0 `FAIL` lines. `pnpm run build` also exits 0 (45.8 s) on this tree, which the earlier rounds of this series did not
run.

`63b647ef`: `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
`pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 987, web 1 333 (+2 skipped),
0 `FAIL` lines.

## Thirty-second round

A second audit of the same ground the thirty-first round audited — the thirteen fixes made after that round's audit —
on two reviewers, to see whether fixing the first audit's nine findings introduced anything new.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | `git diff 5159a3c2 HEAD`, 3 103 lines, described finding by finding in the prompt |
| `muse-wonder-full-1.0` (ax-code) | the same diff and prompt |

### Fixed from the audit

- **`6f1b775d`** — round 31 moved the restart password guard into the daemon branch so it would stop refusing
  foreground instances, and placed it *after* `this.stop(...)`: the refusal took the running server down and then
  declined to start it, where every input it reads was known before the stop. It runs before the stop now, guarded
  by `!isForeground`.
- **`6f1b775d`** — round 31 made `errorMessage` visible on the auth error screen as its detail and cleared it only in
  the status check's `ok` and `401` branches: a retry that failed with a 5xx, or a transport error, showed the
  previous attempt's text as the reason for a different failure. It is cleared when the check starts.

### Reported by this round's audit, not yet fixed

- **The log follower's start offset is taken before the tail read** (`bin/cli.js`). A line appended between
  `fileSize()` and the `readFileSync` inside `readTailLines` is printed by the tail and printed again by the
  follower; a partially written last line is split between the two. The fix is to take the offset from the same read
  that produced the tail (`Buffer.byteLength` of what `readFileSync` returned) rather than from a separate stat.
- **The worktree-draft claim precedes a call the comment says must not run while it is held**
  (`ui/src/lib/worktreeSessionCreator.ts`). Reported as suspected; the claim sits above `checkIsGitRepository`, and a
  rejection from that path releases it only through the two early returns the round-31 fix added.
- **The summarization path pattern can leave a trailing slash** (`server/lib/text/summarization.js`). A path written
  with a trailing separator loses the run and keeps the slash.

The second reviewer (`muse-wonder-full-1.0`) then reported five findings of its own. Three of them are the same
ground this round already covered — the restart guard at `cli.js:2302`, the follower's offset at `cli.js:2704` and
the summarization pattern at `summarization.js:25`, all from the pre-fix state it was given — and are closed by
`6f1b775d` and the commit after it. Two are not yet looked at: `cli.js:1358` (`terminateProcessTree`'s signal path,
CONFIRMED) and `NotificationCenter.tsx:32` (the entry's new `responding` guard, SUSPECTED), and they are the first
thing the next pass reads.

Other findings from the two commits above:

- **`f9d0f2e2`** — the follower's start offset came from a `stat` taken before the tail read, so a line appended in
  between printed twice; it comes from the same `readFileSync` now. And the summarization pattern consumed a run of
  segments while leaving a trailing separator: "in /usr/bin/ today" came back as "in / today". Red:
  `expected 'in / today' to be 'in today'`.
- The full run after `f9d0f2e2` failed one web test (`ax-code/core-routes.test.js` > "allows GET requests without an
  Origin header"), which passes alone (29 tests): the wall-clock family this record already groups, now on a fourth
  file. The run after `d724cb6e` lost a different one from the same family — `terminal/runtime.test.js` > "keeps the
  cap when the replaced session leaves on its own during the spawn", which passes alone too and had flaked once
  before. Five full runs in this stretch have each lost exactly one wall-clock test, in four different files; the
  other four gates were 0 every time.
- **`063782f3`** — the guard this series added to the bell's permission entry was a `useState` flag, and `setState`
  is async: two clicks in the same tick both read it as false and both handlers ran — the reason the sibling
  `PermissionCard` uses a ref, whose own comment says so. The ref is the gate now; the state remains for `disabled`.
  The test had hidden it by flushing `await act(...)` between the two clicks; both happen inside one `act` now.
  Red: `expected "vi.fn()" to not be called at all, but actually been called 1 times`.
- **`d724cb6e`** — the second audit found the bypass round 31's group signal left: `stop` asks the server to shut
  down and, when the leader exits inside that wait, returned success without ever reaching `terminateProcessTree`,
  so a child in its group that ignored the shutdown outlived a `stop` that reported the instance stopped and then
  deleted its pid files. The graceful branch runs the same tree call with no grace left. Its red light came in `167e7457`: `stopInstanceProcess` is
  exported for it, as `terminateProcessTree` already is, and the test stubs `process.kill` to answer ESRCH for the
  pid — a leader that is already gone — and asserts the group still receives `SIGKILL` (red:
  `expected [ [ 4343, +0 ] ] to deep equally contain [ -4343, 'SIGKILL' ]`). The summarization pattern's
  `(` alternative is dropped with it: parentheses are stripped earlier in the same function, so it was dead.

## Thirty-first round

An audit of every fix this series made after the thirtieth round's report — `git diff 5159a3c2 HEAD`, 55 commits —
on two reviewers. The diff was checked before it was handed over (2 941 lines, 58 files), because a truncated or
empty input is the harness failure this record keeps meeting.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | the diff: the carried-forward fixes and the round-30 work they follow |
| `muse-wonder-full-1.0` (ax-code) | the same diff |

### Fixed from the audit

- **`6e482e8a`** — `kill(-pid)` with `pid === 1` means "every process this user may signal", not "the group led by
  pid 1": a foreground server is PID 1 inside its container, and a `stop` run from there would have killed the CLI
  itself and everything beside it. The group form is skipped for pid 1.
- **`6e482e8a`** — the restart password guard ran before the foreground branch, so a foreground instance with no
  record was refused although that branch never starts a server or carries a password (its process manager restarts
  it with the environment it was given). It moved into the daemon branch, inside the per-instance `try`, so a
  refusal is recorded like the other per-instance errors.
- **`6e482e8a`** — the terminal env's comment still described the entrypoint as passing `--ui-password`, which this
  series removed when it moved the password into the environment.
- **`9bf02c1e`** — `sanitizeForSummary`'s path pattern matched any `/<word>`, so prose lost its second half:
  "either/or and TCP/IP" came back as "either and TCP". It matches a run that begins a word now.

### Fixed from the second audit

Four regressions in this series' own fixes, all from `82b7a710`:

- **`git/routes.js`** — the stash file-count guard inspected an *array* only, while `countStashFiles` normalizes a
  non-array value into a one-element list (`service.js:452`) and passes each entry as bare argv: the string form of
  `--output=<path>` was still reachable. The guard looks at both forms.
- **`cli.js`, `followFile`** — when the log did not exist at start, the device and inode were never established:
  they were assigned only inside the rotation branch, which requires them. The first file opened is the baseline
  now, so a later rotation is recognised instead of read from the old offset.
- **`cli.js`, `terminateProcessTree`** — it returned success as soon as the *leader* exited, without the `SIGKILL`
  that reaches a surviving group member, so a child holding a loopback port outlived a `stop` that said it worked.
  The force signal goes to the group before success is reported.
- **`ui/src/components/notifications/NotificationCenter.tsx`** — delaying the entry's removal until the reply
  settled added no guard against a second answer: Allow and Deny could both be submitted for one request while the
  first was pending. Both buttons are disabled while it is, and the handler refuses a re-entry.

All four carry a red-light test now. The last two arrived in `b9c76f85`: the follower's starts before the log
exists, creates it, then rotates it (red: `expected [ 'first', 'd-one', …(2) ] to include 'rotated-one'` — the
"d-one" is the middle slice the old offset read), and the signal sequence is asserted against a stubbed
`process.kill` that answers ESRCH for the pid, which is what an already-exited leader looks like (red:
`expected [ [ -4242, 'SIGTERM' ], [ 4242, +0 ] ] to deep equally contain [ -4242, 'SIGKILL' ]`). The process-level
fixture written first was dropped: the child it spawned never reported a pid in this environment, and a stubbed
signal sequence asserts the same contract without a process to leak.

Two further leads from the first audit are recorded rather than acted on: the log-rotation test deletes and
recreates the file immediately, so a filesystem that reuses inode numbers would defeat it; and the preview sandbox
covers HTML, SVG and XHTML but not `application/xml`/`text/xml`, which can run script when the root element is in
the XHTML namespace.

## Thirtieth round

Two audits of the twenty-ninth round's own commits, the four server trees this record had never read
(`git`, `github`, `quota`, `desktop`), two entry-point reviews of `bin/cli.js`, `server/index.js`,
`server/lib/http/**` and `scripts/docker-entrypoint.sh`, and the config surfaces and UI trees it mentions
least (MCP, providers, multirun, auth, supervision, notifications) plus `server/lib/{text,preview}`.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of `git diff 5159a3c2 HEAD` — the twenty-ninth round's own commits |
| `muse-wonder-full-1.0` (ax-code) | a second, independent audit of the same diff |
| ax-code `glm-5.3` | `web/server/lib/{git,github,quota,desktop}/**` (never read before) |
| Claude Code CLI | `ui/src/components/{auth,multirun,supervision,notifications}/**` |
| `grok-build-cli/grok-4.6` | `ui/src/components/{mcp,sections/providers,multirun}/**` |
| ax-code `qwen/qwen3.8-flash` | `web/server/lib/{text,preview}/**` |
| ax-code `glm-5.3`, `xiaomi/mimo-v2.6-pro` | two reviews of the process entry points |

### Fixed from the round's own commits

- **`c89350fe`** — `4e103795` rotated the session secret before clearing the passkeys, and the rotation
  rebuilds the passkey controller around a binding derived from the new secret: its first read replaces the
  store with an empty one, so the count taken after it was always zero (`clearedPasskeys: 0` for a reset that
  cleared two) and the comment's claim that a failed clear leaves a usable passkey was wrong. The count is
  taken first now, through a `countPasskeys()` on the controller, and the tests seed a store bound to the
  current secret so both directions are asserted.
- **`d9538e79`**, **`8960d0bc`** — the ClawdHub duplicate guard this record added twice more: first it claimed
  the slug before the download, so a failed download held it and a second selection for the same slug was
  skipped as a duplicate of an install that never happened; then the claim still preceded the download's
  validation, whose three `continue`s skip past the `catch` that releases the name. It now claims only once a
  selection is actually going to install, which is where the repository installer claims.
- **`c97aea0b`** — `0b8489e6`'s `AbortSignal.timeout(20_000)` stayed armed after the headers, so it also
  aborted the body read: a valid multi-megabyte archive on a slower link failed where it used to download. The
  bound now covers the wait for a response (released once it arrives) with a budget for the whole call, and
  the body stays bounded by size.
- **`a7fc0222`** — the anchor this record tightened two rounds ago matched the first `if (!store)` after
  `handleEvent`, which is the recovery scan: it passed for a clear sitting between the two branches, the
  placement it was written to catch.
- **`c13125f0`** — the worktree claim moved above the project lookup to close the same-tick race, which put it
  above a call that can throw: a throw from the store or the toast left the flag claimed for the life of the
  renderer. It is claimed after the project check, still before the first await.

### Fixed from the trees read for the first time

- **`deac3501`** — three git routes reached git's argv with no option-form guard while every sibling carries
  one: `POST /api/git/stashes/file-counts` forwarded a `-`-prefixed ref to `git stash show`, which passes
  options on to `git diff` (`--output=<path>` wrote that file and the route answered 200 with a counts map
  keyed by the option); `POST /api/git/branches` forwarded `startPoint` into `git checkout -b <name>
  <startPoint>` (a `--force` there is read as a flag, so the branch was created at HEAD and reported as
  created from the given commit); and `DELETE /api/git/remote-branches` forwarded `remote` into `git push
  <remote> <refspec>` (`--force :main` force-deletes main on the default remote).
- **`deac3501`** — the GitHub OAuth token was written without a mode and chmod'd afterwards with the failure
  swallowed: the file was 0644 in between and stayed 0644 if the chmod failed. The write carries `mode` now,
  as the git identities store beside it does, and the storage directory is 0700.
- **`deac3501`** — two of the three `git diff --no-index` call sites hardcoded `/dev/null`, which does not
  exist on Windows, while the third selected the null device per platform.
- **`c23560e2`** — `serve --ui-password` with no value (the next token is another flag) assigned `""` and
  started the server with no password protection, exit code 0, and under `--quiet` no warning at all:
  `--port` and `--host` refuse the same input as a usage error.
- **`5881a58c`** — `terminateProcessTree`'s POSIX branch signalled the daemon's pid alone, and the daemon is
  spawned as its own process-group leader with the runtime, terminals and preview servers as its children: a
  daemon that had to be killed left them running, holding their loopback ports, while `stop` reported the
  instance stopped. The Windows branch of the same function kills the tree.
- **`e02d553f`** — the attempts-exhausted guard in the scheduled-task migration read `length` off a `Set`
  (always false) and could not fire for a second reason the review did not check; the guard is gone.
- **`ec32a918`**, **`b7724c7e`**, **`49fe8674`**, **`2ccde16d`** — four UI defects from the component reviews:
  a failed unlock showed the network screen instead of the failure the server answered with, and its message
  survived into the retried form; a permission entry in the bell removed itself before its reply landed, so a
  failed answer took the user's only handle on a still-pending request; the multi-run setup-command load was
  keyed on the projects store's object identity, so a reload of that list discarded what the user had typed;
  and an OAuth completion reloaded only the active project, leaving the others on a pre-auth snapshot, while
  the agent picker read a store method whose identity never changes and so never followed the loaded list.

### Fixed from the carried-forward list (the same round's reviews, later in the day)

- **`1a6f6118`** — the external-preview sandbox was applied when a response was `text/html`, and an SVG or XHTML
  response from an external preview is a document too: opened directly it ran script under the app's own policy,
  which allows inline script, on the Desktop origin. The policy now covers all three scriptable document types
  and is applied before the branch that returns a response whose type is none of html/css/javascript — where the
  SVG case left earlier. This is the class `60cfcf9c` fixed for project icons.
- **`5649bb29`** — the preview bridge's `fetch` patch handled a string and a `Request`, and `fetch` takes a `URL`
  too: one built from `location.href` reached the Desktop server's own routes with the session cookie, unproxied.
  The bridge script is exported now so a jsdom test can drive its patches — the first coverage that script has had.
- **`9f5dda5c`** — `restart` built the replacement from the instance record and fell back to `{ port }` alone when
  that record was missing, so the running instance was stopped and replaced by one with no UI password on a port
  that may have had one. The rule is explicit and exported now: the record, an explicit `--ui-password`, or the
  environment carries it, and with none of them the command refuses and says how to proceed.
- **`65b4a080`** — the preview's no-store policy was set on `proxyRes.headers` after http-proxy-middleware had
  already copied the upstream headers onto `res`, which the file itself documents for `x-frame-options` and CSP —
  it strips those on `res` for exactly that reason. So the policy never reached the browser and a document the
  proxy had just rewritten could be served from the browser's cache. It goes through `applyPreviewNoStoreOnRes`,
  beside the frame-busting strip.
- **`6e178590`** — `ProvidersPage` tracked one `axEngineBusyKey` for the whole panel, so starting a second AX Engine
  download replaced the first row's entry and the first row's `finally` cleared the second's: a row's button came
  back while its request was still in flight and a second click started a duplicate. The busy state is a set of
  keys now, one per download, and each handler releases only its own — the MCP dropdown in the same tree already
  models its busy rows that way.
- **`fcb5c94d`** — the multi-run launcher's `@` mentions resolved through `useChatSearchDirectory`, which answers
  with the app's current chat directory: a run started from the launcher proposed files from whatever session the
  chat happened to show, not from the project it has selected. `FileMentionAutocomplete` takes the directory its
  caller names now (defaulting to the hook), and the launcher passes its selected project down through the
  run-group card that renders each prompt.
- **`03b334f6`** — the container entrypoint passed `--ui-password <secret>`, putting the UI password in the process
  argv where every process in the container can read it with `ps`; it is exported as
  `AX_CODE_DESKTOP_UI_PASSWORD` now, which the CLI reads and which the terminal a user opens drops before the shell
  sees it. `docker-entrypoint.test.mjs` already drove the script with shims and asserted the old argv form
  (`06873447` updates it: the argv without the password, the variable carrying it).
- **`c43b3bb8`** — `handleStart` in the fusion dialog filtered out the runs whose last assistant message has no
  text and fused the rest while the dialog kept listing every selected run, so the fused answer read as covering
  runs it had silently dropped. It refuses now and asks the user to exclude the run in the dialog's own list; the
  message names no count because that needs a new key in all fourteen locales, which the localization check
  enforces. No red-light test: that harness renders the dialog with its model picker mocked to `null` and no
  store selection, so `handleStart` returns at its guard before any source is read — reaching the filtering needs
  a picker stub that sets a selection and per-session message stubs, which the file does not have.
- **`da178739`** — `logs --follow` printed the tail and then followed from the file's current size, dropping every
  line written in between — the ones the followed run was producing. The caller records the size before the tail
  read and the follower starts there. It also read a rotated file from the old offset whenever the new one was
  longer, splicing a middle slice of it into the output (the test captured `'nd'` of the first line); it tracks
  the device and inode now and restarts from the beginning when either changes.

### Confirmed by this round's reviews and not yet fixed

These are carried forward rather than fixed in this round; each has the reviewer's evidence in its cell's
output and a test idea with it.

- **`preview/proxy-runtime.js:224, 287-303`** — the bridge's `matchMedia` patch keeps every listener in a
  page-global `Set` that is never pruned when the `MediaQueryList` is discarded.
- **`text/summarization.js:22-23`** — `sanitizeForSummary`'s path-stripping regex deletes ordinary
  slash-separated prose, not just paths (latent: the summary mode has no production caller).
- **`cli.js:1092-1110`** — `startup enable` on Windows hands `schtasks /TR` a string well over its 261
  character limit (the fixed env-file parsing block alone is ~300), which cannot be verified here and needs a
  task-XML registration or a launcher script.
- **`cli.js:1197-1207, 946-953`** — the UI password is persisted in the instance record and in the macOS
  LaunchAgent plist. Both are deliberate (0600, and `restart`/logon-start read them), so this is recorded as a
  policy question rather than a defect.

### The items left, and why they are left

Each of these is confirmed as a defect in the code, and none can be verified where this series runs. They are
written here with the shape of the fix so they can be taken up rather than rediscovered.

- **The preview bridge's `matchMedia` patch leaks a listener per discarded `MediaQueryList`**
  (`server/lib/preview/proxy-runtime.js`, the `colorSchemeListeners` set). An entry is removed only when the page
  calls the bridged `removeEventListener`; a page that drops the MQL without one leaves the entry, its callback and
  the page's closures in the set for good, and the bridge keeps calling it on a scheme change. The fix is to hold
  the MQL through a `WeakRef` in the entry and drop the entry when `deref()` answers undefined while notifying.
  There is no deterministic red light: the pruning needs a collection, and this suite has no `--expose-gc` hook. A
  test can at least pin the structure (the entry holds a weak reference, and a dead one is pruned when the
  notifier runs) by seeding the set through the exported bridge script — which is what `bridge-script.test.js`
  already does for the fetch patch.
- **`schtasks /TR` cannot take the command `startup enable` builds on Windows** (`packages/web/bin/cli.js`,
  `enableStartupService`). The fixed env-file parsing block alone is ~300 characters against a documented 261, and
  the whole action is ~550-650 for any real install path. It needs registering through task XML, or a launcher
  script the task points at with the parsing inside it. This cannot be run or verified outside Windows, and the
  suite's only related test asserts the quoting, not the length.
- **The UI password is persisted in the instance record and in the macOS LaunchAgent plist** (`cli.js`,
  `writeInstanceOptions` and the plist writer). Both are deliberate and 0600: `restart` reads the first, and a
  logon task cannot start the server without the second. But it is a credential stored at rest, which the
  repository's hard rules name as something not to do outside the process, and the plist copy outlives reboots
  until `startup disable`. This is a product decision rather than a local fix: keeping the plist copy is the cost of
  starting without input, and dropping the instance copy would make `restart` require the flag — which
  `9f5dda5c` now does explicitly when the record is missing.

A fourth item stood here — `sanitizeForSummary`'s pattern deleted the second half of `either/or` and `TCP/IP`. It
was fixed in `f9d0f2e2` (a slash-run is a path only at a word boundary) and again in `63b647ef` (punctuation
becomes a space, so `[docs](/etc/hosts)` and `file:/etc/hosts` no longer leak through). It stays named here so the
old entry is not rediscovered as new.

## Twenty-ninth round


Two audits of the twenty-eighth round's own commits, on two reviewers, plus two scopes this record had never read
systematically — `ui/src/lib` and `ui/src/hooks`, and the process entry points — and a second review of the four
small server trees whose first review had run out of time.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of `git diff f6ea81a4 HEAD` — the twenty-eighth round's own commits |
| `muse-wonder-full-1.0` (ax-code) | a second, independent audit of the same diff |
| `MiniMax-M3` (ax-code) | a third, after the first Claude cell ended without writing anything |
| Claude Code CLI | `ui/src/lib/**` and `ui/src/hooks/**` |
| ax-code `xiaomi/mimo-v2.6-pro` | `web/bin/cli.js`, `server/index.js`, `server/lib/http/**`, `scripts/docker-entrypoint.sh` |
| ax-code `glm-5.3` | a second review of `session-folders`, `magic-prompts`, `skills-catalog` and `ui-auth` (round 28's first cell had timed out mid-read; it answered with four findings when it finished) |

The first Claude audit cell exited 0 having written 22 bytes — its marker line and nothing else. It was re-run on
`MiniMax-M3`, which read every hunk and reported no confirmed bugs; the second audit of the diff found one, in this
round's own test rather than in the fixes.

### Fixed from the round's own test

- **`87a68016`** — the timeline dialog's composition test asserted `expect(openChangeMock).not.toHaveBeenCalled()`
  synchronously, and the dialog closes *after* an `await` in `navigateToMessage`: the assertion was true of any
  Enter, including the one that navigates and closes, so it measured the opposite of its own comment. It now drains
  the microtask after each press and asserts the plain Enter navigated and closed exactly once while the composing
  one did neither. The same review noted that `useDefaultDiffViewMode`'s comment promised only that a preview's
  toggle changes one preview; the callers' reset effects depend on the setting, so a later change applies to the
  previews already open, and the comment says so now.

### Fixed from the UI trees

- **`8428a5a4`** — the static-preview fallback ran `python3 -m http.server <port>` with no `--bind`, and the server
  listens on every interface by default: it serves the project directory as it stands — `.git`, `.env` and any
  credential file in it — to the whole network, while the command's own `previewUrlHint` says `127.0.0.1`.
- **`10940285`** — the new-worktree guard was read at the top of `createInstantWorktreeDraft` and set after
  `await checkIsGitRepository`, and neither the shortcut nor the menu item awaits the call: two presses in the same
  tick both passed it and each created a worktree and a branch, with one draft target between them, while the first
  call's `finally` cleared the flag under the second.
- **`6c263e40`** — a resumed integration reported `state.remainingCommits.length` as `moved`, and that is only the
  tail from the conflict onward: the success toast said "2 commits moved" for a five-commit integration, shrinking
  again at each further conflict. The state carries the total across the conflict now.
- **`9e6736ff`** — `appearanceAutoSave` hands its pending payload to `updateDesktopSettings`, which only merges it
  and arms persistence's own timer; the unload listeners that flush that timer are registered while
  `persistence.ts` loads, before this module's, so on `pagehide` the payload arrived after the flush had gone and
  was re-queued behind a timer the unload never reached. A change made inside the 150 ms debounce was still lost
  when the window closed. Found by tracing the two modules' registration order, which neither shows alone.

### Fixed from the second review of the small server trees

- **`5cc053c8`** — the session-folders GET read `if (!raw)`, conflating "the file is missing" with "the file is
  there and empty": a zero-byte file answered 200 with the empty snapshot, which the client treats as authoritative
  and writes back. Only `null` from the `ENOENT` catch means "no folders yet" now; an empty string falls through to
  the parse and is reported as corrupt, as `magic-prompts`' own store already does.
- **`7bdbc883`** — the disabled-auth controller returned every handler but `handleSessionLogout`, while
  `POST /auth/logout` is registered whether or not a password is: signing out rejected with a missing-method
  TypeError (a 500) and the cookie that branch's own `ensureSessionToken` hands out was never cleared.
- **`22d3a63d`** — the skills scan cache keyed on `owner/repo` without the host, so a self-hosted source and GitHub
  naming the same `owner/repo` shared one entry: the second source listed the first one's skills, whose items carry
  that source's clone URL, so installing "from" it cloned the other host. The parsing already keeps the host apart.
- **`23d00b59`** — an unvalidated `conflictDecisions` value counted as consent at the conflict gate and then matched
  neither the skip branch nor the overwrite branch, falling through to a copy over the live directory: same-named
  files replaced, stale ones left, no backup, reported as installed. The value is one of two words or nothing now,
  and a target that exists with nothing resolved the conflict is refused rather than merged into.
- **`5717703e`** — the ClawdHub tree disagreed with the repository tree in two places: its scan mapped every
  registry item as `installable` while both install paths apply `validateSkillName`, so the UI offered a button
  whose every press answered "Invalid skill name"; and it had no same-name guard, so a request naming one slug
  twice installed it once and renamed the second download onto the directory the first had filled — the user saw the
  raw `ENOTEMPTY` as their second selection's reason.
- **`4e103795`** — `handleResetAuth` cleared every passkey and *then* rotated the JWT secret, whose file write can
  fail: the endpoint answered an error with the passkey store already emptied on disk, so the sign-out had not
  happened and the credential the user still had was gone. The module states this rule for the env-pinned case; the
  rotate now comes first, and a failure destroys nothing.
- **`0b8489e6`** — the ClawdHub fetches had no bound while every other external call here is time-boxed, so a
  registry that accepts the connection and never answers held the catalog request (and the install behind it) for
  undici's own headers timeout, about five minutes, with the spinner on it. Both calls pass a signal now.

### Reported, verified, and not changed

- **A preview's mode follows the setting while it is open** (SUSPECTED, the second audit): the reset effects in
  `ToolPart-impl` and `ToolOutputDialog` depend on `defaultDiffViewMode`, so changing the layout setting resets a
  preview that was toggled by hand. That is what the upstream commit this round ported does, and the alternative —
  a preview that ignores the setting until it is reopened — is equally defensible; the hook's comment now states
  which one this is rather than leaving it to be discovered.
- **The two source-substring assertions this round added** (SUSPECTED, the second audit): both cover wiring inside
  components that cannot be mounted without the git store, the diff worker and the SDK (`DiffView`,
  `ToolPart-impl`), which is the seam this record documents for such components. The behaviour they stand for is
  covered where it can be: the store action has its own test, and the hook has a probe test.

## Twenty-eighth round

An audit of the twenty-seventh round's own commits, on two reviewers, plus the UI trees this record mentions least
(`mini-chat`, `comments`) together with every remaining key handler in `ui/src` that acts on a composition's keys, and
the small server trees that have all changed since they were last read.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of `git diff 971e2975 HEAD` — the twenty-seventh round's own commits |
| `muse-wonder-full-1.0` (ax-code) | a second, independent audit of the same diff |
| ax-code `xiaomi/mimo-v2.6-pro` | `web/server/lib/{magic-prompts,session-folders,skills-catalog,ui-auth}/**` |
| Claude Code CLI | `ui/src/components/{mini-chat,comments}/**` and the remaining composition-sensitive key handlers |

Both audits converged on three of the same defects in the round's own work — two of them regressions that round had
introduced with its own fixes — and the second found two more in what those fixes left on the path production
actually uses.

### Fixed from the round's own commits

- **`e02d553f`** — `0c67c6e8` left the attempts-exhausted guard `if (remaining.length === 0 && settledKeys.length === 0)`
  in place, and `settledKeys` comes from a map of `Set`s: `length` is `undefined`, so the `continue` could never run.
  It could not have run for a second reason the audit did not check — the project loop `continue`s on
  `tasks.length === 0` before either map is written, so every project that reaches this loop has something to remove
  — which is also why the consequence the audit named (an unguarded write for a file with nothing to remove) does not
  occur. The guard was a remnant of the pre-`ac70e683` logic and is the thing that skipped the file whose
  settled-task removal is what failed, so it is gone; the test pins the invariant that makes it unnecessary.
- **`00d4206c`** — `b1570268` resolved the deepest *existing* ancestor for a target that does not exist yet, because
  a write may be creating the file. A symlink whose target does not exist answers the same `ENOENT`, so the walk up
  from it treated the leaf as "about to be created": the path compared as inside the skill, and the write then
  followed the link and created the file wherever it pointed. The resolution now reports that case as its own,
  reading and removing answer as before (both act on the link itself), and the write refuses it.
- **`7082c5c8`** — `7cd0445b` marked the ask being answered from its debounce entry, but the flush deleted that entry
  as its first statement: a keyed ask answered by a reply without an id still announced "Input needed" while the
  flush awaited the template variables, and an unkeyed ask answered by a reply *with* an id marked only the keyed
  set its own flush never consults. The entry now outlives the flush — cleared when it settles, and only if it is
  still that ask's — which is what lets a reply name the ask it can only be answering.
- **`6d5c3f13`** — two fixes from that round which did not reach the path production uses.
  `78b1601f` made `broadcastUiNotification` drop a stream it ended, but that function delegates to
  `createGlobalUiEventBroadcaster` whenever one is wired, and that fan-out ignored `writeSseEvent`'s `false` and left
  the client in the set — its own test forced the fallback branch, so it passed where production does not go. And
  `sanitizeTerminalEnv`'s by-name list missed `UI_PASSWORD`, the alias the container entrypoint passes as
  `--ui-password` while `exec`ing the server in the same environment.

### Fixed from the UI review

- **`34ccdc71`** — the timeline dialog's search field acted on the keys a composition consumes, the class round 27
  fixed in four other fields: Enter navigated to the message the half-typed query matched and closed the dialog, and
  the arrow keys moved the result highlight instead of the candidate list. The sweep that found it covered every
  remaining key handler in `ui/src`.

### Ported from the upstream comparison's follow-up pass

- **`2698eb8a`** — the Changes header kept its layout only for the files on screen, so a file that appeared later,
  another session or the next launch opened inline again while Appearance still showed the old choice
  (`openchamber 0ceac5c964545a829f7716184dbd9e47e6a7323a`).
- **`16998525`** — both diff previews in chat hard-coded `unified` and reset to it whenever the preview changed,
  whatever the layout setting said (`openchamber 1cd03296e2700f820b64e31fb009d10b1ab7cd6a`, its functional half).
  See `.internal/reports/UPSTREAM-COMPARISON-2026-10-16-openchamber-fixes.md` for the pass, its method and what it
  discarded.

### Reported, verified, and not changed

- **One source-order assertion is weaker than the behaviour it stands for** (SUSPECTED, the first audit):
  `DirectoryExplorerDialog-browse.test.ts` asserts that the composition guard's line index precedes the first
  `event.key === "ArrowDown"`, so it would still pass if the guard were wrapped in a condition. The other one the
  audit named, `pendingToastWiring.source.test.ts`, **was tightened** (`a1412bfb`): it compared the clear's index
  against the comment `// Global events`, and it now matches the two branch statements inside `handleEvent` with the
  searches starting at the handler, which keeps its sensitivity to the placement it was written for (`b575ecbb^`
  still fails it) without a comment edit being able to answer it. The directory dialog's handler cannot be made
  behavioural cheaply: it lives inside a dialog that needs the desktop file API, the projects and git-identity
  stores and the identity picker before it mounts, which is the seam this record documents for such components.
  What the guard *does* is call `isIMECompositionEvent`, which four dispatch tests in this series exercise with
  `isComposing: true`.

## Twenty-seventh round

An audit of the twenty-sixth round's own commits, the server's `ax-code`, `terminal` and `event-stream` trees, the
UI trees this record mentions least (`dashboard`, `model-picker`, `mini-chat`, `files`, `comments`), the web
package's own source with the `notifications`, `projects` and `desktop` server helpers, and — once the fixes were in
— an audit of the round's own commits.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of `git diff ea6e8a96 HEAD` — the twenty-sixth round's own commits |
| ax-code `xiaomi/mimo-v2.6-pro` | `web/server/lib/{ax-code,terminal,event-stream}/**` |
| Claude Code CLI | `ui/src/components/{dashboard,model-picker,mini-chat,files,comments}/**` |
| Grok CLI | `web/src/**` and `web/server/lib/{notifications,projects,desktop}/**` — ended without reviewing |
| Claude Code CLI (re-run) | the same `web` scope, on the same prompt |
| muse-wonder-full-1.0 | an audit of this round's own commits (`git diff 971e2975 HEAD`) |

The Grok cell is the harness failure this record keeps meeting in a new shape: it ran a shell command first
(`node --input-type=module`), the headless session refused to approve it, and the process ended with that refusal as
its entire output — 343 bytes and an exit status of 0. That is why the batch helper looks for findings rather than
for a process that ended, and why the same scope was re-run on the Claude Code CLI: that cell is the one that
produced the four `web` findings below.

### Fixed from the audit of the round's own commits

- **`0fa22360`** — `4d3eaaf7` cleared a session's pending toast keys in its `session.deleted` branch only, though
  its own comment and the tracker's test both say "(or archived)". Archiving arrives as `session.updated` with
  `time.archived` — the signal `event-reducer` reads for the same thing — so an archived session kept its keys for
  the life of the renderer with its toast pointing at a session that is gone. The clear also sat *after* the early
  return a directory with no loaded child store hits, which skipped it entirely for a delete there.
- **`1ae54451`** — `5d6f5457`'s reset read `dragAxisRef`, which outlives the drag that set it: a later
  disappearance of that axis's thumb, with no drag running, was read as the interrupted drag — the hover flag of
  the thumb the pointer was actually on was cleared and the bar hid under the cursor.
- **`ac70e683`** — `e1c2ea11` leaves a settled task in the project file when the loop threw before its removal
  write, and the attempts-exhausted cleanup removed only what it counted as remaining: the migrated task stayed
  listed for good, with the marker's `migratedAt` stopping any later boot from cleaning it up. The cleanup write
  includes the keys this pass settled — without recording them as dropped, so the counts keep their meaning.

### Fixed from the UI review

- **`527e805f`** — two key handlers acted on the keys an input method consumes. In the model picker's search box,
  Enter (which commits a composition) selected the highlighted model and closed the picker, the arrow keys (which
  move through candidates) moved the highlight or switched the thinking variant, and Escape closed it. In the
  inline comment field, Escape (which dismisses candidates) cancelled the comment and unmounted the field with the
  text already typed in it. The composer and the question card gate through `lib/ime`; these two do now as well.
- **`6e0b059a`** — the same class in the two remaining text fields, found while sweeping for it: the cross-session
  search box (its arrows move the highlighted hit and Enter opens it) and the directory browser's filter (its arrows
  move the row highlight, Enter opens a row or adds one). Both acted during a composition, so the highlight moved
  while the user was picking an IME candidate and Enter opened something before the query was committed. The sweep
  also settled the two cases it could not: `ProvidersPage`'s handlers only `stopPropagation`, `ProjectsHome`'s need
  the list itself focused and hold no text field, and Base UI's own Escape dismissal already defers while composing
  (`floating-ui-react/hooks/useDismiss.js:96`), so dialogs need no guard.
- **`1dffd654`** — found while reading the controller the review above pointed at: its reset keys the selection, the
  half-typed text and the edit target on the comment *scope*, and that scope was the session (or the draft project)
  without the file. A draft carries its `fileLabel`, and the file view passes the file it shows as that label
  without being remounted per file — so switching files with the comment box open carried all three into the next
  file, and saving wrote the comment against the file now on screen or moved the draft being edited onto it.
- **`f25dcf10`** — `getFolderBadgeForPath` counted a file in two buckets: the two checks were independent `if`s, so
  a file staged as added and edited again (`A` + `M`) counted as both modified and added while
  `getFileStatusForPath` classifies it as "git-added" and its own row says so. A folder with one such file reported
  `modified: 1, added: 1`. Each file lands in one bucket now, in the per-file classifier's order.

### Found while re-reading the round's own fixes

- **`ae9bed2a`** / **`6ad0788d`** — `93762314` keyed the question path's answered mark by request id, and only a
  session-level mark covered a reply the runtime sends without `requestID` (which the permission path documents as
  a possibility). `ae9bed2a` added that session-level check; re-reading it showed the mark's cost is worse than
  the stale notification it prevents — a session-wide mark is cleared by the *next* question in that session, and
  not clearing it silences that question, a notification nobody has answered. `6ad0788d` settles it the way the
  permission path does: an unattributable reply drops the session's *pending* flush, no mark is kept, and an
  id-carrying ask and reply are cancelled by their own key.

### Fixed from the server tree review

- **`49239d7a`** — `parseSseEventEnvelope` took the *first* `id:` line of an upstream block with `.find()`, while the
  SSE spec makes a repeated `id` field overwrite the earlier ones and this module's own `readTrailingEventId`
  implements last-wins for a block too large to keep. The cursor stored for a reconnect was therefore the first id,
  and the replay it requested either re-delivered an event the client had applied or skipped one it never saw.
- **`b1570268`** — `assertPathWithinSkillDir` realpath'd the skill directory but compared the target as written, and
  `path.resolve` does not follow symlinks: a link shipped inside a project's own skill directory passed the check,
  so a supporting file read returned whatever it pointed at, a write overwrote it and a delete unlinked it. The
  comparison is canonical now, using the deepest existing ancestor for a write that is creating the file.
- **`9c133917`** — one SSE client's backpressure answered with `session.ptyProcess.pause()`, and that pty is shared
  by every other SSE client, the bound WS clients and the replay buffer: one socket that stopped draining froze
  output for all of them, which is the freeze the teardown path then spent lines undoing. With two stalled clients
  the first `drain` resumed the pty while the second was still behind, since `paused` was per-client state. The WS
  path already disconnects the client that is too far behind, and the SSE path now does the same, so the pty is
  never paused for a viewer.
- **`9c133917`** — in the same file, `sanitizeTerminalEnv` dropped `AX_CODE_SERVER_PASSWORD` and the browser marker
  but not the loopback UI password or the session signing keys, so a shell spawned by the app inherited them and any
  command in it — including a script from the project being opened — could read them. The app's own credentials are
  now dropped by name, as `cli-install` does for the upgrade CLI; the user's own exported tokens stay, because
  scrubbing by pattern would break `git push` with an exported `GITHUB_TOKEN`.
- **`0c72a164`** — the queue that holds upstream events arriving before `server.connected` is bounded at 200, and
  evicting its oldest was silent: the ready frame plus the surviving tail read as a gap-free stream, and the client's
  cursor had already moved past the dropped prefix, so nothing would ask for it again. The flush now prepends the
  `server.resync_required` frame this module already uses for an unrecoverable gap elsewhere.

### Fixed from the web review

- **`4d2adf23`** — a reasoning part carries `text` like a text part, and the text extractor accepted any part that
  did, so the notification body led with the model's chain of thought instead of its answer; the body is truncated
  to 250 characters, so the answer was usually cut off and the trace also reached the OS notification centre.
  `AssistantTextPart` renders the two as different parts, which is the distinction the extractor now makes.
- **`96fd7c31`** — the codex import read `trust_level` from a fixed 240-character window starting at the section
  header with no section boundary, so a project that sets no trust level — the usual case — reported the next
  section's, and the import UI showed a trust the user never set.
- **`78b1601f`** — two ways a notification stream stayed in `getUiNotificationClients()` after it was gone, each
  with a live 25 s heartbeat and a write on every later broadcast: `writeSseEvent` answers `false` after ending a
  stream whose buffer is over the cap, and both callers discarded it (which is also why the close handler the
  emitter's comment relies on does not fire for such a socket); and the stream route attaches `req.on("close")`
  after two awaits, the first of which starts the global watcher, so a client that disconnected in that window had
  already fired `close` and was never removed.

### Fixed from the audit of this round's own fixes

- **`7cd0445b`** — `93762314` keyed the question path's answered mark by request id, and an ask the runtime sends
  without an id has no id for its reply to be keyed by: the mark the flush checks computed `null`, so a reply in the
  flush's await window no longer stopped the "Input needed" notification. `c5e7352d` had covered that case with a
  session-wide mark and this round's `6ad0788d` moved the debounce cancellation into its own branch on top of it,
  leaving the unkeyed ask with no suppression on either path. The reply is now marked against the key it can carry
  — its own id, or the pending ask's id, or the session when neither has one — and the next unkeyed ask clears that
  session mark, since it is a different question. **The audit also caught that this round had rewritten the original
  test's inputs to carry ids**, which is why the case had stopped being covered; the test now covers both shapes.
- **`0c67c6e8`** — `ac70e683` added the keys this pass settled to the attempts-exhausted removal, but the loop
  `continue`d on an empty remaining list before building that set, and a file whose removal write failed is exactly
  the one whose remaining list is empty. Its write never ran and the marker's `migratedAt` stopped the next boot
  from trying again, so the file kept tasks the runtime already owned.
- **`b575ecbb`** — `0fa22360` moved the pending-toast clear above the store lookup, but the global branch above that
  one returns first for a `session.deleted` that resolves to "global" or empty, which is where a session no child
  store knows lands. The clear now sits with the other code that runs before the first branch that returns, and the
  source assertion covers that branch rather than only the store lookup.
- **`547e64c6`** — `527e805f` put the composition guard above `event.stopPropagation()` in the model picker's search
  box. That call was unconditional before it, so the guard also dropped the shield the box keeps for the keys the
  picker owns, and Escape from a composition reached the menu and the window-level handlers above it — one of the
  outcomes the guard was added to prevent. The two other handlers this round guarded propagate their keys already,
  so nothing changed there.

### Reported, verified, and not changed

- **The slash-command hand-back runs before the command's send** (SUSPECTED, the same audit). `158d456a` moved the
  hand-back to each branch's first statement, so for a command submitted from a new-session draft the session
  guard sees `null === null` and the attachments return to the composer before the command creates its session.
  That is the intended side of the trade: the attachments live in a single input store rather than per session — so
  they are simply still attached, the same state a failed send restores — while the position the guard was written
  for (after the await) could only *drop* them. Losing a user's attachments is worse than their remaining attached.

## Twenty-sixth round

An audit of the twenty-fifth round's own seventeen commits, the `sync` and `stores` trees, the server's
`fs`/`security`/`text`/`preview` helpers, and the layout, terminal, update, onboarding, desktop and icon UI
trees.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of `git diff 66d55595 HEAD` — the twenty-fifth round's seventeen commits |
| ax-code `xiaomi/mimo-v2.6-pro` → Claude Code CLI | a second, independent audit of the same diff |
| ax-code `glm-5.3` → `MiniMax-M3` | `ui/src/sync/**`, `ui/src/stores/**` |
| ax-code `deepseek-flash` | `web/server/lib/{fs,security,text,preview}/**` |
| Grok CLI | `ui/src/components/{layout,terminal,update,onboarding,desktop,icon}/**` |

Two cells had to be re-run, and the second time the failure was silent. The `sync`/`stores` cell died on its first
model (`defai-01-ax-trust-com` slot cooldown: "all eligible credential slots are cooling down (stopped after 5
retries)"), the same provider-side refusal the early rounds recorded for three other models; it was re-run on
MiniMax-M3 with the same prompt. The second audit ran on `xiaomi/mimo-v2.6-pro` and its process then disappeared
without writing its `EXIT` marker — its output file held startup traces, which read as "still running" until
`check-round-outputs.sh` (written this round) compared the process table against the expected markers. It was
re-run on the Claude Code CLI, which is the audit recorded above.

### Fixed from the audit of the round's own commits

All four audit findings were defects in the previous round's fixes — the fourth round running where that lens
out-yields the fresh reviews.

- **`158d456a`** — `c77d78a9` moved the slash-command hand-back into each branch that handles its command, but
  put it just before the branch's `return`, i.e. after the branch's awaits. `/compact`, `/summary`, `/plan` and
  the rest send and await before returning, and the hand-back restores a pre-submit snapshot with a
  replace-style write (`setAttachedFiles` replaces the list) plus a session guard written for a synchronous
  position: a file attached while the command ran was overwritten by the snapshot, a command submitted from a
  new-session draft dropped its attachments (the send had created the session by then), and switching session
  during the command dropped them too. It is the branch's first statement now.
- **`08af72ff`** — `58112089`'s save path derived the global permission back out of `permissionRules`, which
  structurally excludes the `*`/`*` rule (`applyPermissionState` filters it out; the saved config re-adds it from
  `globalPermission`). `getGlobalWildcardAction` therefore answered its default `"allow"`, so saving an agent
  whose global is ask or deny flipped the selector to allow and built the baseline against the wrong wildcard,
  dropping the overrides that had become redundant from it. The baseline uses the submitted global now, which is
  what a reload of that file produces.
- **`6734ae37`** — `29e8a715` cleared the scrollbar drag flag when *no* thumb was left, but a drag belongs to one
  axis: with both axes overflowing, shrinking the content until only the horizontal thumb remains left the flag
  set, and the bar then showed for the programmatic scrolls `suppressVisibility` exists to hide. The reset checks
  the axis the pointer captured.
- **`e1c2ea11`** — `24a6e7c6`'s catch added to `retryableRemaining` after the `try` had already added to it, so a
  project whose file write failed after a task retried reported that task twice; and it reset the project to every
  task it was handed, discarding `settledTaskKeys` — so when the attempts ran out, the tasks that had been
  migrated were recorded as dropped ("migration attempts exhausted") and removed from the project file. The
  project's remaining tasks are computed once, after the try/catch, and hold only what this pass did not settle.
- **`e4c9f36d`** — found while re-reading `08af72ff` above, in the same place: the save-time baseline is the
  *filtered* rules (what a reload of the file produces) but the live list was left untouched, and `isDirty`
  compares the live list against that baseline — so a wildcard override equal to the global (`bash: * = allow`
  under an allow global) kept the editor dirty for the save that had just written it. The live list takes the
  filtered rules now, and only while it still holds what was submitted.

### Fixed from the sync and stores review

- **`4d3eaaf7`** — the "an agent needs you" toasts kept their keys in two module-level `Set`s, deleted only when the
  request was answered. A session deleted while a request was outstanding never reports that reply, so its keys
  stayed for the life of the renderer (unbounded over a session of the app, and enough to suppress a toast if that
  key came back), and the toast itself stayed on screen pointing at a session that no longer exists.
  `pendingToastTracker` replaces the two sets, dismisses the toast when a key is dropped (the inline
  `toast.dismiss` calls were the other half of the same bookkeeping), and `session.deleted` clears the keys that
  belong to the session.

### Fixed from the layout and onboarding review

- **`6d808d46`** — the embedded agent browser's native view was hidden only when the document held
  `[role="dialog"][aria-modal="true"]` or a native `dialog[open]`. The app's dialogs are Base UI popups: they carry
  `role="dialog"` and no `aria-modal` (the only `aria-modal="true"` in the tree is the mobile overlay panel), so
  the settings window, the command palette, a confirm dialog and the project edit dialog were invisible to that
  test — the native view stayed on the browser host's rectangle, on top of the modal, and every click inside it
  went to the embedded page instead of the dialog. The selector matches the shapes the app renders now.
- **`f4d8c529`** — the bottom terminal's resize handle started a drag and listened for `pointermove`/`pointerup` on
  `window` without capturing the pointer, so a release outside the Electron window was never delivered and the dock
  kept following the pointer with no button down until the next `pointerup` anywhere; a platform-cancelled pointer
  reports no `pointerup` at all and left the same state. The handle captures the pointer (as the sibling splitters
  do) and the drag ends on `pointercancel` too.
- **`421aa63d`** — the chooser's "Check now" did nothing for a `false` answer. `checkCliAvailability` answers false
  both for a CLI that is not running yet and for a health request that failed or could not be read, and only a
  rejection from recording the choice was reported: the button returned to "Check now" with the status area still
  saying the app was waiting, so the user could not tell this check from one that had succeeded. It reports the
  same `onboarding.localSetup.errors.cliNotReady` the local-setup screen uses.

### Fixed from the second audit

The same diff, a second reviewer. All five findings are defects in the twenty-fifth round's own fixes — and one of
them is a *withdrawal*: the audit checked a fix against the rule the runtime actually applies, which the fix had
taken from a sibling helper in the same tree instead.

- **`91dc003f`** — `033a129d` widened the agent pane's WebMCP origin rule to every `127.x.x.x` address, following
  the loopback helper next to it. That helper answers a different question (which hosts the renderer protocol may
  fetch from); the pane has to answer the runtime's, and the runtime's own `WEBMCP_LOOPBACK_HOSTS` —
  `localhost`, `127.0.0.1`, `[::1]`, shared by its bridge policy, approval store and TUI allowlist dialog, and
  copied into the UI for the grant box — accepts no other address. With the wider rule the pane read
  `http://127.0.0.2:8080/` as `ready` while the grant path refused the origin: the address bar offered something
  the server rejects. The round-25 entry is superseded by this revert, and the round-25 review's finding (a local
  service on another loopback address cannot be granted) is a property of the runtime's rule, not a pane defect.
- **`c3cf0e4b`** — `8d8516e3` normalized a tool path before handing it to the editor, and the normalization
  rewrites backslashes: a POSIX filename containing one (legal there) was turned into a path with an extra
  separator, and the mobile branch of the same handler still used the raw path, so the two disagreed. A POSIX
  absolute path is passed through as the tool wrote it; a Windows drive path is still normalized.
- **`5d6f5457`** — `29e8a715`/`6734ae37` cleared the drag flag when the dragged axis's thumb vanished, but not the
  rest of the state an interrupted `pointerup` resets: `handlePointerUp` schedules the hide, and the hover flag it
  leaves set is what makes `scheduleHide` return early (the `mouseleave` that clears it goes to the node that is
  gone). The bar could stay on screen with no hide timer behind it, indefinitely.
- **`93762314`** — `c5e7352d` marked a question answered by *session*, and a new ask cleared that mark, so a
  question answered while its own flush awaited the template variables was announced anyway as soon as the
  session asked something else — with the session's tag, so the stale text could replace the newer question's
  notification. The mark carries the request id now, as the permission path's equivalent does; only an ask the
  runtime sent without an id, which can only be keyed by its session, clears its session's mark.
- **`5125dd7d`** — `e1c2ea11`'s catch gives an empty retry set when the file write that removes a project's
  settled tasks is what failed, so the pass reported `migrated: true` and wrote the marker's `migratedAt`, which
  stops the next boot from trying again: the project file keeps listing tasks the runtime already holds and
  nothing records the failure. A warning names it, and a task skipped again on a later boot (the same failed
  removal) is listed once.

### Reported, verified, and not changed

- **The persisted child-store cache key can collide between directories** (SUSPECTED, the same review).
  `storagePrefix` is the first 12 sanitized characters plus a 32-bit rolling hash of the whole path, so two
  directories whose first 12 characters match and whose hashes agree share a `localStorage` key and would show one
  workspace's VCS info, project metadata or icon for the other. The head already discriminates real paths, so an
  accidental collision needs on the order of 2^16 paths sharing a head; a deliberate one needs local filesystem
  control (to place a repository at a chosen absolute path) and buys a display-only substitution. Widening the hash
  is a key-format change with no reachable defect behind it, so it is recorded rather than made.
- **An archived session keeps its pending toasts** — the same tracker could clear them on `session.updated`
  carrying `time.archived`, but an archived session can still be answered, and the reply clears the key. Recorded
  as a judgement call rather than a defect.
- **The `fs`/`security`/`text`/`preview` review found nothing** (`no confirmed bugs`), and withdrew both of its
  own leads after checking them against the repository: the win32 reveal branch's `code === 0` gate is an extra
  success condition (the project's own Windows launcher ignores the child's status and watches `error` only), and
  the unguarded `distillNoteFallback` needs `mode: "note"`, which no production caller passes.
- **Core search hits are joined onto the root without a containment check** (SUSPECTED, the same review, recorded
  here after checking it myself). `mapCoreFindFilesToSearchEntries` does `path.join(rootPath, relativePath)` where
  the sibling read/raw/list paths normalize through `toRuntimeRelativePath`. The only consumer is the deep-scan
  favicon finder, which filters the hits by a `favicon.(ico|png|svg|jpg|jpeg|webp)` basename and serves the match
  as an image under its own CSP; the runtime's `/find/file` contract scopes its results to the directory it was
  given, so a `..`-bearing hit requires the signed runtime to misbehave. Adding the check would be defence in
  depth rather than a fix for a reachable defect.
- **The liveness tracker's `ping: false` mode declares a socket dead after two intervals** — `alive` is only ever
  set by a pong, and no caller passes the option, so the branch is dead code today. Recorded rather than removed
  (removing an unused option is churn, and the wait it encodes may be wanted by a future transport).

## Twenty-fifth round

The UI primitives tree (last read in the first round) and its entry point, the web package's own source tree,
the electron main process, the server modules this record mentions least (the scheduled-task convergence
migrator, the magic-prompt store, the session-folder routes, the projects/notifications/desktop helpers), and —
for the fourth round running — an audit of the previous round's own commits.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | `ui/src/components/ui/**`, `ui/src/main.tsx` |
| ax-code `deepseek-flash` | `desktop/packages/web/src/**` |
| Grok CLI | `desktop/packages/electron/src/**` |
| ax-code `glm-5.3` | `web/server/lib/{scheduled-task-convergence,magic-prompts,session-folders}/**` |
| ax-code `qwen/qwen3.8-flash` | `web/server/lib/{projects,notifications,desktop}/**` and the small cache/handler helpers |
| Claude Code CLI | an audit of `git diff 67f599dc HEAD` — the twenty-fourth round's seventeen commits |

The audit cell produced no output at all, and the reason was a harness defect of the same family as the
previous round's: its prompt-building function wrote the prompt file and echoed the path but never invoked a
reviewer. The cell was found by requiring every expected `out-r25-*.txt` to exist rather than by reading the
batch's status, and it was re-run directly. Its findings — four of the round's own fixes — are the first group
below, which is what makes this lens worth its slot every round.

### Fixed from the audit of the round's own commits

- **`c77d78a9`** — `f365a32d` handed the consumed review drafts and files back for *every* parsed command, but
  only the branches that `return` leave the text unsent: `/summary`, `/compact` or `/undo` in a new-session
  draft (those branches need a session) fall through to the ordinary send, which carries the drafts folded into
  the text and the attachments out with it. The same comments were therefore sent *and* put back, and the
  attachment chips reappeared after a successful send. Each branch that handles its command hands the state back
  before returning; nothing restores on the way in.
- **`7795ad22`** — `8ccbcbd3` wrote the values captured in the render that started a save back into the form
  after the `await`. The fields are still live while a save is in flight and `isSaving` only disables the button,
  so typing during a save was replaced by the pre-save text, a rule added meanwhile by the pre-save list, and a
  switch to another agent or command by the previous entry's values — baseline included. A value goes back into
  its field only when that field still holds what was submitted, and the baseline is set from the rules that were
  saved while the live list is left alone.
- **`8d8516e3`** — `816df1ef` used `isAbsoluteChangedFilePath` for the turn's changed-files dropdown, but that
  helper reads the shape `extractGitChangedFiles` builds (forward slashes, uppercase drive) while the dropdown's
  entries come from `extractChangedFiles`, which copies what a tool reported (`C:\repo\a.ts`, `c:/repo/a.ts`).
  The drive path was prefixed with the directory it already starts with. The tool-path helper added in the same
  round normalizes both shapes and is used there now.
- **`530facd4`** — `06f3ee15` attached the disk record's fallback to `onLatestError`, which fires only for a
  write that is still the latest entry with nothing queued: a write that failed after the content moved on was
  reported nowhere, so the record kept pointing at text the disk never received and a revert to the text the disk
  *does* hold looked like "nothing to save". `PlanSaveQueue` reports every failed write through `onError` now, the
  counterpart of `onSaved`.

### Fixed from the UI primitives review

- **`b911d2a0`** — the update dialog's changelog split fell back to the whole release body for a version whose
  section is only its heading, so that version's card printed every other version's notes; and
  `normalizeReleaseNotesForMarkdown` searched for `<script`/`<style` in a lowercased copy and applied those
  offsets to the string it slices, so a character whose lowercase form is longer (`İ`) made the removal start
  inside the block — the notes kept a stray fragment and dropped the text after it.
- **`5c90dce3`** — the overlay scrollbar's drag mapped pointer movement over the full client height while the
  thumb is positioned on a track 16 px shorter, so the content scrolled about 6% slower than the pointer and the
  thumb drifted away from it: dragging the thumb to the end of its travel left the content short of the end.
- **`29e8a715`** — the thumb unmounts as soon as the content stops overflowing, and the `pointerup` that clears
  the drag flag goes to the element that captured the pointer. A drag interrupted that way left the flag set for
  the life of the instance, and the bar then showed for every programmatic scroll the `suppressVisibility` and
  `userIntentOnly` paths exist to hide.
- **`4962256a`** — `normalizeToStep` derived its precision from the step and returned the value untouched when
  that precision was zero, so a whole-number step enforced nothing: `1.5` was committed into the retention-days
  field (and every other integer field) and the blur documented as forcing an off-step entry into range left it
  as typed.

### Fixed from the web package review

- **`a45a935a`** — the loopback-URL rewrite checked a path parsed against the `app:` page origin and then handed
  back a URL built for the loopback origin. `app:` is not a special scheme, so a backslash survives its parser
  while the `http:` parser treats it as a separator and collapses the dot segments around it:
  `/api/a\..\..\assets/x` passed the `/api/` prefix test and was fetched as `/assets/x`, outside the API tree,
  with the app-protocol handler's own traversal guard bypassed because the request had been rebound. Both
  branches now build the URL they return against the loopback origin and check *its* pathname.

### Fixed from the electron review

- **`0733d92d`** — a `.cmd` launcher is spawned through `cmd.exe` with `/s`, which strips the leading quote and
  the last quote character of the `/c` string. The command line was `"C:\…\ax-code.cmd" serve --port 4096`, so the
  quotes that went were the ones around the binary: cmd tried to run `C:\Program`. The staged launcher lives
  under the install directory, which has a space on Windows, so this is the shape the runtime spawn and the
  version probe actually use.
- **`16b1648e`** — the walk resolves a *directory* it entered through a symlinked root before the deny policy
  sees it, but a *file* was judged on the caller's path alone: searching `/tmp/alias` (a link to
  `~/.config/git`) returned `credentials`, the name of a path `desktop_read_file` refuses and the walk follows
  the link to. Only an entry that can appear in the results is resolved, so the walk does not pay one `realpath`
  per entry.
- **`033a129d`** — `agentOrigin` listed `127.0.0.1`, `localhost` and `[::1]` by hand, so a local service bound to
  any other loopback address was read as a public `http:` page: the address bar marked the pane un-grantable and
  the agent's navigate failed. It uses the same loopback helper the renderer protocol's checks use.

### Fixed from the convergence and magic-prompt review

- **`24a6e7c6`** — the scheduled-task migration classifies every *runtime* answer as retry or permanent so one
  bad task cannot abort the pass, but a *local* failure had no such classification: a snippet directory that
  cannot be read, or a project id the config layer refuses, threw out of both loops. The marker is written only
  after the loops finish, so `attempts` never advanced, the attempts-exhausted branch could not fire, and every
  project file sorted after the failing one was never migrated — its scheduled tasks stopped firing with one log
  line to show for it. A project that fails this way is left for the next boot, like the runtime-unreachable case.
- **`eec6fe57`** — the magic-prompt state file was written in place, so a process killed or a full disk halfway
  through left partial JSON, and every later read refuses that file as corrupted — which turns both the list and
  every future edit into a 500. The only in-app recovery from there is `resetAllOverrides`, which drops every
  stored override rather than the one whose write was interrupted. The write goes through a temp file and a
  rename, as every sibling persistence path in this tree already does.

### Fixed from the notifications review

- **`955ee2cf`** — the permission-ask notification path read `settings.notifyOnQuestion`, the toggle that belongs
  to `question.asked` (which reads it for its own path), and never consulted `notifyOnPermission`: turning
  "Questions" off silenced permission asks, and turning "Permissions" off still announced them. The server is the
  only notifier while the window is unfocused, so a silenced ask leaves the user with no idea an agent is blocked.
- **`c5e7352d`** — the question path deletes its debounce entry before awaiting the settings read and the
  template variables (which resolve a git command), so a reply landing in that window found nothing to cancel and
  the "Input needed" notification fired seconds after the user had answered. The permission path cancels for
  exactly this reason; the question path now does too, and a new ask clears the session's answered mark.

### Reported, verified, and not changed

- **An in-flight `realpath` promise never expires** (SUSPECTED, the qwen run). A hung OS-level lookup pins every
  later resolution of that path. Sharing the in-flight promise *is* the cache's purpose — it is what keeps
  concurrent callers from running the same lookup — and the hang it would have to be rescued from is an OS
  condition the cache cannot fix: a deadline would issue a second lookup against the same hung mount. No failure
  was demonstrated for it.
- **The IME guard ahead of every shortcut** (SUSPECTED, the audit). The guard covers all shortcuts although the
  comment that justifies it is about Escape arming the double-Escape abort. The project's own
  `isIMECompositionEvent` — used by the composer's handler — defines "composing" as exactly
  `isComposing || keyCode === 229`, and the helper documents why both signals are needed. Narrowing the guard
  would trade a real abort defect for a speculative shortcut annoyance.
- **`notifyAgentCompletion` treating a Tauri `undefined`/`null` result as success** (SUSPECTED, the web review).
  The `result == null` branch is deliberate — it is what a legacy `desktop_notify` command returns — and the test
  "treats legacy null desktop results as successful" documents it.

## Twenty-fourth round

The composer's shell surface — the slash-command branches and what the submit path consumes before them —
the session, projects, supervision and multirun panels, and, for the third round running, an audit of this
series' own commits since the last audit.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | `ui/src/components/chat/**` shell surface: the slash-command branches and the submit path |
| Claude Code CLI | `ui/src/components/{session,projects,supervision,multirun}/**` |
| Claude Code CLI | an audit of the round's own diff (`git diff 0b5920a3 HEAD`), run again after the harness defect below |
| deepseek-flash | a second, independent audit of the same diff |
| Grok CLI | `ui/src/components/chat/**` — the run before this one ended without a report; the second attempt's findings are below |

### The audit harness handed the reviewer its own prompt

`run-round24.sh` passed the prompt file itself as the scope of the audit cell, so `prompt_for` generated a
prompt whose `SCOPE:` line named that file and the reviewer was asked to audit a prompt about auditing. It
answered "no confirmed bugs" in 40 bytes and the run was recorded as clean. Every prompt the harness
generates is now checked for a `SCOPE:` line that names source (a glob) or the diff, and the corrected run
took 6 695 bytes to report **five defects, all of them in this series' own fixes**. The intermediate
conclusion (that rounds 20–23's fixes had been audited clean) was not evidence and is withdrawn; what the
earlier audit did cover is the twenty-third round's own record.

### Fixed from the corrected audit

- **`776a0c33`** — `bbb1717b` consumed a hunk body by draining `oldCount + newCount` from one counter, but a
  context line is in *both* counts, so the guard ran `oldCount` lines past the body of any hunk with context.
  `stageHunk`/`unstageHunk` rely on it to refuse a patch that edits another file, and the over-run swallowed
  the next file's `--- `/`+++ ` pair: the guard counted one section, `git apply` staged the other file's hunk
  too. The over-run read the other way as well — a later hunk's own `--- a`/`+++ b` body lines (a removed
  `-- a` above the added `++ b` that replaces it) were counted as a second section, rejecting a patch that
  targets nothing but the named file. The two counts are tracked apart now.
- **`8ccbcbd3`** — the agents and commands editors moved their dirty-check baseline to the trimmed values but
  left the untrimmed text in the form, and `isDirty` compares the raw state against that baseline while the
  list reload no longer re-populates for the same key: a prompt ending in a newline stayed "dirty" after a
  successful save. The commands editor's `template` had the same split in the other direction (baseline raw,
  save trimmed). The same commit moves the agents editor's permission-rule reset below the key guard, where
  the background reload the guard ignores had been wiping the rule being typed.
- **`a5c23c8d`** — `3ecdcb7b` folded the searched text one code point at a time, which is not the fold the
  query goes through: lowercasing `Σ` is context-sensitive, so a word-final capital sigma folds to `ς` in
  `normalizeSearchQuery` and to `σ` here — text reading exactly `ΟΔΟΣ` stopped matching a search for `ΟΔΟΣ`,
  which the older context-aware window had matched. The fold is applied to the whole string now, with the
  per-code-point walk kept only for the index map, and the match reports the span's own length: `İ` lowercases
  to two code units, so `"İstanbul city"` had been highlighted as `"İstanbul "`.
- **`abd50e84`** — `861bdf45` let the arrow keys reach the context rows while a file search ran, but left
  `selectedIndex` where the hidden file list had it: with one context row on screen and file row 1 selected,
  nothing carried the selection while Enter wrapped to `1 % 1 = 0` and attached the terminal output. The
  loading state is now one of the triggers that resets the selection. Reproducing this needed care — an
  unrelated identity change in the reset effect's own dependency list (`visibleAgents`, re-filtered on every
  query change) resets the index by accident in the harness unless the re-filter is allowed to land first, and
  that accident is what hid the defect from the previous round's review.

### Fixed from the panels review

- **`94432c5c`** — `BranchSelector` resolved a default source branch in an effect that bails out when the
  current value is already a branch, reading that value from the render that started the resolution. A
  `getRootBranch` that landed after the user picked replaced the pick with the repository's root branch,
  silently, because the selector's value comes from its parent. Reported as SUSPECTED (the reviewer could not
  run a harness); the deferred-promise test that makes it fail on the pre-fix source is in the commit.
- **`05756b4c`** — `DirectoryExplorerDialog` rendered the quick-add `<button>` inside the row `<button>` for a
  directory that is not added yet. Invalid nesting: assistive technology flattens the inner control into the
  row. The quick-add is a sibling now. Also SUSPECTED by the reviewer, and the one fix in this series whose
  *visual* result is not verified — the class-level change keeps the row's original spacing by holding the
  button in an absolutely positioned box over the row's padding, and there is no way to see the result from
  here. The source assertion pins the sibling structure, not the pixels.

### Fixed from the chat review

The Grok CLI run over `ui/src/components/chat/**` — the reviewer's second attempt, after the first ended without a
report.

- **`bb79fdac`** — a store can order an assistant reply before the prompt it answers (the legacy id wrap the full
  turn build handles), and the incremental update could not map such a reply. Appending that prompt was still taken
  as a plain append, which put the new turn's slice start at the prompt itself while the full build walked the slice
  back over the reply: the window dropped it, and `scrollToMessage` could not find it either.
- **`132e10df`** — both reads of a subagent session are bounded (500 on the first, 160 while the task runs, 80 while
  it is idle) and each wrote its page straight into the sync child store, dropping every message before it. The task
  record's step list and the child session's own view read that array. The page is merged now, with the same
  predicate the session store uses for a refetch, so a page copy that changed still replaces the stale one — and the
  rollback path still replaces outright, which is what keeps a truncated session truncated.
- **`816df1ef`** — three click handlers (the pending-changes bar, the turn's changed-files dropdown, and a tool
  row's own file path) resolved a path with only a leading `/` as their absolute test. `extractGitChangedFiles`
  builds absolute paths and a tool can name a `C:/…` path directly, so each prefixed the path with the directory it
  already starts with: the editor was asked for `C:/repo/C:/repo/src/app.ts`. `StaticToolRow` carried the correct
  test next to one of them, which is what made the others visible. The changed-file consumers now share
  `isAbsoluteChangedFilePath` from the module that builds those paths, and the tool rows share `toAbsoluteToolPath`,
  which is `StaticToolRow`'s own `resolveAbsolutePath` moved into the module that owns tool paths.
- **`723f0822`** — `132e10df`'s helper imported `areMessagesEqual` from `event-reducer`, which the *store* boundary
  check keeps private to `src/sync/` (R2). The focused runs in this round covered the desktop boundary check only;
  `pnpm run check:boundaries` runs the store one after it, and it is the gate that caught this. The helper sits in
  `optimistic` beside `mergeMessages` now, which the chat tree may import.

### Fixed from the second audit

- **`73e4abd2`** — both skill installers keep the replaced copy in a temp backup and hand it to `finally`, which
  removes it once the replacement landed or was restored and keeps it otherwise (the backup is the user's only
  complete copy when restoring failed too). That condition also covered the case where the *backup copy* is what
  failed, and there the installed copy is untouched: a partial `replaced-*` directory was left in the temp
  directory on every such failure with nothing pointing at it.
- **`58112089`** — the agents editor compares every permission rule against a second baseline to badge rules as
  added or modified and to serve `revertRule`. The populate effect set that baseline, and a save no longer reaches
  it: rules a save had just written stayed badged, and reverting one restored the pre-save action.
- **`06f3ee15`** — `PlanView`'s disk record means "what the disk holds", and a write that lands while a newer one is
  queued deliberately does not move it. When that newer write then failed, nothing moved it either: the file held
  the skipped write's content while the record stayed on older text, so reverting to that text looked like "nothing
  to save" — the same dropped revert the previous round fixed on the success path.

### Fixed from the shell review

- **`4f3a5ca4`** — `/undo` and `/redo` were the only two slash branches without a `try/catch`: a refused
  revert left an unhandled rejection and a cleared composer with nothing shown, while every neighbouring
  branch reported through `toast.error` (two keys added to the fourteen catalogs). The same commit clears the
  linked GitHub issue/PR when the session changes, which had been sending session A's issue context to
  session B, and it holds off the keyboard shortcuts while an IME composition is open.
- **`f365a32d`** — a slash command returned before the paths that put consumed review drafts back, so the
  inline comments and the attachments the submit had already cleared vanished with no trace. The branch
  restores both.
- **`a514c9a4`** — the second auditor's two gaps in the round's fixes: the skills catalog did not release a
  claimed name when the first directory failed to install and was not restored, holding the name against a
  later installable copy; and `PlanView`'s `onSaved` wrote the loaded plan's state into whichever entry was
  current when it resolved, so a save that landed after a switch marked the wrong plan saved.

### Reported, verified, and not changed

- **The permission card's pattern builder cannot take effect** (CONFIRMED by the chat review, and by the pinned
  runtime's own contract). Confirming a suggested or custom pattern calls `handleResponse("always")`, whose body is
  `{ requestID, reply }` only: the runtime persists exactly `request.always` — the pattern list the request itself
  carries — and its `message` field is the reject *feedback* (`CorrectedError`), not a pattern. The SDK type agrees
  (`reply: "once" | "always" | "reject"; message?: string`), and no other route writes the project's permission
  table. So the user picks a narrower pattern, the runtime grants its own set (and on a request with no `always`
  patterns, grants nothing durable at all), and the card disappears. Fixing it means either a channel in the
  runtime's reply contract — this repository consumes that runtime as a pinned artifact and does not own it — or
  removing an affordance that is a product decision, so it is recorded here rather than changed.
- **An unmodified config-editor form never picks up an external change** (SUSPECTED, raised by both auditors). The
  key guard skips every re-population for the same key, so editing an agent's file in another window leaves the
  form on the old values and the next Save overwrites the new ones. This is the trade-off the MCP page already
  documents in place ("Saving updates the baseline directly"), so it is a design decision rather than a local
  defect, and widening the guard to a dirty check is the over-engineering the request rules out. The part of the
  lead that was a plain defect — resetting the pending rule before the guard — is fixed above.
- **`buildHunkPatch`'s split of a diff into single-hunk patches** — raised as a suspicion next to the server
  one and refuted by reading: it keys on `@@ ` at the start of a line, and a hunk *body* line always begins
  with ` `, `+`, `-` or `\`, so a body line cannot be mistaken for a header. No change.
- **The `401` flake on the server route suites** (recorded in the twenty-second round and seen again here):
  `server/lib/{ax-code,quota}/**` route tests answer `401` where `200` is expected while reviewers run, and
  pass in isolation. No app in that tree has a `401` path of its own — the number comes from the shared guard
  — and the mechanism is still unexplained. Every full run in this section was made with the machine quiet.

## Twenty-third round

The audit lens on everything landed since the last one — rounds 20 to 22, twenty-seven commits — run by the
Claude Code CLI and, in parallel, by the Grok CLI; plus the `ui/src/lib` files the previous round named as
unread, and the settings sections, hooks and contexts trees.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of the twenty-seven commits since the nineteenth round's audit |
| Grok CLI | the same diff, independently |
| deepseek-flash | the `ui/src/lib` files the twenty-second round listed as unread, plus `search/`, `supervision/`, `theme/` |
| Claude Code CLI | `ui/src/components/sections/**`, `ui/src/hooks/**`, `ui/src/contexts/**` |

Both audits found defects **in this series' own fixes**, nine in total — the highest-yield lens in the whole
report, and a plain argument for running it every round:

- **`f0bd824c`** — `acdad603` searched the rest of the token for an `@`, so an `@` in a path or query read as
  userinfo: `http://localhost:5173/@vite/client`, the shape every Vite dev server serves, stopped matching. The
  search ends at the authority now.
- **`6a0f2251`** — `656266ce` made `refetchSessionMessages` report a failed read, which `unrevertSession`'s retry
  loop did not expect: the first transient failure ended the retries and reported a restore that had succeeded
  server-side as failed.
- **`cd03dc1e`** — `7c6ae05c` removed the in-run title registration, but the runtime's list is also the resume
  record and one entry could answer for two same-named tasks: after a partial run, the second was read as
  already migrated and deleted from the project file. An entry is consumed when it answers for a task now.
- **`bbb1717b`** — `f61edf6c` leaned on the `diff --git` count for "one file only", and a patch can start a
  second section without that line: `--- a/other.txt` / `+++ b/other.txt` after the first hunk passed the guard
  and `git apply` would have staged it. The header search walks the patch, consuming each hunk body by the
  counts its own header declares.
- **`861bdf45`** — `6be58872` refused *every* key while a file search ran, but the spinner only covers four
  arrays: the context rows (terminal, diff, commit picker) stay visible and stopped answering.
- **`ff7fcf90`** — the double-Escape abort priming was a bare timestamp, so pressing the first Escape in one
  session and switching within the window aborted whichever session was on screen, with no banner.
- **`3ecdcb7b`** — `063873d1` replaced the lowercased index with a fixed-width window over the original text,
  which cannot match when lowercasing *lengthens*: searching for `İstanbul` found nothing, where the older
  `toLowerCase().indexOf` had found it. The folded text is built code point by code point, with a map back.
- **`d90aba52`** / **`50cb0b5b`** — `cfbfcda0` claimed a skill name when a directory was first seen, so an
  uninstallable `review` held the name and a second, installable one was skipped as a duplicate; `f194a96a`
  swallowed a failed restore and then deleted the backup it had just failed to restore, destroying the last
  complete copy. The second commit fixes a scope bug in the first: `restoredIntoPlace` was declared inside the
  `try` and read in the `finally`, which eslint caught (`no-undef`) and I committed through — at runtime the
  assignment created an implicit global, so the behaviour looked right for a reason the code did not state.
- **`de32196e`** — `15c0e19f` advanced the "what the disk holds" record for every save that landed, including
  one whose newer edit was already queued: the record said B while C was on its way out, so reverting the editor
  to B matched it and C landed. The queue reports a *waiting* write (`hasQueued`) separately from the one in
  flight, and the record only advances when nothing is queued.

Found by the other two reviewers and fixed:

- **`05ec41c8`** — `McpPage` awaited the pending-context lookup before its `try`, so a rejection left the
  callback-URL handler with nothing shown and an unhandled rejection.
- **`94dbbc54`** — a failed *add* reported "Failed to delete plugin", and a failed *update* reported the reload
  hint ("ax-code reload failed — restart required"); both have their own keys now, added to every catalog.
- **`25fd8a84`** — `validateContextFileOpen` read with `optional: true`, the flag that tells the engine an absent
  file is not a failure, and then judged size: a missing plan or context file was reported as openable and the
  guard's own "File not found" verdict was unreachable. The reviewer confirmed the flag's semantics against the
  server handler before this became a finding.
- **`fe759f19`** — the agents and commands editors re-populated their form whenever the object they read through
  changed identity, so a sidebar delete or create, or a config-change event, dropped whatever was half-typed (the
  MCP page already guarded this).
- **`3d484ef8`** — a typing error in `25fd8a84`'s own test (`vi.fn(async () => …)` has an empty argument tuple, so
  `mock.calls[0][1]` does not compile); the vitest run passed and `pnpm run typecheck` did not.

Reported, verified against the source, and not fixed:

- **`LocalModelsPage`'s refresh guard** (SUSPECTED). `load()` returns while a request for the same directory is in
  flight, and the action handlers `await load()` to show their result, so a started download can take up to the
  2 s poll interval to appear. Forcing the load would run two requests for one directory concurrently — the
  clobbering the guard exists to prevent — and sequencing them properly is machinery this delay does not earn.
- **The `detectDevServer` substring match** — the reviewer raised it, then refuted it from the call site:
  `detectDevServerCommand` runs only under the auto-discover action, which discards the project's own actions, so
  no real action can be mis-selected as the dev server.

## Twenty-second round

The sibling session's UI feature code (its worktrees are gone, so reviewing and fixing that code no longer risks
colliding with it), a re-read of `ui/src/lib` after twenty rounds of changes, the electron main process, and the
sync/stores trees.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | the sibling's feature components: the diff-hunk review list, the GitHub board and its model, the issue/PR dialogs, the scheduled-task run history, the mention autocomplete and the cross-session search dialog |
| deepseek-flash | `ui/src/lib/**` (excluding what recent rounds covered) |
| Grok CLI | `desktop/packages/electron/src/**` |
| Claude Code CLI | `ui/src/sync/**`, `ui/src/stores/**` |

Fixed:

- **`51d0dc3c`** — four defects in `GitHubBoardView`, the board another session added. The list effect bumps the
  request id that `loadMore`'s cleanup compares against, so a filter change, tab switch or refresh during a page
  load left `loadingMore` true: "Load more" stayed disabled with "Loading…" until the view remounted.
  `changeState` replaced the selection object for the same item — the detail pane reads the state from the bundle,
  so that only re-ran the detail effect, which cleared the comment draft, dropped both bundles and refetched, and
  its captured-`issueBundle` write could put one item's bundle over another's. `submitComment` appended the
  comment to whichever bundle was current and cleared the draft there, so posting for one issue while another was
  selected showed the comment on the wrong item. The detail effect's early return left in-flight work valid, so a
  tab switch issued a request for the previous row under the new kind and its response was applied to state with
  no selection.
- **`23d5ddba`** — the working directory was moved back to the active project's root whenever the projects list
  changed at all (`projectListKey` is the whole JSON, so an icon, a label or a `lastOpenedAt` bump counted,
  including a sync from another window) and `removeProject` did it even when the removed project was a different
  one. `addProjects` already conditioned its equivalent switch on the active id changing; these two did not.
- **`063873d1`** — three unguarded reads in `ui/src/lib`: `desktopHostsGet` wrote
  `window.__AX_CODE_DESKTOP_LOCAL_ORIGIN__` without the `try`/`catch` that `persistence.ts` applies to the
  equivalent contextBridge property, so a read-only property rejected the whole read and lost the hosts config the
  invoke had just returned; `findSessionHits` took the match index from `message.text.toLowerCase()` and sliced
  `message.text` with it, so a code point that lowercases to a longer string (`İ`) shifted every offset and the
  snippet highlighted `"edle"` instead of `"needle"`; and `shouldAnimateMessage` dereferenced `message.time.created`
  where every sibling reader normalizes that field, throwing inside the render path for a replayed record.
- **`7dffcac8`** — leaving a session (closing it, archiving or deleting it, or opening a new-session draft) never
  cleared the module refs `isViewedInCurrentSession` answers from, because the only writer passed a session id. A
  `permission.asked`, `question.asked`, `session.idle` or `session.error` for the session the user had left was
  still treated as viewed: its toast was skipped and the completion notification was stored as seen.
- **`60115dae`** — `createWorkingSet` drops the oldest set at the cap but only `deleteWorkingSet` cleared
  `activeWorkingSetId`, so evicting the active set left the id pointing at nothing: the panel filtered by it,
  showed nothing, and no tab was selected.
- **`656266ce`** — `refetchSessionMessages` ignored `result.error` and returned on an empty list, so
  `revertToMessage` applied its marker onto stale messages and `unrevertSession` gave up silently and let the
  caller show the "restored" toast for content that never arrived. The file already had
  `assertSessionCallSucceeded` for exactly this.
- **`041b8fc0`** — two defects in the electron main process. `runProbe` captured the handle it probed but its
  post-await guard only asked whether *an* attempt was healthy, and a restart installs a replacement that
  answers the same: the stale result was counted against the new runtime (two loops then accumulating into one
  `probeFailures`, so half the failures it needs judged a healthy runtime wedged and terminated a process
  running agent work) and its trailing arm created a second probe timer beside the one the new attempt had
  started. Separately, `collectNativeSearchResults` keeps the caller's paths and compares them as strings
  against the read path's policy, so a root like `/tmp/alias` pointing at `~/.config` walked into `ax-code` and
  listed the runtime's auth files — names of exactly the paths `desktop_read_file` refuses. Each directory is
  resolved before it is entered now.
- **`6be58872`** — the mention autocomplete renders a spinner while a file search runs but keeps the previous
  query's hits in state, and `handleKeyDown` counted rows from those arrays: Enter or Tab attached a mention
  that was nowhere on screen. The handler refuses input while loading, and the imperative handle depends on
  that flag — without the dependency its closure kept the previous value, which is how the behaviour survived
  the first version of the fix.

Left as a lead for a second pass: the deepseek-flash reviewer read about sixty files of `ui/src/lib` and named
the ones it did not reach (`debug.ts`, `desktopBridge.ts`, `search/fuzzySearch.ts`,
`supervision/multiRunGroups.ts`, several `providers/` and `theme/` modules), reporting no defect in the
network, path and IPC-facing helpers it did read.

## Twenty-first round

The areas no round had named: the desktop-mode server wiring, the shared package and the web package's own
source, the release machinery (workflows, packaging scripts, winget, release identity) and the `ui` views tree.

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | `web/server/lib/desktop/**`, `web/server/*.js`, `electron/src/api-prefix-router.js` |
| deepseek-flash | `desktop/shared/**`, `packages/web/src/**` |
| Grok CLI | `desktop/scripts/**`, `script/**`, `.github/workflows/**`, `tools/winget/**`, `config/**` |
| Claude Code CLI | `ui/src/components/views/**` |

The Grok CLI's release-machinery scope returned after the rest, with three defects (`0ad5509e`):
`sign-shadow-artifacts.sh` built its temporary directory under `$RUNNER_TEMP` as it stands, which on a Windows
runner is a native path the shell's `mktemp` cannot treat as a directory, so the signing step exited before it
wrote anything; `.github/workflows/desktop-shadow.yml` decoded the Apple certificate with `base64 --decode`,
which macOS's `/usr/bin/base64` rejects, ending the step before the certificate was imported — the signing
script already handled that pair; and `publish-github-release.sh` pushed the tag and then polled for a
`desktop-release.yml` run that cannot exist, because that workflow is not in the repository, leaving the tag on
the remote for a second attempt to reject. It now checks the workflow exists before pushing.

Fixed:

- **`537a8c6b`** — the packaged renderer's socket URLs were never rebound to the loopback server.
  `rewriteAppProtocolNetworkUrl` accepted an absolute URL only under the `app:` protocol, but the UI's socket
  URLs never carry it: `normalizeWebSocketPath` builds `ws://${window.location.host}<path>`, which on the
  packaged page is `ws://ax-code/api/terminal/ws`. The packaged renderer's CSP allows WebSockets to
  `127.0.0.1`/`localhost`/`[::1]` only, so the terminal transport's socket pointed at a host that cannot
  resolve. The app host is matched under the socket schemes now.
- **`cc2d3384`** — the same function's relative branch tested the loopback prefix against the raw,
  unnormalized string while the absolute branch used the parser-normalized path, so `/api/../assets/index.js`
  was rebound to the API origin (where it resolves to an asset the app:// handler owns, and 404s). Both
  branches agree on the normalized path.
- **`8a4b40ab`** — `proxy-headers.js` dropped `host`, `origin`, `accept-encoding` and the hop-by-hop headers
  but not `cookie`, so every proxied request carried the renderer's `oc_ui_session…` cookie into the runtime
  process. The runtime's own credential travels under `authorization` (which the filter replaces), so the
  cookie only moved a credential into a second process.
- **`39847cc7`** — two ways `PlanView`'s autosave lost an edit: `loadedContentRef` ("what the disk holds") was
  written only by the load paths, so editing away from the loaded text and back to it made
  `planContentNeedsSave` answer false and the revert was never written; and the effect's early return left the
  previous run's queued entry in `pendingSaveRef` while its cleanup cleared the debounce timer, so typing then
  undoing inside the 350 ms delay and leaving the view wrote the abandoned text.

Reported, verified against the source, and not fixed:

- **Repeated response headers collapse** (`proxy-headers.js:64-68`, SUSPECTED). `applyForwardProxyResponseHeaders`
  calls `setHeader` once per entry, so two `Set-Cookie` headers from the runtime leave only the last one on the
  client. The reviewer found no evidence that the runtime emits more than one, so nothing is reachable today;
  recorded rather than guarded.
- **The git index mutation queue drops a merged mutation's rollback** (`ui/src/components/views/git/gitIndexMutationQueue.ts:78-86`,
  SUSPECTED). Two stage clicks that queue behind a running mutation merge into one entry, and only the first
  entry's rollback survives; that rollback restores a whole-status snapshot, so it can also revert a status
  refresh that landed between the clicks. It relies on the delayed reconcile fetch to correct the display, and
  the reviewer could not show that fetch failing.
- **The rewrite installer no-ops silently when the desktop server origin is missing**
  (`app-protocol-network.ts:54-57`, SUSPECTED). On the `app:` page that leaves every socket unrouted with no
  diagnostic. The trigger is a preload projection that is absent or late at the moment `main.tsx` runs, which
  the reviewer did not establish; the alternative is a startup retry, which is a design change rather than a
  bug fix.

## Twentieth round

| Reviewer | Scope |
| --- | --- |
| Claude Code CLI | an audit of the nineteenth round's own two commits |
| deepseek-flash | `server/lib/quota/**`, `server/lib/security/**` |
| Grok CLI | `server/lib/skills-catalog/**`, `magic-prompts/**`, `session-folders/**` |
| Claude Code CLI | `server/lib/ui-auth/**`, `server/lib/event-stream/**` |
| Claude Code CLI | `server/lib/scheduled-task-convergence/**` (935 lines, mentioned twice in this report before this round) |
| glm-5.3 | the server side of a sibling session's six feature commits, read-only and frozen at `8879b747` |

Fixed, in the order they were verified:

- **`7ab7f114`** and **`acdad603`** — the URL boundary, twice. The audit found that `7ab7f114` had put the
  IDN dot equivalents in the rejected set unconditionally, which cost the preview for the most ordinary
  Chinese sentence shape: `已啟動 http://localhost:3000。` matched nothing. A dot cannot continue a port, so
  the two guards now differ there (after a port a dot ends the address; after a bare host the dots continue
  it only when a name character follows, which keeps `http://localhost。evil.example` unmatched). The same
  audit showed the userinfo guard only covered an `@` directly after the host: `http://localhost!x@evil.example/`
  — whose host, by the `@`-splits-the-authority rule, is `evil.example` — still offered `http://localhost/`.
  The guard now looks for an `@` anywhere in the rest of the token, and rejects a combining mark or a soft
  hyphen (IDNA drops the latter). `02fc780a` pins the forms Grok named.
- **`559d8336`**, **`b54bf3fb`** — the startup pipeline's failure path. `724d9f4e` had claimed to stop the
  managed runtime but only cancelled an in-flight spawn: the process itself is closed by the shutdown
  runtime's phase-3 teardown, which the pipeline never ran, so a bind failure after the bootstrap published
  its handle still left the child alive with its port bound. That teardown is now one named function both
  callers share. The audit also showed the retry loop still spawned when the shutdown landed between the
  caller's bootstrap and the first attempt (the attempt creates its own abort controller), and that closing
  the handle without republishing the HMR state put the dead handle back on an in-process re-entry.
- **`7c6ae05c`** — four ways the one-time desktop→runtime scheduled-task migration could delete a task from
  the project JSON without creating it in the runtime and without recording a skip: the per-title idempotency
  map was updated with the task created moments earlier in the same run, so a second desktop task with the
  same name read as already migrated; `replaceScheduledTasks` handed its updater the *normalized* task list,
  which drops what its normalization rejects (a task the transform accepts with its
  `execution.providerID`/`modelID` warning) and gives an id-less task a fresh id per read, so a retry-pending
  task was erased and a settled one never matched; and the attempts-exhausted cleanup passed a literal `[]`,
  deleting a task saved while the pass was talking to the runtime.
- **`27a877aa`** — `quota/utils/auth.js` defaulted the config and data directories to `~/.config` and
  `~/.local/share` while ax-code resolves both through xdg-basedir, which the sibling readers already mirror.
  With a customised `XDG_DATA_HOME` the Antigravity accounts file was read from a directory the runtime never
  writes, so the source silently disappeared from the Google card.
- **`a26f3769`** — `upstream-reader.js` cleared the reconnect backoff as soon as the response headers
  arrived, so a runtime that answers `200` and closes the body immediately — a crash loop, or a proxy dropping
  idle connections — was retried at the base delay for as long as it stayed that way: the storm the backoff
  was added to prevent. A connection now clears the counter only once it has lasted the backoff cap.
- **`982fbb77`** — `respondUnauthorized` chose its body with `req.path.startsWith("/api")`, but a mounted
  middleware sees `req.path` relative to the mount, so under `app.use("/api", …)` it is `/sessions`: the API
  branch never ran and an API client sending the default `Accept: */*` got `text/plain` instead of
  `{ error, locked }`.
- **`f194a96a`**, **`cfbfcda0`**, **`fccd3ab2`** — four defects in `skills-catalog`: the ClawdHub installer
  deleted the installed copy before a move that could still fail (and a rename cannot land on a directory that
  exists, which is why the delete is there at all), leaving the user with neither the old skill nor the new
  one; `rateLimitedFetch` retried a 429/5xx without releasing that response's body, leaving up to nine bodies
  holding their sockets per call; the git installer wrote two selected directories with the same basename into
  one target and reported both as installed; the git overwrite deleted the installed copy before a copy that
  refuses symlinks; and a failed `git ls-tree` was reported as a successful empty scan, which the caller then
  cached for thirty minutes as "this repository has no skills".
- **`43b9d489`** — the round-17 `lsof` test could only pass off Windows; it pins the platform now, which the
  Grok CLI's audit of that commit found.
- **`5c0ca164`** — `startAxCode` publishes the handle only after the launch resolves, and the teardown closes
  what it can see, so a shutdown that landed in that window closed nothing and the publish that followed left
  the child running with its port bound. A launch resolving into a shutdown is closed and reported as
  cancelled now.
- **`f36eefa3`** — the Wafer quota provider tested `error.name === "AbortError"` for a signal built by
  `AbortSignal.timeout()`, which aborts with `"TimeoutError"`: the friendly "Request timed out" message was
  dead code and the raw abort text reached the card. The repository handles that pairing in two other places;
  the quota module had no check for it anywhere.

Reported, verified against the source, and not fixed:

- **The Google quota source cannot refresh with an empty OAuth client.** `google/auth.js` reads its client id and
  secret from `ANTIGRAVITY_GOOGLE_CLIENT_ID`/`_SECRET` and `GEMINI_GOOGLE_CLIENT_ID`/`_SECRET`, defaulting to
  `""`, and nothing in this repository sets them; the Antigravity source always needs a refresh, so its branch
  of the Google card is dead. The comparison against `.internal/reference/openchamber` shows why: upstream has
  the same four values as **literals** in `google/auth.js` and in its vscode package (a public client secret
  published in that ecosystem), and this port removed them. That removal is the repository's own rule ("never
  store raw credentials"), so putting them back is a policy decision, not a bug fix — and the remaining
  options (a configuration path, or a clear "not configured in this build" message instead of the provider's
  `invalid_client` error) are a product change. Recorded here so the state is not mistaken for a working
  provider.

Reported against a sibling session's feature diff, then fixed once that session had exited:

- The glm-5.3 reviewer read the server side of a sibling session's feature commits (hunk staging, the GitHub
  issues/PRs board, terminal replay) and returned two findings. Both are now fixed — the session's worktrees
  were gone by the time they were verified, so nothing was left to collide with:
  - **`f61edf6c`** — the hunk-patch validation in `git/service.js` counted every `--- `/`+++ ` pair in the
    patch, including pairs inside a hunk body, so a removed `-- old` line directly above the added `++ new`
    line that replaces it read as a second file header and a valid hunk was rejected with "Patch does not
    target file.txt". The pair scan stops at the first `@@ ` hunk header now, and "one file section" is
    carried by the patch's `diff --git` lines, which a hunk body cannot start.
  - **`1bd9f252`** — the board's label filter sent a comma-joined value as one quoted label
    (`label:"bug,ui"`) although the route takes that path precisely because a comma separates labels, so
    filtering by two labels returned nothing unless the repository had a label with that literal name. Each
    label gets its own qualifier now. The reviewer's caveat about which API path a comma-free label should
    take is untouched.

## Nineteenth round

The audit lens that has paid off most often in this series, over everything since `11a54e33` — the six
commits of the seventeenth and eighteenth rounds, a 573-line diff — with the Claude Code CLI reading the
frozen diff and then the current source of every file it touches.

Two findings, both real, both defects in the *fixes* rather than in the code they fixed:

- **`7ab7f114`** — the loopback-URL boundary from `70c6327e` was too loose. It rejected an ASCII name
  character, an optional dot in front of one, or an unrecognized `:port`; every other way a longer authority
  can continue passed it, and the pattern matched the prefix again — the very regression the boundary exists
  for. `http://localhost@evil.example/x` (userinfo, so the text names `evil.example`) offered
  `http://localhost/`, as did `http://localhost:3000@evil.example/x`, `http://localhost%2eevil.example`,
  `http://localhost\evil`, `http://localhosté.example`, `http://localhost。evil.example` (U+3002, a WHATWG
  dot equivalent), `http://localhost:` and `http://localhost:abc`. The lookahead now rejects what an
  authority can be made of — a Unicode letter or digit, `_`, `-`, a `.` followed by one of those, an IDN dot
  equivalent, or the glue `:`, `@`, `%`, `+`, `~`, `\` — which keeps the sentence punctuation and CJK text
  `70c6327e` fixed and the two cases the earlier whitelist guarded.
- **`559d8336`** — `724d9f4e` did not do what its message claimed. It gave the startup pipeline's
  bind-failure path the `stopAxCodeLifecycle` hook, but that hook only flags the shutdown and aborts an
  in-flight launch; the process itself is closed by the shutdown runtime's phase-3 teardown, which the
  pipeline never ran. A bind failure *after* the bootstrap had finished and published its handle still left
  the child running with its port bound. Phase 3's teardown is now one named function both callers share,
  and the lifecycle's retry loop checks `isShuttingDown` before its first attempt as well: a shutdown landing
  between the caller's bootstrap and that attempt found no abort controller to cancel (the attempt creates
  its own) and spawned a runtime nothing would close; it now reports the skipped start rather than throwing
  a null error.

The audit's own evidence was stronger than the regression tests it criticised: the pipeline's new test used
a `vi.fn()` for the stop hook, so it could only show the callback ran, which is exactly why the second
finding survived the seventeenth round. The replacement wires the real shutdown runtime into the pipeline
and asserts the process is closed and its port freed, and the lifecycle test asserts no spawn at all.

Both findings are the same shape as the two the sixteenth round's falsification pass found: a fix whose
*reason* was asserted rather than demonstrated. That lens stays in the rotation.

The Grok CLI ran the same audit in parallel and returned later with the same two defects from the authority
side, plus one of its own: the round-17 test "kills only a listener on the port" asserted that `lsof` had been
called, but `killProcessOnPort` returns before spawning anything on win32, so the test could only pass off
Windows. It now pins the platform and asserts the whole argv (`43b9d489`), and the two URL forms Grok named
are in `url.test.ts` (`02fc780a`). Its reading of the shutdown path agreed with the Claude audit on the
published handle and disagreed on one detail — it also claimed the failure path latches the
`gracefulShutdown` gate; `stopAxCodeLifecycle` only sets the lifecycle's own flag
(`axCodeLifecycleRuntime.shutdown()`), not the `index.js` one that gate reads, so nothing was latched.

## Eighteenth round

The falsification lens again, narrowed this time to the third-to-ninth round block of this report — the
"Reviewed and deliberately not changed", "Reported as confirmed, verified and rejected" and "Verified and
left alone" entries of those rounds — with the Claude Code CLI and deepseek-flash. Both were asked to check
the *stated reason* of each entry against the current source, not to re-find the bug.

- deepseek-flash: **no falsified recordings**, two entries stating more than their evidence carries.
- Claude Code CLI: three refutations, two of which are real defects in current source.

Fixed from it:

- **`70c6327e`** — `ui/src/lib/url.ts`. The fifth round had given the loopback-URL pattern a positive
  boundary listing which characters may follow the host, so the trailing `.`, `,` or `)` of ordinary prose,
  or CJK punctuation, made the whole match fail: `Server ready at http://localhost:3000.` offered no preview
  at all, and the `trimUrlTrailingPunctuation` set written to strip exactly those characters never saw a
  match. The boundary is now a negative lookahead for what would have continued the name, which keeps both
  fifth-round regressions covered (`http://localhost.evil.example/x` and `http://localhost:123456/` still
  match nothing).
- **`2879fcf8`** — `ui/src/lib/openchamberConfig.ts`. `parseProjectPlanMarkdown` removed the heading line
  from the body in full while the title took only its first 160 characters, so the overflow existed nowhere:
  importing a plan file, or saving an assistant plan, with an H1 longer than the limit lost its tail for good
  once `formatProjectPlanMarkdown` wrote the truncated title back. The heading now stays in the body in that
  case. This also refutes the Limit audit's sentence that plan titles "have a visible `length/max` counter" —
  they have no editor at all.

Reported, verified against the source and rejected:

- **Soft-removal undo after the timer fired** (Claude Code CLI, CONFIRMED). The trigger says "sonner pauses
  the toast's countdown on hover, but the module's own 7 s timer keeps running". Sonner 2.0.8 does not pause
  on hover: its only mouse-enter handler is `onMouseEnter: () => setExpanded(true)`, and the sole pause
  mechanism is an explicit `duration === Infinity` (`dist/index.mjs`). The toast's duration and the commit
  timer are the same 7 000 ms, so the residual window is the toast's exit animation, not hover.
- **The provider circuit breaker counting errors it ignores** (Claude Code CLI, CONFIRMED). The counter is
  named and documented as `consecutiveErrors`, and `recordProviderError` has always incremented it for every
  error; the breaker opens only when the *current* status is retryable and the count has reached the
  threshold, which is the "stop hammering a provider that has failed four times in a row" behaviour the
  threshold is for. The third-round entry's "nothing user-visible follows" is too strong, but the code is
  the designed behaviour and the reviewer's proposed change would alter it.

Entries whose reason was corrected rather than the code:

- The third round's `materializeSessionSnapshots` entry names `shouldPreserveExistingPart` as the guard
  bounding it. That guard lives in `sync/event-reducer.ts` and runs on the live event path only; the
  materialize path's tool-part handling is `finalizeUnsettledToolParts`, which rewrites a snapshot `running`
  to `aborted` for an already-completed message. Both reviewers agree the divergence is not bounded by the
  named guard, and neither could produce the interleaving, so the entry stands as an unproduced race with a
  corrected reason.
- The third round's `disconnectProviderAuth` entry calls the `new URL(baseUrl, "http://localhost")` second
  argument "dead code". It is load-bearing in the mode the same function supports: with `window` absent,
  `resolveBaseOrigin()` returns `""` and `buildDirectoryUrl` returns a relative path, so the base argument is
  what lets `new URL` parse at all.

Behind this round's table: the same Claude Code CLI reviewer also flagged that `ui/src/lib/gitApiHttp.ts`
interpolates the identity id into `/api/git/identities/${id}` without encoding, while both the store
(`profile-` plus `Math.random().toString(36)`) and the server accept arbitrary ids. That is an observation
without an anchor in the recordings; the app-generated prefix is base36, so nothing in the UI produces an id
that needs encoding today.

## Seventeenth round

A seventeenth round, aimed at the largest modules of `server/lib/ax-code/` — the area two directory-level
passes had already covered, read file by file this time: `lifecycle.js` (1 531 lines, the biggest file in the
package), `settings-runtime.js` (914) and `proxy.js` (810).

| Reviewer | Scopes |
| --- | --- |
| Claude Code CLI | `lifecycle.js` |
| deepseek-flash | `settings-runtime.js` and its helpers |
| MiniMax-M3 | `proxy.js` and the network runtime |

Fixed:

- **`98effbe3`** — `lifecycle.js`, two findings. The managed-start retry loop checked `state.isShuttingDown`
  before the retry delay and not after it, so a shutdown that began *inside* the delay spawned a child
  nothing would close: it outlived the app with its port bound. The guard now runs after the delay too, as
  `restartAxCode` already guarded its own gap. `killProcessOnPort` ran `lsof -ti :PORT`, which matches every
  process whose local *or remote* port is that number — a client connected to the runtime, or an unrelated
  app whose source port happens to be it — and killed it; it now filters on `-sTCP:LISTEN`, which the sibling
  helper in `core-routes.js` already did.
- **`724d9f4e`** — `lifecycle.js` / `startup-pipeline-runtime.js`. The startup pipeline bootstrapped the
  managed runtime first and validated the host and port afterwards; when that validation failed it logged,
  called `process.exit()` and left the runtime it had just started running. It now stops the runtime first.
- **`45d7e083`** — `lifecycle.js`, the win32 branch. `createManagedAxCodeServerProcess` is handed the startup
  abort signal and the macOS/Linux branch passes it to the SDK launcher, which rejects a pending launch; the
  win32 branch dropped it on the way to the legacy launcher, which never listened for `abort` either. A
  shutdown that began while that spawn was pending left the child bound to its port for the whole 30 s start
  timeout. The legacy launcher now takes the signal, rejects the pending launch and closes the child it
  spawned.
- **`6935eb59`** — `settings-runtime.js`. `moveDirectoryContents` deleted the destination entry before the
  rename meant to replace it, which added a data-loss window to a migration that had just written a merged
  config pointing at the new directory: a rename that then failed left the destination's previous content
  gone and the source file in the old id directory. The rename runs first now — it replaces an existing
  destination on POSIX and, through libuv's `MOVEFILE_REPLACE_EXISTING`, on Windows too — and the EXDEV
  copy-then-delete fallback is unchanged. The other half of that finding stands as recorded risk:
  `migrateProjectScopedStorage` writes the merged config before it moves the storage, so a failure that leaves
  files under the old id leaves the config pointing at the new one. The opposite order only moves which half is
  stranded, and a compensating rollback is more machinery than a once-per-project-id migration earns, so it is
  recorded rather than fixed.

Reported, verified against the source and rejected:

- **Orphan recovery "could not be auto-matched"** (deepseek-flash, CONFIRMED). The claim is that the warning
  branch is dead weight because nothing ever removes or quarantines the files it names. Removing an orphan
  that matched no project would destroy the only copy of a user's notes or todos, so leaving it in place and
  saying so is the safe half of the contract; the one-shot flag it also criticises is what the comment above
  it claims ("cache the outcome for this process lifetime"), and it is set before the await so concurrent
  settings reads cannot race into a second scan.
- **The dangling `activeProjectId` fallback** (deepseek-flash, CONFIRMED). The reviewer read
  `projectIdMap.get(currentActiveId) || currentActiveId || nextProjects[0]?.id` as able to write an active id
  that names no project. It cannot be reached: `migrateSettingsFromLegacyLastDirectory` runs first in the same
  read, repoints an active id that names no project, and the list it validates against is the same
  `sanitizeProjects` output the later migration maps (both calls are pure functions of the same array), while
  `persistSettings` repairs the same state right after `validateProjectEntries` drops entries. A regression
  test now documents that invariant rather than a change to the fallback.
- **`migrateProjectIconFiles` deleting the old icon** (deepseek-flash, SUSPECTED). The icon route resolves a
  project's icon from the project's *current* id (`project-icon-routes.js`), so once the id has been migrated
  the file under the old id is unreachable and removing it is the cleanup, not the loss.
- **`persistSettings` logging secrets under non-enumerated keys** (deepseek-flash, SUSPECTED). The eight keys
  the write path drops are the credential-bearing ones, and the log line hides exactly those; no key the
  update path accepts carries a credential (the reviewer named `notificationTemplates`, `shortcutOverrides`
  and `usageModelGroups`, which are user-visible display strings). A value-based redactor would be a
  different design, not a guard for a proven leak.

The MiniMax-M3 reviewer on `proxy.js` died mid-report in a repeated-output loop and returned no finding, so
that file's round produced nothing to verify.

## Sixteenth round

A different lens: two reviewers (the Claude Code CLI and deepseek-flash) were asked to *falsify* this
report's own conclusions — to take the entries in "Reported as confirmed, verified and rejected",
"Reviewed and deliberately not changed" and the "Suspected … verified and not changed" subsections and check
whether the guard each one names still stops what it claims to stop.

Both returned **"no falsified recordings"**: no rejection or deferral was shown to be wrong. What they did
show is that four of the entries state more than their evidence carries, and one of those overstated entries
hid a real defect:

- **`615743d0`** — the `session-folders` entry said the client "guards every shape the reviewer named", which
  is true of the three shapes it named and false as a general claim: the guard is an object check, not the
  per-entry check the entry described, so `{"foldersMap":{"/p":"oops"}}` reached the store and
  `getFoldersForScope` handed a string to callers that map over it. One validating reader serves both the
  localStorage and the disk path now.
- Three entries were reworded to what was actually established: the `ErrorBoundary` timeout (the reset path
  is safe; the "every path that exists today" claim was never enumerated), the dev-shutdown route (its
  UI-session requirement is conditional on a controller being configured), and — already phrased that way —
  the heartbeat recording, whose interleaving could not be produced.

This is the second time the falsification lens paid: the fifteenth round's pass over the same list found a
rejection whose stated reason was simply wrong (the packaged renderer *does* forward the session cookie, so
the gate it deferred was safe to add), and a deferral that had already been fixed two rounds earlier.

## Fifteenth round

A fifteenth round: an auditor over every fix the fourteenth round made, a reviewer over
`ui/src/lib/preview` (the largest file in `ui/src/lib`, and the only one no round had read), and two over
`server/lib/ax-code` — one for the runtime/bootstrap/core-route modules, one for the plugin and
session-runtime modules. That second one took three attempts: the MiniMax run was killed by its own timeout
with no report, the first Claude run sent its findings to a reporting tool this session does not have and
left only a summary, and the re-run asked for plain stdout and produced one CONFIRMED and four SUSPECTED
leads, all five fixed.

### Fixed from the audit of the fourteenth round's fixes

- **`b6bff10f`** — five findings, all in this series' own work: the blocking-request stamp defaulted a
  session with no store entry to `0` while the stamp lives in module state and outlives the store, so such
  a session read as "changed during the request" and its pending question was dropped (the module now
  exposes a floor captured when the request goes out); `withRouteDefaults` filled the chat tab into
  `/?file=src/a.ts`, killing the documented diff deep link; refusing an unparseable magic-prompts file also
  blocked `resetAllOverrides`, the one operation whose purpose is to replace it; unkeyed permission asks got
  distinct pending keys but kept one shared notification tag, so the sink still replaced the earlier one;
  and bounding a long config file name left the legacy file behind, where every directory-enumerating reader
  takes it for a second project.

### Fixed from the preview review

- **`fe7a3bee`** — three findings: both `instanceof HTMLElement` checks are false for nodes built by another
  document (an iframe's, or snapDOM's clone document), which is every node they run on, so the nested-scroll
  bake never recognised snapDOM's wrapper (applying its transform a second time) and
  `document.scrollingElement` was never read; a failed proxied asset fetch left its registered target in the
  cache, so everything after a server restart was a blank placeholder until it expired; and a failure inside
  `inlineIframeCaptureAssets` meant the caller never received the closure that undoes its work, leaving the
  live iframe with data-URL sources and frozen fixed elements.

### Fixed from the ax-code review

- **`a283fc56`** — the session-state and notification routes answered without a UI session (see the
  corrected recording in the fourteenth round below): `requireUiSession` is the gate the stream route in the
  same file already applied, mounted for `/api/sessions*` and `/api/session-activity` and attached to
  `/api/notifications/auto-accept`, which decides whether permission prompts are announced at all.
- **`5643d632`** — four findings: the `/api` session gate and the rate limiters were mounted after the body
  parsers, and the status and system routes before the limiters, so an unauthenticated request had its body
  buffered (50 MB) before the 401 (a malformed one answered the parser's 400) and
  `GET /api/system/free-port`, which binds a listener per call, was never throttled; the urlencoded parser
  had no path predicate while the JSON dispatcher sends the raw `/api/session/*` proxy path to `next()` on
  purpose, so a form-encoded request to it arrived with the stream consumed and the proxy forwarded an empty
  body; and `--ui-password` with no value became the empty string — this server's "no UI password" sentinel —
  turning authentication off and overwriting a password seeded from the environment.

### Suspected leads from this round, verified and not changed

### Fixed from the plugins and session-runtime review

- **`f3444e84`** — `updatePluginEntry` renamed an entry onto a spec another entry in the same scope already
  carried; the entry id is derived from scope and spec, so the duplicate could be neither edited nor deleted
  (`getPluginTarget` only reaches the first copy) and the runtime loaded the plugin twice.
  `createPluginEntry` already refused that with `ENTRY_EXISTS`, which the route maps to 409. And one entry
  `parsePluginRaw` rejects threw out of the `map`/`findIndex`/`some` callback that reached it, so `GET
  /api/config/plugins` answered 500 and no entry at or after the broken one could be addressed — it is
  skipped and logged now, and stays in the file for a manual fix. (The same commit adds `use` to the route
  harness, which the session gate of `a283fc56` needed and the fake app did not have.)
- **`aacc972d`** — the five-second status dedupe compared the status *type* alone, so a retry reporting a new
  attempt, message and next time inside the window was dropped without a write or a broadcast, and the
  snapshot kept the first attempt's numbers. The comparison includes those fields.
- **`eb432ec1`** — `resetAllSessionActivityToIdle` (the bulk path `resume()` runs after an in-process
  restart) moved the activity phase to idle but broadcast nothing and left `sessionStates` and
  `sessionAttentionStates` at busy, so clients and `getSessionStateSnapshot` reported a run that no longer
  existed for up to the state's 24-hour window; and `isPathSpec` accepted any `~` prefix while
  `parsePathSpec` expands only `~` and `~/…`, so a spec like `~other/plugin.js` was resolved against the
  server's own cwd and the registry answered missing/ok for a path nobody named.

### Suspected leads from this round, verified and not changed

- **`POST /api/system/dev-shutdown` kills whatever listens on a caller-supplied loopback port**
  (`core-routes.js:316-345` with `killListenPort`): the caller (the app's own dev UI) sends the preview URLs,
  but nothing ties a named port to a preview server, so the runtime's own port could be named. The route
  requires the dev flag and a same-origin request, and a UI session *when one is configured* — the
  requirement is `if (uiAuthController)`, so a password-less server (where a session gate would mean nothing)
  relies on the other two. The correct fix — kill only the ports the preview proxy registered — needs that
  runtime's private target registry, which the status routes are not given; wiring it through is a design
  change rather than a bug fix. Recorded.

## Fourteenth round

A fourteenth round: fresh reviewers over `ui/src/lib/{i18n,search,router,settings,tray,webmcp,wiki,preview}`,
`server/lib/{sessions,lsp,plugins,update,notifications,magic-prompts,session-folders,desktop}` and
`ui/src/components/{ui,desktop,update,icon,icons,notifications,comments}`, plus an auditor over everything
the thirteenth round's audit did not cover (the fixes that followed it, that whole round, and the batch the
upstream comparison produced). The audit found five things in that work; all five are fixed.

### Fixed from the audit

- **`759e1674`** — `continueRebase` and `continueMerge` continued through simple-git's own
  `rebase()`/`commit()`, and simple-git's `rebase()` *resolves* when git refuses a step, answering the
  failure text as its value: the `catch` was dead code, so a rebase stopped on unresolved conflicts was
  reported as `{success: true, conflict: false}` and the panel never showed the conflict list. Both run the
  step through `runGitCommand` (a real exit status) now. The same commit does the ordering the audit
  flagged: the structural answer (unmerged entries) comes first, git's empty-step text is consulted only
  once the conflicts are resolved — its message quotes the commit it failed to apply, whose subject can
  read "handle no changes in the diff view" — and a failed `rebase --skip` is re-checked instead of being
  reported as a completed step.
- **`2405d281`** — the counter added in `784f8d17` lived on the reducer's draft, and the pipeline publishes
  a draft only when the reducer reports a change; a `question.replied` for a question this client never
  held (the reconnect-gap case, exactly what the counter is for) returns false, so the draft and the count
  were discarded and the stale snapshot restored the answered question. The stamp is module state now
  (`sync/blocking-request-events.ts`), one counter per session, like `serverSessionStatusStamp`.
- **`ccc3903f`** — two follow-ups to the previous batch: the relative-redirect base took the request path
  as a URL reference, so a path beginning with `//` was read as protocol-relative and registered a proxy
  target for that host; and the Codex provider's new 401 body read fell through to cancelling a body that
  had already been consumed.
- **`6d793f99`** — bounding a long config file name (`8ab5933f`) left the name and the project id no longer
  the same thing, and the scheduled-task convergence derives the id from the file name: it logged "project
  path is unavailable; left for next boot" on every boot for such a project. The runtime writes `projectID`
  into the config it owns, and the convergence reads it first.

### Fixed while the round ran

- **`86a3c917`** — the gap the "Limit audit" recorded: a full message queue refused the entry silently.
  The refusal reports it now, with the cap read from the store's own constant through the message's
  `{count}` placeholder; the key is in all fourteen catalogs.

### Arrived, being verified

- `server/lib/{sessions,lsp,plugins,update,notifications,magic-prompts,session-folders,desktop}`
  (deepseek-flash), two CONFIRMED, both fixed in **`71848983`**: a file the magic-prompt runtime cannot
  parse was answered exactly like a missing one and the next edit then rewrote it with only that one
  override — every other stored override was gone (the read now refuses, which the routes answer as 500,
  the choice `session-folders` documents for the same reason) — and an ask the runtime sends without an id
  was keyed `unkeyed:<session>`, a constant, so a burst collapsed onto one entry and only the last ask
  reached the user. Its two SUSPECTED leads are recorded below.
- `ui/src/components/{ui,desktop,update,icon,icons,notifications,comments}` (MiniMax-M3): no confirmed
  bugs; two SUSPECTED, recorded below.
- `ui/src/lib/{i18n,search,router,settings,tray,webmcp,wiki,preview}`: the Grok CLI run for this scope
  answered its preamble and then nothing for thirteen minutes past the other three reviewers, so it was
  stopped and the scope re-run with the Claude Code CLI. That found three CONFIRMED and one SUSPECTED,
  all fixed: the tray's approval title (the copy of the finding fixed in `27d6b446`, which the round's
  own review of `lib/tray` did not reach), the router's tab list and its omitted-parameter defaults
  (`a73f9823`), and the WebMCP error verdict read out of a prose message (`63717e46`).

### Fixed from the ui/src/lib review

- **`27d6b446`** — the tray's approval rows come from every session's pending permissions and questions,
  but the title map was built from the root rows alone, so a subagent's approval reached the tray with
  its raw session id as the title (this one was found by both this reviewer and the tray review of the
  same round).
- **`a73f9823`** — `VALID_TABS` listed five of the eight values `MainTab` can hold while
  `serializeRoute` writes any non-default tab, so `?tab=wiki`, `?tab=plan` and `?tab=context` were
  written to the URL and read back as invalid: a reload or a history entry could not restore them. And
  because serialization omits whatever matches the default, `?session=abc` says nothing about the tab —
  `parseRoute` answers null for an absent parameter and `applyRoute` read null as "keep the current
  value", so Back from `?session=A&tab=git` to `?session=A` left the user on the git tab and then
  rewrote that entry with `tab=git`. `withRouteDefaults` fills what a route from the history or the
  address bar leaves out; only the popstate and mount paths use it.
- **`63717e46`** — the WebMCP error classifier scanned a failure's `message` for the same tokens it reads
  from `reason`/`code`/`name`, and `rejected` is a word in a sentence: any unrelated refusal ("Request
  rejected by proxy") was reported as "the grant was rejected". Free text is only read for the two tokens
  that name a state; the rest falls to the generic message, which claims nothing.

### Suspected leads from this round, verified and not changed

- **The session-state and notification routes carry no session gate**
  (`notifications/routes.js:83-149`, `:192-203`), while the stream route in the same file does
  (`:30-41`), as do the runtime-backed routes (`ax-code/core-routes.js:267`) and the diagnostics ones
  (`requireSessionWhenEnabled`). In password mode the session titles, statuses and attention flags they
  read (and the auto-accept they write) were therefore reachable without a session. This was first recorded
  as blocked on the packaged renderer's credential path — a wrong reading: the record said its
  `desktop-renderer-protocol.js` forwards no `Cookie` header because the file holds no occurrence of the
  word, while `copyProxiedRequestHeaders` (`:199-217`) copies every request header except
  `host`/`connection`/`content-length`, so the session cookie reaches the server and the gate cannot lock
  the app out. Fixed in **`a283fc56`** on that correction.
- **`session-folders` GET echoes whatever the file holds** (`session-folders/routes.js:21-23`): a file
  containing `[]`, `"x"` or `{"foldersMap":42}` is answered 200 with that JSON. Recorded here as harmless
  because the client guards those shapes — which it does — and then **fixed in `615743d0`** after the
  sixteenth round's falsification pass read it again: the guard was an object check, not the per-entry check
  this entry described, so `{"foldersMap":{"/p":"oops"}}` reached the store and `getFoldersForScope` handed
  a string to callers that map over it. Both the localStorage and the disk path go through one validating
  reader now. The rest of the entry still holds: the writer is this repository's own POST path, which
  refuses a non-object body, and the corrupt-JSON case beside it is refused with 500.
- **`ErrorBoundary`'s copy timeout is never cleared** (`ui/ErrorBoundary.tsx:70`): the `setTimeout` that
  restores the copy label is not stored, so nothing clears it on unmount. Recorded, with the bound the
  falsification pass could confirm rather than the universal one this entry first claimed: the reset path is
  safe (`handleReset` keeps the class instance mounted, so the pending timer fires on a live instance), and a
  deferral remains because proving the rest would mean enumerating every scope-boundary mount site for one
  that unmounts inside the 1 500 ms window.
- **`AxCodeUpdateToast` reads `cliStatusRef.current` in its failure branch**
  (`update/AxCodeUpdateToast.tsx:97-117`), so the manual command it shows can lag the polling loop's latest
  state. The ref is written by that same loop and read immediately after a rejection, so the window is one
  poll interval; the value shown is still a valid command. Recorded.

## Thirteenth round

A thirteenth round: the twelfth round's server scope re-run over `server/**` and
`lib/{event-stream,preview,text,security}` with the Claude Code CLI (the Grok CLI run of that scope had
returned its preamble only), fresh reviews of `ui/src/sync`, `server/lib/{git,fs,terminal}` and
`ui/src/stores` plus `lib/{worktrees,permissions,quota}`, and an auditor over the twelfth round's own
commits. Everything found so far is fixed; what is still being verified is listed at the end.

### Fixed from the re-run of the server scope

- **`1338e5b7`** — `rewriteProxyRedirectLocation` resolved an upstream `Location` against the target's
  bare origin, so a legal relative reference lost the request path (`Location: intro` from `/docs/guide`
  sent the browser to `/intro`, a query-only `Location: ?page=2` dropped the path), and the SSRF guard
  accepted a rooted loopback name (`http://localhost./`, `http://svc.localhost./`,
  `http://printer.local./`) as an external target because the WHATWG parser keeps the root dot. The
  same commit makes the ax-code proxy's forwarded `authorization` replace the client's instead of
  joining it under a second casing ("Bearer client, Basic server" reached the runtime).
  The re-run's fourth finding — the global hub keeps its replay buffer across `stop()` while the new
  reader starts without `Last-Event-ID` — was checked and is not a defect: the client's `onReconnect`
  refetches the authoritative snapshot on every successful connect
  (`sync/sync-context-impl.tsx:1466`).

### Fixed from the git, files and terminal review

- **`bed1f0c7`** — five defects: the terminal restart marker was added before the slot reservation and
  removed only by an inner `try/finally` the 429 return never reached, so a refused restart of an id
  with no live session permanently answered 409 for that id; `getCommitFiles` pushed `displayPath`,
  which the rename branch set to `filePath` in both arms (dead code), so the history view received
  `src/a.ts => lib/b.ts` as a path and every renamed file answered 500; `checkout` handed an
  unvalidated value to `git checkout`, where a value naming a tracked file is a pathspec
  (`git checkout README.md` restored it from the index and discarded the user's edits) and `-f` is an
  option — both reported as a successful branch checkout; committing selected files temporarily
  unstaged the other staged paths and restored them from their index entries, which cannot express a
  staged *deletion*, so the deletion came back unstaged and the next commit no longer carried it; and
  `/api/fs/raw` answered with the app's own CSP, which allows inline script, so a workspace SVG opened
  directly ran on the app's loopback origin with the session cookie reachable by same-origin requests.

### Fixed from the audit of the twelfth round's commits

- **`40c6600a`** — the bound's own test (`count <= before + 1`) also passes with an unbounded map. It
  asserts the first id is gone and the newest survives. Fixing that exposed the audit's third finding:
  a counter that restarts at 1 after eviction can match the 1 an in-flight send captured and roll a
  running turn back to idle, so stamps now come from one counter shared by every session.
- **`9ceef9ee`** — the `startup disable` test called the real teardown with only the data dir
  redirected, and `getStartupServicePaths` builds its path from the home directory: every
  `pnpm run test` on a machine with the integration enabled ran `launchctl bootout` (or systemd, or
  `schtasks`) and unlinked the developer's own entry. The three commands are refused through a
  `child_process` mock now, HOME/USERPROFILE point at the temp dir, and the test asserts the teardown
  did reach the stubbed command. The same commit makes the tunnel test's "stop did take effect" half
  reach the `stopped || !isProcessRunning(pid)` condition it claims to cover (it took the
  "not-running" early return, so a regression that dropped `stopped ||` passed).
- **`031e86b5`** — `recoverPendingRemovals` ended by writing its leftovers over this window's pending
  slot (or removing the key), dropping a removal the user made while its requests were in flight; a
  crash inside that undo window resurrected the session. The leftovers go through
  `keptForRecovery`/`persistPending()` like every other write.

### Fixed from the sync review

- **`784f8d17`** — three defects around a snapshot that arrives after a live change: `bootstrap.ts`
  applied the `session.status` snapshot to every session it and the store named, so a
  `session.status {busy}` that arrived while the request was in flight was overwritten with idle (the
  poll path already dropped those entries with `pickApplicableResyncedStatuses`); the question and
  permission resyncs (four sites, in `bootstrap.ts` and `sync-context-impl.tsx`) compared an id
  signature taken before the request with the one after it, so a question asked *and answered* inside
  that window left the signature back where it started and the answered question was merged back —
  the directory now carries `blockingRequestRevision`, bumped by every question/permission event in
  `event-reducer.ts` before its own dedupe, and the sites compare it in addition to the signature; and
  the reconnect pass folded `session.get`'s answer into the live list without looking at
  `time.archived`, so an archived parent — read only to materialize its child's messages — reappeared
  in the sidebar's active list.

### Fixed from the stores and worktrees review

- **`436c7c23`** — `removeSessions` is the documented funnel for every delete path, but only the
  `session.deleted` event path recorded a tombstone: the hard-delete flows remove the session
  optimistically right after the server confirms, so a reconnect snapshot taken before the event (or a
  dropped event) brought it back. A removal that took a session out of the lists records its ids now.
  In the same commit, `worktreeBootstrap`'s poll loop consulted the generation counter only before
  writing state, so a run retired by `clearWorktreeBootstrapState` (the worktree was removed) kept
  asking the runtime for its status every 250 ms for the rest of the five-minute timeout; it settles on
  the answer already on its way — the behaviour the two existing retired-poll tests pin — and starts no
  further request.

### Fixed from the upstream comparison's second pass

The second pass over upstream's `fix(...)` commits (window 2026-09-15 .. 2026-10-13, 732 commits,
screened programmatically after the identifier-per-commit method turned out to be unusable at that
scale) produced eight leads in `.tmp/bughunt/upstream/pass2-leads.txt`. Three were real and are fixed:

- **`a9e1f160`** — `continueRebase` tested its conflict pattern before the "the step has nothing left to
  apply" one, and git answers that case with its conflict hint in front of the emptiness (`hint: Resolve
  all conflicts manually …` plus `No changes - did you forget to use 'git add'?`, exit 1 on the apply
  backend, reproduced in a real repository here). The panel reported a conflict that no longer exists,
  with the stale conflict file list, and the step never advanced. The check runs first now — for
  `continueMerge` too — and covers git's other wordings.
- **`a9e1f160`** — the PR status route answered a 403 with the same "no pull request" shape it uses for a
  404, so an organization that restricts OAuth apps (or a rate limit) read as a branch without a PR, even
  when this very request had just found one and only the enrichment call was refused. A 403 answers 403
  with GitHub's own message now; the 404 shape and its no-cache rule are unchanged.
- **`a9e1f160`** — the Codex quota provider called every 401 an expired session, including the
  access-enforcement refusal the endpoint sends for a sign-in method it declines while the credential is
  fine; that body's `error.type` is reported on its own now.

Two more were real and are fixed:

- **`b8485bd6`** — `resolveWorktreeProjectContext` required `rev-parse --show-toplevel`, which a bare
  checkout answers with "fatal: this operation must be run in a work tree", so creating, previewing or
  validating a worktree for a bare repository failed outright. The directory is the sandbox when the top
  level cannot be resolved, and a bare repository — whose common directory is itself — is its own primary
  worktree rather than its parent (which would have handed the project id and the AX Code worktree root to
  the wrong path). `git worktree list` also reports the bare repository itself as a `bare` worktree (now
  marked and filtered out: it has no work tree to check out), and the listing ran from the top level it
  cannot resolve there, so it returned nothing at all.
- **`8ab5933f`** — the project config is `<projects dir>/<project id>.json` with the id being `path_` plus
  base64url of the whole project path, so a long enough path pushed the file name past the filesystem's
  255-byte limit and the config could be neither written nor read (`ENAMETOOLONG` — reproduced here with a
  300-character id). Names longer than 96 characters keep a readable prefix and a digest of the rest, and
  the read path still finds the file an earlier version wrote under the full id.

The last three leads were checked and left alone:

- **The git store's prefetch slots** (`ui/src/stores/useGitStore.ts:870,878`). A prefetch that passes its
  10-second UI deadline releases the path in `inFlight` while its transport is still running, so a later
  pass can start the same request again. `inFlight` is this store's *dedupe reservation*, not its
  concurrency cap — that is the worker count per pass, so a single pass never exceeds it — and upstream's
  alternative (hold the path until the transport settles) trades one duplicate request for a path that
  stays reserved forever if a transport never settles, which is the case the deadline exists for. The
  empty per-directory sets the same lead mentions are part of the `useGitStore` per-directory state that
  "Reviewed and deliberately not changed" already records.
- **The Ollama Cloud usage reader** (`lib/quota/providers/ollama-cloud.js`) and **the Moonshot balance
  reader** (`lib/quota/providers/kimi.js`) live behind endpoints we do not call (`ollama.com/api/balance`,
  `api.moonshot.ai/v1/users/me/balance`). Upstream moved to them so a refused or reworded page still has a
  number to show; that is a feature we cannot verify offline, and our readers are not broken as written.
  Recorded as a divergence rather than a defect.

### Reported as suspected, verified and rejected (this round)

- **`worktreeStatus.toAbsolutePath` fabricating a path from an empty base** (`worktreeStatus.ts:6-23`).
  The function can produce `/.git` or `/etc/passwd` from an empty base, but nothing it produces reaches
  a caller: every result goes through `derivePrimaryWorktreeRootFromGitDir`, whose `|| null` guard
  returns null for `/.git` (an empty prefix) and for any path without the `.git`/`/.git/worktrees/`
  markers, and `computeProjectRoot` then falls back to `directory`.
- **`permissionStore.setSessionAutoAccept` broadcasting a stale `enabled` to descendants**
  (`permissionStore.ts:296-307`). The scenario needs the first call's loop to run after the second
  toggle, and it cannot: `set` and the loop over `resolveSessionScope` are one synchronous block with
  no `await` between them, so the captured `enabled` is the live value for the session by the time the
  loop reads it.

## Twelfth round

A twelfth round over surfaces the earlier ones had not opened (`web/bin/**` — the CLI and the tunnel
manager, via Claude Code CLI; the server's top-level files plus `lib/{event-stream,preview,text,security}`
via Grok CLI; `ui/src/lib/{codemirror,shiki,theme,messages}` via deepseek-flash; `desktop/shared/**`,
`tools/**`, `config/**` via MiniMax-M3) and one auditor over the eleventh round's commits. The CLI batch
carried five findings and the audit two, all fixed:

- **`96159434`** — `stop --port N` hit the "no running AX Code Desktop instances found" early return
  before it probed the port, so a port held by the desktop app (which this command cannot stop) or by an
  orphaned server was reported as nothing to do and stayed occupied. The probe for an explicit port runs
  first now, which is where its own branches already expected to be.
- **`96159434`** — `startup disable` never removed `startup.env`, the file `startup enable` writes with the
  UI password and a snapshot of the environment (API keys included); the only caller of
  `removeStartupEnvFile` was the macOS *enable* path, so a disabled integration left those credentials on
  disk.
- **`96159434`** — `tunnel stop` removed the tunnel's state file even when the process survived the stop,
  untracking a tunnel that is still public: `tunnel status` stopped listing it and a retry reported
  "not-running". The file goes only once the process is confirmed gone, as `commands.stop` does with its
  pid and instance files.
- **`85edbf89`** — `restart` of a foreground instance reported success without checking that the stop took
  effect: `commands.stop` records a per-instance failure and returns rather than throwing, and the
  foreground path calls no `serve` (so nothing fails later the way the daemon path does). The instance's
  pid is checked.
- **`85edbf89`** — Ctrl+C on `logs` (follow by default) ran the module's global SIGINT handler first, and
  that handler exits 130 with "Operation cancelled." before the follower's own handler can unsubscribe
  and resolve — right after the banner promised "Ctrl+C to stop". The follower marks itself active and the
  global handler leaves the signal to it, the same exemption the foreground server has. (No test: the
  handler is installed only when the module is the process entry point.)
- **`654484b9`** — the audit of the eleventh round found two gaps in my own fixes: the TTL prune skips
  jobs that are not "done" (a running job must survive), and the *foreground* exec path had no catch that
  finishes the record the way the background path does, so a run that threw left a job in "running"
  outside the TTL; and the declared-size refusal in `downloadClawdHubSkill` threw without cancelling
  `response.body`, leaving the connection open (the streaming path already cancels).

The round's other two reviewers (the UI libraries via deepseek-flash, `desktop/shared` and `tools` via
MiniMax-M3) arrived after that batch; three of their findings were real:

- **`6aae3c7c`** — `getAssistantTokenTotal` (`ui/src/lib/messages/assistantTokens.ts`) summed the
  message's `reasoning` and `cache` fields without a guard, so a provider that omits them — the shape the
  step-level twin in the same file already defaults to zero — made the total NaN, and `NaN <= 0` is false,
  so the guard admitted the message and the context meter rendered NaN%. Reported by both reviewers of
  that batch, one as CONFIRMED and one as CONFIRMED with the step path and `ContextSidebarTab`'s
  `toNonNegativeNumber` as the sibling guards. Every field is read through one guard, the returned tokens
  are normalized, and a payload JSON wrote as nulls is skipped.
- **`99cd5cd5`** — `createLanguageController().update` wrote the file and advanced `preferences` before
  reading the state, so a throwing `systemLanguages()` (`app.getPreferredSystemLanguages` in `main.js`)
  rejected a save that was already committed. The state is resolved before the write.
- **`e365d263`** — `tools/winget/generate-manifests.ts` read value-taking options as
  `argv[++index] ?? <default>`, so `--out` or `--tag` as the last argument silently wrote the manifests to
  `.tmp/winget` (or the derived tag) and reported success. All three options throw on a missing value now.

The batch's two remaining SUSPECTED leads — both in `ui/src/lib/messages/assistantTokens.ts` and
`ui/src/lib/shiki/appThemeRegistry.ts` — were checked and left alone, with the evidence below.

### Suspected leads from this batch, verified and not changed

- **A malformed newest `step-finish` aborts the scan and discards an older measurement**
  (`assistantTokens.ts:56-58`, reported SUSPECTED). It does return `null` for a step whose `tokens` is
  missing or non-numeric while a step reporting all zeros is skipped with `continue`, so the two branches
  differ. Both readers of the same payload in the pinned runtime behave the same way: the TUI's
  `Usage2.lastStepTokens` in `desktop/packages/electron/dist/mac-arm64/AX Code.app/.../index-node-tui.js`
  returns `void 0` on the first `step-finish` whose `input`/`output` are not numbers rather than looking
  further back, and the runtime writes `tokens: usage.tokens` on every step it finishes, so an absent
  `tokens` object is not a shape it produces. The existing test pins the current contract
  (`returns null for a malformed step-finish tokens payload`). Changing the fallback from the message
  totals to an *older* step would also report a pre-step context size for a turn that just finished, so
  the difference is not an unqualified improvement.
- **The renderer's theme caches are never evicted** (`ui/src/lib/shiki/appThemeRegistry.ts:40-41`,
  reported SUSPECTED, low severity). The ids are content-derived, so an edited theme does leave an
  unreachable entry behind. Evicting `resolvedThemeCache` would not release anything, though:
  `registerCustomTheme` (`@pierre/diffs`) calls `themeResolver.registerTheme(name, load)`, a module-level
  registry that keeps the loader closure — and the resolved theme it returns — for the life of the
  renderer, and the package exposes no unregister. The retained memory is the registration, not this map,
  so bounding the map would be a change that does not bound the growth it is meant to bound. Recorded
  rather than changed.

## Tenth round

Two batches again. The review batch ran four reviewers over surfaces earlier rounds had not read
(`components/{projects,onboarding,auth,dashboard,providers,model-picker,mcp,mini-chat,multirun}` via Claude
Code CLI, server `{git,fs,terminal,preview,projects,skills-catalog,ui-auth}` via Grok CLI, `sync/**` via
qwen3.8-flash and `stores/**` via MiniMax-M3); the audit batch was folded into the ninth round's own
follow-ups above. Fixed from it:

- **`e66a4814`** — the dashboard's URL stays empty until the runtime version arrives, and the
  upgrade-status fetch had no deadline, so a runtime that accepted the connection and stopped answering
  left it empty for good. The iframe was hidden in that state but the Open button stayed enabled, and
  `window.open("")` opened a blank tab. The button is gated now and the fetch is bounded.
- **`08c3c135`** — the MCP dropdown held one busy server name: toggling a second server re-enabled the
  first one's switch while its call was in flight (a second click then issued a concurrent call for the
  same server), and each handler's `finally` re-enabled the other's. A set of in-flight names now, and
  the switch state agrees with the last click.
- **`b1bb1357`** — the model picker's `hiddenModels` default was a fresh `[]`, so the flat list was a
  different array on every render while the highlight-reset guard compares identities: it never matched,
  and any unrelated re-render of an open picker reset the highlight to the first row, so the next Enter
  selected a different model than the user had arrowed to. `ModelMultiSelect` omits that prop, and the
  existing regression test passed a stable array.
- **`a53c650a`** — the multi-run launcher loads `setup-worktree` commands per project and never cleared
  them on a project switch, while Start did not wait for that load: pressing Start after switching
  submitted the previous project's shell commands with the new project's worktrees. The commands are
  cleared on the switch and Start waits for the load, as it already did for the worktree base branches.

### Fixed from the round's remaining leads (server and sync)

- **`765336ae`** — the passkey sign-in wrote back the snapshot it had read *before* the WebAuthn
  verification, without the store lock every other mutation holds: a revoke landing in that window was
  overwritten and the credential the user had just removed could sign in again (the same window dropped
  a credential registered during it, and an older counter could overwrite a newer one).
- **`d4586105`** — a queued worktree bootstrap closed over its directory string only. The directory can
  be removed and re-created under the same (preferred) name while the run awaits git and the start
  scripts, so the earlier run reset the new worktree's checkout and started the old project's scripts in
  it. A run owns a generation now, checked after each await, and a removal retires it.
- **`1042f5e0`** — the restart route killed the existing terminal and deleted its session id before
  asking the provider for a replacement, so a provider or spawn failure answered 500 with the client's
  shell already dead and nothing to attach to. The replacement spawns first and the swap follows.
- **`65820182`** — `validateRepositoryFilePaths` treated any relative path starting with `..` as an
  escape, so a directory whose name starts with two dots (`..cache/file.txt`) could not be staged,
  unstaged or diffed. Only `..` itself or a leading `../` leaves the repository, as the fs routes state.
- **`d1c5f223`** — global sign-out was refused whenever `AX_CODE_JWT_SECRET` was set, even when the value
  is too short to be used for signing (the file secret is what protects those sessions), leaving them
  valid until they expired.
- **`8d0c0fc0`** — `optimisticSend`'s failure path restored the previous status whenever the store's
  status merely *was* busy, so a POST that reached the runtime (starting the turn) before its response
  failed left a live turn shown as idle — no working indicator, no Stop, and the queued-message auto-send
  firing on a busy-to-idle edge that never happened.
- **`d834b2f9`** — the beforeunload flush of pending removals released the pending flags before its
  requests and then persisted the store's map, which that release had emptied: a removal that failed
  fast wrote an empty recovery slot and the next launch resurrected a session the user had deleted.
- **`e16c11e8`** — a watchdog's own timer removes its map entry before its async checks run, so a prompt
  sent during those checks registers a new timer; the grace-window re-arm then overwrote that entry and
  left the newer prompt's timer uncancellable, so it fired during a later turn. The slot is claimed by an
  owner token per prompt now.
- **`a3453a19`** — the optimistic-part replacement scanned only when the *first* slot lacked a sessionID,
  but parts are inserted by sorted id and the server echoes a prompt's parts one at a time: an earlier
  echo sorting in front of them skipped the scan and the user's prompt rendered twice.

## Eleventh round

Two batches: four reviewers over combinations the earlier rounds had not used together
(`components/{terminal,files,layout,icons}` via Claude Code CLI, server
`{ax-code,terminal,event-stream,notifications}` via Grok CLI, `apps/**`, `contexts/**` and
`lib/event-stream/**` via deepseek-flash, server `{projects,skills-catalog,ui-auth,preview,fs,text,quota}` via
MiniMax-M3) and two auditors over the tenth round's commits. Fixed from it:

- **`6892a76b`** — the diff viewer's shadow-root attachments (the gutter-click capture listener and the
  annotation MutationObserver) did not list the inputs that make the render effect rebuild the
  container, so after a hunk revert or an agent edit they stayed attached to the detached shadow root:
  gutter clicks stopped resolving a side and annotation changes stopped triggering a re-render.

### Fixed from the audit of the tenth round's fixes

- **`3430aea7`** — spawning the replacement terminal before the swap made "replace my own slot" a
  check-then-act race: two overlapping restarts of one id both read the same live session, neither
  reserved a slot, and both spawned and registered, so the count went past the cap and the first
  replacement was orphaned. One restart per id now; the second is answered 409.
- **`10698601`** — the connection between that fix and the SSE path: `optimisticSend`'s failure rollback
  still restored idle, because the reducer dedupes an equal `busy` without writing, so the store kept the
  object the send itself wrote. The reducer now counts every `session.status` event per session (before
  the dedupe) and the rollback requires that no server status arrived since the send began.
- **`8599ff61`** — the quit-recovery slot: keeping *every* failed removal for the next launch is right for
  the unload flush (nobody can see the outcome) and wrong for the undo-window timer, which runs while the
  user is watching, reports the failure and puts the session back — queueing it deleted that session on
  the next launch. Only the flush keeps its failures.

- **`e59e9b74`** — the worktree bootstrap's ownership guard sat before the upstream configuration
  *and* after the start scripts, but the upstream step awaits a network fetch (the longest suspension in
  the run): a worktree removed and re-created during that fetch still had the stale run configure its
  upstream and start the previous project's scripts in it.
- **`562d1326`** — the reordered terminal restart holds no reservation while it spawns (the session it
  replaces holds that slot), and that session can leave the map in that window — its shell exiting, or
  another window closing it — after which a create takes the freed slot and the replacement registered
  past the cap, leaving a PTY nobody owned. The replacement takes a slot of its own at swap time and is
  refused when the cap filled up.
- **`3e5b75b9`** — the recovery slot: an entry kept for the next launch was dropped by the next write in
  that window (`persistPending` rebuilds the slot from the store's pending map, which no longer holds it),
  so an unrelated removal or an undo lost the record and the next launch resurrected a session whose
  removal had failed. Entries kept for recovery are module state every write carries now, cleared when
  the removal is confirmed or undone.

- **`7eee96a7`** — both preview panes rebuilt the iframe `src` from a resolved proxy base path plus the
  current URL's path and query. That state outlives a URL change by one commit (the effect that resolves
  the new target runs after the commit), so navigating between origins rendered
  `previousBase + newPath?query` — a request carrying the new URL's path and query string (tokens
  included) went through the *previous* origin's proxy, and a load started against the wrong server. The
  state carries the key it was resolved for and is only used for that key.
- **`eb848c6e`** — the project dialog's Save button is disabled during an icon upload or removal, but the
  name field's Enter key calls the handler directly: a second press uploaded the icon twice and ran the
  removal, `onSave` and the close handler again.
- **`86c383d2`** — the sidebar tree's Refresh cleared the loaded-directory set and the children cache and
  reloaded only the root; the effect that loads expanded directories keys on the expanded set and the root,
  and a refresh changes neither, so every expanded folder kept its row and rendered empty until it was
  collapsed and expanded again.

- **`33dbb94c`** — `replaceScheduledTasks` coerced an updater's non-array result to `[]`, and
  `writeScheduledTasksToDisk` deletes the `scheduledTasks` key for an empty list: a broken caller erased
  every scheduled task in the project with nothing thrown or logged. It refuses now. (The one caller
  today always filters the list, so the trap was latent — fixed because the failure mode is silent data
  loss.)
- **`1958c090`** — the ClawdHub ZIP validator checked entry *names* only, so a symbolic-link entry (whose
  name is ordinary) passed and `AdmZip.extractAllTo` created a real link in the skill directory pointing
  wherever the archive said — the escape the GitHub install path already refuses with
  `lstat().isSymbolicLink()`. The Unix mode in the entry's external attributes is checked now.
- **`804c137d`** — `downloadClawdHubSkill` returned `response.arrayBuffer()`: a malicious or compromised
  publisher could hand the desktop process a multi-gigabyte archive, materialised in memory and then
  extracted under `os.tmpdir()`. The body is read against a 32 MB cap (declared length, streamed
  chunks stopped and cancelled, and a size check for a body with no stream).
- **`34152cba`** — the exec-job TTL pruner retires jobs by `updatedAt`, which the runner refreshes
  *between* commands: a background job whose single command outlasted the 30-minute TTL was deleted
  mid-flight and polling it answered 404. Only finished jobs age out now.

### Reported as confirmed, verified and rejected

- **"DiffWorkerProvider caches a failed pool creation as a success"** (`contexts/DiffWorkerProvider.tsx:91-103`).
  The `.catch` clears the cached promise *after* the current tick: `createWorkerPool` is `async`, so the
  `??=` assignment and the `return` both happen while it is pending, and a later call finds the field
  cleared and retries — the invariant the comment states does hold. (A concurrent call during the
  failure window joins the pending promise, which is the intended dedupe.)
- **"The worker-pool render theme is only ever applied on first creation"** (same file, `:133-146`).
  `syncPoolRenderTheme` — the only writer — imports `appThemeRegistry`, calls
  `ensurePierreThemeRegistered` for both themes and only then applies, which is exactly the guard the
  report said was absent; the registry call is synchronous (`registerCustomTheme` stores the loader), so
  the pool has the id before `setRenderOptions`.
- **"`/api/fs/read?optional=true` is defeated by `realpath`"** (`server/lib/fs/routes.js:1000-1064`).
  The `realpath` call is inside the same `try` whose catch maps `ENOENT` to an empty body when `optional`
  is set, so the optional contract does hold for a missing file. A test now pins it (200 + `""` with the
  flag, 404 without), which is the durable answer either way.
- **"`suppressTransitionsForThemeSwitch` leaves `.ax-theme-switching` on `<html>`"**
  (`contexts/ThemeSystemContext.tsx:46-64`). The returned cleanup removes the class unconditionally, and
  the uncancellable inner frame only removes it as well, so the class cannot outlive the effect. What is
  real is the inverse and cosmetic: a superseded pass's inner frame can remove the class *during* a newer
  switch, letting transitions animate for that frame.
- **"Mini-chat presence posts `viewed:false` with the wrong session"** (`apps/ElectronMiniChatApp.tsx:196-222`).
  The cleanup's closure carries the session the effect was viewing, which is the session the message is
  about; a consumer that treats it as "stop viewing A" is being told the truth. The reviewer's own note
  is that the window is one render wide and self-correcting.
- **"A late `heartbeat.reset()` permanently disarms the silence watchdog"** (`lib/event-stream/heartbeat.ts`,
  `client.ts:99-103`). `activity()` has no attempt-identity check, but the frame has to arrive in the
  window between the attempt settling and the driver nulling its own handler on settle
  (`adapters/websocket.ts:51`), and both outcomes are bounded: the stale timer fires into
  `attempt?.abort()` (a no-op between attempts, an extra reconnect if a fresh attempt is live), while a
  live attempt re-arms on its own next frame. Recorded rather than changed, because the interleaving the
  report needs could not be produced and the module's contract is that the watchdog only follows
  *observed* activity.

Suspected, recorded rather than changed:

- **`useExecutionModeStore.setMode` reports a generic "update failed"** when `applyMode` fails part way
  and the UI shows the mode's real settled state; the data is right and the message is not. Whether the
  product wants the toast suppressed in that case is a wording decision.
- **`useMcpStore.refresh`/`refreshResources` "silent" only suppresses the loading flag**, not the error
  entry, so a silent post-connect refresh that fails still paints an error. Every silent call follows a
  successful user-initiated mutation, so this is the meaning of "silent" rather than a wrong result.

## Ninth round

A ninth round ran two review batches: six reviewers over surfaces the earlier rounds had not read
(`components/{session,projects,supervision}` via Claude Code CLI, `components/{ui,comments,notifications,layout,files,desktop,update}`
via Muse, server `{notifications,event-stream,security,text,quota,projects}` via deepseek-flash,
`electron/src/**` via glm-5.3, packaging and tooling scripts via Grok CLI, and the remaining
`ui/src/lib/**` via qwen3.8-flash) and three auditors over *this series' own commits*, each handed the
round's unified diff and told to look only for mistakes in it. All nine produced findings; the audits
were the higher-yield half, and five of their findings are fixed below.

### Fixed from the review batch

- **`037b26bb`** — both quota handlers returned `error.message` to the client, so a failed dynamic
  import or provider call put absolute paths and module specifiers in the response body. The ax-code
  routes already log the detail and answer a fixed string for exactly this reason.
- **`25c1097b`** — `locationMatchesHost` normalized both URLs through `normalizeHostUrl` (which deletes
  the query) and then compared `host.search`, always the empty string, so the guard could never refuse:
  a host configured for `?profile=dev` matched a window on `?profile=prod` and `hosts.find` returned the
  first entry — the wrong instance label and window title. The query is read from the raw values now.
- **`7b7c3a79`** — the worktree-delete dialog's setup effect listed `deleteDialog` in its dependency
  array while the status check wrote its result back into that state, so the effect re-ran and
  re-initialised the "also delete the remote branch" choice, the dirty-worktree warning and the Delete
  button's disabled state. Keyed to the dialog's identity now, read through a ref.
- **`fd75d931`** — the bulk session archive and delete acted on the selection alone while the
  single-session path cascades to descendants: a removed parent's subagents stayed behind and re-rooted
  as top-level rows (a hard delete left them running). The cascade is a tested helper, and the confirm
  dialog counts what it will act on.
- **`4e77fd4e`** — `resolveStageTarget` read only the bare `--mac`/`--win`/`--windows`/`--linux` flags
  while electron-builder also takes `--win=nsis` and `-w`/`-m`/`-l`, so a cross-platform package staged
  the *host's* runtime tree (the launcher check passed and the packaged build then reported a
  placeholder skip instead of failing). The sibling `packaging-target.mjs` reads both forms.
- **`db83f382`** — the JSON tree's collapsed set is initialized once, from the first document, and its
  entries are node ids — which are paths. FilesView renders the viewer for another file in the same
  slot, so switching files applied the previous document's paths to the new one: a shared path collapsed
  it to that row, a disjoint one left it fully expanded instead of stopping at the initial depth.
- **`9f080d2d`** — the sidebar file tree implements the same three dialogs as the Files view and only
  the Files view's branches were guarded: a typed `sub/x.txt` or `../x.txt` was joined onto the dialog's
  directory and wrote outside it (with enough `..`, outside the project) while the original directory
  was refreshed, so the result was invisible; and `rename` replaces its target, so renaming a file onto a
  sibling's name destroyed that file behind a "Renamed successfully" toast.
- **`9ca2f478`** — the same four dialog branches closed as a success when the runtime refused the
  operation by resolving `{ success: false }` (a channel `.catch` cannot see): the user read a refused
  create, rename or delete as done.
- **`4060c66d`** — a project action's only duplicate guard was the `projectActionRuns` snapshot, which
  the store learns about only after `createSession`, a 350 ms wait and the terminal claim, so two clicks
  in that window both reached `terminal.sendInput` and ran the command twice in one shell.

### Fixed from following the round's remaining leads

- **`84514b55`** — the unload settings flush fired the write and answered every waiting caller with
  success without looking at it, so a failed save was reported as done while the server file kept the
  old value, and the change was lost. That path also serves `visibilitychange → hidden`, where the
  document is still running. The waiters settle from the write now, and a failure re-queues the change.
- **`f795be68`** — `reload` and `navigate` touched the pane's webContents after teardown could have
  destroyed it, so Electron's raw "Object has been destroyed" reached the renderer while every other
  branch in that file guards the same object (`status()` reads a destroyed pane deliberately and keeps
  its own guard).
- **`bc9e7f68`** — `pauseChromeBridgeForProjectBrowser` bumped the counter it also used to detect "a
  resume overtook this pause", so a second pause looked like a resume: the first pause reconnected the
  bridge it had just disconnected and recorded nothing, leaving the embedded browser enrolled with the
  Chrome bridge connected. Only resumes bump it now.
- **`603b3010`** — `desktop_get_installed_apps` answered two windows and a `force` request with
  independent scans and plain `writeFile`s of one path; interleaved writers can leave a partial JSON
  file that the next read loses to a parse error. One refresh at a time, through the atomic
  `writeJsonFile` the file already uses elsewhere.
- **`fac2aec5`** — the earlier conflict/plan fix re-read `uiKindRef`, which only moves on render, so a
  queued `setUi({ kind: "conflict" })` was invisible to it. The two updates are conditional on the
  state they are applied to now, which makes their order irrelevant. (The auditor of that commit found
  this; the new test passes against both versions, so the argument stands on the update being
  conditional — that is recorded in the commit and here.)
- **`387e4e2c`** — the packaged smoke's readiness probe and asset fetch had no deadline: a socket that
  was accepted and then went quiet held the gate past `--timeout-ms`, and its `finally` never stopped
  the CLI. Both requests are bounded now.

### Fixed from the audits of this series' own commits

- **`f87f60be`** — the release-run selection added in `80598ff2` accepted a same-commit run from up to
  two minutes before the tag push, which readmits exactly the run that push created. The tag match is
  authoritative now and the same-commit run is a fallback only when it started strictly after the push.
- **`40bb758c`** — the selector's entry-point guard compared the caller's path against `import.meta.url`
  as text, so a symlinked path (`/tmp` and `/var` are symlinks on macOS, as is a symlinked checkout)
  skipped `main()`: the command printed nothing and `find_release_run` read it as "no workflow run yet"
  for sixty polls. Both sides are realpathed.
- **`23a9582b`** — invalidation touched only the plain status key while `mode: "light"` caches under
  `::light`, so a light read kept its entry across a mutation and a light request in flight wrote its
  pre-mutation payload back.
- **`b5d0c7dc`** — the model-preference baseline was marked before the request and rolled back on
  failure, so two overlapping flushes that both failed restored the *first* one's payload, which the
  server never received; every later flush then saw the store equal to it and sent nothing. The baseline
  only moves on success now.
- **`ee45dc8a`** — the reload added in `efd5cefe` does not make a retry adopt what a failed create left
  behind (adoption needs the editor's member ids, which a new task withholds): the comment claimed the
  sibling branch's outcome and now states the reload's real effect, with the duplicate-on-retry left as
  a decision.

### Verified and left alone

- **A stuck `busy` activity entry is never aged out** (`session-runtime.js:337-341`, after `7d029719`).
  The audit is right that the 24 h eviction was the only bound for an entry whose idle status never
  arrives. It is kept deliberately: the predecessor lost the count for a session that *was* working, and
  the consumer bounds itself — `shouldSkipRestartForBusySessions` forces the restart after its own 2 min
  grace and the restart path does not consult the count at all when the runtime process is gone. What
  remains unfixed is a lost idle event leaving a false count (a longer upstream stall timeout, a 2 min
  delay before an unhealthy runtime is restarted); clearing the entry on a session deletion or an SSE
  reconnect needs a payload contract this module does not read today.
- **The permission auto-accept mirror is sticky** (`notifications/runtime.js:70-78`). The server
  suppresses permission notifications for sessions it believes are auto-accepting and the route is the
  only mutator, with no TTL. A TTL would fight the feature (notifications resuming while the client
  still auto-approves), and the client side already replays its effective map — including `false`
  entries — on rehydration and reconnect, so the disagreement needs the client to disappear without
  ever confirming. Invalidating on session close or on a reconnect handshake is a decision about that
  contract.
- **A stream of a session dropped from `session_status` is never completed** (`sync/streaming.ts:166-172`,
  the skip also covers this-directory sessions whose status entry was deleted, and the retention prune only
  removes completed entries). The state is bounded by the number of sessions deleted while busy and the
  dead message ids are no longer rendered, so it is a leak, not a wrong result; completing it needs a
  decision about which directory's state proves the session is gone.
- **The worktree bootstrap's invalidation key can differ from the key it registered**
  (`server/lib/git/service.js:3628` with `:40-46`). `toBootstrapStateKey` only resolves, while
  `git worktree list` reports canonical paths — a project opened through a symlinked root would file the
  state and the invalidation under two spellings, and the in-flight run would keep going. Making the key
  canonical is a change to every reader of that map (the status is polled, and the directory may be gone
  by then, where `realpath` fails and the spelling falls back), so it needs one decision about the key's
  semantics rather than a local `realpath` call.
- **`verify-packaged-electron.cjs` walkers ignore symlinks** (`:45-54`, `:61-71`). With
  `withFileTypes`, a symlink is neither a file nor a directory, so a symlinked directory in `Resources`
  outside `ax-code`/`ax-computer`, and a symlink in `app.asar.unpacked`, are invisible to the packaging
  gate. Nothing in this repo stages such a symlink today, and following links safely needs a
  cycle-guarded walk — recorded rather than guessed at.
- **Archive extraction does not refuse `..` members** (`stage-ax-code.sh:140`). The archive is checked
  against a pinned size, SHA-256 and minisign signature first, so this needs that artifact to be
  compromised; a member-name pre-check is the fix when that hardening is wanted.
- **Single-digit loopback ports are not matched** (`lib/url.ts:100-102`), an unreachable-in-practice
  class (no preview target binds port 0-9) that contradicts the pattern's intent.
- **A git identity id is not URL-encoded** (`gitApiHttp.ts:893-914`). Ids are minted as
  `profile-<time>-<random>`; a hand-edited id with a `/` would already fail the server's own lookup.
- **`sign-windows.cjs:64` passes only `--azure-key-vault-managed-identity`** while
  `resolveSigningConfiguration` requires the tenant/client/secret trio and the shadow workflow checks
  only that those three variables are non-empty. Whether that authenticates on a GitHub-hosted Windows
  runner depends on AzureSignTool's flag semantics, which the reviewer could not read here; it needs a
  check of that tool (or a signing rehearsal) rather than a guess.
- **PR create and repo-branch listing skip the repo containment their siblings enforce**
  (`server/lib/github/routes.js:564-587` on create, `:1013-1045` for branches, while `/pr/update`,
  `/pr/merge` and `/pr/ready` funnel through `resolveRepoForRequest`) and **every attachment is dropped
  when a directory listing fails once** (`chatInputMentions.ts:391-395`). Both are bounded to the user's
  own token and own service call, and the second is a missing user-visible signal rather than lost data;
  the reviewers marked both SUSPECTED and they need a decision about how much the routes should narrow.

## Eighth round

A second pass over the surfaces the earlier rounds read only once, again with reviewers those rounds did
not use there: `components/views/**` (Claude Code CLI), the remaining `ui/src/lib/**` (Muse CLI),
server `{mcp,lsp,plugins,update,sessions}/**` (deepseek-flash), the server's top-level files (glm-5.3),
`components/chat/**` (MiniMax-M3), `script/**` and workflows (Grok CLI), and `hooks/**`,
`contexts/**`, `sync/lib/**` (qwen3.8-flash). All seven runs finished; their findings were read from the
line each names, and every confirmed one is fixed below.

| Run | Confirmed | Outcome |
| --- | --- | --- |
| `views` (Claude Code CLI) | `useDiffHunkRevert.ts:27-52`, `FilesView-impl.tsx:1968,2034`, `git/IntegrateCommitsSection.tsx:75-103` | fixed |
| `lib` (Muse CLI) | `gitApiHttp.ts:221`, `modelPrefsAutoSave.ts:70` and `:46`, `scheduledTasksApi.ts:234` | fixed |
| server `{mcp,lsp,plugins,update,sessions}` (deepseek-flash) | `plugin-routes.js:409-419`, MCP create/update without the field its `type` needs, `session-runtime.js:337-341` | two fixed, MCP not reachable (below) |
| server top-level (glm-5.3) | `persistSettings` logging the credentials it strips | fixed |
| `chat` (MiniMax-M3) | `PermissionCard.tsx:164-189`, mermaid `file://` URLs, absolute-path `@`mentions | all three rejected or deferred (below) |
| `script/**` (Grok CLI) | `runtime-manifest.cjs:84`, `publish-github-release.sh:267`, `docker-entrypoint.sh:78` | two fixed, manifest is a standing decision |
| `hooks/**` (qwen3.8-flash) | `useSessionAutoCleanup.ts:136-143` | fixed |

- **`924946d5`** — reverting a second diff hunk while the first `writeFile` was in flight rebuilt the
  whole file twice from the same closed-over `modified`, and the later write landed without the earlier
  revert: one revert silently lost, the first call's `finally` clearing the second's spinner. Only the
  clicked hunk's own button was disabled. An in-flight ref closes the gap between the click and the
  re-render, and every hunk button is disabled while a revert runs.

- **`65c36b62`** — `discardAndContinue`/`saveAndContinue` armed the one-shot flag that suppresses the
  discard dialog for the whole decision, but only `handleSelectFile` reads it. The guarded tab switch
  navigates after clearing the guard, and closing a tab with no next file navigates nowhere, so nothing
  consumed it there: the flag stayed set and the next file switch reset it and skipped the prompt,
  discarding the draft without asking. The flag is now armed immediately before each `handleSelectFile`
  call that consumes it.

- **`76367512`** — the panel's "an in-flight integrate owns it" guard read `uiKindRef` only before
  `await computeIntegratePlan`. On mount with a persisted cherry-pick conflict both effects start while
  the kind is still `idle`, and a plan that resolved last wrote `ready` over the restored `conflict`: the
  Abort/Continue/Resolve controls vanished, Move became clickable over a worktree still holding the
  cherry-pick, and the persisted state was never cleared. The kind is re-read after the await.

- **`1b0c002f`** — `invalidateGitStatusCache` dropped the cached status and the in-flight slot, but the
  request that started before the mutation still wrote its pre-mutation payload into the cache when it
  resolved, and the refresh the mutation triggered read it back inside the 1.2 s TTL. An invalidation
  epoch per directory now gates the write.

- **`dcb1a0ba`** — model preference autosave had two of the defects already fixed in the appearance
  autosave beside it: only the 1200 ms timer flushed, so a favourite toggled and then a closed window
  lost the change, and `lastSent` was recorded before `updateDesktopSettings` resolved with the rejection
  swallowed, so a failed save counted as sent and was never retried or reported. It now flushes on
  pagehide/visibilitychange like its sibling, rolls the baseline back on failure, and surfaces the error.

- **`efd5cefe`** — the reconciliation branch reloads the scheduled-task group before rethrowing so a
  retry adopts a partial failure; the create branch did not. A fan-out draft whose `pause` failed left
  active tasks the list never showed, and re-saving created duplicates. It reloads too.

- **`89d5fbdb`** — the plugin file PUT passed `req.body?.content` into a writer that ends in
  `writeFileSync(path, content ?? "")`, so a body without `content` truncated the file and answered 200.
  The route now requires a string.

- **`7d029719`** — the hourly cleanup evicted any activity entry older than 24 h, but `updatedAt` only
  moves when the phase changes. A session that stayed busy aged out of the snapshot and the busy count
  main reads before honouring the restart grace dropped to zero. Only idle entries are forgotten now;
  a stuck entry cannot wedge the restart path, because that path bounds its own grace
  (`shouldSkipRestartForBusySessions`, 2 min) and restarts immediately when the runtime process is gone.

- **`397407a1`** — the session-cleanup latch was cleared from inside the run, and the disabled/loading/
  cooldown skips return before the first `await`: an async function that returns before awaiting finishes
  synchronously, so `finally` cleared the latch before the next line assigned the run to it. The latch
  held an already-settled promise and every later cleanup replayed that first skip — one click while the
  session list was loading disabled retention for the rest of the window. It is released from a handler
  attached after the assignment.

- **`6ee3c372`** — `persistSettings` logged the raw request body before the strip that exists for
  `desktopUiPassword` and `desktopLocalClientToken`, so those values were printed verbatim to server
  stdout on every settings write. The log now uses the same redacted view (AGENTS.md forbids raw
  credentials in logs).

- **`f9e2cbb6`** — the docker entrypoint ran `serve`, which spawns the server detached and exits, then
  made `cli.js logs` PID 1: a crashed server left the container running and the restart policy never
  fired, and SIGTERM reached the follower. It now execs `serve --foreground`.

- **`80598ff2`** — `find_release_run` accepted any run whose `headSha` was the release commit, including
  the run from the push that put that commit there. Watching that already-finished run returned
  immediately while the tag's own build was still running. A same-commit run is accepted only when it
  started at or after the tag push, and the selection moved into a tested module.

Suspected, verified by reading, not fixed:

- **MCP entries without the field their `type` requires** — `createMcpConfig`/`updateMcpConfig`
  persist `{type: "remote"}` with no `url` or `{type: "local"}` with no `command` and answer success,
  while the code's own comments call those fields required. The UI refuses to submit either shape (`McpPage.tsx:951-957`), so the API-level laxity
  is not reachable from the app, and `buildMcpEntry` is a normaliser over a hand-editable config file —
  tightening it is a decision, not a fix.
- **`script/runtime-manifest.cjs:84`** — native binaries are excluded from the runtime manifest by the
  generator *and* rejected as entries by the verifier, so replacing the bundled `node` or adding an
  `addon.node` passes `verifyBundledAxCodeIntegrity` on Linux. Covering them means hashing ~90 MB at
  startup (or a second signed list) — a security and startup-cost decision, not a local guard.
- **mermaid `file://` URLs (`ToolOutputDialog.tsx:700-704`)** — `normalizeFilePath` accepts any absolute
  path. The only production caller passes a `data:` URL today, so the branch is unreachable; it needs the
  workspace-containment decision below if a caller ever passes a file URL.
- **absolute-path `@`mentions (`chatInputMentions.ts:311-320`)** — a typed `@/etc/passwd` becomes a
  server attachment read by the runtime, with no workspace containment; the app's own `/api/fs/*` routes
  answer "Path is outside of active workspace" for the same path. The user types the path themselves, and
  attaching a file outside the project may be intended, so whether mentions should be confined is a
  product decision.
- **`sync/soft-removal.ts:389`**, **`sync/soft-removal.ts:223`** — unchanged from round seven: both are
  decisions about who owns the pending-removal slot, and the outcome is benign.

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

- **`b98f757b`** — `trimSessions` protected only sessions with a pending permission or question, so a
  session that is working and has the smallest id was spliced out of `state.session` as soon as the list
  grew past its limit (a subagent appearing was enough, since children count against the same array).
  Every lookup by id starts from that list, so the session the user was watching left the sidebar and the
  lookups, and each later event for it re-inserted it only to be trimmed away again. The trim uses the
  ids the cache eviction already protects.

- **`69e72884`** — the directory status resync applied its HTTP answer without looking at what changed
  since the request went out. A run that starts outside `optimisticSend` (shell mode, a scheduled task,
  another client) sends `session.status{busy}` while that request is in flight, and the answer, computed
  before it, carries `idle`: the session showed idle — no working indicator, no Stop button — until the
  next poll. Only `promptRecentlyAccepted` protected a newer status and only `optimisticSend` sets it,
  while the question and permission resyncs in the same file compare before/after signatures for this
  reason. The resync records the candidates' statuses before the request and drops the entries whose
  status moved meanwhile.
- **`8867eade`** — the cross-window dispatch claim and the write that persists a queued message's retry
  id are not atomic, and both windows mint an id before claiming: each then sent its own, so in the
  interleaving the shared id exists to survive the server saw two ids and delivered the prompt twice.
  The dispatch reads the id back from the entry after claiming.

### Suspected, verified by reading, not fixed

- **`sync/soft-removal.ts:389`** — this window's pending-removal slot has two writers with different
  ideas of what belongs in it: `persistPending` mirrors the store's `pendingRemoval` map, and
  `recoverPendingRemovals` ends by writing only the entries it could not commit. A soft-delete during
  the launch recovery overwrites the recovery failures, and the recovery's final write erases a removal
  made while its requests were in flight — in both directions the user's delete can fail to stick if the
  app quits inside the undo window. The outcome is benign (the session reappears; nothing is destroyed),
  and the fix is a decision about ownership — separate keys for live removals and recovery failures, or
  one writer that derives the slot from both sources — rather than a local guard.

Round six and seven are complete: every confirmed finding is fixed.

## Verification

- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass. The round's twenty commits answer twenty-one findings — one fix spans a pair of commits, and two fixes each
  answer a pair of findings. The assertions are behavioural almost everywhere: the notification runtime through its
  own trigger surface, the migration through a real projects directory and marker file (including a write that
  fails once), the codex TOML and the SSE envelope through their parsers, the notification stream through the route
  harness and the emitter's client set, the directory websocket bridge through the real runtime and a fake socket,
  the skill helpers against a real directory and a real symlink, and the terminal stream through a real session
  with a mock pty whose `pause`/`resume` are counted. The one source-level assertion is the pending-toast wiring,
  where `handleEvent` is private to the provider and mounting it needs the SDK, the child stores and the event
  pipeline — the same seam the config editors' and `PlanView`'s contracts use, and it now covers the branch that
  the previous version of it missed.
- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass — nine defects across seven commits. The assertions are behavioural: the diff-layout store through the public
  store, the chat preview through a probe hook plus the two call sites' sources, the timeline dialog through a
  mounted dialog with the SDK and the stores stubbed, the convergence migration through a real projects directory
  and marker file, the skill helpers against a real directory and a real symlink, the notification runtime through
  its own trigger surface, the SSE fan-out through a set of clients, and the terminal env through the sanitizer.
- One of the nine has no behavioural red light and says so: `e02d553f` removes a predicate that could never fire
  (`undefined === 0` on a `Set`'s `length`, in a loop that cannot see a project with nothing to remove). Its test
  passes either way and was written to fail if the invariant behind that goes away.
- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass — twelve defects across eleven fix commits, plus one correction to this round's own test. The assertions are
  behavioural: the preview command through the detector with the runtime APIs stubbed, the worktree guard through
  two calls in one tick and a short real timer, the integration count through the resumed flow with `execCommand`
  mocked, the autosave hand-over through the real module order with persistence mocked, the store read through the
  route harness, the sign-out through the controller, the reset through a secret write that fails once, the cache
  key through a round trip, the conflict decision through a fixture skill directory, and the ClawdHub paths through
  the registry and ZIP fixtures they already had.
- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass — with one exception, stated plainly: the multi-run agent picker's subscription has no red-light test, only
  the reasoning that its sibling selectors were fixed the same way, and its commit says so. The others are
  behavioural: the passkey count and the reset order through two seeded stores, the ClawdHub slug through the ZIP
  fixtures, the registry bound through the fetch call, the route guards through the route harness (three of them
  answering 200 before the fix), the token file's mode through a stat with chmod made to fail, the CLI's missing
  password value through `parseArgs`, and the process group through a real detached leader and its child.
- Latest full run, in the thirty-eighth round, after `3bed167c`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 185 (+6 skipped),
  electron 600, ui 2 999, web 1 340 (+2 skipped), 0 `FAIL` lines. Two full runs before this one each lost one
  `plugin-routes.test.js` case (a different one each time); both pass alone, and the next full run was clean — the
  documented wall-clock family, now on its third appearance for this file.
- Latest full run, in the thirty-eighth round, after `251cf277`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 185 (+6 skipped),
  electron 600, ui 2 999, web 1 340 (+2 skipped), 0 `FAIL` lines. `pnpm run build` also exits 0 on this tree.
- Latest full run, in the thirty-seventh round, after `1c398e0b`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 185 (+6 skipped),
  electron 600, ui 3 000, web 1 340 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-sixth round, after `8e017639`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 184 (+6 skipped),
  electron 600, ui 2 998, web 1 340 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-fifth round, after `490d6db3`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 183 (+6 skipped),
  electron 600, ui 2 995, web 1 338 (+2 skipped), 0 `FAIL` lines. The first full run of the round lost
  `layout.test.ts`'s wall-clock case; the rerun after the best-of-three change was clean.
- Latest full run, in the thirty-fourth round, after `d288f1c0`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 182 (+6 skipped),
  electron 600, ui 2 993, web 1 336 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-third round, after `81ff4b7c` (the audit of this round's own fixes): `pnpm run
  typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 —
  root scripts 180 (+6 skipped), electron 600, ui 2 990, web 1 334 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-third round, after `63b647ef`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 987, web 1 333 (+2 skipped), 0 `FAIL` lines. Two findings have no red light here and say so:
  the Windows test gating (this machine is macOS), and the fusion refusal, which is deliberate.
- Latest full run, in the thirty-second round, after `167e7457`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 981, web 1 331 (+2 skipped), 0 `FAIL` lines. Every finding of the round now carries a
  red-light test.
- Latest full run, in the thirty-second round, after `063782f3`: `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 981, web 1 330 (+2 skipped), 0 `FAIL` lines. This is the first run of this stretch without a
  wall-clock flake.
- Latest full run, in the thirty-first round, after `b9c76f85` (the last two red lights): `pnpm run typecheck` 0,
  `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts
  180 (+6 skipped), electron 600, ui 2 980, web 1 330 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-first round, after `82b7a710` (four more of the audit's findings): `pnpm run
  typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 —
  root scripts 180 (+6 skipped), electron 600, ui 2 980, web 1 328 (+2 skipped), 0 `FAIL` lines.
- Latest full run, in the thirty-first round, after `6e482e8a` (three of the audit's findings): `pnpm run typecheck`
  0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts
  180 (+6 skipped), electron 600, ui 2 979, web 1 327 (+2 skipped), 0 `FAIL` lines. The four findings the second
  audit confirmed are recorded above and not yet fixed.
- Latest full run, after the eighth carried-forward fix (`65b4a080`): `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 979, web 1 326 (+2 skipped), 0 `FAIL` lines.
- Latest full run, after the seventh carried-forward fix (`6e178590`): `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 979, web 1 325 (+2 skipped), 0 `FAIL` lines.
- The run before it, after `fcb5c94d`, was **not** green: the typecheck step failed (`EXIT_STATUS=2`) on the test
  that commit added, whose `searchFiles` mock was typed as taking no arguments (`TS2493`), and this series' summary
  of that run said the gates were green — a misreading of the log, where the `0` quoted belonged to the lint step
  and the `2` above it to the typecheck. `6e178590` types the mock and uses both of its arguments; the correction
  is recorded here because a summary that says "green" over a failing gate is worse than the failure.
- Latest full run, after the fifth carried-forward fix (`03b334f6`) and its test update (`06873447`):
  `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 978, web 1 325 (+2 skipped),
  0 `FAIL` lines. The run before the test update failed the electron package's own entrypoint test, which asserted
  the argv form the fix removed: a fix that changes a contract a test encodes has to update that test, and the
  gate is what showed the one that existed (the review had reported the entrypoint as untested).
- Latest full run, after the fourth carried-forward fix (`da178739`): `pnpm run typecheck` 0, `pnpm run lint` 0,
  `pnpm run test` 0, `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped),
  electron 600, ui 2 978, web 1 325 (+2 skipped), 0 `FAIL` lines. The run before it failed one web test
  (`terminal/runtime.test.js` > "keeps the cap when the replaced session leaves on its own during the spawn"),
  which passes alone (25 tests) and passed in this run: a timing flake of the shape this record already notes,
  not a regression from the change under test. The run after that failed a different web test
  (`ax-code/plugin-routes.test.js` > "GET /registry forwards refresh true to npm lookup"), which also passes alone
  (30 tests): two different files in two consecutive full runs, so the flake is not one test's. With the `401`
  entry below that makes three files, all in the web package, all passing alone and all failing only inside the
  full run — a suite-under-load family rather than three bugs. The web package configures no pool or isolation of
  its own, so vitest's defaults (isolated forks) apply; what the three share has not been reproduced outside a
  full run. The bisect that settles it was run: the web package alone, twice in a row, is green both times
  (135 files, 1 325 tests, exit 0) and takes about 30 seconds a run — where the same suite inside the four-package
  turbo run has the electron and ui packages compiling and running beside it. So the family is not cross-file
  state: it is wall-clock margin. Each of the three has a bounded wait in it (the terminal one arms a spawn and
  waits for the replaced session to leave; the registry one arms a cache and asserts the refresh that follows; the
  `401` one waits on a mutation that is answered by a mounted guard), and under CPU saturation one of them loses
  its race to `testTimeout`. What that asks for is the fix this record applies elsewhere: assert on the observable
  effect instead of sleeping, or drive the clock — not a re-run.
- Latest full run, after the three carried-forward fixes (`1a6f6118`, `5649bb29`, `9f5dda5c`) and the test
  robustness change (`1efed504`): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0, `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600,
  ui 2 978, web 1 323 (+2 skipped), 0 `FAIL` lines. The run before it failed five ui tests, and two of them were
  this series' own: the re-entrancy tests passed alone and were order- and load-dependent together (one left a
  fire-and-forget attempt holding the module's claim, the other raced a 50 ms timer against it), which only the
  full run shows. They release what they arm now.
- Latest full run, after the thirtieth round's fixes (each command's exit status captured, not inferred from a
  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 978, web 1 318 (+2 skipped),
  0 `FAIL` lines. The lint run's only output is the pre-existing `react-hooks/exhaustive-deps` warning in
  `ui/src/sync/use-sync.ts`, and the `401` flake did not appear.
- Two reviewers read the process entry points independently and converged on the same first finding — the
  `--ui-password` value that could go missing — while the rest of their lists differed; that scope had never been
  read before, and its remaining confirmed items are carried above rather than fixed blind.
- Latest full run, after the twenty-ninth round's fixes (each command's exit status captured, not inferred from a

  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 971, web 1 309 (+2 skipped),
  0 `FAIL` lines. The lint run's only output is the pre-existing `react-hooks/exhaustive-deps` warning in
  `ui/src/sync/use-sync.ts`, and the `401` flake did not appear.
- Two cells of this round are worth recording for their shape rather than their findings. The first Claude audit
  exited 0 after writing 22 bytes — its marker and nothing else — which the helper reports as `SUSPECT` rather than
  as a cell that finished; it was re-run on `MiniMax-M3` and that run read every hunk and reported no confirmed
  bugs. And the round-28 server cell that had not written its marker for twenty minutes was not dead: it finished
  its read and answered with four findings, the suite's second review of the same four trees found four more (two
  of which that first cell had missed), and the whole scope is now clean twice over.
- Latest full run, after the twenty-eighth round's fixes (each command's exit status captured, not inferred from a
  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 967, web 1 300 (+2 skipped),
  0 `FAIL` lines. The lint run's only output is the pre-existing `react-hooks/exhaustive-deps` warning in
  `ui/src/sync/use-sync.ts`, and the `401` flake did not appear.
- Latest full run, after the twenty-seventh round's fixes (each command's exit status captured, not inferred from a
  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 960, web 1 295 (+2 skipped),
  0 `FAIL` lines. The lint run's only output is the pre-existing `react-hooks/exhaustive-deps` warning in
  `ui/src/sync/use-sync.ts`, and the `401` flake did not appear. This run covers all 22 fixes the round produced,
  the last eleven of them after a second pass over the round's own work.
- The first attempt at that run is the reason the sentence above spells the requirement out: the loop piped each
  command into `tail`, so the status it recorded was the pipeline's last stage and every line read `0`. It was
  caught by reading the captured output rather than the statuses — the test counts were there, the per-command
  statuses were not the commands' — and the run was repeated with the command's own status captured. The same
  distinction the batch helper for the reviewer cells makes between a cell that finished and one that failed.
- Latest full run, after the twenty-sixth round's fixes (each command's exit status captured, not inferred from a
  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 950, web 1 280 (+2 skipped),
  0 `FAIL` lines, 14 locales / 4 802 keys / 62 426 translated entries. The lint run's only output is the
  pre-existing `react-hooks/exhaustive-deps` warning in `ui/src/sync/use-sync.ts`. The `401` flake did not appear.
  This run covers the fourteen fixes the round produced, including the second audit's five.
- Two rounds of harness trouble in this one, both caught by requiring every expected `out-r26-*.txt` to exist and
  to carry an `EXIT` marker rather than by reading a batch's status: the `sync`/`stores` cell's first model died on
  a provider cooldown ("all eligible credential slots are cooling down"), and two later cells' processes
  disappeared without writing their marker at all (their files held startup traces, which read as "still
  running"). Both were re-run — the sync review on MiniMax-M3, the second audit on the Claude Code CLI — and the
  helper is what showed the difference between a cell that finished, one that failed, and one that is still
  going. The re-run of the second audit ended the same way — its process was gone and it never wrote its marker,
  after it had produced all five findings and then tried to write a report of its own into a directory that does
  not exist; its output file holds the complete answer, which is what this record is built from.
- Latest full run, after the twenty-fifth round's fixes (each command's exit status captured, not inferred from a
  pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 600, ui 2 939, web 1 276 (+2 skipped),
  0 `FAIL` lines, 14 locales / 4 802 keys / 62 426 translated entries. The lint run's only output is the
  pre-existing `react-hooks/exhaustive-deps` warning in `ui/src/sync/use-sync.ts`. The first full run of this set
  failed one web test — see the `401` flake below — and both the web package alone (1 276 + 2 skipped) and the
  full suite were re-run green, which is the run recorded here.
- The `401` flake again, and now with a quiet machine: `server/lib/ax-code/config-entity-routes.test.js` "still
  reports 500 for an unexpected mutation failure" answered `401` where `500` is expected, a response no app in
  that tree can produce (its shared guard is not mounted by any of these test apps). It passes alone (7 tests),
  and the web package and the full suite pass on the next run. This is the sixth file to show the signature
  recorded in the twenty-second round; the mechanism is still unexplained and the note there stands.
- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass. The assertions are behavioural wherever the module has a surface a test can drive — `stageHunk`,
  `mergeChildSessionMessages`, `toAbsoluteToolPath`, both skill installers' backup directories, `BranchSelector`
  through a deferred `getRootBranch`, `FileMentionAutocomplete` through a pending search, the scrollbar through a
  rendered thumb and pointer events, the `PlanSaveQueue`, the notification runtime, `resolveSpawnInvocation`,
  `collectNativeSearchResults` and the app-protocol rewrite — and against the source where the component cannot be
  rendered (`AgentsPage`, `CommandsPage`, `PlanView`, `ChatInput-impl`, `TurnChangedFilesDropdown`), as the earlier
  rounds did.
- Latest full run, after the twenty-fourth round's fixes (each command's exit status captured, not inferred from
  a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 597, ui 2 928, web 1 271 (+2 skipped),
  0 `FAIL` lines, 14 locales / 4 802 keys / 62 426 translated entries. The lint run's only output is the
  pre-existing `react-hooks/exhaustive-deps` warning in `ui/src/sync/use-sync.ts`. One intermediate
  `check:boundaries` run failed: the *store* boundary check (R2) rejected `taskToolSummary.ts` importing
  `areMessagesEqual` from `event-reducer`, which the focused `check-desktop-boundaries` run this round used does not
  cover; `723f0822` moved the helper into `src/sync/optimistic.ts` and the gate is green in the run above. The
  `401` flake recorded below did not appear in this run; every reviewer process had finished first.
- Every fix in this round carries the regression test named in its commit, and each was verified by running that
  test against the pre-fix source and observing the stated failure, then against the fixed source and observing it
  pass. The assertions are behavioural where the module has a unit surface
  (`declaredFileSections` through `stageHunk`, `findCaseInsensitiveMatch`, the turn-window model,
  `mergeChildSessionMessages`, `toAbsoluteToolPath`, both installers' backup directories, `BranchSelector` through a
  deferred `getRootBranch`, and `FileMentionAutocomplete` through a pending search) and against the source where the
  component cannot be rendered (`AgentsPage`/`CommandsPage` and `PlanView`, as the earlier rounds did).
- Latest full run, after the twenty-third round's fixes (each command's exit status captured, not inferred from
  a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0 — root scripts 180 (+6 skipped), electron 597, ui 2 907, web 1 266 (+2 skipped),
  0 `FAIL` lines, 14 locales / 4 800 keys / 62 400 entries. The first run of this set failed twice and neither was
  the code under test: three `no-unused-vars` errors in the round's own new test (fixed in `d7a98647`) and
  `server/lib/ax-code/cli-install.test.js` "accepts an upgrade with 202" answering 401 — the same load-related
  signature as the other flakes below, and the file passes in isolation. The run above, with the machine quiet,
  is the one to read.
- Latest full run, after the twenty-second round's fixes (each command's exit status captured, not inferred
  from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 597, ui 2 895, web 1 262
  (+2 skipped), 0 `FAIL` lines. The first run of this set failed one test,
  `server/lib/quota/routes.test.js` "returns the providers the quota module lists" (200 expected, 401
  answered) while four reviewer processes were still finishing; it passes in isolation and the run above,
  with the machine quiet, is the one to read.
- Latest full run, after the twenty-first round's fixes so far (each command's exit status captured, not
  inferred from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 595, ui 2 880, web 1 262
  (+2 skipped), 0 `FAIL` lines. The Grok CLI's release-machinery review was still running; any finding it
  returns is fixed and the gates re-run before that round is closed.
- Latest full run, after the twentieth round's fixes (each command's exit status captured, not inferred
  from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 595, ui 2 878, web 1 258
  (+2 skipped), 0 `FAIL` lines. The tree also carries another session's feature commits; `ec581ab8` says
  what they added.
- Latest full run, after the nineteenth round's fixes (each command's exit status captured, not inferred
  from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 595, ui 2 876, web 1 240
  (+2 skipped), 0 `FAIL` lines. The ui and web totals are larger than the eighteenth round's because six
  feature commits from a sibling session landed on this branch between the two runs (a project Issues & PRs
  board, hunk staging, mention attachments, message search, scheduled-task run history, and one web fix);
  the run covers that tree, not only this series' work. The individual suites this round touched were also
  run on their own: `server/lib/ax-code/` 462 passed in 48 files.
- Latest full run, after the eighteenth round's fixes (each command's exit status captured, not inferred
  from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 595, ui 2 780, web 1 200
  (+2 skipped). As before, the lint run's only output is the pre-existing
  `react-hooks/exhaustive-deps` warning in `ui/src/sync/use-sync.ts`. (Round 17 alone: the same four
  commands, recorded inside this run.)
- The rounds 17 and 18 fixes each carry the regression test named in their section, and each was verified by
  running that test against the pre-fix source and observing the expected failure: `expected … to be called
  1 times, but got 2 times` and `expected [ '-ti', ':45678' ] to include '-sTCP:LISTEN'` (98effbe3),
  `expected "vi.fn()" to be called 1 times, but got 0 times` (724d9f4e), `Error: Test timed out in 3000ms`
  for the in-flight win32 launch (45d7e083), `AssertionError: promise rejected "Error: ENOENT…" instead of
  resolving` for the deleted storage destination (6935eb59), `AssertionError: expected [ '…3000/' ]` versus
  `[]` for the sentence-final URL (70c6327e), and `AssertionError: expected 'body' to contain 'aaaa…'`
  for the dropped plan-title overflow (2879fcf8).
- Latest full run, after the fifteenth round's fixes (each command's exit status captured, not inferred
  from a pipeline): `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run test` 0,
  `pnpm run check:boundaries` 0 — root scripts 180 (+6 skipped), electron 595, ui 2 778, web 1 193
  (+2 skipped). (After the sixteenth round: the falsification pass and the session-folder validation it
  turned up, and the expiry added to the project-knowledge cache.) The lint run's only output is a pre-existing `react-hooks/exhaustive-deps` warning in
  `ui/src/sync/use-sync.ts`.
- Two runs during that round failed one test each, both of the load-related kind below and both green in
  isolation: `server/lib/ax-code/dev-shutdown-auth.test.js` "refuses an unauthenticated caller…" (a
  `Parse Error: Expected HTTP/…` from a raw socket) and `plugin-routes.test.js` "DELETE /file/:id unlinks
  file" (200 expected, 401 answered — the same signature as the `routes.test.js` flake recorded here).
  Each one failed while a reviewer process was running and passed twice on its own; the run above, with
  nothing else on the machine, is the one to read.
- The twelfth round's own run, for the record: typecheck 0, lint 0, test 0, boundaries 0 — root scripts
  180 (+6 skipped), electron 595, ui 2 757, web 1 141 (+2 skipped).
- Final state after the ninth round, with each command's exit status captured rather than inferred
  from a pipeline: `pnpm run typecheck` 0, `pnpm run lint` 0, `pnpm run check:boundaries` 0,
  `pnpm run check:locales` 0. `pnpm run test` reported one failure in its last full run — the
  `core-routes.test.js` flake below — and every suite passed with the machine idle afterwards
  (typecheck 0, lint 0, test 0, boundaries 0; web 1 124, ui 2 743, electron 594, root scripts 179).
- Test totals at that run: ui 2 752, web 1 136 (+2 skipped), electron 594, root scripts 179
  (+6 skipped). `pnpm run check:locales` reports 14 locales, 4 695 keys and 61 035 translated
  entries; the ninth round added one key (`sessions.sidebar.session.export.failed`), translated in
  every catalog.
- `pnpm run check:boundaries` passes in full: desktop boundaries, store
  boundaries, electron runtime, endpoint contracts, IPC contracts, package test
  scripts, no sibling dependencies, source ownership, runtime pin, release policy
  and release contract.
- `pnpm run build` passes (3/3 turbo tasks) — last run before the ninth round; that round touched no
  bundling input.
- **The web package's timing-sensitive tests fail while the machine is CPU-starved, and only then.**
  Four full-suite runs that overlapped six parallel reviewer processes each failed a *different* test —
  `routes.test.js` "deduplicates concurrent prompt_async requests" (the second response came back 401),
  `routes.test.js` "answers a runtime that stopped answering" (the mocked `fetch` was never reached),
  `core-routes.test.js` "should call gracefulShutdown" (never called; that test asserts no status, so a
  4xx/5xx under load looks the same) and `config-entity-routes.test.js` "answers a name that exists
  nowhere" — while every one of those files passes in isolation (9 runs for `routes.test.js`) and two
  consecutive full runs with the machine idle pass, 1 117 tests each. Each failing test does real HTTP
  through supertest, or races two requests against a fetch it releases by hand, or waits on a 250 ms
  deadline, so a starved CPU closes its window. Nothing in this series touches those paths; the three
  tests that assert no response status could be hardened to say why they failed.
- Two follow-up commits fix defects in this series' own output rather than in the
  product: `1359da50` moves the change list's prefetch effect off a per-render
  array (a hooks-lint warning and a redundant parent notification), and `2b27bd59`
  types the github test's fetch mock (an unused-parameter lint error and a
  zero-length tuple that failed `tsc`). The ninth round's audits played the same
  role for the eighth round's commits, and five of their findings are fixed above.

