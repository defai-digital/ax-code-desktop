**Round 19 judgment at `f06cea02`** (round-19 changes in `7811c298..HEAD`). Read-only; no files or config touched. Credit only what pinned v7.28.2 `desktop_webmcp` sends (`definitionDigest`, redacted `inputPreview`, `reason`, `nextAction`). `UI` = `desktop/packages/ui/src`, `S` = `desktop/shared`.

| Step | Score | One sentence and path:line |
|---|---:|---|
| A1 discover | 8 | Description, redacted raw schema, hint badges, origin, visible `shown/total` cap, named rejection and advisory lint are all inspectable before any grant, but it is still a collapsed technical tree (`UI/components/mcp/WebMcpToolPanel.tsx:1000`, `:452-504`). |
| A2 enable and scope trust | 8 | Enable/Pause/Resume separate from Disconnect, Sign out clears one project's pages after an unsaved-work check, and the trust summary states scope — but there is still no read-only grant list or schema-hash binding (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:485`, `:540-557`). |
| A3 watch live | 8 | Rows carry redacted arguments, result, duration, earlier-page marker, failure reason, approval jump and unanswered note, though the strip is collapsed by default and capped (`UI/components/mcp/WebMcpCallStrip.tsx:60`, `:107`, `:120`, `:127`). |
| A4 approvals | 8 | The card builds its effect sentence from call data, renders `inputPreview` with the runtime's truncation marker, shows the page definition only on a digest match, and counts the runtime's `autoOnceAt` down — but expiry still has no outcome of its own (`UI/components/chat/PermissionCard.tsx:405`; `UI/components/chat/WebMcpApprovalToolInfo.tsx:52`, `:76`). |
| A5 failure recovery | 8 | Transport success, application error, timeout, cancellation, uncertain and stale-form stay distinct with one reason vocabulary and a filtered `nextAction`, but a runtime-side rejection still arrives without a mapped property (`UI/lib/toolHelpers.ts:488`, `:492`; `WebMcpToolPanel.tsx:720`). |
| A6 evidence after the task | 8 | The recap reports outcome, duration, digest, changed-since and never-called tools, and now suppresses "never called" entirely when any invoke lacks an identity (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:98-101`, `:216`). |
| A7 pause and take over | 8 | Pause keeps the page and connection, is visibly separate from Disconnect, and acknowledgements report stopped versus still-finishing from fixed metadata while claiming no rollback (`EmbeddedWebMcpBrowser.tsx:540-557`; `UI/components/mcp/WebMcpCancellationStatus.tsx:7`). |
| A8 several sessions at once | 8 | Pooled per-session pages, visible ownership, independent revoke, waiting states and a bounded pool with an explicit full state support concurrent supervision (`UI/components/mcp/WebMcpPages.tsx:101-149`; `EmbeddedWebMcpBrowser.tsx:467-474`). |
| B1 see registered tools | 8 | Kind, hints, origin, raw and execution schemas, byte caps, named rejections and lint are visible together (`WebMcpToolPanel.tsx:524`, `:1018`; `S/webmcp-catalog-projection.cjs:65-78`). |
| B2 try by hand and compare | 8 | Journal, replay, compare and export all bind to the main-issued `invocationID` plus native digest, and a credential-shaped name can be tried by opaque id (`UI/lib/webMcpCatalog.ts:103-113`; `WebMcpToolPanel.tsx:1087`, `:1121`; `S/webmcp-catalog-projection.cjs:56-57`) — however drafts for a property over 256 characters or named `__proto__` are still silently dropped (`UI/stores/useWebMcpBrowserStore.ts:501-517`). |
| B3 iterate | 8 | Registration history keeps 32 events keyed by invocation id with both definition versions, and the property diff now covers minimum, maximum, lengths, pattern, format and default — rendered as a raw JSON blob (`WebMcpToolPanel.tsx:1040-1053`; `UI/lib/webMcpPropertyDiff.ts:17`). |
| B4 diagnose misuse | 8 | Diagnosis resolves the digest's own retained definition, refuses ambiguous digests and says "unknown" instead of "not called" (`UI/lib/webMcpCatalog.ts:280-287`; `WebMcpToolPanel.tsx:381`, `:1123`) — but the runtime's rejection reason is still never joined to the failing property. |
| B5 onboarding docs | 8 | The guide now documents receipts, the 2 KiB preview, unanswered approvals, 32-event history and opaque invocation (`docs/webmcp-page-tools.md:303-319`). |

**Means:** A **8.00/10**; B **8.00/10**. All thirteen steps score 8 on this ballot, so each needs one more judge at 8 to pass.

**Movement vs round 18.** B2 and B4 move **7→8** on my ballot, exactly the steps where two judges withheld 8 for name-keyed evidence; B3's diff widens to every diagnosed constraint; A6 gains honest unknown-association suppression. A2, A4 and B5 score 8 rather than round 18's best ballots of 9 because the final audit confirms a credential-in-`[name,value]`-array leak (`S/webmcp-redaction.mjs:115-121`) and lossy draft storage, both reachable in those journeys; nothing shrank.

**Three changes that would raise the lowest steps most**

1. Close the two confirmed P1s — give arrays credential context and store drafts losslessly — lifting **B2, A3, A6**.
2. Render the property diff as readable rows over every diagnosed constraint plus root-level changes, and diagnose from the recorded input rather than the display projection (codex P2), lifting **B3, B4**.
3. Join the runtime's `reason` to the failing property everywhere and qualify the runtime approval-expiry timer, giving expiry a first-class outcome, lifting **A5, A4**.

No files were modified.