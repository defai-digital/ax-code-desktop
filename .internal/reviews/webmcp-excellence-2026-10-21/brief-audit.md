# WebMCP experience audit at HEAD (read-only, English, max 1100 words). Do not modify files.

AX Code Desktop embeds a project browser where the coding agent uses web pages through WebMCP (page-registered tools listed and
invoked by the agent, plus act/read), with human approval. The goal is now an EXCELLENT WebMCP experience, not parity with a
competitor. Two personas:
- A: a developer supervising agents that use web apps through WebMCP.
- B: a web developer BUILDING a WebMCP-enabled app with an agent's help (registering tools, testing, debugging schemas).

Read: AGENTS.md; .internal/reviews/supervision-ux-orca-2026-10-20/round8-webmcp-design/ (AUDIT, DECISION, SYNTHESIS);
.internal/prd/PRD-2026-10-21-competitive-supervision-ux-v1.md sections for CS-21 and CS-25..CS-32; scorecard README rounds 8-11;
docs/development-webmcp.md; and the source: components/layout/EmbeddedWebMcpBrowser.tsx, hooks/useWebMcpBrowser.ts,
stores/useWebMcpBrowserStore.ts, components/mcp/ (WebMcpCallStrip, page tools, Try it), components/chat/PermissionCard.tsx,
components/chat/message/parts/ToolPart-impl.tsx, lib/toolHelpers.ts, lib/webMcpCalls.ts,
components/views/git/ReviewLandingBrowserEvidence.tsx, desktop/packages/electron/src/desktop-webmcp-browser.js and related
electron files (all paths under desktop/packages/ui/src unless stated). The runtime side lives in the AX Code repo (not here);
ADR-266 adds inputPreview, reason codes, nextAction, schema validation before permission and rejects schemas that use
`pattern`/`patternProperties`; it is not yet in a pinned runtime.

For each journey step, give what exists (path:line), what is missing or rough, and a 1-10 score:
A1 discover what the agent can do on a page; A2 enable and scope trust (and persistence, revocation, sign-in); A3 watch the agent
act live (where on the page, which tool, arguments, result); A4 decide approvals; A5 understand and recover from failures;
A6 evidence after the task (transcript, landing, recap); A7 pause/take over; A8 several sessions and pages at once.
B1 see the tools my page registers, with schemas and validation problems (including ones the runtime will reject); B2 try a tool
by hand and compare with what the agent sent; B3 iterate (reload, hot reload, re-registration) without losing state; B4 see why
the agent misused or failed a tool (schema mismatch, description ambiguity); B5 docs and onboarding for making a page agent-usable.
Also cross-cutting: accessibility, the 14 locales, macOS/Windows/Ubuntu differences, performance.

End with the 12 highest-value changes ranked by user value / effort, each tagged A or B, Desktop-only or needs runtime.
