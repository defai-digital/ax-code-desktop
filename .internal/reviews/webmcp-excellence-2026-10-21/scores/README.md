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
