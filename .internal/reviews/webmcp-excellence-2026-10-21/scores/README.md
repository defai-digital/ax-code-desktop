# WebMCP excellence rubric scores

Each judge scores every persona step 1 to 10 against an absolute bar (PRD-2026-10-21-webmcp-excellence-v1, sections 2 and 3).
Runtime fields that are not in the pinned runtime get no credit.

## Baseline (HEAD `7696232a`, before round 12; raw judgments in `baseline/`)

| Step | codex | deepseek-flash | MiniMax-M3 |
| --- | --- | --- | --- |
| A1 discover | 6 | 6 | 6 |
| A2 enable and scope trust | 6 | 6 | 6 |
| A3 watch live | 5 | 5 | 6 |
| A4 approvals | 6 | 7 | 7 |
| A5 failure recovery | 5 | 5 | 6 |
| A6 evidence after the task | 6 | 6 | 6 |
| A7 pause and take over | 6 | 6 | 6 |
| A8 several sessions | 3 | 3 | 3 |
| B1 see registered tools | 3 | 3 | 4 |
| B2 try and compare | 3 | 4 | 4 |
| B3 iterate | 4 | 4 | 4 |
| B4 diagnose misuse | 3 | 3 | 4 |
| B5 onboarding docs | 2 | 2 | 7* |

\* MiniMax read the uncommitted round-12 quickstart (`docs/webmcp-page-tools.md`) in the working tree; the clean baseline for B5
is 2. Means: supervisor about 5.5, builder about 3.2. All three judges agree with the codex audit's ordering: the builder steps and
A8 are lowest.

## Round 12a (Claude packages; M12 and R10 follow in round 12b)

- Q12 (WX-06): `docs/webmcp-page-tools.md` and the runnable `docs/examples/webmcp-quickstart/`, linked from the project browser
  ("How to add page tools", and "This page registers no page tools." when a page has none). The example was run in the bundled
  Electron engine: four tools register, errors come back as `{ error: { field, constraint, got } }`, and `complete_task`
  unregisters itself with its AbortSignal. `executeTool` there needs a JSON string, which the guide states. Review (MiniMax-M3 as a
  first-time builder) scored onboarding 5/10 with three HIGH findings, all fixed (`reviews/round12/REVIEW-q12-minimax.md`).
- A12 (WX-08, WX-11): the WebMCP approval card opens with one sentence built only from call data (never the page's own
  description; page-supplied element names capped) and says the answer covers this call only; browser mode tabs move focus with
  Arrow, Home and End; the native page area is a named region. Review (Nemotron 3 Super): no blocking issue.
- X12 (WX-13, Desktop part): beside Stage, Commit and Push, a recap of the latest turn's browser steps in order, how each was done,
  how it ended with its failure reason, and the current page's tools the agent never called.
- Task suite: `project-browser-webmcp.mjs` drives W1 natively (four page tools discovered in 5 actions, budget 8) and joins the
  three-platform CI journey job.
- Gates: UI 4349, web, Electron and shared suites; typecheck, lint, boundaries, 14 locales (5213 keys); build; the four native
  journeys and `e2e:desktop` on macOS.

## Round 12 result (HEAD `cbb21705`; raw judgments in `round12/`)

| Step | codex | deepseek-flash | MiniMax-M3 |
| --- | --- | --- | --- |
| A1 discover | 6 | 6 | 7 |
| A2 enable and scope trust | 6 | 6 | 7 |
| A3 watch live | 5 | 5 | 6 |
| A4 approvals | 7 | 8 | 8 |
| A5 failure recovery | 6 | 7 | 7 |
| A6 evidence after the task | 7 | 7 | 8 |
| A7 pause and take over | 6 | 6 | 6 |
| A8 several sessions | 3 | 3 | 3 |
| B1 see registered tools | 4 | 4 | 4 |
| B2 try and compare | 6 | 6 | 8 |
| B3 iterate | 4 | 4 | 5 |
| B4 diagnose misuse | 4 | 5 | 5 |
| B5 onboarding docs | 7 | 8 | 8 |

