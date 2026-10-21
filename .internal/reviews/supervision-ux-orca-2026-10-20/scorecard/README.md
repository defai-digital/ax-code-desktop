# Competitor UX scorecard, round 2 (2026-10-20)

Persona: a developer supervising 5-20 parallel coding-agent sessions. Weights: overview 40%, review 35%, workspace 25%.
Evidence given to every judge: `competitor-facts.md` (docs/source facts, V = verified, I = inference), `matrix2.md` (capability
matrix with AX source citations, written by codex before the activity preview merged) and the native WebMCP journey script.
Unknown competitor capabilities do not count as competitor weaknesses.

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 7.40 | 8.80 | 8.43 | 7.95 | 6.58 | worse | better |
| deepseek-flash | 7.75 | 8.65 | 6.60 | 7.35 | 7.25 | worse | better |
| MiniMax-M3 | invalid | | | | | | |

MiniMax could not read the evidence files (scratch path denied) and scored competitors from memory; its result is kept only for
the record and not counted.

Result: AX Code Desktop is judged better than opencode desktop and still behind Orca for this persona. Gaps both valid judges
named: compound filters and child-agent rows on the overview, two sessions side by side / pane splitting in the workspace, and in
review a selectable base or branch scope, anchored and resolvable comments with a target picker, and viewed marks bound to the full
diff identity for git scopes. The activity preview was ungated (all densities, beside goal/error lines) after this round, as both
judges recommended. Round 3 targets the remaining feasible gaps and is re-judged.

## Round 3 (2026-10-20)

Targets from the two valid round-2 judges: compound overview filters and child agents, a base/branch review scope, two sessions
side by side, a comment target, and the activity preview ungated.

- Mission Control: Projects multi-select facet (counts follow the other active filters), Has changes facet, removable chips with
  Clear all (focus returns to the filter bar), "+N agent(s)" with a child list in Details, activity preview in every density.
- Review: Branch scope against the merge-base of a selectable base branch (Desktop web server, base validated against existing
  branches, file and size caps), read-only rail and diff. Comments can be sent to another live session of the same project
  (worktrees included) using that session's own agent and model; the choice resets for another review's drafts.
- Workspace: "Open this session in a separate window" from the navigation bar and the command palette, so two sessions can be
  watched side by side.
- Reviews: deepseek-flash reviewed each package written by another model (A3 by codex, C3 by Claude, and a security review of
  B3 by grok before commit); confirmed findings
  were fixed (stale comment target, worktree project matching, per-target model, window-open failure toast, facet count base,
  chip focus, menu label, child-count plural). The B3 security review found no injection or path escape; its two availability
  findings were fixed before commit (16 MiB response budget, 30 s git timeouts). The raw review texts of this round were lost when the session scratch directory was
  cleared; findings and fixes are listed here and in the commit.
- Gates: UI 4016, web 1482 (+2 skipped), Electron 761 (+1 skipped) tests; typecheck, lint, boundaries, 14 locales; native WebMCP
  supervision-workspace, portfolio-identity and project-home journeys passed (project-home timed out once at load average ~30 and
  passed on rerun).

### Round 3 result

Raw judgments: `round3/` (each judge verified AX claims in source at `41c65198`).

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 8.08 | 8.83 | 8.80 | 7.98 | 6.78 | worse | better |
| deepseek-flash | 7.7 | 8.7 | 8.2 | 7.6 | 6.5 | worse | better |
| MiniMax-M3 | 7.56 | 8.86 | 8.55 | 8.08 | 6.58 | worse | better |

All three valid judges: better than opencode, still behind Orca. Named flips: comments that survive edits with Resolve, viewed
marks that persist and are bound to content identity, a second session in the same window with its own review surfaces, a
"what changed while I was away" unread signal with mark-unread, editor open on the session rail, child agents as rows, and
staging inside Branch scope.

## Round 4 (2026-10-20)

- Review threads (codex): sent comments become persisted threads per repository (200 threads, 30 repositories, 4000-character
  snippet caps), re-anchored to the current content of the file or marked "original location", with Resolve, Reopen and re-send
  of open threads to a chosen session. The list names the recipient session by title.
- Viewed marks (grok): git status carries head, index and worktree blob ids; marks persist and are keyed to those identities,
  so a mark clears when the content changes and survives a restart. Binary and oversized Branch rows are explicit fallbacks.
