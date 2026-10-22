I have verified all 13 steps directly in source. Here is my round 25 ballot.

---

## Round 25 judgment (read-only, at `0fb2203e`)

**Verification limits.** The `task`/`bash` tools were unavailable in this turn (`ProviderModelNotFoundError`), so I could not run `git log5193b0c8..HEAD`, the test suite, or any journey. Every claim below is from direct source reads at this commit; no runtime or screenshot evidence. `UI` = `desktop/packages/ui/src`, `E` = `desktop/packages/electron/src`, `S` = `desktop/shared`.

**Rounds 22–24 hardening, verified in source.** Indexed/quoted compound path sensitivity and JSON-Pointer escapes (`S/webmcp-redaction.mjs:102`, `:106`); bracketed assignments (`:72`); inherited field sensitivity through nested descendants (`:161`, `:168`); JSON-draft masking where the redactor would change a value; a 2-second native init bound with abort on `destroyed`/`render-process-gone` (`E/native-webmcp.js:114`, `:133-135`); owner-window and renderer-loss recovery retaining the page for the next window (`E/desktop-webmcp-browser.js:104`, `:527`); full-schema diagnosis covering properties the field form hides (`UI/lib/webMcpToolForm.ts:86`). `92775899` is a round-15 ancestor; the gaps named below are unchanged since round 24.

| Step | Score | Judgment (source) |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and named catalog rejections are inspectable, but every capability sits behind one collapsed technical disclosure tree with no grouping or search (`UI/components/mcp/WebMcpToolPanel.tsx:930`). |
| A2 enable/scope trust | 9 | Origin, project, session and access state sit in one trust disclosure with per-session revoke and per-project sign-out that bind to the next call (`UI/components/mcp/WebMcpPages.tsx:157`, `:164`). |
| A3 watch live | 8 | The open strip gives outcome, duration, redacted arguments, 8-char digest, result preview, a failure reason and a transcript jump, but arguments are hard-cut at 140 characters (`UI/components/mcp/WebMcpCallStrip.tsx:109`). |
| A4 approvals | 8 | Call-derived effect sentence, origin, tool, element, scope-once and the digest all render, but a vanished request reports only "no answer was recorded" and never an expiry (`UI/components/chat/PermissionCard.tsx:405`, `:488`). |
| A5 failure recovery | 7 | The collapsed transcript row still shows only the generic failed label; the actual persisted error string appears solely after expanding the part (`UI/components/chat/message/parts/ToolPart-impl.tsx:1685`, `:994`). |
| A6 evidence after task | 8 | The recap lists each step, outcome, duration, digest, rejection detail and never-called tools, and copies the whole turn, but it carries no call inputs because evidence is receipt-gated (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:107`, `:193`). |
| A7 pause and take over | 8 | Pause is separate from Disconnect and keeps the page, distinguishing stopped from still-finishing in a polite live region with no rollback claim (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545`, `:595`). |
| A8 several sessions | 8 | Per-session pages, independent revoke, waiting-page badges and recovery after owner loss work, but recovery is reported only as a page state, never explained to the person (`UI/components/mcp/WebMcpPages.tsx:123`, `E/desktop-webmcp-browser.js:527`). |
| B1 registered tools | 8 | Raw schema, hint badges, advisory lint and named rejections are inspectable, but the field aid still silently truncates descriptions at 300 characters (`UI/lib/webMcpToolForm.ts:30`). |
| B2 try and compare | 7 | Full forms, masked drafts, replay and side-by-side comparison exist, but exact agent input needs a surviving approval receipt — `readWebMcpInvokeInput` returns "missing" without `arguments`, `input` or `inputPreview` (`UI/lib/toolHelpers.ts:401`). |
| B3 iterate | 8 | Registration history, retained drafts, stale-result marks and structured property diffs support iteration, but the diff still renders as one raw JSON blob and misses root-level composition changes (`UI/components/mcp/WebMcpToolPanel.tsx:982`, `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis names property, rule and value kind across the whole schema, and receipt placeholders are refused rather than diagnosed, but unsupported constraints and absent receipts limit coverage (`UI/lib/webMcpDiagnosis.ts:75`, `:235`). |
| B5 onboarding docs | 8 | A runnable quickstart (`docs/examples/webmcp-quickstart/index.html`) plus honest limits on the 2 KiB preview and memory-only receipts are documented, yet onboarding stays document-led rather than an in-product loop (`docs/webmcp-page-tools.md:311`). |

**Means:** A **63/8 = 7.88**; B **38/5 = 7.60**.

**Movement versus round 24: no step moved on my ballot.** Round 24 scored A 8.13 (codex/deepseek) or 8.00 (grok); I score A5 at 7 and A lower overall because the generic collapsed failure row (`ToolPart-impl.tsx:1685`) and the receipt-gated input path (`toolHelpers.ts:401`) are unresolved facts in this source, not judgment drift. This is my first ballot, so my means are not comparable to round 24's per-judge ballots; treat the deltas as mine alone. The round-24 fixes are real: redaction is now materially stronger (`S/webmcp-redaction.mjs:97-110`, `:161`) and init/page recovery removes a failure class (`E/native-webmcp.js:114`, `E/desktop-webmcp-browser.js:527`) — but they harden existing surfaces rather than raise any step's ceiling.

**Three changes that would raise the lowest steps most:**

1. **Surface the persisted error on the collapsed row and the call strip** instead of the generic failed label (`ToolPart-impl.tsx:1685`), and render the `property`+`rule` pair that `webMcpRuntimeRejections` already extracts (`webMcpDiagnosis.ts:211`). **Lifts A5 (7→9) and A3.**
2. **Diagnose the input already on the tool part, not only the approval receipt.** `readWebMcpInvokeInput` requires `metadata.arguments`/`input`/`inputPreview` and otherwise reports `no-arguments` (`toolHelpers.ts:398-401`); the transcript part's own invoke input is discarded. **Lifts B4 and B2 (7→9), and widens A6.**
3. **Render `propertyDiff` as before/after rows and remove the silent 300-char field-description cap** (`WebMcpToolPanel.tsx:982`, `webMcpToolForm.ts:30`), and make `propertyDiff` cover root composition and nested properties, not just the ten compared keys (`webMcpPropertyDiff.ts:17`). **Lifts B3 and B1.**