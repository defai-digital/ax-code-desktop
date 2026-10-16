# Upstream comparison — openchamber fixes our fork does not have

The fork point is older than the reference clone: `.internal/reference/openchamber`
carries 4 835 commits (the README's `--depth=1` note is out of date) and its newest
is `release v2.3.1` from 2026-10-13, while our `desktop/` has been developed
independently since the extraction. Upstream has therefore fixed defects we still
have, and the same defects can be found by comparing rather than by reading.

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

That produced 29 confirmed defects in our tree. Three are fixed below; the rest are
listed with the shape of their fix so they can be picked up.

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

## Confirmed in our tree, not yet fixed

Ordered by severity. Line numbers are where the defect lives today.

1. **A git repository rooted at the home directory or a filesystem root is accepted**
   (`web/server/lib/git/service.js:1488`). `isGitRepository` only asks
   `rev-parse --git-dir`, so a home directory (or a drive root) with an accidental
   `.git` above it makes the Git view run `status` over the whole tree — minutes
   per refresh, and our `runGitCommand` has no timeout to abort it. Fix: also read
   `--show-toplevel` and refuse when it is the filesystem root or `os.homedir()`.
2. **The remove-worktree path never releases the runtime instance** that served it
   (`web/server/lib/git/service.js:3461`, `git/routes.js:1037`). Instances rooted at
   deleted paths accumulate until the runtime restarts, and a re-created worktree at
   the same path is served by stale state. Fix: best-effort `POST /instance/dispose`
   before `git worktree remove`, warn-and-continue on failure.
3. **The two UI session cookies are shared across ports** (`web/server/lib/ui-auth/ui-auth.js:8`,
   `security/request-security.js:16`). Browsers key cookies by host, not port, so two
   instances on one host overwrite each other's `oc_ui_session` and log each other
   out. Fix: derive the cookie name from the request's host, appending the port.
4. **A stale live copy overwrites a session the user marked done**
   (`ui/src/stores/useGlobalSessionsStore.ts:599`, `:626`). `mergeSessionLists` lets
   incoming win, so a list refresh that fails or times out brings the session back
   into "In work". Fix: append only sessions absent from both active and archived
   state, never overwrite by id.
5. **A tool part persisted as running in a completed assistant message stays live
   forever** (`ui/src/sync/materialization.ts:185`). After any cold load, an
   interrupted turn's tool card keeps its spinner and holds the message open; no
   later event will settle it. Fix: when materialising a part set from a completed
   assistant message, map an active tool state to a terminal one.
6. **Layout and word-case loss in file mentions**: the @ mention agent list is
   computed from a getter whose identity never changes
   (`ui/src/components/chat/FileMentionAutocomplete.tsx:68`), so it keeps the
   previous directory's agents until the query changes; and recent files are offered
   without checking they still exist (`:127`), so choosing one inserts a dead path.
7. **"Revert All" and "Generate" fan out without a bound**
   (`ui/src/components/views/GitView-impl.tsx:1742`): one POST per changed path at
   once saturates the connection pool and the panel appears hung. Upstream bounds it
   at two.
8. **The upstream SSE reader reconnects on a flat 1 s timer**
   (`web/server/lib/event-stream/upstream-reader.js:206`, `:341`). While the runtime
   is down, every reader re-reads state once a second, forever. Fix: exponential
   backoff with a cap.
9. **The editor's Find panel covers the first lines of the document**
   (`ui/src/components/ui/CodeMirrorEditor.tsx:426`): the theme positions the panel
   out of flow and nothing reserves its height.
10. **The editor reconfigures all six compartments on every render**
    (`ui/src/components/ui/CodeMirrorEditor.tsx:461`): a config object built inline
    upstream re-runs the effect and re-parses the document. Upstream diffs each
    compartment against the last applied one.
11. **A JSONC file cannot be previewed as a tree**
    (`ui/src/components/ui/JsonTreeView.tsx:32`): strict `JSON.parse` reports
    "Invalid JSON" for any `.jsonc` with a comment, though `strip-json-comments` is
    already a dependency.
12. **An imported MCP server keeps its capitals**
    (`ui/src/components/sections/mcp/mcpImport.ts:291`) and the create then fails
    with a generic "Failed to save" (`stores/useMcpConfigStore.ts:231` swallows the
    server's message), so the user cannot tell what was wrong.
13. **Hidden custom subagents cannot be managed**
    (`ui/src/components/sections/agents/AgentsSidebar.tsx:267`): filtered out of
    Settings → Agents entirely, so they can only be removed by hand.
14. **"Reset" is offered exactly where it can never work**
    (`ui/src/components/sections/agents/AgentsSidebar.tsx:122`): built-in agents have
    no override file to remove, so the action always ends in an error toast.
15. **The New Worktree dialog re-initializes when the worktree list changes**
    (`ui/src/components/session/NewWorktreeDialog.tsx:602`): the reset effect depends
    on a callback derived from that list, so a background worktree change while the
    dialog is open replaces the typed branch name, issue and PR with a fresh random
    slug.
16. **The restart-to-update button is not latched**
    (`ui/src/stores/useUpdateStore.ts:164`): a second click runs
    `quitAndInstall()` again, which Squirrel refuses after the services were already
    stopped, surfacing "install-not-started" on a dead runtime.
17. **An agent's `displayName` is ignored** (`ui/src/components/chat/ModelControls.tsx:1154`,
    `sections/commands/AgentSelector.tsx:93`): pickers and search show the
    capitalized id instead of the name the runtime supplies.
18. **A collapsed user message has no keyboard-accessible expand control**
    (`ui/src/components/chat/message/parts/UserTextPart.tsx:243`): the only way to
    read a long message is to click the clipped text.
19. **The PR base-branch field opens when its wrapper is clicked**
    (`ui/src/components/views/git/PullRequestSection.tsx:1913`): the block is a
    `<label>`, so clicking its whitespace activates the select inside it.
20. **The context meter shows the compaction request's fill**
    (`ui/src/lib/messages/assistantTokens.ts:25`): after `/compact` the newest
    token-bearing assistant message is the summarising request itself.
21. **Staged and unstaged line counts are merged into one number**
    (`web/server/lib/git/service.js:1642`): a half-staged file shows the same total
    on both its Staged and Changes rows.
22. **The image viewer's frame size is reset by a racing effect**
    (`ui/src/components/chat/message/ToolOutputDialog.tsx:376`): on a cached image the
    reset erases the measurement, and the empty margins swallow clicks.
23. **The worktree start command is read from a legacy file the runtime does not
    write** (`web/server/lib/git/service.js:1221`), so a new worktree runs no project
    start command at all.
24. **The Zhipu coding-plan provider matches only `TOKENS_LIMIT`**
    (`web/server/lib/quota/providers/zhipuai-coding-plan.js:99`) and ignores the
    envelope's in-body errors, so its card shows no windows and a rejected key reads
    as a successful empty card. The neighbouring `zai.js` shares the one-type match.
25. **The sidebar search keeps filtering after its field is hidden**
    (`ui/src/components/session/sidebar/hooks/useSessionSearchEffects.ts:36`): the
    query survives, so every group renders filtered by text that is no longer on
    screen and the empty state has no visible cause.
26. **The worktree branch rename field silently renames to a different name**
    (`ui/src/components/views/git/WorktreeBranchDisplay.tsx`): covered by the branch
    name fix above for the character set; what remains is that a sanitized name equal
    to the current one closes the editor without saying so.
