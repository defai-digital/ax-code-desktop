**HEAD `7cd2d383`: Supervisor A = 7.00/10; Builder B = 7.00/10.** Substantial progress, but my ballot reaches 8 only on A1, B1 and B5.

Read-only source judgment; no files modified or journeys executed. Uncommitted changes and unavailable ADR-266 fields receive no credit. Arrows compare with Round 12’s Codex judgment.

| Step | Round 12 → 13 | Judgment and source |
|---|---:|---|
| A1 Discover | 6 → **8** | Expanded descriptions, schemas, hints, origin and explicit truncation make capabilities inspectable before granting access ([WebMcpToolPanel.tsx:367](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:367)). |
| A2 Enable/scope trust | 6 → **7** | Project storage and session-owned views preserve continuity, but popup-based sign-in remains blocked and the unified trust experience is incomplete ([desktop-webmcp-browser.js:558](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:558)). |
| A3 Watch live | 5 → **7** | Duration, filtered results and conversation navigation materially improve monitoring, but navigation targets a message rather than an exact call and approval linkage remains absent ([WebMcpCallStrip.tsx:63](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:63)). |
| A4 Approvals | 7 → **7** | Call-derived effects and explicit call-only scope remain useful, but missing runtime-provided invocation arguments still limit informed decisions ([PermissionCard.tsx:446](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:446)). |
| A5 Failure recovery | 6 → **7** | Structured application errors now fail correctly alongside timeout/cancellation distinctions, but classification alone does not provide complete recovery guidance ([webmcp-manual-outcome.js:15](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/webmcp-manual-outcome.js:15)). |
| A6 Evidence afterward | 7 → **7** | Ordered outcomes and unused-tool reporting remain helpful, but the recap still lacks historical catalog binding, effect receipts and individual evidence links ([ReviewLandingBrowserEvidence.tsx:42](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:42)). |
| A7 Pause/take over | 6 → **7** | Page-preserving pause/resume is real, but native cancellation is requested without awaiting confirmation and mid-script page operations cannot be aborted immediately ([native-webmcp.js:432](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/native-webmcp.js:432)). |
| A8 Several sessions | 3 → **6** | Session-owned pooling, project partitions and independent revocation fix the destructive switching foundation, but capacity still returns `pool-full` and dedicated multi-session supervision surfaces remain missing ([desktop-webmcp-browser.js:558](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:558)). |
| B1 Registered tools | 4 → **8** | Raw schemas, advisory lint, hints and named catalog rejections provide strong inspection, without establishing parity with runtime validation ([WebMcpToolPanel.tsx:582](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:582)). |
| B2 Try/compare | 6 → **6** | Faithful manual inputs and corrected outcomes help, but storage retains only the latest result per tool, without a journal, editable replay or agent-call comparison ([useWebMcpBrowserStore.ts:95](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:95)). |
| B3 Iterate | 4 → **7** | Definition-keyed drafts and stale results improve reload continuity, but registration history exposes digest changes rather than inspectable schema differences ([WebMcpToolPanel.tsx:599](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:599)). |
| B4 Diagnose misuse | 4 → **6** | Catalog diagnostics and structured errors help builders, but the actual agent input and authoritative validation explanation remain unavailable when runtime metadata is missing ([toolHelpers.ts:414](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:414)). |
| B5 Onboarding | 7 → **8** | The runnable guide now covers inspection, lifecycle, troubleshooting and a documented builder CLI with meaningful exit codes ([webmcp-page-tools.md:124](/Users/akiralam/code/ax-code-desktop/docs/webmcp-page-tools.md:124)). |

Means moved **A: 5.75 → 7.00**, **B: 5.00 → 7.00**; A4, A6 and B2 are unchanged.

Recorded native passes deserve bounded credit: [W1/W2](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs:71) omit the prescribed large-schema/property-25 checks; [W5](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs:119) covers idle takeover, not long-call cancellation. These passes do not establish the complete task-suite gate.

The three highest-impact changes:

1. Add a bounded manual journal, editable replay, comparison and regression export (**B2/B4**).
2. Qualify and pin runtime support for observed inputs, validation paths and call correlation, then expose actionable diagnostics (**B4/A4/A5/A6**).
3. Finish the page switcher, waiting indicators, session-grid ownership, capacity recovery and native W7 isolation journey (**A8/A2**).

The controlling rule requires **8+ from two judges per step**; this ballot alone cannot establish consensus passage.

