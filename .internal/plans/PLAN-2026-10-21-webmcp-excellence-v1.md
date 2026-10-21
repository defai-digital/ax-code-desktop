# Plan: WebMCP excellence v1

Controlling record: `../prd/PRD-2026-10-21-webmcp-excellence-v1.md`. Evidence: `../reviews/webmcp-excellence-2026-10-21/`.

## Model allocation

Same allocation as the competitive plan, applied to WebMCP:

| Role | Model |
| --- | --- |
| Source audit, implementation, review of security-sensitive code | codex |
| Larger implementation packages in isolated worktrees | grok 4.7 |
| UI and UX critique, judge | MiniMax-M3 |
| Visual comparison of screenshots | Gemini 3.8 Flash |
| Translations | Mistral Medium 3.5 |
| Accessibility review | Nemotron 3 Super |
| Long-context synthesis | Kimi K3 |
| Verification of citations and claims | glm-5.3 |
| Judges | codex, deepseek-flash, MiniMax-M3 |

## Before round 12: research and requirements

1. External state of the art (WebMCP proposal status, builder tooling, browser-agent UX, known pain points).
2. Source audit of every persona step at HEAD (codex).
3. Plus, minus, multiply and divide discussion on both inputs (the round 8 method), synthesis (Kimi), verification (glm).
4. Fix PRD sections 4 and 6; baseline-score the rubric with the three judges before implementation.

Done 2026-10-21: inputs `RESEARCH-2026-10-21-state-of-the-art.md` (research agent), `RESEARCH-2026-10-21-grok-value.md` (grok),
`AUDIT-2026-10-21-codex-baseline.md` (codex); discussion `answers/` (MiniMax-M3 UI/UX, deepseek-flash as the AI agent, codex
feasibility); synthesis `SYNTHESIS-kimi.md`; verification `VERIFY-glm.md`. PRD sections 4 and 6 fixed.

## Round 12: honest builder basics (Desktop only, small)

| Package | Requirements | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| M12: manual panel truth | WX-01 honest forms, WX-03 honest outcomes | codex (isolated worktree) | deepseek-flash | implemented with probes; review: 1 HIGH (translations), 1 MEDIUM, 6 LOW being fixed; ships in round 12b |
| Q12: builder quickstart and fixture page | WX-06; the fixture page also serves task suite W1 to W3 and W8 | Claude | MiniMax-M3 (as a first-time builder) | done; review scored onboarding 5/10 with 3 HIGH, all fixed; example verified in the bundled engine; native journey W1 passes (4 tools, 5 actions, budget 8) |
| A12: approval card and accessibility | WX-08, WX-11 | Claude | Nemotron 3 Super (accessibility) | done; no blocking issue; element names capped |
| J12: baseline judging | three judges score every step at HEAD before round 12 lands | codex, deepseek-flash, MiniMax-M3 | | done (`scores/README.md`) |
| X12: browser recap at landing | WX-13 (Desktop part): each step of the latest turn, how it was done, how it ended, tools never called | Claude | (round 12b review) | done with probes |
| R10 (carried over) | review rail tree and adjustable width | grok (worktree) | MiniMax-M3 | review: 2 HIGH, 4 MEDIUM being fixed; ships in round 12b |

## Round 13: the steps that did not move (A8, A7, A3, B1, B3)

Round 12 judged at `cbb21705`: supervisor means 5.75 / 6.0 / 6.5, builder 5.0 / 5.4 / 6.0 (`scores/README.md`).

| Package | Requirements | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| V13: several sessions at once | WX-15 steps 1 to 6 (view pool, per-project storage, additive IPC, hidden-page wait, per-session revocation, keyed store) | codex (worktree `wx15-view-pool`) | deepseek-flash | in progress |
| I13: inspect and iterate | WX-02 inspectable capabilities and lint, WX-04 registration truth | grok (worktree `wx13-inspect`) | MiniMax-M3 | in progress |
| C13: page-bound call strip | WX-07: duration, filtered result, earlier-page marker, open the call in the conversation | Claude (worktree `wx13-call-strip`) | glm-5.3 | done with probes |
| T13: pause and take over | WX-10 after V13 lands (shares the browser pane) | | | next |

## Round 14: the four steps still below the bar (A8, A2, B2, B4)

Round 13 judged at `7cd2d383`: nine of thirteen steps pass (`scores/README.md`).

| Package | Requirements | Author | Reviewer | Status |
| --- | --- | --- | --- | --- |
| R14a: sessions you can see and control | WX-15 steps 7 to 9 (page switcher, per-session revoke, capacity and LRU unload, waiting surfaced outside the pane, W7), WX-09 trust summary | codex (worktree `r14-sessions`) | deepseek-flash | in progress |
| R14b: try, compare and diagnose | WX-05 journal and replay, comparison with the agent's call, misuse diagnosis, WX-18 regression export, guide update | grok (worktree `r14-diagnose`) | MiniMax-M3 | in progress |

## Decisions

- 2026-10-21: target changed by the user from beating Orca to an excellent WebMCP experience. Round 11 (S10, F10, R10) finishes
  under the competitive record; later rounds follow this plan. The standing push approval carries over; releases and runtime
  pins still need explicit approval.
- 2026-10-21: the user lowered the rubric bar to 8 ("i can accept if reach 8"): every persona step at least 8 from every
  judge (PRD section 3, item 1). After round 12 the steps below 8 for at least one judge are A1, A2, A3, A5, A7, A8, B1, B2,
  B3, B4 (and B5 at 7 from codex); A4 and A6 reach 8 from two judges.
- 2026-10-21: the user set the pass rule per step to "at least 8 from two of the three judges". Against round 12 this passes
  A4 (7/8/8) and B5 (7/8/8); every other step is still below it (A6 7/7/8 and B2 6/6/8 have one judge at 8).