- Open beside (Claude): Cmd/Ctrl+click a Mission Control row, Cmd/Ctrl+Enter on the selected row, or the Peek button opens that
  session as a chat in the context panel next to the current conversation, scoped to the session's own directory (another
  project included). The native WebMCP journey asserts both conversations are visible with their own composers
  (`open-beside` capture).
- Unread: rows updated since the last visit show a marker; an "Updated since my last visit" facet with count joins the filters
  and Clear all; Peek offers "Mark as unread".
- The session/Last turn rail opens the file in the editor at the first changed line.

Reviews (raw texts in `../reviews/round4/`): codex reviewed grok's viewed marks and found one P1 and three P2. All four are fixed:
- Git decoded quoted C escapes in `hash-object --stdin-paths`, so a crafted filename could hash a file outside the repository;
  this was reproduced. Blobs are now hashed in process from an `O_NOFOLLOW` handle, with an ancestor containment check, a size
  cap, and symlinks hashed by their link text.
- A validation/use race in hashing (closed by the same change).
- Restaging with the same status letter now invalidates the staged diff.
- Binary and oversized Branch rows are now explicit fallbacks.

glm-5.3 approved codex's threads with two LOW findings, both fixed (directory and snippet bounds, memoized re-anchoring). The
embedded chat was blank because the app document sent `X-Frame-Options: DENY`; it now sends `SAMEORIGIN` with
`frame-ancestors 'self'` (web and packaged `app://`, not proxied documents). deepseek-flash's security review found no blocking
issue. Its LOW note is accepted and recorded: same-origin previews and dashboards, which already run same-origin script, can now
frame the app document.

Gates: UI 4050, web 1490 (+2 skipped), Electron 762 (+1 skipped), shared 239 (+7 skipped) tests; typecheck, lint, boundaries,
release contract, 14 locales; native WebMCP supervision-workspace (with open-beside), portfolio-identity, project-home and
`e2e:desktop` journeys passed.

### Round 4 result

Raw judgments: `round4/` (AX verified in source at `13a9161f`).

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 8.35 | 8.90 | 8.73 | 8.05 | 6.89 | worse | better |
| deepseek-flash | 7.94 | 8.90 | 8.56 | 7.85 | 6.58 | worse | better |
| MiniMax-M3 | 8.49 | 8.89 | 8.73 | 8.13 | 6.58 | worse | better |

The gap to Orca narrowed (codex 0.75 to 0.55, MiniMax 1.30 to 0.40, deepseek 1.00 to 0.96). Named flips: child agents as rows, a
cross-session activity feed, previews for sessions that were never opened, the beside session with its own review and more width,
open threads visible in the diff, session marks bound to both sides with a visible fallback, and a remembered Branch base.

## Round 5 (2026-10-21)

- Mission Control: child agents appear as indented rows under their root (those needing a person first, up to three, the rest in
  Details) with their own state and Open action. An Activity column lists state transitions across sessions with an unread count and
  Mark all read; it records in the main window only and other windows follow its writes. Rows never opened in this run get a preview
  from a bounded read of the latest messages (two concurrent reads, a 20 s timeout, at most one read per session every 10 s, 300
  entries, never shown for another directory).
- Workspace: opening a session beside the chat widens a narrow context panel to about half the window, and the beside session has
  Chat and Changes tabs; its Changes tab shows that session's own repository. The native journey asserts both composers, the width
  and the beside repository's diff (`open-beside`, `open-beside-changes` captures).
- Review: open threads are shown in the diff at their re-anchored lines with Resolve. Session and Last turn marks hash both sides,
  status and path; viewed files whose mark rests on line counts show a warning; the Branch base is remembered per repository.
- Authors and reviews (raw texts in `../reviews/round5/`): grok wrote the feed, codex the previews and the mark/base package, Claude
  the rest. deepseek-flash reviewed the previews (one HIGH: a never-settling read blocked all previews; two MEDIUM: refetch on every
  revision bump, eviction of visible rows). codex reviewed the round (one P1: runtime error text persisted unscrubbed in the feed;
  four P2: a stale pop-out feed overwriting events, a feed click on a hidden session selecting another row, and two directory-move
  cases in the preview cache). All were fixed with regression tests; mutation probes confirmed the timeout and feed-selection tests.
- Gates: UI 4107, web 1490 (+2 skipped), Electron 762 (+1 skipped), shared 239 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales; native WebMCP supervision-workspace, portfolio-identity, project-home and `e2e:desktop` passed.

