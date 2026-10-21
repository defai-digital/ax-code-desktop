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

## Decisions

- 2026-10-21: target changed by the user from beating Orca to an excellent WebMCP experience. Round 11 (S10, F10, R10) finishes
  under the competitive record; later rounds follow this plan. The standing push approval carries over; releases and runtime
  pins still need explicit approval.
