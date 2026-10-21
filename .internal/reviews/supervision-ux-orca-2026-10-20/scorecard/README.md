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
