# Independent UX scorecard, round 14 interim (read-only). You are one of three judges; judge independently.
Persona: a developer supervising 5-20 parallel coding-agent sessions across several repositories, who must (a) notice and answer what
needs them, (b) understand what each agent is doing without opening every session, (c) review and land the agents' changes safely.
Products: AX Code Desktop (this repository at HEAD), Orca, opencode desktop, Codex app, Claude Code desktop.
Evidence inside this repository (read them):
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/competitor-facts.md — competitor facts (V = verified, I = inference).
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/matrix2.md — capability matrix with AX citations, written BEFORE rounds 3-4.
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md — round 2/3/4 scores and the round 3/4/5 changes.
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/round10/ — the three round-10 judgments (their flip lists drove rounds 11 to 13).
- .internal/prd/PRD-2026-10-21-competitive-supervision-ux-v1.md — the controlling PRD (requirements CS-05 to CS-32).
- .internal/reviews/supervision-ux-orca-2026-10-20/round8-webmcp-design/ — the WebMCP audit and design decision.
Since round 10 (verify each in source; .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md "Round 11" and
.internal/reviews/webmcp-excellence-2026-10-21/scores/README.md rounds 12 and 13):
- Review: Stage, Commit and Push from This session and Last turn, bound to the reviewed content and file mode
  (components/views/git/ReviewLanding.tsx); a collapsible review rail tree with adjustable width (components/views/ReviewFileRail.tsx);
  a Windows fix so Last turn no longer hangs (components/views/SessionChangesView.tsx).
- Overview: Retry and last-read age for stale activity previews; the titlebar Activity panel no longer stalls while sessions stream.
- WebMCP (agents using web apps; Orca's browser pane has no page-tool concept): several sessions and projects can each keep their
  own page at once with a page switcher, per-session revoke, capacity handling and waiting calls surfaced in Needs you, Mission
  Control and the session grid (in progress in round 14); pause and take over; an inspectable tool panel with schemas, hints,
  lint, registration history and honest Try it outcomes; a call strip bound to the page with durations and results; approval
  cards with a one-sentence effect; a recap beside landing; a builder quickstart and a headless 
> ax-coder@7.28.0 webmcp:check /Users/akiralam/code/ax-code-desktop
> node desktop/packages/electron/scripts/webmcp-check.mjs

 ELIFECYCLE  Command failed with exit code 64..
- CI: supervision and project-browser journeys pass on macOS, Windows and Ubuntu.
Earlier rounds 3-13 are summarized in the scorecard README.
Also score WebMCP (agent use of web apps) as part of the workspace and review surfaces where it applies; Orca has a browser
pane but no page-tool concept (competitor-facts.md).
Rules: Unknown competitor capabilities are not counted as weaknesses. Weight by impact on the persona, not by count. Be strict.
Verify claims in source; cite path:line for every AX claim. Do not credit features you cannot find.
Output (max 650 words, English):
1. Per surface (Mission Control/overview; Workspace/layout; Review changes) a 1-10 score for each of the five products, with a
   two-sentence justification for AX vs Orca and AX vs opencode.
2. Weighted overall (overview 40%, review 35%, workspace 25%) per product and the verdict lines
   "AX vs Orca: better / equal / worse" and "AX vs opencode: better / equal / worse".
3. If AX is not better than Orca: the 3 smallest concrete changes most likely to flip it.

Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
