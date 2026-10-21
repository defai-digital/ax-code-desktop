**HEAD `7696232a`: A = 5.38/10; B = 3.00/10. No step reaches 9/10.**

Read-only source judgment against the controlling PRD’s absolute excellence bar. No files modified or runtime tests performed. Uncommitted additions and ADR-266 fields absent from the pinned runtime receive no credit.

| Step | Score | Judgment and source |
|---|---:|---|
| **A1 Discover** | **6** | Tools are visible before granting access, but truncated descriptions and absent schema/hint inspection limit understanding of their capabilities ([WebMcpToolPanel.tsx:118](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:118)). |
| **A2 Enable and scope trust** | **6** | Session changes correctly reset access, but trust lacks a consolidated scope/persistence/revocation surface and continuity across reopening ([EmbeddedWebMcpBrowser.tsx:126](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:126)). |
| **A3 Watch live** | **5** | The call strip exposes names and outcomes, but lacks page binding, result expansion, duration, approval linkage and transcript navigation ([WebMcpCallStrip.tsx:49](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:49)). |
| **A4 Approvals** | **6** | Origin and operation are clear, but unavailable invoke arguments, missing call-derived effect explanations and unclear approval-expiry outcomes prevent fully informed decisions ([PermissionCard.tsx:374](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:374)). |
| **A5 Failure recovery** | **5** | Browser-load repair actions help, but manual invocation collapses exceptions into `invoke-failed`, obscuring timeout, cancellation and uncertain completion ([desktop-webmcp-browser.js:615](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:615)). |
| **A6 Evidence afterward** | **6** | Transcript evidence and landing counts provide a foundation, but the landing control opens the browser without a task recap connecting effects, failures and individual calls ([ReviewLandingBrowserEvidence.tsx:21](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:21)). |
| **A7 Pause/take over** | **6** | Page-preserving revocation exists, but the visible enabled-state action is Disconnect, without a dedicated takeover flow or cancellation-complete acknowledgement ([EmbeddedWebMcpBrowser.tsx:374](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:374)). |
| **A8 Several sessions** | **3** | Each window owns one browser view, and replacing it clears storage, preventing concurrent session-owned pages with independent continuity ([desktop-webmcp-browser.js:349](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:349)). |
| **B1 Registered tools** | **3** | Derived input fields expose part of each definition, but raw schemas, annotations and runtime-rejection diagnostics remain unavailable ([WebMcpToolPanel.tsx:128](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:128)). |
| **B2 Try and compare** | **3** | Manual execution exists, but forms silently stop at 24 properties, trim strings and provide no agent-call comparison ([webMcpToolForm.ts:19](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/webMcpToolForm.ts:19)). |
| **B3 Iterate** | **4** | Native registration changes propagate, but name-keyed component state lacks definition-version invalidation, durable drafts and a registration timeline ([WebMcpToolPanel.tsx:211](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:211)). |
| **B4 Diagnose misuse** | **3** | Diagnostic rendering depends on supplied metadata, with no delivered argument/schema comparison or property-level validation explanation ([toolHelpers.ts:364](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:364)). |
| **B5 Onboarding docs** | **2** | HEAD documents Desktop’s separate UI automation surface, without a website-author registration-to-agent-testing quickstart ([development-webmcp.md:3](/Users/akiralam/code/ax-code-desktop/docs/development-webmcp.md:3)). |

The three changes with the greatest impact on the lowest steps:

1. **Ship a runnable builder quickstart**, linked from the tool panel, covering registration, schemas, lifecycle, errors and agent testing (**B5**).
2. **Build an inspectable, faithful tool workbench**: full schemas and rejection explanations, exact manual inputs, versioned registration history, outcome-aware journal and editable replay; qualify the runtime contract for exact agent-call comparisons (**B1–B4**).
3. **Provide isolated browser contexts per session**, with visible ownership, retained page/sign-in state and independent revocation (**A8**, also **A2**).