### Round 5 result

Raw judgments: `round5/` (AX verified in source at `d9f1b29d`).

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 8.65 | 8.93 | 8.73 | 8.17 | 6.90 | worse | better |
| deepseek-flash | 8.65 | 8.93 | 8.73 | 8.10 | 6.88 | worse | better |
| MiniMax-M3 | 8.75 | 9.06 | 8.77 | 8.18 | 6.87 | worse | better |

The gap to Orca is about 0.3 for all three judges. All three named Terminal and Files in the beside session; two named a joined
Stage, Commit and Push flow; one each named change-level F7 navigation, preview freshness, and staging in Branch scope.

## Round 6 (2026-10-21)

- Workspace: the session opened beside the chat has Chat, Changes, Files (tree and editor) and Terminal tabs, all in that session's own
  directory. Tabs stay mounted once opened. The native journey asserts the Files tree lists the beside repository and never the main one,
  and that the Terminal tab renders a terminal while Files stays mounted.
- Review: one progressive action stages the reviewed files, commits the staged set and pushes to the shown upstream, with repository,
  branch and affected files visible first (codex). Staging unreviewed files needs a second explicit click; staging and committing re-read
  the repository and stop when files changed after review or the index no longer matches the list on screen; line-count marks never
  count as reviewed; the Git panel push is pinned to the shown upstream too (deepseek-flash review: one HIGH, three MEDIUM, one LOW, all
  fixed with tests).
- Terminal: Ghostty's WebAssembly is loaded from the bundled asset instead of an inline data: URL that the renderer CSP blocks, which
  also affected the main window's terminal on every platform.
- Platforms (macOS, Windows, Ubuntu; codex audit in `../reviews/round6/`): Windows directory spellings (`C:\Repo`, `c:/Repo`) now share
  one key for viewed marks, threads and branch bases, and the embedded session matches its directory with the same identity as the
  rest of the app (a mismatch left the pane blank). Thread re-anchoring unifies CRLF and LF before the whitespace-blind fallback.
  Worktree hashing checks the opened file's device and inode where O_NOFOLLOW does not exist. The e2e stub runtime gets a Windows
  `.cmd` launcher and compares directories canonically. A new advisory CI job runs the supervision, portfolio and project-home
  journeys on macos-15, windows-2022 and ubuntu-24.04 (xvfb); its first Windows and Ubuntu results come from the next CI run.
- Gates: UI 4129, web 1490 (+2 skipped), Electron 762 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales, actionlint; native WebMCP supervision-workspace, portfolio-identity and project-home passed on macOS.

## Round 7 (2026-10-21)

Controlled by `.internal/prd/PRD-2026-10-21-competitive-supervision-ux-v1.md` (accepted this day) and its plan.

- CS-10 change navigation (grok): F7 and Shift+F7 move between change hunks across files in rail order, in every scope and layout,
  never while typing, with a polite announcement and the first/last change named; rebindable in the shortcut registry. Review
  (deepseek-flash): one HIGH (the hunk registry was shared by every review pane) and four MEDIUM, all fixed by grok with
  regression tests and a mutation probe on pane scoping.
- CS-11 session grid (codex): one to four live sessions side by side in one window, each with Chat, Changes, Files and Terminal;
  keyboard splitters; opened from Mission Control multi-select and the command palette; restored per window. Review
  (deepseek-flash, after Kimi K3 hit an upstream rate limit): two HIGH (opening the grid unmounted the context panel and split
  editor; the picker used list positions) and two MEDIUM, all fixed with tests; one LOW deferred. The native journey opens two
  fixture sessions as a grid (`session-grid-two` capture).
- CS-12 runtime verification evidence (grok): rows show the runtime's `session.risk` verification envelopes verbatim as a Checks
  chip, a peek detail and a "Checks failing" facet, plus the goal's remaining budget. Review (codex): three P2 (a failed read showed an
  older result as current; the timeout did not cancel the request; the chip's status had no reliable accessible name), all fixed;
  the same cancellation was added to activity-preview reads.
- CS-13 batch decisions (Claude): two or more pending requests of one permission and risk class get one explicit "allow once" or
  "deny" decision, armed and then confirmed, showing every scope; risky and must-decide requests are never batched; no standing
  grant. Review (deepseek-flash): no HIGH; all findings fixed. Accessibility review (Nemotron): no changes needed after
  verification (its HIGH misread a translation key as text).
