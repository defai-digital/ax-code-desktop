# Upstream comparison — openchamber fixes our fork does not have

The fork point is older than the reference clone: `.internal/reference/openchamber`
carries 4 835 commits (the README's `--depth=1` note is out of date) and its newest
is `release v2.3.1` from 2026-10-13, while our `desktop/` has been developed
independently since the extraction. Upstream has therefore fixed defects we still
have, and the same defects can be found by comparing rather than by reading.

## Follow-up pass: the commits that landed after the pass above

Rerun the same day, over the 58 commits upstream landed after 2026-10-13 (the newest
at the time being `d648bdedf`, 2026-10-16) — about 29 of them `fix(...)`. The same
method applies: read each diff, map its paths onto ours, keep it only when the file
exists and still contains the fix's context lines verbatim and none of its added
lines. Two commits survived that test and our tree had the defect:

- `2698eb8a` **The Changes header kept its layout only for the files on screen.**
  `openchamber 0ceac5c964545a829f7716184dbd9e47e6a7323a`. The header wrote a
  per-file override and never touched the Appearance setting, so a file that
  appeared later, another session or the next launch opened inline again while the
  setting still showed the old choice.
- `16998525` **Chat diff previews ignored the layout setting.** `openchamber
  1cd03296e2700f820b64e31fb009d10b1ab7cd6a` (its functional half; the separator
  tint and the toggle's localized label in the same commit are cosmetic and were
  not ported). Both the transcript preview and the tool output window hard-coded
  `unified` and reset to it whenever the preview changed.

Discarded, with the reason:

- **Features our fork does not have**: spaces (7 commits), guests, the VS Code and
  JetBrains shells, `session-work`, mobile and the phone List.
- **Cosmetic or build**: dark-theme body text, the command palette's icon for Run in
  parallel, red confirm buttons' label, the diff separator tint, the diff toggle's
  `aria-label`, the TypeScript 7 / oxlint migration, the dependency bumps, the Linux
  `.deb`/`.rpm` packaging feature.
- **Our code already handles it differently**: the usage-credit display and the
  sidebar's sub-agent handling have no counterpart here.

One limitation remains in the clone itself — it is fetch-shallow per ref, with 42 boundary
commits, so a branch tip whose parent object is absent cannot be diffed locally. Six of the
29 fixes above were in that state. Their patches were read from the GitHub API instead
(`GET /repos/btriapitsyn/openchamber/commits/<sha>`), which needs no local parent:

- `c7bd084b6` **Enter in an empty message box sends the queue.** Our composer already does:
  `handleSubmit` proceeds when the queue is non-empty even with no input, and the `if (!hasContent)
  return` the fix removes never existed here. No change.
- `d3228344e` **Export Markdown from a flat row offers its subtasks.** Our tree had the exact
  pre-fix shape — the dialog was gated on the rendered node's `children.length`, and Live and
  recent rows render `{ session, children: [] }`. Fixed in `63b647ef` by resolving the tree from
  the global sessions cache when the user acts.
- `e7ffa604a` (move to worktree takes the subagents) and `d15a4dbd5` (the composer keeps typed
  text when a session moves to another worktree): our sidebar has no move-to-worktree action, so
  neither applies.
- `fe644985a` (draw assistant images saved anywhere) and `f53dff3d0` (the credit balance was 100×):
  both fixes live in the OpenCode runtime's own modules (`markdown-image-grants`,
  `quota/providers/opencode-go`), which this repository consumes rather than owns. The same
  applies to `agent-tool/runtime.js` in the first of the two.

So every one of the 29 is now either fixed here or shown not to apply, and no deepened clone is
needed.

## Method

1. List upstream's `fix(...)` commits since 2026-09-01 — 932 of them.
2. For each, read the diff and map its paths onto ours
   (`packages/ui/...` → `desktop/packages/ui/...`, and likewise for `web` and
   `electron`). Keep a commit only when our file exists.
3. Keep it only when our file still contains at least three of the fix's
   *context* lines verbatim (so our code is that same code) **and** none of the
   fix's added lines (so the fix is not there). That narrowed 932 commits to 170
   file-level leads across 122 commits.
