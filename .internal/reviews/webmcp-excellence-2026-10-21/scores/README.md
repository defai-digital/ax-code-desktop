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