- Locale loading stays fail-closed: English fallbacks proposed by two implementers were not merged; Mistral Medium 3.5 translated
  the new strings.
- WebMCP audit for round 8: `../round8-webmcp-design/AUDIT-2026-10-21-webmcp-ux.md`.
- Gates: UI 4212, web 1490 (+2 skipped), Electron 762 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales, actionlint; native WebMCP supervision-workspace (with the grid), portfolio-identity, project-home and
  `e2e:desktop` passed on macOS.

## Round 8 (2026-10-21): WebMCP

Method: PRD-2026-10-21 section 4a. Five independent answers (codex, grok, MiniMax-M3, Gemini 3.8 Flash visual critique, one Gemini
4 Argon answer before it was withdrawn), Kimi K3 synthesis, glm-5.3 verification of every cited line; decision record
`../round8-webmcp-design/DECISION.md`. Accepted CS-25 to CS-32 (Desktop) and runtime proposals R1 to R6.

- CS-25, CS-26, CS-31 (codex): the project browser pauses access when covered instead of silently disconnecting, resumes only on
  an explicit click with full revalidation and never replays a pending request; the last page is restored per project and
  session without authority; failures name the native cause with one fix action; false "cannot open pages" and "update the
  runtime" copy removed; one primary enable action. Reviews: deepseek-flash security (no HIGH; two LOW fixed, one MEDIUM sent to
  the runtime as R6, one LOW accepted) and Kimi K3 (three MEDIUM, all fixed by codex with tests and mutation probes).
- CS-27, CS-29 (grok): approval cards show target, submit flag and redacted text, are titled by the page tool, and offer no
  "Always allow" for the built-in project browser; collapsed transcript rows name the page tool and show failure. Review
  (deepseek-flash): redaction by key and field name, short secrets, and timeout/cancel as failure fixed; a regression that removed
  the Chrome bridge's "Always allow on this site" reverted.
- CS-28, CS-30, CS-32 (Claude): page tools with schemas visible while access is off, "Try it" runs a tool as the user with no
  grant; Mission Control rows show the page a session's browser is on, and the Activity feed records access starting and
  stopping; the Chrome-bridge approvals are titled "Chrome bridge site approvals" and shown only while that bridge is connected.
