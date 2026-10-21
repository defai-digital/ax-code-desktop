# Round 19 judgment at `f06cea02` (judge 2 of 3) — read-only

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `SH` = `desktop/shared`. No shell was exposed, so this is source reading only — no journeys run, no tests executed. Credit only what the pinned runtime v7.28.2 actually sends (`definitionDigest`, redacted `inputPreview`, `reason`, `nextAction`). Uncommitted `config/`, `pnpm-lock.yaml` and version pins excluded.

**Round-19 claims, verified:** id+digest keying CONFIRMED (`webMcpToolIdentity` requires both, `webMcpCatalog.ts:103`; export refuses on `webMcpEvidenceMatchesTool`, `webMcpDiagnosis.ts:175`); stable credential labels CONFIRMED (`[redacted tool N]` ordinal cached per origin+name in the identity map, `webmcp-catalog-projection.cjs:55-58`); original-schema sensitivity CONFIRMED (`executionSchema` at form/sensitivity `:569,:583` and diff `:1053`); unknown-association CONFIRMED (`associationUnknown` suppresses never-called, `ReviewLandingBrowserEvidence.tsx:98`); diff now 10 constraint fields (`webMcpPropertyDiff.ts:17`, was 4). "One shared permission predicate" is PARTIAL: `lib/webmcp/allowlist.ts` centralizes origin/scope, but timeout/reason mapping remains split across `toolHelpers.ts` and `ToolPart-impl.tsx`.

| Step | Score | One sentence + path:line |
|---|---:|---|
| **A1 discover** | **8** | Descriptions, raw schemas, hint badges, origin, `shown/total` truncation and advisory lint are all pre-grant, but the panel is still a collapsed technical tree (`UI/components/mcp/WebMcpToolPanel.tsx:782`). |
| **A2 enable/scope trust** | **8** | Session-scoped enable, per-session revoke, isolated-profile sign-in and explicit Sign out are legible, but revocation stays whole-project and the pool capacity is main-supplied, not a setting (`UI/components/mcp/WebMcpPages.tsx:117`). |
| **A3 watch live** | **8** | Rows carry redacted arguments, duration, result preview, earlier-page marker, failure reason and a transcript jump, but correlation remains bound to call id rather than a runtime correlation id (`UI/components/mcp/WebMcpCallStrip.tsx:134`). |
| **A4 approvals** | **9** | The card renders the runtime's `inputPreview` with its truncation marker, gates the definition on `definitionDigest` and gives a vanished request an explicit outcome (`UI/components/chat/WebMcpApprovalToolInfo.tsx:52`). |
| **A5 failure recovery** | **7** | One vocabulary distinguishes transport, application error, timeout, cancellation and uncertain completion, but a runtime-side rejection still lands unmapped to a property (`UI/lib/toolHelpers.ts:244`). |
| **A6 evidence** | **8** | The recap now honestly says "unknown association" instead of falsely claiming never-called, and copies the whole turn — but evidence remains clipboard text with no artifact (`ReviewLandingBrowserEvidence.tsx:128`). |
| **A7 pause/take over** | **8** | Pause awaits bounded acknowledgement, reports stopped versus still-finishing, keeps the document and claims no rollback (`E/native-webmcp.js:531`). |
| **A8 several sessions** | **8** | Session-owned views with waiting states, independent revoke and cross-window focus work, but the bound is a main-process constant so acting in a hidden page still needs the person (`UI/hooks/useWebMcpPoolProjection.ts:52`). |
| **B1 see registered tools** | **8** | Schemas, annotations, registration history and named rejections are inspectable before any grant, yet nothing predicts an actual runtime rejection (`UI/components/mcp/WebMcpToolPanel.tsx:482`). |
| **B2 try and compare** | **8** | Manual runs keep absent/empty/zero/false distinct and compare against the runtime preview, with credential names reachable by opaque id (`UI/components/mcp/WebMcpToolPanel.tsx:339`). |
| **B3 iterate** | **8** | Property diffs now cover type, enum, description, minimum, maximum, min/maxLength, pattern, format and default plus required, though still rendered as one JSON blob (`webMcpPropertyDiff.ts:17`). |
| **B4 diagnose misuse** | **7** | Diagnosis resolves against the digest's own definition and honestly reports `uncheckable`, but the runtime's rejection reason never reaches the failing property (`UI/lib/webMcpDiagnosis.ts:60`). |
| **B5 onboarding docs** | **8** | The runnable guide covers registration through regression export and now documents v7.28.2 receipts and truncation (`docs/webmcp-page-tools.md:303`). |

**Means:** A **8.00**; B **7.80**.

**Moved vs round 18:** B3 up (7→8 on the Codex ballot; constraint diff widened). B2 holds 8 but its round-18 blocker — completed-call metadata lacking arguments — is unchanged: `readWebMcpInvokeInput` still depends on ADR-266 preview presence, and `webMcpRegressionExport` still refuses credential-shaped names outright (`webMcpDiagnosis.ts:140`). A5 and B4 stay at 7; the three new fixes are real but none touches the runtime-reason mapping that caps both. A4 stays 9. On consensus across my ballot and round 18's three, every step passes except A5 and B4.

**Three changes that would raise the lowest steps most**
1. **Map the runtime `reason` to the failing property** in one shared vocabulary consumed by transcript, compare and recap — this alone lifts **A5** and **B4**, the only two steps below 8 (`webMcpDiagnosis.ts:60`).
2. **Render `propertyDiff` as readable rows** instead of a single `<pre>` blob, covering nested and root-level schema changes — pushes **B3** toward 9 (`WebMcpToolPanel.tsx:1053`).
3. **Bind call rows and the recap to the runtime correlation id** and emit an exportable evidence artifact rather than clipboard text — lifts **A3** and **A6** (`ReviewLandingBrowserEvidence.tsx:126`).

Read-only throughout: no files created, modified or deleted.