**Round 14, HEAD `fc645985`: Supervisor A = 7.38/10; Builder B = 7.40/10.**

Read-only source judgment; no files modified or journeys executed. Uncommitted implementation changes and unavailable ADR-266 fields receive no credit. Scores compare with Round 13’s Codex ballot.

| Step | R13 → R14 | Judgment and source |
|---|---:|---|
| A1 Discover | 8 → **8** | Full descriptions, schemas, hints and visible truncation provide strong discovery before enrollment ([WebMcpToolPanel.tsx:690](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:690)). |
| A2 Enable and scope trust | 7 → **8** | The consolidated trust summary and scoped revocation clarify ownership and control, although popup-based sign-in remains blocked ([WebMcpPages.tsx:149](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:149); [desktop-webmcp-browser.js:727](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:727)). |
| A3 Watch live | 7 → **7** | Outcomes, durations and result previews help monitoring, but navigation still targets a message rather than an exact call or approval ([WebMcpCallStrip.tsx:53](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:53)). |
| A4 Approvals | 7 → **7** | Call-derived effects and call-only scope are useful, but missing invocation arguments still prevent fully informed approval ([PermissionCard.tsx:446](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:446)). |
| A5 Failure recovery | 7 → **7** | Bounded polling now exposes interruption and reconnects, but this fixes transport recovery without completing invocation-specific diagnosis and recovery guidance ([desktop-webmcp-browser.js:533](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:533)). |
| A6 Evidence after the task | 7 → **7** | The ordered recap identifies failures and unused tools, but lacks historical catalog binding, effect receipts and individual evidence links ([ReviewLandingBrowserEvidence.tsx:42](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:42)). |
| A7 Pause and take over | 7 → **7** | Pause preserves the page, but native cancellation is not awaited and running page scripts cannot be interrupted immediately ([native-webmcp.js:432](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/native-webmcp.js:432)). |
| A8 Several sessions at once | 6 → **8** | Named ownership, independent revoke, waiting surfaces, LRU unloading and owner-window recovery make pooled sessions manageable ([WebMcpPages.tsx:67](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:67); [desktop-webmcp-browser.js:696](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:696)). |
| B1 See registered tools | 8 → **8** | Raw schemas, advisory lint and named registration rejections support inspection, without proving parity with runtime validation ([WebMcpToolPanel.tsx:923](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:923)). |
| B2 Try by hand and compare | 6 → **7** | Journal, editable replay and export materially improve manual testing, but agent comparison remains incomplete without delivered argument receipts ([WebMcpToolPanel.tsx:268](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:268)). |
| B3 Iterate | 7 → **7** | Draft preservation and stale-result marking help reloads, but the registration timeline still shows digest changes rather than inspectable schema differences ([WebMcpToolPanel.tsx:940](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:940)). |
| B4 Diagnose misuse | 6 → **7** | Property/rule/value-kind checks improve manual diagnosis, but unavailable agent inputs and checks against the current schema limit causal explanations ([WebMcpToolPanel.tsx:245](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:245)). |
| B5 Onboarding docs | 8 → **8** | The runnable guide covers registration, iteration, journal, comparison and CI, while explicitly explaining missing runtime inputs ([webmcp-page-tools.md:61](/Users/akiralam/code/ax-code-desktop/docs/webmcp-page-tools.md:61)). |

**Means:** A **7.00 → 7.38**; B **7.00 → 7.40**. Only **A2, A8, B2 and B4 moved**.

W7 now checks two-project storage isolation, hidden-call waiting, independent revocation and 50 switches; its memory checks cover renderer/guest heaps and DOM listeners, not whole-process memory ([project-browser-sessions.mjs:95](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e/project-browser-sessions.mjs:95)). This supports A8, but does not establish complete cross-platform qualification.

The three highest-impact changes:

1. **Deliver qualified runtime receipts:** masked arguments, authoritative validation paths, definition identity and call/approval correlation; connect these to comparison and actionable recovery (**B2/B4/A3/A4/A5**).
2. **Preserve historical schemas and evidence:** inspectable schema diffs, diagnosis against the invoked definition, full input/output comparison and exact-call recap links (**B3/B4/A6**).
3. **Confirm takeover completion:** distinguish cancellation requested from acknowledged, retain uncertain status when necessary, and verify long-call keyboard takeover natively (**A7**).

Five steps reach 8 on this ballot; passage requires **two of three judges**, so this judgment alone establishes no consensus result.

