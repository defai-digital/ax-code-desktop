**Round 15 at `92775899`: A = 7.75/10; B = 7.40/10.**

Read-only source judgment; no files modified or native journeys executed. Uncommitted changes and unavailable ADR-266 fields receive no credit. Changes below compare with **Round 14’s Codex ballot**.

Paths: `UI/` = `desktop/packages/ui/src/`; `E/` = `desktop/packages/electron/src/`.

| Step | R14 → R15 | Judgment and source |
|---|---:|---|
| **A1 Discover** | 8 → **8** | Expanded descriptions, schemas, hints, origin and explicit truncation provide strong discovery before enabling access (`UI/components/mcp/WebMcpToolPanel.tsx:693`). |
| **A2 Enable and scope trust** | 8 → **8** | Session-bound trust and independent revocation are clear, but popup-based sign-in remains blocked (`UI/components/mcp/WebMcpPages.tsx:155`; `E/desktop-webmcp-browser.js:747`). |
| **A3 Watch live** | 7 → **8** | Call rows now target exact transcript parts and expose pending approvals through existing call IDs, although revelation requires the target to be rendered (`UI/components/mcp/WebMcpCallStrip.tsx:63`; `UI/lib/revealToolPart.ts:8`). |
| **A4 Approvals** | 7 → **7** | Page descriptions, hints and required markers help, but missing invocation arguments and lookup against the current catalog prevent reliably informed approval (`UI/components/chat/PermissionCard.tsx:455`; `UI/components/chat/WebMcpApprovalToolInfo.tsx:34`). |
| **A5 Failure recovery** | 7 → **7** | Bounded reconnection and recovery controls help, but adapter exceptions still collapse into a generic error without their actionable reason (`E/desktop-webmcp-browser.js:688`). |
| **A6 Evidence after the task** | 7 → **8** | Exact-call buttons, durations, result previews, visible list caps and clipboard export improve review, but historical definition identity remains unavailable without runtime receipts (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:143`). |
| **A7 Pause and take over** | 7 → **8** | Pause awaits bounded cancellation acknowledgement, interrupts only the tracked original document and retains unfinished requests for later stop reports (`E/native-webmcp.js:479`; `E/desktop-webmcp-browser.js:321`). |
| **A8 Several sessions at once** | 8 → **8** | Drag, dock, split, pop-out and owner-window recovery improve supervision, but pool eviction remains restricted to the requesting window (`UI/components/sessionGrid/SessionGrid.tsx:142`; `E/desktop-webmcp-browser.js:707`). |
| **B1 See registered tools** | 8 → **8** | Raw schemas, advisory lint and named registration rejection support inspection, without establishing authoritative runtime-validation parity (`UI/components/mcp/WebMcpToolPanel.tsx:702`, `:927`). |
| **B2 Try by hand and compare** | 7 → **7** | Manual replay remains useful, but agent arguments are unavailable and export placeholder recursion still skips arrays despite improved secret handling (`UI/components/mcp/WebMcpToolPanel.tsx:326`; `UI/lib/toolHelpers.ts:324`). |
| **B3 Iterate** | 7 → **7** | Retained drafts and registration history help iteration, but changes remain digest pairs rather than inspectable schema differences (`UI/components/mcp/WebMcpToolPanel.tsx:944`). |
| **B4 Diagnose misuse** | 7 → **7** | Advisory property/rule checks help manual debugging, but missing agent inputs and diagnosis against the current schema limit causal explanations (`UI/components/mcp/WebMcpToolPanel.tsx:301`, `:329`). |
| **B5 Onboarding docs** | 8 → **8** | The runnable guide covers registration, manual testing, agent use, iteration and CI while explicitly acknowledging missing runtime arguments (`docs/webmcp-page-tools.md:12`, `:71`). |

**Means:** A **7.38 → 7.75**; B **7.40 → 7.40**. Only **A3, A6 and A7 moved**, each +1. Eight steps reach 8 on this ballot; consensus passage requires another judge’s agreement.

R15b/R15c’s PR/check facets and palette split-open are present, but do not resolve missing WebMCP evidence (`UI/components/supervision/missionControl/MissionControlFilters.tsx:140`; `UI/components/ui/CommandPalette.tsx:766`).

The three highest-impact changes:

1. **Deliver qualified runtime receipts:** masked invocation arguments, authoritative validation paths and invoked-definition identity, connected to approvals and comparison (**A4, B2, B4**).
2. **Preserve historical definitions:** show actual schema diffs and diagnose each call against its invoked schema (**B3, B4**).
3. **Preserve adapter failure reasons:** carry structured outcomes into transcript, strip and recap, with specific recovery actions (**A5, B4**).

