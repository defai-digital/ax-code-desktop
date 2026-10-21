**Round 20 at `4b7f80db`** (round-20 changes `f06cea02..HEAD`, commit `25c5ee98`; source lineage `92775899` through HEAD). Read-only source review — no files, config or tests touched; uncommitted `config/`, lockfile and version pins ignored. Credit only what pinned v7.28.2 `desktop_webmcp` sends (`definitionDigest`, redacted `inputPreview` on the ask). `UI` = `desktop/packages/ui/src`.

| Step | Score | One sentence and path:line |
|---|---:|---|
| A1 discover | 8 | Description, redacted raw schema, hint badges, origin, `shown/total` cap, named rejection and advisory lint stay inspectable before any grant, but discovery is still a collapsed technical list (`UI/components/mcp/WebMcpToolPanel.tsx:1032`). |
| A2 enable and scope trust | 8 | Session-scoped enable, per-session revoke, isolated-profile sign-in and Sign out remain legible, yet there is still no read-only grant/scope summary and the pool bound is main-supplied (`UI/components/mcp/WebMcpPages.tsx:74`, `:129`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:467`). |
| A3 watch live | 9 | Completed calls now render the approval's retained redacted arguments, duration, digest, result, earlier-page marker and unanswered note in a strip that is open by default (`UI/components/mcp/WebMcpCallStrip.tsx:27`, `:107`, `:112`; `UI/lib/webMcpCalls.ts:132`). |
| A4 approvals | 8 | Effect sentence from call data, preview, digest-gated definition and page-claim labelling are strong, but expiry still collapses into "unanswered" rather than an outcome with a time (`UI/components/chat/PermissionCard.tsx:398`, `:478`; `UI/components/chat/WebMcpApprovalToolInfo.tsx:36`). |
| A5 failure recovery | 9 | Runtime rejections are parsed to property and rule and shown beside the advisory check in transcript, compare and recap, on top of the six-way outcome vocabulary (`UI/lib/webMcpDiagnosis.ts:182`, `:207`; `UI/components/mcp/WebMcpCallDiagnosis.tsx:95`). |
| A6 evidence after the task | 9 | The recap adds mapped rejections, digest-changed, and pair-array redaction, and the bounded receipt cache makes post-task evidence reconstructable (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:98`, `:164`; `desktop/shared/webmcp-redaction.mjs:116`; `UI/stores/useWebMcpApprovalOutcome.ts:52`). |
| A7 pause and take over | 8 | Pause/Resume stays separate from Disconnect with bounded acknowledgement and no rollback claim (`EmbeddedWebMcpBrowser.tsx:545`). |
| A8 several sessions at once | 8 | Session-owned pooled pages, ownership labels, independent revoke, waiting surfaces and an explicit full state support concurrency (`WebMcpPages.tsx:78`, `:200`; `EmbeddedWebMcpBrowser.tsx:467`). |
| B1 see registered tools | 8 | Schemas, hints, origin, byte caps, named rejections and lint appear together, still without runtime-validator parity (`WebMcpToolPanel.tsx:1032`). |
| B2 try by hand and compare | 9 | Comparison now runs against a real completed agent call's retained receipt, each side diagnosed against its own digest, with credential `[name,value]` pairs redacted (`WebMcpToolPanel.tsx:279`; `webMcpCalls.ts:133`; `webmcp-redaction.mjs:116`). |
| B3 iterate | 8 | Drafts keep every accepted property name, long values and `__proto__` in prototype-safe bounded records, but the schema diff is still one JSON blob (`UI/stores/useWebMcpBrowserStore.ts:321`, `:503`; `WebMcpToolPanel.tsx:971`). |
| B4 diagnose misuse | 9 | Diagnosis checks complete values against the definition the digest names, says "definition no longer available" instead of borrowing the current schema, and joins runtime reasons to the failing property; a tool-level "changed" note still appears only in compare because the transcript passes the call's own digest as current (`webMcpDiagnosis.ts:235`; `WebMcpCallDiagnosis.tsx:91`; `WebMcpToolPanel.tsx:282`). |
| B5 onboarding docs | 9 | The guide now documents the complete-input check, the no-substitute rule, the bounded receipt cache and rejection-detail rendering, matching the panel (`docs/webmcp-page-tools.md:72`, `:313`, `:316`). |

**Means:** A **67/8 = 8.38**; B **43/5 = 8.60**. All thirteen steps reach 8 on this ballot.

**Movement vs round 19 (my ballot):** A3 8→9, A5 8→9, A6 8→9, B2 8→9, B4 8→9, B5 8→9; A1, A2, A4, A7, A8, B1, B3 hold at 8. Each blocker the three round-19 ballots named is now visible in source: receipts on completed calls, exact-definition diagnosis, property-mapped rejection, pair-array redaction, lossless drafts. Residuals are B3's JSON blob, A4's expiry wording, and the transcript's self-comparing digest.

**Three changes that would raise the lowest steps most**
1. Render the registration diff as readable rows (property · field · before → after · added/removed), including root-level changes — lifts **B3**.
2. Give approval expiry a first-class card outcome (countdown → "timed out unanswered") and keep the answered decision visible on the card — lifts **A4**.
3. Put a one-screen "what this page lets the agent do" summary above the schema tree (name, hint badge, effect verb) — lifts **A1** and **B1**.

No files were modified.