Means: supervisor 5.75 / 6.0 / 6.5 (baseline about 5.5); builder 5.0 / 5.4 / 6.0 (baseline about 3.2). Moved most: B5, B2, A4,
A6, A5. Not moved: A8 (one view per window), A7 (no dedicated pause or take-over), A3 (no duration, result or page binding in the
strip), B1 and B3 (no raw schema, annotations, registration history). Round 13 targets exactly these: WX-15, WX-10, WX-07, WX-02,
WX-04. The definition of done (every step 9, none below 8) is not met.

## Round 13 evidence so far (2026-10-21)

- CI run 39579636501 (`95708569`): supervision-workspace and project-browser journeys pass on macOS-15, Windows-2022 and
  Ubuntu-24.04. This confirms the Windows Last turn fix (`ab00be7d`): the scope no longer waits forever on synced messages.
- Merged: WX-07 call strip (`56abfb59`), W2 journey and structured-error fix (`e09d0209`), WX-17 builder CLI (`313a7c70`),
  WX-02/WX-04 inspectable tools and registration truth (`2df77ae8`). WX-15 is being merged with main in its worktree.
- Rubric rule (PRD section 3, revised by the user): a step passes with 8 or more from two of the three judges.
- WX-15 steps 1 to 6 merged (`920e1d1b`): reviews by deepseek-flash and Kimi K3 (no blocking issue; all findings fixed with
  mutation probes, `reviews/round13/HANDOFF-v13-codex.md`). Gates on the merged tree: UI 4460, Electron 862, web 1499,
  shared 240 tests; build; supervision-workspace, portfolio-identity, project-home and project-browser journeys and
  `e2e:desktop` on macOS.
- WX-10 pause and take over merged: review by deepseek-flash (no blocking issue; fixes and dispositions in
  `reviews/round13/REVIEW-t13-deepseek.md`). Gates: UI 4467, Electron 870, web 1499, shared 240 tests; build; four native
  journeys including W5 keyboard pause and resume (idle), and `e2e:desktop` on macOS. Open: W5 during a long call.

## Round 13 result (HEAD `7cd2d383`; raw judgments in `round13/`)

A step passes with 8 or more from two of the three judges (PRD section 3 as revised by the user).

| Step | codex | deepseek-flash | MiniMax-M3 | Pass |
| --- | --- | --- | --- | --- |
| A1 discover | 8 | 8 | 9 | yes |
| A2 enable and scope trust | 7 | 7 | 9 | no |
| A3 watch live | 7 | 8 | 9 | yes |
| A4 approvals | 7 | 8 | 9 | yes |
| A5 failure recovery | 7 | 8 | 9 | yes |
| A6 evidence after the task | 7 | 8 | 9 | yes |
| A7 pause and take over | 7 | 8 | 9 | yes |
| A8 several sessions | 6 | 6 | 9 | no |
| B1 see registered tools | 8 | 8 | 9 | yes |
| B2 try and compare | 6 | 7 | 8 | no |
| B3 iterate | 7 | 8 | 9 | yes |
| B4 diagnose misuse | 6 | 6 | 8 | no |
| B5 onboarding docs | 8 | 8 | 9 | yes |

