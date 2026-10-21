**Round 18 at `7811c298`**, reviewing the source lineage from `92775899`, including `7f63b436..HEAD`. Read-only; no files modified or journeys executed. Unrelated version pins excluded.

Paths below: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | **8** | Descriptions, schemas, origin, hints and explicit catalog limits provide substantial discovery, though the experience remains a dense, collapsed technical inventory (`UI/components/mcp/WebMcpToolPanel.tsx:980`). |
| A2 enable and scope trust | **9** | Session ownership, origin and access scope combine with isolated-profile sign-in and explicit project sign-out to make trust understandable and revocable (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:482`). |
| A3 watch live | **8** | Outcome rows expose duration, previews, transcript navigation and unanswered approvals, but stronger execution correlation remains unavailable (`UI/components/mcp/WebMcpCallStrip.tsx:60`). |
| A4 approvals | **8** | Runtime-supplied redacted previews retain honest truncation markers, digest-matched definitions expand their descriptions, and disappeared unanswered requests receive an explicit outcome, although disappearance does not establish timeout (`UI/lib/toolHelpers.ts:479`; `UI/components/chat/WebMcpApprovalToolInfo.tsx:52`; `UI/components/mcp/WebMcpCallStrip.tsx:63`). |
| A5 failure recovery | **8** | Structured application failures and explicit timeout/cancellation states are distinguished, but generic runtime errors can still collapse into application-error without an authoritative recovery explanation (`UI/lib/toolHelpers.ts:565`). |
| A6 evidence after the task | **8** | The recap copies the whole turn with outcomes, previews and unused tools, but completed-call metadata does not establish retained invocation arguments or definition identity (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:96`). |
| A7 pause and take over | **8** | Cancellation waits for bounded acknowledgement and targets only the executing document, preserving a credible handover without promising rollback (`E/native-webmcp.js:509`). |
| A8 several sessions at once | **8** | Session-owned pooled pages, independent access controls and visible cancellation states support concurrent supervision, with hidden-page waiting still requiring active management (`UI/components/mcp/WebMcpPages.tsx:145`). |
| B1 see registered tools | **8** | Raw schemas, bounded-display notices, advisory lint and named registration rejection provide useful inspection without authoritative runtime-validation parity (`UI/components/mcp/WebMcpToolPanel.tsx:470`). |
| B2 try by hand and compare | **7** | Manual invocation now supports credential-shaped names through opaque identifiers, but completed runtime metadata still omits the arguments needed for dependable post-call comparison (`E/desktop-webmcp-browser.js:1401`; `UI/lib/webMcpCalls.ts:121`). |
| B3 iterate | **8** | Bounded previous definitions and rendered property differences improve reload iteration, but constraint-only changes such as minimum or maximum are omitted by the diff (`UI/lib/webMcpCatalog.ts:274`; `UI/lib/webMcpPropertyDiff.ts:11`). |
| B4 diagnose misuse | **7** | Historical digest matching improves diagnosis when receipts exist, but missing history falls back to the current schema and the pinned runtime’s completed-call metadata lacks the necessary invocation receipts (`UI/components/mcp/WebMcpToolPanel.tsx:306`). |
| B5 onboarding docs | **8** | The runnable guide covers registration, manual execution, comparison and regression export, but its “current schema” diagnosis description now trails the historical-definition implementation (`docs/webmcp-page-tools.md:12`; `:72`). |

**Means:** A **8.125/10**; B **7.60/10**.

Against the round 17 Codex ballot, **A4 moves 7→8 and B3 moves 7→8**; all other scores hold. Eleven steps reach 8 on this ballot; consensus requires the other judges.

W3/W4/W6/W8 are wired into the three-platform CI suite (`.github/workflows/desktop-ci.yml:265`, `:319`), but W4 explicitly uses scripted expiry (`desktop/packages/electron/scripts/e2e/project-browser-tasks.mjs:185`); source wiring proves neither successful CI execution nor signed-runtime timer qualification.

Three highest-impact changes:

1. Retain redacted invocation previews and definition digests in completed runtime metadata, enabling dependable **B2/B4** comparison and diagnosis.
2. Refuse diagnosis against an unmatched current schema; show “invoked definition unavailable” instead (**B4**).
3. Extend property diffs to constraints, nested schemas and root-level changes, with readable explanations (**B3/B1**).