4. Five read-only reviewers each took 25 of those commits, read the upstream diff
   and our counterpart, and reported only cases where **our** tree has the defect.
   They filtered out styling, dependencies, wording, and features our fork does
   not have (mobile, spaces, guests, VS Code/JetBrains, relay/tunnel), and cases
   where our code already handles it a different way.

That produced 29 confirmed defects in our tree, and one more was found while fixing them.
The twenty-nine entries below are fixed; the 1 that remains is listed with the shape of its
fix so it can be picked up.

## Fixed

- `60cfcf9c` **A project icon response had no policy of its own.** An SVG icon is a
  document when opened directly, and the only CSP on it was the app's, which allows
  inline script — so an icon carrying one ran on the app's loopback origin, where a
  same-origin request reaches the API with the session cookie. Every icon response
  now carries `default-src 'none'; style-src 'unsafe-inline'; sandbox` and nosniff.
- `f585ac23` **Attached files were not scoped to a session.** One process-wide list
  plus a composer that is not remounted on a session switch meant files attached in
  one session showed in the next one's composer and were sent with its prompt. The
  store now holds the list per draft identity and swaps it on a switch.
- `09fe3795` **A branch name written in any script was destroyed.** Both inputs
  sanitised with an ASCII whitelist instead of git's forbidden set: `测试分支`
  became empty (the create button then did nothing) and `feature/测试` became
  `feature` — a different branch. Now one shared rule, faithful to git.
- `bc5f6635` **A repository whose top level is the home directory or a filesystem
  root is refused.** Accepting one made every Git panel read run over the whole
  tree, with no timeout to abort it.
- `5fb78afc` **A tool a completed message left running is settled.** It used to come
  back active after every load, with a running timer and no event left to end it.
- `d81044dc` **The sidebar search stops filtering once its field is hidden.** The
  list used to stay filtered by text that was no longer on screen.
- `254ea7fd` **The always-failing "Reset" is gone, and a hidden agent backed by a
  file stays manageable.** One menu item could never succeed; the other agent kind
  was unreachable in the UI.
- `bc030494` **A fallback snapshot no longer overwrites a session the store moved
  on** (marked done or archived), so a failed reload cannot put it back.
- `a6b9fb92` **Upstream reconnects back off** instead of retrying a down runtime at
  full rate, which re-read state every second from the daemon and every client.
- `be43532e` **A `.jsonc` document is previewed as JSONC**, so its comments and
  trailing commas no longer read as "Invalid JSON".
- `39f5267e` **An imported MCP server name is normalized** and a rejected create now
  reports the server's reason instead of "Failed to save".
- `982e13d7` **The New Worktree form initializes once per open.** Its reset effect was
  keyed on a slug generator derived from the worktree list, so a background worktree
  change replaced the typed branch name, issue and PR with a random slug mid-typing.
- `7be3d315` **A second restart-to-update click is ignored** while the install is in
  flight, instead of reporting the updater's refusal as a restart failure.
- `1c7a9585` **@ mentions follow the loaded agent list** rather than a getter whose
  identity never changes, so a popup opened while a directory's agents loaded kept the
  previous directory's.
- `265c6e73` **An image viewer measurement stays with its image.** The reset effect
  raced a cached image's load and wiped the size, leaving a frame whose margins
  swallowed the click that closes it.
- `878451f6` **The UI session cookie is keyed by the port the request arrived on.**
  Browsers key cookies by host, so two instances on one machine shared one cookie:
  the last login overwrote the other's token and the first tab was logged out.
- `c886a5cb` **A PR field's label no longer opens the branch select.** The wrapper
  was a `<label>` around a trigger that is a button, so clicking the caption or the
  whitespace beside it opened the list.
- `6896be7e` **Agent pickers show the runtime's display name**, instead of the
  capitalized id, so searching by the name the user knows finds the agent.
- `12015b00` **Revert All fans out at two**, instead of one request per path, which
  filled the connection pool and made the panel look hung on a large changeset.
- `4c285c15` **Removing a worktree releases the runtime's instance for it** before
  the directory goes, instead of leaving instances rooted at paths that no longer
  exist (best-effort: a refusal never fails the removal).
- `0413cd6f` **The Zhipu coding plan's `CREDIT_LIMIT` is read**, and a failure the
  monitor API reports inside an HTTP 200 body is answered as an error with its own
  message, instead of an empty card with no reason.
- `55bc0ba2d` **A collapsed user message can be expanded without a click.** Its only
  control was the clipped text itself, which a keyboard or a screen reader never
  reaches.
