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
