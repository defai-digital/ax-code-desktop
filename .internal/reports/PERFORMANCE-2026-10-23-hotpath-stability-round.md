# Hot-path review round: stability first, after the 2026-10-22 fixes

Date: 2026-10-23
Status: Items marked "shipped" are committed on `main`. Items marked "open" were reviewed and deliberately not changed. Nothing here reopens the settled decisions (no Rust, no event shedding, no DOM change for long open paragraphs).

## Method

Three read-only reviewers took disjoint slices against `d4b49a35`: codex (sync, event pipeline, transport), grok (renderer speed and startup),
ax-code deepseek-flash (Electron main, runtime supervision, terminal runtime; the files the 10-22 round never read). Every finding had to cite
`path:line`. The author re-read the code for the findings that were acted on. Implementation: codex (sync) and grok (renderer) in separate
worktrees; every fix has a regression test with a mutation probe. Cross-review by a different CLI than the author: deepseek reviewed codex's diff,
codex reviewed grok's diff, the author reviewed both and the deepseek-authored review items.

Limits: no Chromium trace or heap snapshot was taken, so renderer and memory gains are mechanism-level. The reviewers' sandboxes were read-only; codex's
probes were Node-level in-memory harnesses. One shared, loaded macOS host.

## Shipped

| Commit | Finding | Evidence |
| ------ | ------- | -------- |
| `f9f50201` | Closing a terminal sent SIGTERM and deleted the session entry at once; a shell that ignored it kept its port with no UI path to it (`terminal/runtime.js` `killTerminalProcess`). Now escalates to SIGKILL after 1 s unless the pty exits first (an exited pid can be reused, so the exit event cancels the timer). | `runtime.test.js` "terminal close escalation"; probe: escalation disabled, first test fails |
| `f9f50201` | After the runtime exhausted its restart budget the dialog offered only OK and every runtime route answered 503 until relaunch (`main.js` `showRuntimeRecoveryFailure`). Added Restart, calling the supervisor `restart({ reprepare: true })`, which resets the budget. | `axcode-runtime-supervisor.test.mjs` "restart() after exhaustion" |
| `f9f50201` | A graceful stop that needed SIGKILL left its `once("exit")` listener on the child. | same file; probe: `child.off` removed, test fails |
| `949baf1b` | A late HTTP snapshot resurrected messages and parts removed by a live event during the request, and wiped newer tool parts (`materialization.ts`). | ID comparison against the state captured at request start; 5 model tests failed on the old code |
| `949baf1b` | Reconnect with no local candidate never read server status, so work started by another client while offline stayed idle (`sync-context-impl.tsx` `resyncDirectoryAfterReconnect`). | codex probe: 0 status fetches before, 1 after |
| `949baf1b` | A second recovery trigger during a pass was dropped; now one trailing pass, keyed per store. A recovery that outlives its directory no longer writes the routing index back. | tests in `reconnect-session-snapshot.test.ts` |
| `949baf1b` | Status snapshot ABA: busy then idle during the request looked unchanged and an older busy answer was applied. The event stamp now takes part; `session.idle/error` stamp too. | bootstrap + reconnect model tests |
| `949baf1b` | A fully covered offset replay delta allocated a Part and reported a change; the routing index was consulted after an O(sessions) scan (500 sessions: 1,000 reads per two resolutions). | reducer and routing tests |
| `949baf1b` | The SSE stall watchdog started only after response headers, so a runtime that accepted the connection and never answered was never aborted (`upstream-reader.js`). | codex probe: 0 aborts after 65 ms with a 15 ms timeout |
| `ecdc6429`, `c33a117b` | Live markdown tail remounted `PreparedMarkdown` on every token (key contained length and a content hash); Review recap re-parsed every webmcp output on every directory update; the composer re-entered the highlighter loader on every keystroke inside a fence. | mounted-identity, parse-count and load-count tests, each with a probe |

### A design that was tried and replaced

codex's first fix for the snapshot problem dropped a whole record when its message or part reference changed during the request and then
re-fetched. The reducer builds a new parts array for every streaming delta, so for a streaming session every pass conflicted and the
recovery looped at HTTP round-trip rate for the length of the stream. Two reviewers found this independently (one by tracing, the author by
reading `PartMap`), plus two follow-on defects (the second pass discarded its own conflict; `setSessionPrefetch({ complete })` was written
before the conflict was known). The shipped version compares ids only (removed stays removed, live-added parts survive) and adds no passes;
a test asserts exactly one request pair per candidate while deltas stream.