- `9282df961` **The @ list drops recent files that are gone.** A file deleted or renamed
  after it was opened kept its tab, so the list went on offering it and choosing it
  inserted a path that is gone. Each candidate is checked once per project: a path whose
  entry is no longer a regular file, or whose stat fails because the file is missing, is
  dropped; any other failure keeps it.
- `a1f1156c1` **A missing or deleted file keeps its tab and reports the failure**
  (upstream issue 4477). A failed read closed the tab, so the editor fell back to another
  open file while the panel still named the failed path, and nothing was reported at all.
- `1c9bfa1ab` (partly) **The editor rebuilds only what changed.** Every render
  reconfigured all six compartments, which rebuilds the gutters, re-measures the editor
  and re-parses the document — and the Files view hands over a fresh line-number config
  and fresh highlight lines on every render, once per keystroke while typing. Each
  compartment is now reconfigured only when its input changed, and the gutter width is
  read in CodeMirror's measure phase instead of forcing a layout on every update.

- `bcaf5e3d5` **The Find panel no longer covers the first lines.** It floats over the top
  of the editor, so at the top of a file it hid the lines a search started from the top is
  looking at. While it is open the content carries a top padding as tall as the panel, and
  the space scrolls away with the text.

- `bc798178b` **Staged and unstaged line counts stay in their own scope.** The status
  returned one combined per-path map, so a file with edits in both the index and the
  working tree showed the same summed total on its Staged row and its Changes row. The
  status now reports `{ staged, working }` and each surface reads the scope it shows.

- `bdf2da86f` **A new worktree runs the project's start command again.** It read the
  command from `<data dir>/storage/project/<id>.json`, the format the runtime migrated from
  and no longer writes, so the command never ran. It now comes from the runtime's project
  record over `GET /project`.

- (no upstream commit) **A worktree branch rename shows the name it would use.** The field
  sanitized the name only when saving, so typing `feature a` for the existing `feature-a`
  looked like a rename and then quietly closed the editor, and a name that sanitizes to
  nothing was sent to git as an empty branch name. The field sanitizes as it is typed and
  the save button is off while the name is empty or already exists. Upstream has the same
  behaviour, so this is a defect of our tree rather than an upstream fix we lack.

## Confirmed in our tree, not yet fixed

Ordered by severity. Line numbers are where the defect lives today.

1. **The context meter shows the compaction request's fill**
    (`ui/src/lib/messages/assistantTokens.ts:25`): after `/compact` the newest
    token-bearing assistant message is the summarising request itself. Deferred: our SDK
    carries compaction as a message part rather than the assistant message's `summary`
    field, so there is no request to read the fill from, and what the meter should show
    after a compaction is a product decision.

## Upstream fixes in the same module, checked later and not adopted

Upstream rewrote this module (`packages/ui/src/stores/utils/tokenUtils.ts` there, our
`ui/src/lib/messages/assistantTokens.ts`) around two readers we had not seen when the
list above was written. Both were checked against our counterpart after the fact:

- **The unguarded sum.** `getAssistantTokenTotal` summed `reasoning` and `cache` without
  a guard, so a partial payload produced NaN and the `total <= 0` guard admitted it, and
  the meter rendered NaN%. Upstream's `sumTokenBreakdown` defaults every field, which is
  the same fix; ours is `6aae3c7c`, which now also normalizes the tokens it returns.
- **Preferring `tokens.total`.** Upstream treats the server-reported `total` as the window
  the context really holds and sums the fields only when it is absent, because `cache.read`
  accumulates across a turn's round-trips. We did not adopt it: our runtime accumulates
  `total` across a turn's steps the same way it accumulates the fields
  (`assistantMessage.tokens = { total: (usage.tokens.total ?? 0) + (assistantMessage.tokens.total ?? 0), … }`
  in `desktop/packages/electron/dist/mac-arm64/AX Code.app/.../index-node-tui.js`), and its
  own reader takes `Math.max(total, component sum)` (`effectiveTokenTotal`). Preferring
  `total` would therefore not correct the overstatement it corrects upstream, and which
  number the meter should prefer is the same product question as the compaction entry
  above. The step-level path still reports the newest finished step, which is the reading
  upstream's fallback produces on a single-step turn.