Nine of thirteen steps pass (round 12: two). Means: supervisor 7.0 / 7.6 / 9.0, builder 7.0 / 7.4 / 8.4. MiniMax's first output
held only its summary; it was rerun with an instruction to put the full table in its final answer (`brief-minimax.md`).
Round 14 targets the four failing steps: A8 and A2 (page switcher, per-session revoke, capacity and LRU unload, waiting
surfaced in Needs you, Mission Control and the grid, task W7) and B2 and B4 (manual journal and replay, comparison with the
agent's call, misuse diagnosis naming the property and rule, regression export).

## P1 audit after round 13 (glm-5.3, `AUDIT-2026-10-21-p1-glm-round13.md`)

No P1. One P2: the provider's `/next` poll has no independent timeout, so a half-open runtime connection stalls agent calls
silently while the pane shows access as on; fixed in round 14 (R14a). Three P3 notes recorded. Definition of done item 3 needs
the audit repeated after round 14.

## Round 14 evidence (in progress)

- R14a merged: page switcher, per-session revoke, trust summary, named capacity with LRU unload, waiting surfaced in Needs you,
  Mission Control and the session grid, bounded provider poll. Gates: UI 4485, Electron 881, web 1499, shared 240 tests; build;
  five native journeys including `project-browser-sessions` (W7: two projects, 7 actions of a 12 budget, 50 switches with flat
  listeners and memory) and `e2e:desktop` on macOS. W7 joins the three-platform CI job.
- R14b merged: manual journal and replay, comparison with the agent's latest call, schema diagnosis naming the property, rule
  and value kind, regression export, guide update. Gates: UI 4498, Electron 881, web 1499, shared 240 tests; build; five
  native journeys and `e2e:desktop` on macOS.

## Round 14 result (HEAD `fc645985`; raw judgments in `round14/`)

| Step | codex | deepseek-flash | MiniMax-M3 | Pass |
| --- | --- | --- | --- | --- |
| A1 discover | 8 | 8 | 8 | yes |
| A2 enable and scope trust | 8 | 8 | 8 | yes (new) |
| A3 watch live | 7 | 8 | 7 | no |
| A4 approvals | 7 | 8 | 7 | no |
| A5 failure recovery | 7 | 8 | 8 | yes |
| A6 evidence after the task | 7 | 8 | 7 | no |
| A7 pause and take over | 7 | 8 | 7 | no |
| A8 several sessions | 8 | 9 | 8 | yes (new) |
| B1 see registered tools | 8 | 8 | 8 | yes |
| B2 try and compare | 7 | 9 | 8 | yes (new) |
| B3 iterate | 7 | 8 | 8 | yes |
| B4 diagnose misuse | 7 | 8 | 8 | yes (new) |
| B5 onboarding docs | 8 | 9 | 8 | yes |

Nine of thirteen pass. All four round-14 targets now pass; A3, A4, A6 and A7 fall back to failing because MiniMax scored them
7 (9 in round 13) with no change to that code. The judges' reasons: A3 a row opens the message, not the exact call or its
approval; A4 approval arguments are missing until a runtime with ADR-266 is pinned (v7.28.2 contains it; another session's
pin update is in progress) and approval expiry is not shown as an outcome; A6 no per-call evidence links, receipts, export or
definition binding; A7 cancellation is checkpoint-only and not awaited. P1 audit after round 14 (glm-5.3,
`AUDIT-2026-10-21-p1-glm-round14.md`): no P1; two P2s (a second window's pane loops on Reopen; the manual surface shows
secret-named inputs in clear).

## Round 15 evidence

- R15d merged: a running call in the call strip opens its approval; the transcript jumps to and highlights the exact tool part;
  page-tool approval cards show the page's own definition; the recap lists steps as buttons with duration, result and
  definition identity, caps and copies; exported regressions use placeholders for secrets. Gates: UI 4508 tests, build, five
  native journeys and `e2e:desktop` on macOS. Review: deepseek-flash, fixes applied.
- R15a merged: pause awaits the native cancellation acknowledgement and interrupts only the original document's script; calls
  report stopped or still finishing and unfinished page requests stay in later reports; a second window names the owner window
  with Focus that window. Review: codex (one P1 and one P2, fixed). Gates include the new `project-browser-second-window` journey.
- R15b and R15c merged (workspace): grid drag, dock, split and pop-out with one browser owner (codex review: two P1s and five
  P2s, fixed); PR state and checks facets; palette PR search, scope and split-open (codex review: two P2s, fixed).

## Round 15 result (HEAD `92775899`; raw judgments in `round15/`)

| Step | codex | deepseek-flash | MiniMax-M3 | Pass |
| --- | --- | --- | --- | --- |
| A1 discover | 8 | 8 | 8 | yes |
| A2 enable and scope trust | 8 | 8 | 8 | yes |
| A3 watch live | 8 | 9 | 8 | yes (new) |
| A4 approvals | 7 | 8 | 8 | yes (new) |
| A5 failure recovery | 7 | 8 | 8 | yes |
| A6 evidence after the task | 8 | 9 | 8 | yes (new) |
| A7 pause and take over | 8 | 8 | 9 | yes (new) |
| A8 several sessions | 8 | 9 | 8 | yes |
| B1 see registered tools | 8 | 8 | 8 | yes |
| B2 try and compare | 7 | 9 | 8 | yes |
| B3 iterate | 7 | 8 | 8 | yes |
| B4 diagnose misuse | 7 | 8 | 8 | yes |
| B5 onboarding docs | 8 | 9 | 8 | yes |

All thirteen steps pass under the two-of-three rule. Means: codex A 7.75 and B 7.40, deepseek-flash A 8.4 and B 8.4, MiniMax-M3
A 8.0 and B 8.0. Remaining judge asks: runtime receipts for approval arguments and invoked-definition identity (A4, B2, B4),
property-level schema diffs (B3), adapter failure reasons kept through to the transcript (A5), explicit sign-out and a
read-only grant list (A2), and an approval-expiry outcome (A4).

P1 audit after round 15: glm-5.3 was cut off by an upstream error; codex ran the audit instead
(`AUDIT-2026-10-21-p1-codex-round15.md`) and found three P1s: secrets nested in arrays survive regression export, the headless
checker exits 0 when the Electron child dies before requested runs finish, and exported tests misclassify a recorded
`status: "failed"` outcome. Definition of done item 3 is not met until these are fixed and an audit run reports no P1.

## Rounds 16 and 17: P1 audit hardening

Fresh audits after round 15 kept finding P1s, so rounds 16 and 17 alternated fix, full gates and a fresh audit (codex with
glm-5.3 or deepseek-flash as the second auditor) until both auditors reported no P1. Seventeen audit passes in all. Fixed
classes: credential redaction (arrays, nested and embedded JSON, key-value text with any separators, URL userinfo, encoded
parameter names in query, fragment and path, signed URLs and OAuth callbacks, short values in explicit contexts, every main to
renderer response and display site, page titles), origin-only address history, binding of manual Try it and queued
navigation to the displayed document and definition, one definition-digest vocabulary, retirement of replaced or rejected
definitions, receipts kept for self-unregistering tools and mid-call generation changes, regression exports limited to
reproducible outcomes, `webmcp:check` exit codes, keyed identity receipts, top-level-only tools and contamination after a
timeout, sign-in popups in the isolated profile with the agent waiting (WX-14) and Sign out, unsaved-work protection for
eviction, close, sign-out, quit, restart and update with a bounded confirmation, masked sensitive and JSON inputs, and a
landing recap that counts and copies the whole turn. Every merged step passed typecheck, lint, boundaries, locales, all tests,
build, six native journeys and `e2e:desktop` on macOS.

Final audit at `5b0bc8a6` (`AUDIT-2026-10-21-p1-codex-round17.md`, `AUDIT-2026-10-21-p1-deepseek-round17.md`): no P1 from
either auditor. Two P2s remain: a tool whose name is itself credential-shaped cannot be tried by hand (shown as a stale form),
and approval cards shorten page descriptions to 200 characters. Definition of done item 3 is met at this commit.

## Round 17 result (HEAD `7f63b436`; raw judgments in `round17/`, grok-4.7 added as a fourth judge)

| Step | codex | deepseek-flash | MiniMax-M3 | grok-4.7 | Pass (2 of the 3 original judges) |
| --- | --- | --- | --- | --- | --- |
| A1 discover | 8 | 8 | 8 | 8 | yes |
| A2 enable and scope trust | 9 | 9 | 8 | 9 | yes |
| A3 watch live | 8 | 9 | 8 | 8 | yes |
| A4 approvals | 7 | 8 | 7 | 7 | no |
| A5 failure recovery | 8 | 8 | 8 | 7 | yes |
| A6 evidence after the task | 8 | 9 | 8 | 8 | yes |
| A7 pause and take over | 8 | 9 | 8 | 8 | yes |
| A8 several sessions | 8 | 9 | 8 | 8 | yes |
| B1 see registered tools | 8 | 8 | 8 | 8 | yes |
| B2 try and compare | 7 | 9 | 8 | 8 | yes |
| B3 iterate | 7 | 8 | 7 | 7 | no |
| B4 diagnose misuse | 7 | 8 | 8 | 7 | yes |
| B5 onboarding docs | 8 | 9 | 8 | 8 | yes |

Eleven of thirteen pass at the final hardening commit; A4 and B3 fall back. Reasons: A4 the card says the runtime gives no
arguments, there is no approval-expiry outcome and the page description is cut at 200 characters; B3 registration changes show
digest pairs, not property-level schema differences. The brief told judges that ADR-266 runtime fields are not pinned; the
runtime pin is now v7.28.2, which sends `definitionDigest` and a redacted `inputPreview` at approval, so round 18 verifies
Desktop renders that shape and adds expiry, the full description and a property-level diff.

## Round 18 result (HEAD `7811c298`; raw judgments in `round18/`)

Round 18 rendered the pinned v7.28.2 runtime's `inputPreview` and `definitionDigest` on approval cards, added an approval
expiry outcome, full page descriptions, property-level schema diffs with bounded definition history and opaque ids for
credential-shaped tool names, and added native task journeys W3, W4, W6 and W8 (`project-browser-tasks.mjs`: 2/12, 3/10, 3/8
and 13/15 actions) to the three-platform CI job beside W1, W2, W5 and W7. Desktop CI on `7811c298` passed on macOS 15,
Windows 2022 and Ubuntu 24.04.

| Step | codex | deepseek-flash | MiniMax-M3 | grok-4.7 | Pass (2 of the 3 original judges) |
| --- | --- | --- | --- | --- | --- |
| A1 discover | 8 | 8 | 8 | 8 | yes |
| A2 enable and scope trust | 9 | 9 | 8 | 9 | yes |
| A3 watch live | 8 | 8 | 8 | 8 | yes |
| A4 approvals | 8 | 9 | 8 | 8 | yes |
| A5 failure recovery | 8 | 8 | 8 | 7 | yes |
| A6 evidence after the task | 8 | 8 | 8 | 8 | yes |
| A7 pause and take over | 8 | 8 | 8 | 8 | yes |
| A8 several sessions | 8 | 8 | 8 | 8 | yes |
| B1 see registered tools | 8 | 8 | 8 | 8 | yes |
| B2 try and compare | 7 | 9 | 8 | 8 | yes |
| B3 iterate | 8 | 8 | 8 | 8 | yes |
| B4 diagnose misuse | 7 | 8 | 8 | 7 | yes |
| B5 onboarding docs | 8 | 9 | 8 | 8 | yes |

All thirteen steps pass, and also pass two of three when grok-4.7 replaces any one judge. P1 audit at `7811c298`: glm-5.3 no
P1 (two P2s); codex one P1 (credential-shaped tool names share the redacted display name in journal, compare, replay and
export), fixed in round 19.

## Round 19 and closure (main `8670e718`)

Round 19 fixed the round 18 audit P1 and the findings of four further audit passes: manual evidence, replay, diagnosis and
export key on the main-issued tool id plus native definition digest; one shared WebMCP permission predicate; schema displays,
property diffs and form text decide sensitivity on the original schema before transforming; credential-shaped tool names get
distinct stable labels and are mapped to the stable id inside main; unresolved call associations are shown as unknown instead
of "never called"; the identity map is bounded. Every merged step passed typecheck, lint, boundaries, locales, all tests,
build, seven native journeys (including W3, W4, W6 and W8) and `e2e:desktop`; Desktop CI on main passed on macOS, Windows and
Ubuntu.

Final audit at `dd6b4bf6` (merged as `8670e718`): glm-5.3 no P1 (it has reported no P1 at every pass since round 18); codex
two P1s, both narrow: an API key in a `[name, value]` pair array (for example `Array.from(headers.entries())`) is not redacted,
and manual-form drafts for a property name longer than 256 characters or named `__proto__` are lost on remount; plus one P2
(advisory diagnosis checks display-truncated values). Codex has found new edge-case variants at every pass for nineteen
rounds. On 2026-10-21 the user accepted closing the goal on this basis: rubric 13 of 13 (round 18), all four judges rate AX
better than Orca by more than 0.2 and better than opencode (round 18), W1 to W8 native on three platforms, and the remaining
codex findings recorded as open follow-ups (`AUDIT-2026-10-21-p1-codex-round19d.md`).

## Round 19 judgment at the closing commit (`f06cea02`; raw judgments in `round19/`)

| Step | codex | deepseek-flash | MiniMax-M3 | grok-4.7 | Pass |
| --- | --- | --- | --- | --- | --- |
| A1 | 8 | 8 | 8 | 8 | yes |
| A2 | 9 | 8 | 8 | 9 | yes |
| A3 | 8 | 8 | 8 | 8 | yes |
| A4 | 8 | 8 | 9 | 8 | yes |
| A5 | 8 | 8 | 7 | 7 | yes |
| A6 | 7 | 8 | 8 | 8 | yes |
| A7 | 8 | 8 | 8 | 8 | yes |
| A8 | 8 | 8 | 8 | 8 | yes |
| B1 | 8 | 8 | 8 | 8 | yes |
| B2 | 7 | 8 | 8 | 8 | yes |
| B3 | 7 | 8 | 8 | 8 | yes |
| B4 | 7 | 8 | 7 | 7 | no |
| B5 | 8 | 8 | 8 | 8 | yes |

Twelve of thirteen pass at the closing commit; B4 falls back (codex, MiniMax and grok 7): diagnosis validates the
display-truncated value and can fall back to the current schema, completed agent calls lose the approval's preview and digest,
and runtime rejection reasons do not reach the failing property. Desktop CI: the code commit `8670e718` was cancelled by the
docs commit; `c1e2ab94` failed only on the macOS opening-animation video smoke; the docs-only `f06cea02` skipped native jobs.
Round 20 takes B4 and a fresh three-platform CI run on code. The earlier closure note is superseded by this result.

## Round 20 result and closure (main `4b7f80db`; raw judgments in `round20/`)

| Step | codex | deepseek-flash | MiniMax-M3 | grok-4.7 | Pass |
| --- | --- | --- | --- | --- | --- |
| A1 | 8 | 8 | 8 | 8 | yes |
| A2 | 9 | 8 | 8 | 9 | yes |
| A3 | 8 | 9 | 8 | 8 | yes |
| A4 | 8 | 8 | 9 | 8 | yes |
| A5 | 8 | 9 | 8 | 7 | yes |
| A6 | 8 | 9 | 8 | 8 | yes |
| A7 | 8 | 8 | 8 | 8 | yes |
| A8 | 8 | 8 | 8 | 8 | yes |
| B1 | 8 | 8 | 8 | 8 | yes |
| B2 | 8 | 9 | 8 | 8 | yes |
| B3 | 8 | 8 | 8 | 8 | yes |
| B4 | 8 | 9 | 8 | 8 | yes |
| B5 | 8 | 9 | 8 | 8 | yes |

All thirteen steps pass; every step scores 8 or more from all three original judges, and from grok-4.7 except A5 (7).
Desktop CI run 39689561526 on `4b7f80db` passed on macOS 15, Windows 2022 and Ubuntu 24.04, including the native task
journeys W1 to W8. P1 audit at `25c5ee98` (same code): codex three narrow P1s recorded as open follow-ups in
`AUDIT-2026-10-21-p1-codex-round20.md` (the user accepted closing with codex edge-case findings open on 2026-10-21); the
glm-5.3 pass was cut off by an upstream error, and every completed glm pass since round 18 reported no P1. This supersedes the
round 19 closure note.
