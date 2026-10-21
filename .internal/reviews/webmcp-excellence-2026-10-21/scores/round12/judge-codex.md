**HEAD `cbb217055e86`: Supervisor A = 5.75/10; Builder B = 5.00/10. No step reaches 9; excellence is not achieved.**

Read-only source judgment; no files modified or native journeys executed. ADR-266 fields absent from the pinned runtime receive no credit. Arrows compare with `scores/baseline/judge-codex.md`.

| Step | Baseline → Round 12 | Judgment and source |
|---|---:|---|
| A1 Discover | 6 → **6** | Tools remain discoverable before granting access, but the list truncates descriptions and lacks raw schemas and hint badges ([WebMcpToolPanel.tsx:163](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:163)). |
| A2 Enable/scope trust | 6 → **6** | Explicit session-bound enrollment helps, but session switching recreates the browser and loses page/sign-in continuity ([EmbeddedWebMcpBrowser.tsx:127](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:127)). |
| A3 Watch live | 5 → **5** | Call rows show outcomes, but lack result expansion, duration, page binding, approval links and transcript navigation ([WebMcpCallStrip.tsx:49](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:49)). |
| A4 Approvals | 6 → **7** | Call-derived effect wording and a call-only scope improve clarity, but missing invoke arguments and explicit approval-expiry feedback still limit decisions ([PermissionCard.tsx:386](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:386)). |
| A5 Failure recovery | 5 → **6** | Manual outcomes distinguish timeout, cancellation and uncertainty, but structured application errors can still be reported as successful completion ([webmcp-manual-outcome.js:19](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/webmcp-manual-outcome.js:19)). |
| A6 Evidence afterward | 6 → **7** | The landing recap adds ordered operations, outcomes and unused tools, but provides no effect receipts or per-call evidence drilldown ([ReviewLandingBrowserEvidence.tsx:73](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:73)). |
| A7 Pause/take over | 6 → **6** | Disconnect and automatic pause remain useful, but there is no dedicated page-preserving takeover action with cancellation acknowledgement ([EmbeddedWebMcpBrowser.tsx:375](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:375)). |
| A8 Several sessions | 3 → **3** | Creating another browser replaces the window’s existing view rather than preserving independently owned session pages ([desktop-webmcp-browser.js:351](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:351)). |
| B1 Registered tools | 3 → **4** | Property constraints improve inspection, but raw schemas, annotations and registration-rejection explanations remain unavailable ([WebMcpToolPanel.tsx:186](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:186)). |
| B2 Try/compare | 3 → **6** | Exact strings, explicit empty values, zero/false and JSON fallback repair manual fidelity, but journal, replay and agent-call comparison are absent ([webMcpToolForm.ts:60](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/webMcpToolForm.ts:60)). |
| B3 Iterate | 4 → **4** | Tool state remains keyed by name without registration history, schema-version invalidation or stale-result marking ([WebMcpToolPanel.tsx:358](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:358)). |
| B4 Diagnose misuse | 3 → **4** | Manual field issues and advisory constraints help, but do not explain the agent’s actual input against the invoked schema ([WebMcpToolPanel.tsx:88](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:88)). |
| B5 Onboarding | 2 → **7** | The linked quickstart covers registration through agent testing, but its structured-error example contradicts the completion classifier ([webmcp-page-tools.md:39](/Users/akiralam/code/ax-code-desktop/docs/webmcp-page-tools.md:39)). |

**Means versus baseline:** A **5.38 → 5.75**; B **3.00 → 5.00**.

Round 12 accessibility additions are present: [keyboard tab focus](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:505), a [named page region](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:449), and the [review tree](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:467). The native [W1 journey](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs:65) checks four tool names within budget, but omits raw schemas, hint badges and the 30-property fixture.

An in-memory probe confirmed `{error:{field,constraint,got}}` returns `ok:true, outcome:"completed"`; the [transcript classifier](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:521) shares that detection gap.

The three highest-impact changes:

1. Add raw-schema inspection, advisory lint, named registration rejections, schema diffs and stale-result marking (**B1/B3/B4**).
2. Preserve bounded session-owned browser views with visible ownership, independent revocation and sign-in continuity (**A8/A2**).
3. Fix structured-error classification and add a manual journal, editable replay and agent-call comparison backed by a qualified runtime (**B2/B4/A5**).

