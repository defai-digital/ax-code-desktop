**Round 17 judgment at `7f63b436`**, compared with Round 15 at `92775899`. Read-only source review; no files modified or native journeys executed. Unavailable ADR-266 runtime fields receive no credit; unrelated version-pin changes are excluded.

Paths: `UI/` = `desktop/packages/ui/src/`; `E/` = `desktop/packages/electron/src/`. Scores measure absolute excellence; consensus passage requires two judges scoring ≥8.

| Step | R15 → R17 | Judgment and source |
|---|---:|---|
| **A1 Discover** | 8 → **8** | Expanded descriptions, schemas, hints and explicit catalog limits make capabilities inspectable, although discovery remains a dense technical panel (`UI/components/mcp/WebMcpToolPanel.tsx:757`). |
| **A2 Enable and scope trust** | 8 → **9** | Session-scoped controls now combine isolated-profile sign-in popups, waiting agent actions and explicit Sign out, substantially completing session continuity (`E/desktop-webmcp-browser.js:946`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:485`). |
| **A3 Watch live** | 8 → **8** | Outcome and duration rows open exact transcript parts, but unavailable runtime correlation still limits authoritative page-bound evidence (`UI/components/mcp/WebMcpCallStrip.tsx:63`). |
| **A4 Approvals** | 7 → **7** | Definition mismatches now fail honestly, but missing invocation arguments and definition receipts still prevent fully informed approval (`UI/components/chat/WebMcpApprovalToolInfo.tsx:53`; `UI/components/chat/PermissionCard.tsx:463`). |
| **A5 Failure recovery** | 7 → **8** | Adapter exceptions now preserve allowlisted outcome/reason metadata instead of collapsing every failure into a generic error, improving actionable recovery without exposing exception secrets (`E/desktop-webmcp-browser.js:761`). |
| **A6 Evidence after the task** | 8 → **8** | Whole-turn counts and copying strengthen the bounded, navigable recap, but historical invoked-definition evidence remains incomplete without runtime receipts (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:203`). |
| **A7 Pause and take over** | 8 → **8** | Bounded cancellation acknowledgement distinguishes stopped from still-finishing work while preserving the page and avoiding rollback claims (`E/native-webmcp.js:509`). |
| **A8 Several sessions at once** | 8 → **8** | Independent page controls and conservative unsaved-work retention strengthen supervision, while hidden-page waiting and bounded capacity still require active page management (`UI/components/mcp/WebMcpPages.tsx:162`; `E/desktop-webmcp-browser.js:446`). |
| **B1 See registered tools** | 8 → **8** | Redacted schemas, hints, advisory lint and registration rejection provide strong inspection without establishing authoritative runtime-validator parity (`UI/components/mcp/WebMcpToolPanel.tsx:489`). |
| **B2 Try by hand and compare** | 7 → **7** | Document/definition-bound invocation and safer exports repair correctness, but unavailable agent arguments still prevent dependable side-by-side comparison (`E/desktop-webmcp-browser.js:1402`; `UI/components/mcp/WebMcpToolPanel.tsx:348`). |
| **B3 Iterate** | 7 → **7** | Draft retention and stale-result handling support reloads, but registration changes still expose digest pairs rather than inspectable property-level schema differences (`UI/components/mcp/WebMcpToolPanel.tsx:1019`). |
| **B4 Diagnose misuse** | 7 → **7** | Shared definition identity and explicit unavailable-input states improve honesty, but diagnosis remains advisory against the current schema rather than the proven invoked definition (`UI/components/mcp/WebMcpToolPanel.tsx:198`; `docs/webmcp-page-tools.md:72`). |
| **B5 Onboarding docs** | 8 → **8** | The runnable guide covers registration, manual testing, agent use, iteration and reproducible exports while explaining runtime limitations (`docs/webmcp-page-tools.md:22`). |

**Means:** A **7.75 → 8.00**; B **7.40 → 7.40**. **A2 and A5 moved, each +1.** Other hardening improves reliability without closing their remaining excellence gaps. Ten steps score ≥8 on this ballot; consensus cannot be determined from one judge.

Three highest-impact changes:

1. **Qualify and pin runtime receipts:** masked invocation arguments, invoked-definition identity and authoritative validation reasons for **A4, B2 and B4**.
2. **Retain historical definitions and show property-level diffs**, enabling diagnosis against the actual invoked schema for **B3 and B4**.
3. **Complete approval lifecycle evidence:** explicit expiry outcomes and receipt-linked approval, execution and recap states for **A4, A3 and A6**.

