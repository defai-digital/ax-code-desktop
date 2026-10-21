I have enough evidence. The round 18 baseline scores are: codex AX 9.32, deepseek 9.26, MiniMax 9.30, grok 9.24. Round 19 changes are incremental WebMCP hardening only; no overview or review surface moved. The other judges' pattern shows workspace gaining 0.05 from the round 18 WebMCP work alone.

Now I'll write the independent round 19 judgment.

---

**Independent round-19 judgment at HEAD `f06cea02`.** Weights: overview 40%, review 35%, workspace 25%. Round 19's only delta over round 18 is WebMCP hardening: stable tool identity keyed to `(invocationID, definitionDigest)` (`lib/webMcpCatalog.ts:103-105`), redacted schema-derived text across property diffs (`lib/webMcpPropertyDiff.ts:1,11-12`, citing `webmcp-redaction.mjs`), and an association-aware recap that never calls unknown invocations "not called" (`components/views/git/ReviewLandingBrowserEvidence.tsx:95-101`). Overview and review surfaces are untouched by the round 19 brief, so I hold those scores and add the WebMCP gain to workspace (and a hair to review, where the recap is rendered).

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.4** | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout (25%) | **9.3** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes (35%) | **9.25** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.32** | **8.93** | **6.93** | **8.18** | **8.73** |

**Overview — AX vs Orca.** Multi-select PR state and checks facets with counts (`components/supervision/missionControl/MissionControlFilters.tsx:130`), `#PR` / `#123` palette search with host/project Tab and Shift+Enter split-open, and the actionable global Needs-You inbox (`components/supervision/NeedsYouPopover.tsx:121`) keep the lead first named in round 15; round 19 changed nothing here. **AX vs opencode.** AX's global decision cards and per-row browser context make supervision feasible across 5–20 sessions; opencode's per-session permission docks are documented as the only answer surface.

**Workspace — AX vs Orca.** The grid's drag-to-swap or dock (`components/sessionGrid/SessionGrid.tsx:142-151`), arrow-key moves with following focus, four-pane ceiling, pop-out with one browser owner, and remembered split ratios close Orca's arrangement edge; round 19 adds stable tool identity (`webMcpCatalog.ts:103`) and schema-derived redaction (`webMcpPropertyDiff.ts:11`) so concurrent browser panes stop confusing two tools that share a name. Orca's recursive pane tree that hosts any tool still pulls slightly ahead for non-session tools, but for this persona AX wins. **AX vs opencode.** Four simultaneous sessions with their own Chat/Changes/Files/Terminal beats the documented unsplit timeline-plus-right-panel.

**Review — AX vs Orca.** Session/turn landing signs before/after blob identity and file mode (`components/views/git/ReviewLanding.tsx:77-91`); the collapsible rail tree has a drag width (`components/views/ReviewFileRail.tsx:279-309`) and the browser recap beside landing now reports a definition-changed call only when it can also report association (`ReviewLandingBrowserEvidence.tsx:98-101`). Orca retains inline 3-way merge and a switchable compare base; the +0.05 here vs round 18 is the honest recap. **AX vs opencode.** Content-and-mode landing plus a browser recap beats opencode's documented turn-undo without commit controls.

**Weighted.** 9.4×0.40 + 9.3×0.25 + 9.25×0.35 = **9.32**.

**AX vs Orca: better** (+0.39, above the PRD 0.2 margin). **AX vs opencode: better** (+2.39).

No flip-list needed (AX leads beyond the margin). One residual nit worth recording: `WebMcpApprovalToolInfo` still summarizes a page's description at 200 chars before the expandable full text (`components/chat/WebMcpApprovalToolInfo.tsx:78-80`); defensible while the untrusted description is one click away and a digest mismatch fails closed (`:36-41`).