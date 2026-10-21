# Independent UX scorecard, round 10 (read-only). You are one of three judges; judge independently.
Persona: a developer supervising 5-20 parallel coding-agent sessions across several repositories, who must (a) notice and answer what
needs them, (b) understand what each agent is doing without opening every session, (c) review and land the agents' changes safely.
Products: AX Code Desktop (this repository at HEAD), Orca, opencode desktop, Codex app, Claude Code desktop.
Evidence inside this repository (read them):
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/competitor-facts.md — competitor facts (V = verified, I = inference).
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/matrix2.md — capability matrix with AX citations, written BEFORE rounds 3-4.
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md — round 2/3/4 scores and the round 3/4/5 changes.
- .internal/reviews/supervision-ux-orca-2026-10-20/scorecard/round9/ — the three round-9 judgments (their flip lists drove round 10).
- .internal/prd/PRD-2026-10-21-competitive-supervision-ux-v1.md — the controlling PRD (requirements CS-05 to CS-32).
- .internal/reviews/supervision-ux-orca-2026-10-20/round8-webmcp-design/ — the WebMCP audit and design decision.
Round 10 added (verify each in source; scorecard README "Round 10" section). Round 10 focused on WebMCP (agents using web apps
through page tools), which Orca's browser pane lacks:
- Runtime WebMCP failure reason (eight codes), "Next step" and redacted input preview in the expanded tool row (lib/toolHelpers.ts
  describeWebMcpCall; components/chat/message/parts/ToolPart-impl.tsx). The runtime side (ADR-266) is on an AX Code branch, not yet
  in a pinned signed runtime, so these fields appear only once that runtime ships; older runtimes keep the previous display.
- Live "Agent calls (N)" strip in the project browser pane: tool, redacted arguments, outcome, failure reason
  (components/mcp/WebMcpCallStrip.tsx, lib/webMcpCalls.ts, mounted in components/layout/EmbeddedWebMcpBrowser.tsx).
- Browser evidence beside Stage, Commit and Push: the latest turn's page-tool calls and failures, opening the browser, labelled as
  calls not test results (components/views/git/ReviewLandingBrowserEvidence.tsx in git/ReviewLanding.tsx).
- The dock/taskbar badge now counts unique pending decisions (lib/tray/traySnapshot.ts). Correction: in round 9 it counted unseen
  notifications, despite the round-9 brief.
- PR state and CI checks on Mission Control rows, peek and a PR filter (components/supervision/missionControl/MissionControlPullRequest.tsx,
  hooks/useMissionControlPullRequests.ts, lib/supervision/pullRequestCache.ts, lib/supervision/missionControl.ts).
- CI: the round-9 run passed the supervision journeys on macOS, Windows and Ubuntu.
Not done (moved to round 11): landing from This session/Last turn, manual Retry and last-success age for stale previews, free grid
arrangement, inline three-way merge, review rail tree.
Earlier rounds 3-9 are summarized in the scorecard README.
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