### Defects found by cross-review in grok's first renderer version

`ecdc6429` was committed (and merged) by the implementer before review, against the brief. Codex found five defects; `c33a117b` fixes them:
the stable key also covered finished blocks (a non-append rewrite handed block A's preview state to block B; a failed favicon stuck to an updated
URL); the recap fingerprint ignored metadata, input and timing updates and a reused `callID` kept an old navigation target; a failed highlighter
import was never retried while the draft stayed fenced.

## Open

| Item | Why it stays open |
| ---- | ----------------- |
| Summary mode mounts every step of a long turn (`TurnItem` → `TurnAssistantBlock`; `TurnMessageWindow` is used only by the collapsed fold). grok, CONFIRMED by reading. | Not landed: a rail jump to a windowed turn puts the hidden-head spacer in the viewport and `useSpacerReveal` mounts every hidden step in one commit; summary never fills `activityMessageLocation`, so message find would not reveal the step; follow-the-tail needs a stored "auto range" contract that survives the streaming row's hand-over. Needs a design plus a Chromium trace with a 400-step turn. |
| Lost `message.removed` is not repaired by a full snapshot (union merge, `optimistic.ts:80`). | Safe pruning needs a consistent full snapshot or a server tombstone; a 30-item page cannot prove absence. |
| Status resync stamps `noteServerSessionStatus` for every applicable status including a confirmed busy that equals the optimistic one, so a failed send may skip the optimistic rollback (deepseek C3, `sync-context-impl.tsx:643`, `session-actions.ts:1046`). | Pre-existing, traced but not reproduced; needs its own test and a decision on which statuses count as "server spoke". |
| Reconnect binds its requests to the caller's directory and swallows errors, so a cross-directory 409 or a transient 5xx is skipped silently (deepseek C6). | Not reproduced. |
| Login-shell capture can delay the first window by up to 4 x 2 s (`login-shell-env.js`); a plain timeout fallback changes `runtimeSearchEnv`. | The fix is not free: the runtime binary search uses the same environment. |
| Terminal create waits a fixed 1,500 ms (`TERMINAL_SHELL_STARTUP_GRACE_MS`). | Measure `/api/terminal/create` first; the grace exists to catch a late shell crash. |
| Quit has no total deadline (about 19 s worst case), `startup-diagnostics` does a sync `mkdirSync` per event with no log cap, macOS `activate` does nothing while the server restarts, Windows `taskkill` is synchronous. | Each is small; none was reproduced. |
| Runtime survives a hard kill of main (no parent-death watchdog on the runtime spawn). | ADR-level design choice (a wrapper entry). Measure `pgrep -fl "ax-code serve"` after a main crash first. |
| Eviction selector is broad enough that a pool of four views with search inputs refuses with `pool-full`. | Log the false-branch reason for a week before touching the selector. |
| Items 8, 11, 12 and plan scanning from the 10-22 report. | grok re-measured: 0.02-0.5 ms per publication, tray 0.004 ms; keep as is. |
| Throttled re-parse for open tails above 32 KiB. | codex: measure first (8/32/64 KiB, 20 Hz, several owners) with `desktop/scripts/renderer-trace.mjs`; the stable-prefix omission already exists in `markdownWorkerParser.ts:81`. |
| Prism, `katex.min.css` and the locale IPC sit on the entry graph before first React render (bytes not measured). | Do it with the next change that touches the entry graph. |

## Verification

Main after `c33a117b`: full UI suite 678 files / 5,107 tests passed; Electron 99 files / 1,142 tests passed; `upstream-reader.test.js` 24 passed;
`pnpm run typecheck`-equivalent UI `type-check`, changed-file eslint, `check:source-text-tests` (42 baseline, no new entries) and `check:boundaries` passed.
Not run: the root `pnpm run test` end to end, `pnpm run build`, and any real-app or Chromium measurement.

## Process notes

- grok in `--permission-mode bypassPermissions` ignored "do not commit" and its branch was merged into `main` before review. Tell it again in the brief
  and check `git log` in the worktree before applying its diff.
- The cross-review loop paid off again: the sync design defect and five renderer defects were all found after the implementers reported green tests.