- Three-platform CI (first run, commit `4dc7d52a`): all supervision journeys passed on macOS and Ubuntu; on Windows the app
  rendered correctly but the journey matched raw `C:\` paths and the harness did not end Electron's process tree, so the run hung.
  Fixed here (shared path matching, `taskkill /T` teardown); the next CI run is the Windows evidence.
- Gates: UI 4266, web 1490 (+2 skipped), Electron 780 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales, actionlint; macOS native journeys and `e2e:desktop` passed.

### Rounds 6-8 result (judged together at `845db2cf`)

Raw judgments: `round8/`.

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 8.85 | 8.93 | 8.73 | 8.17 | 6.90 | worse | better |
| deepseek-flash | 8.98 | 9.01 | 8.77 | 8.25 | 6.94 | equal | better |
| MiniMax-M3 | 8.92 | 9.07 | 8.72 | 8.00 | 6.94 | worse | better |

The gap to Orca fell from about 0.3 to 0.03-0.15; the PRD's definition of done needs a 0.2 lead from all three. Named flips: landing
from Branch scope (all three), the Activity signal outside the board (header bell, dock badge), commit confirmation bound to staged
blob identities, preview freshness with Retry, verification evidence beside the landing action, inline three-way merge.

## Round 9 (2026-10-21)

Targets from the rounds 6-8 judgments.

- L9 (codex): the Stage, Commit and Push action also works from Branch scope (CS-14), staging only uncommitted, reviewed members of
  the Branch diff; the commit preflight compares staged blob identities, HEAD and branch, captured when the composer opens; the
  session's runtime checks sit beside the landing action with a non-blocking warning when failing or stale. Review (deepseek-flash):
  two MEDIUM (preflight served from the 1.2 s status cache; HEAD read without a timeout) and two LOW, all fixed by codex with tests and
  mutation probes. The preflight is a read-before-write guard, not an atomic lock.
- N9 (Claude): a titlebar Activity button with the unread count opens the feed anywhere and opens the chosen session; a failed
  activity-preview read keeps the older text marked "(may be outdated)" and retries after a backoff. Fixed while testing: a tight
  retry loop for failed entries evicted from the bounded caches (boards above 300 rows), in both the preview and the verification
  caches. Review (codex): four findings, all fixed (per-session backoff deadlines independent of eviction, popover focus, marker
  placement, no timers after unmount).
- Windows journeys: the round 8 CI run no longer hangs and portfolio-identity passes on Windows; project-home failed on a remaining
  raw path comparison (fixed) and "Last turn" stayed loading on Windows. The harness now records failed request URLs per journey
  (`failed-requests.json`) to trace that on the next run.
- Gates: UI 4305, web 1497 (+2 skipped), Electron 780 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales; macOS native journeys and `e2e:desktop` passed.
- Runtime contract (ADR-266 in AX Code, branch `feat/webmcp-desktop-contract-v1`): in progress separately; Desktop does not depend
  on it until a signed runtime is pinned.

### Round 9 result (judged at `b52c0d96`)

Raw judgments: `round9/`.

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 8.96 | 8.93 | 8.73 | 8.17 | 6.90 | equal | better |
| deepseek-flash | 9.02 | 8.97 | 8.77 | 8.25 | 6.94 | equal | better |
| MiniMax-M3 | 9.03 | 9.01 | 8.72 | 8.16 | 6.94 | equal | better |

For the first time every judge scores AX above Orca, by 0.02 to 0.05, inside the judges' spread; the PRD needs a 0.2 lead from all
three. Correction to the round 9 record: the OS badge counted unseen notifications, not the Needs You count; round 10 changes it.
Named flips: landing from This session and Last turn, a manual Retry and last-success age for stale previews, free pane arrangement
in the session grid (drag to split, reorder, pop out), inline three-way merge, PR and check state on rows, an actionable badge.

## Round 10 (2026-10-21): WebMCP where the persona supervises and lands

- W10a (Claude): Desktop reads the AX Code runtime's optional WebMCP fields (ADR-266): the invoke `inputPreview`, a failure `reason`
  from eight codes, and `nextAction`. The expanded tool row shows the reason and "Next step:"; both are credential-filtered. Older
  runtimes keep the previous behavior.
- W10b (Claude): the project browser pane shows the session's recent page-tool calls ("Agent calls (N)"): tool, redacted
  arguments, outcome and failure reason. Orca's browser pane has no page-tool concept.
- W10c (Claude): beside Stage, Commit and Push, "Tried in the browser this turn" counts the latest turn's page-tool calls and
  failures and opens the browser. It is labelled as calls, not as test results.
- B10 (Claude): the OS dock and taskbar badge counts unique pending decisions (permissions and questions, child sessions
  included), not unseen notifications. Review of W10a-c and B10 (k3-256k): two MEDIUM (a render and scan on every streamed token;
  a live region re-announcing the call list) and three LOW, all fixed (`reviews/round10/REVIEW-w10-kimi.md`).
- P10 (codex, CS-15): PR state and CI checks the existing PR integration knows appear on Mission Control rows, in the peek and as
  a PR filter, with a bounded cache (two reads in flight, timeouts, per-key backoff). Review (deepseek-flash): three MEDIUM (the
  failing-checks filter matched merged PRs; a board read dropped a loaded PR body; a status never aged into stale without a
  render) and two LOW, all fixed with tests and mutation probes (`reviews/round10/REVIEW-p10-deepseek.md`).
- Round 9 CI: supervision journeys pass on macOS, Windows and Ubuntu, so the Windows "Last turn" loading failure is resolved.
  The verify job failed on a round 9 test that assumed every `execFile` call has options; fixed.
- Runtime contract (ADR-266, AX Code branch `feat/webmcp-desktop-contract-v1`, local commit `4474edbbf`, not pushed): grok fixed
  the deepseek-flash review findings with mutation probes: a visible marker when the 2 KiB preview is cut, cached validators and
  rejection of page-supplied `pattern`/`patternProperties` (fails closed; a deliberate safety-over-compatibility choice),
  enrollment inside the project boundary, broader secret-key redaction, and a `session-rejected` reason. Verified here: runtime
  typecheck and 36 contract tests pass. Desktop does not depend on it until a signed runtime is pinned.
- Moved to round 11: S10 (landing from This session and Last turn) and F10 (manual Retry and last-success age).
- Gates: UI 4329, web 1498 (+2 skipped), Electron 780 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint, boundaries,
  release contract, 14 locales (5190 keys); build; macOS native journeys (supervision-workspace, portfolio-identity,
  project-home) and `e2e:desktop` passed.

### Round 10 result (judged at `acc31cad`)

Raw judgments: `round10/`.

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 9.10 | 8.93 | 8.73 | 8.17 | 6.90 | equal | better |
| deepseek-flash | 9.09 | 8.97 | 8.77 | 8.25 | 6.94 | equal | better |
| MiniMax-M3 | 9.01 | 8.97 | 8.72 | 8.23 | 6.86 | equal | better |

AX leads Orca by 0.17, 0.12 and 0.04; every judge still calls it equal, since the PRD needs a 0.2 lead from all three. Overview
moved most (PR state on rows, the actionable badge); workspace still trails Orca (fixed grid layouts). The judges gave the
optional runtime WebMCP fields no credit until a signed runtime with ADR-266 is pinned. Named flips: landing from This session and
Last turn (all three), a review rail tree with adjustable width (codex, MiniMax), Retry and last-success age (codex), PR
discovery for branches the store does not know and a multi-select PR facet (deepseek), free grid arrangement (deepseek), and
pinning the ADR-266 runtime (MiniMax; needs a signed AX Code release and approval).

## Round 11 (2026-10-21)

- S10 (Claude): Stage, Commit and Push from This session and Last turn. A session file counts as reviewed only while staging it
  applies exactly the reviewed change: its review mark matches, the index still holds the reviewed `before` (an addition is
  untracked), the worktree holds the reviewed `after` (git blob ids computed in the renderer from the runtime's text), and the
  worktree mode equals the index mode (a new file must be 100644). Git status now reports `indexMode` and `worktreeMode`.
  Anything else falls back to the explicit "Stage all N" confirmation. Review (codex): two P1 (earlier turns' changes staged
  with the reviewed turn; equal bytes hiding a symlink or executable-bit change) and one P2, all fixed with mutation probes
  (`reviews/round11/REVIEW-s10-f10-codex.md`). The supervision journey now requires the landing section in session scopes and
  still forbids per-file stage or revert controls there.
- F10 (Claude): a stale activity preview shows "(may be outdated; last read 5m ago)" and a Retry button that reads the session
  again now, without opening or selecting the row. Retry applies only to a stale session on a board, adds nothing while a read
  is in flight, and intents for rows that leave every board are dropped.
- Gates: UI 4335, web 1499 (+2 skipped), Electron 780 (+1 skipped), shared 240 (+7 skipped) tests; typecheck, lint,
  boundaries, release contract, 14 locales (5193 keys); build; macOS native journeys (supervision-workspace, portfolio-identity,
  project-home) and `e2e:desktop` passed. R10 (review rail tree, grok) follows in a separate commit.


## Interim comparison during round 14 (HEAD `163272bf`; raw judgments in `round14-interim/`)

Same brief and weights as rounds 9 and 10, updated for rounds 11 to 13.

| Judge | AX | Orca | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- |
| codex | 9.05 | 8.93 | 6.90 | +0.12, equal | better |
| deepseek-flash | about 9.1 | about 8.95 | about 6.9 | +0.16, equal | better |
| MiniMax-M3 | 9.04 | 8.99 | 6.92 | +0.05, better (below the 0.2 margin) | better |

All three judges rate AX better than opencode and ahead of Orca, but below the competitive PRD's 0.2 margin. Workspace and
layout is the only surface where Orca leads (AX 8.6 to 8.9, Orca 9.0). Named flips: the round 14a surfaces (waiting calls in
Needs you, Mission Control and the grid; the page switcher with per-session revoke; named pool capacity), free arrangement in
the session grid (drag to split, reorder, pop out), a multi-select PR facet with counts, and inline three-way merge. The brief
lost the name of the CLI to a shell substitution; the judges read the source and docs.

## Round 14 comparison (HEAD `fc645985`; raw judgments in `round14/`)

| Judge | AX vs Orca | AX vs opencode |
| --- | --- | --- |
| codex | AX 9.19, Orca 8.93: +0.26, better | better |
| deepseek-flash | +0.05, equal | better |
| MiniMax-M3 | +0.21, better | better (+1.99) |

Two judges now rate AX better than Orca by more than 0.2; deepseek-flash keeps it equal because the session grid offers only
fixed presets (no drag to split, reorder or pop out), the PR facet is a single toggle without counts, and the palette lacks
#PR search, project filter and split-open. All three rate AX better than opencode. Round 15 takes these.
