**Round 25: A = 8.13/10; B = 7.80/10.**

I interpret the round-25 target as **`0fb2203e`**; `92775899` is an older ancestor. Verified `15f40f1d..HEAD` and v7.28.2’s actual approval payload; no credit for unsent fields. Read-only: no files modified. Shared-redaction tests: **20 passed**; native journeys, screenshots and platform/accessibility behavior were not verified.

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Full descriptions, schemas, hints and explicit catalog limits support discovery, but capabilities remain behind a technical disclosure tree (`UI/components/mcp/WebMcpToolPanel.tsx:921`). |
| A2 enable and scope trust | 9 | Origin, project/session ownership, access scope, independent revocation and explicit project sign-out make trust understandable and controllable (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The call strip exposes arguments, duration, digest, result and approval navigation, although input previews are abbreviated and receipt coverage depends on observed approvals (`UI/components/mcp/WebMcpCallStrip.tsx:107`). |
| A4 approvals | 8 | Call-derived effects and digest-matched definitions inform decisions, but disappearing requests still lack authoritative expiry, denial or cancellation records (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | 8 | Bounded initialization, distinct outcomes and retained-page recovery improve resilience, but native initialization failures become a generic page-load error (`E/native-webmcp.js:114`; `E/desktop-webmcp-browser.js:1122`). |
| A6 evidence after task | 8 | Copyable recaps provide ordered outcomes, durations, digests, rejection details and never-called tools, but omit inputs and depend on ephemeral approval receipts (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:31`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and distinguish stopped from still-finishing work without promising rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:565`). |
| A8 several sessions | 8 | Session-owned pages, independent revocation, waiting-page controls and owner-loss recovery support concurrency, but recovery lacks equally informative user-facing explanation (`UI/components/mcp/WebMcpPages.tsx:101`; `E/desktop-webmcp-browser.js:520`). |
| B1 registered tools | 8 | Schemas, hints, advisory lint and named catalog rejections are inspectable, but advisory checks cannot establish runtime-validator compatibility (`UI/components/mcp/WebMcpToolPanel.tsx:710`; `:947`). |
| B2 try and compare | 7 | Manual journaling and comparison are useful, but replay retains off-list enum values that the select cannot display and can submit after a warning (`UI/lib/webMcpToolForm.ts:169`; `UI/components/mcp/WebMcpToolPanel.tsx:337`; `:584`). |
| B3 iterate | 8 | Registration history, retained drafts and stale-result markers support iteration, but schema differences remain JSON and omit nested/root-only changes (`UI/components/mcp/WebMcpToolPanel.tsx:982`; `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis and filtered runtime rejections avoid invented findings, but missing receipts and unsupported constraints limit coverage (`UI/lib/webMcpDiagnosis.ts:227`; `:235`). |
| B5 onboarding docs | 8 | A runnable guide covers registration, manual testing, agent comparison and export, with honest runtime limitations, but onboarding remains documentation-led (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **39/5 = 7.80**.

**Movement versus round 24’s Codex ballot: none.** Compound-path filtering, inherited sensitivity and unified structured-field masking strengthen correctness (`S/webmcp-redaction.mjs:97`, `:150`, `:161`; `UI/lib/toolHelpers.ts:298`); they do not remove the remaining journey limitations. B2 remains below 8 on this ballot; majority passage requires another judge’s agreement.

Three highest-impact changes:

1. **Make enum replay visually truthful:** retain off-list values in JSON mode or show them explicitly before submission (**B2**).
2. **Provide runtime-issued completed-call receipts and authoritative approval outcomes**, retained beyond permission disappearance (**A3/A4/A6/B2/B4**).
3. **Render recursive schema changes as readable before/after rows**, including root constraints and nested properties (**B3/B1/B4**).

