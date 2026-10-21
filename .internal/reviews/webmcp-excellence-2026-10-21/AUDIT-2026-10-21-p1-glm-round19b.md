The audit scope is now covered. Consolidating my findings.

**Audit method:** full read of the electron-side bridge (`desktop-webmcp-browser.js`, `native-webmcp.js`, `webmcp-page.js`, `browser-eviction.js`, `webmcp-manual-outcome.cjs`, `webmcp-digests.cjs`, `webmcp-view-key.mjs`), the shared redaction module, the UI surfaces named in the brief (pane, tool panel, pages switcher, call strip, cancellation status, approval card + tool info, landing recap, stores/hooks/libs including `webMcpCatalog`, `webMcpToolForm`, `webMcpPropertyDiff`, `webMcpDiagnosis`, `webMcpCalls`, `toolHelpers`, `revealToolPart`, `sessionGridPopout`, pool projection), the checker (`webmcp-check.mjs`, `-entry.cjs`, `-lib.mjs`, `-receipt.cjs`) and `docs/webmcp-page-tools.md`. Read-only; no files modified; uncommitted `config/`, lockfile and version pins ignored as instructed. A `task`/`explore` subagent dispatch failed (ProviderModelNotFoundError), so all evidence is from direct file reads; no shell was available in this session.

---

## WebMCP audit — round 20 (branch r19-audit, post-round-19)

### P1 findings: none

I found no issue that meets the P1 bar (work/data loss, wrong-page/session/project action or acting without approval, credential leak to screen/logs/storage, a false UI claim about what happened, an unrecoverable hang, or a broken documented flow).

**Round-19 fixes verified in source**
- Manual evidence keyed on invocation id + digest: `webMcpCatalog.ts:102-112` (`webMcpToolIdentity`/`webMcpEvidenceMatchesTool`), journal binding and replay gating at `WebMcpToolPanel.tsx:699,1079,1113-1114`; replay disabled unless the current catalog still holds the exact identity.
- Shared permission predicate + redacted generic metadata: `PermissionCard.tsx:72-73` (`isWebMcpPermission` gates every display path) and `:505-514` (generic metadata fallback rendered through `redactWebMcpReport`).
- Bounded display schemas: `webmcp-redaction.mjs:160-180` (`webMcpDisplayKey` 4000-cap with `[redacted secret]` marker; `webMcpDisplaySchema` redacts the original tree before bounding), plus `SCHEMA_TEXT_CAP` in `WebMcpToolPanel.tsx:48,95-105`.
- Sensitivity decided on the original schema before transforming: `webMcpPropertyDiff.ts:9-26` compares originals (`a`,`b`) and displays only redacted copies (`safeA`/`safeB`); `ToolCompare`/`SchemaBlock` render redacted projections while diagnosis runs on `executionSchema`.

**Key invariants re-checked (no regressions found)**
- Approval/wrong-page: `run()` binds every request to providerID/epoch/projectID/sessionID (`desktop-webmcp-browser.js:824-831`); `enable` resolves the session from the authenticated runtime and validates the project (`:1349-1359`); `tryTool` re-validates origin/generation/frame/digest against the live snapshot (`:1404-1416`); visibility waits recheck the connection and never transfer a request to a newly shown page (`:705-738`); one owner per view per window with opaque ids (`:284-288,852-862`).
- Data loss: every close path goes through `authorizeClose` + `closeForEviction` (beforeunload, 1 s bound) with the sticky `possibleUnsavedWork` flag; eviction probes are 250 ms-bounded and re-check idleness after the await (`:868-884`); pool-full is surfaced instead of forcing unload; `closeAll` reveals and skips refusing pages; the confirmation loop is bounded (main allows one reprompt `:452`; UI retries ≤2 `useWebMcpCloseConfirmation.tsx:20-25`).
- Credentials: one redaction vocabulary at every main→renderer boundary (status url/origin/titles/catalog/rejection), origin-only persisted history (`useWebMcpBrowserStore.ts:422-499`), placeholder-secrets journal retention (`boundJournalInput`), checker receipts keyed by HMAC before redaction (`webmcp-check-receipt.cjs`, `webmcp-check-lib.mjs:88-97`). The raw `executionSchema` clone (`desktop-webmcp-browser.js:72`) is used only for input construction/diagnosis; every render of it is filtered, and enum options display by index with redaction while submitting the original (`WebMcpToolPanel.tsx:408-431`).
- False statements: returned envelopes are classified (`webmcp-manual-outcome.cjs:27-59`, `toolHelpers.ts:566-604`) with explicit timeout/cancel precedence; IPC loss yields "uncertain — inspect the page", never auto-retry (`WebMcpToolPanel.tsx:724-729`); vanished approvals show "unanswered" without inferring timeout/rollback (`useWebMcpApprovalOutcome.ts:10-13`); the landing recap counts and copies the whole turn (`ReviewLandingBrowserEvidence.tsx:53-115`).
- Hangs: bounded deadlines everywhere I traced (load, poll, enable-attach wait, stop acks, reply POSTs, provider DELETE, checker watchdog + contamination).
- Docs: every claim in `docs/webmcp-page-tools.md` I cross-checked matches the implementation (caps, exit codes, sign-in popups, sign-out scope, close-confirmation binding, masked JSON/numeric inputs, opaque manual selector).

### P2 findings (brief)
1. **Stale local error survives recovery** — `EmbeddedWebMcpBrowser.tsx:180` (`result.error ?? commandErrorRef.current`) and `useWebMcpPoolProjection.ts:104`: after a failed local command, a later healthy status poll reporting `error: null` resurrects the old error code, so the error banner and fix button persist after the browser has recovered until the next explicit command. The error did occur, so this is not a false success — but the pane can overstate the current problem. Consider expiring `commandErrorRef` after a successful poll of a subsequent command.
2. **Checker `--run` name/position coupling** — `webmcp-check-lib.mjs:88-92,109-119`: requested runs are matched to report runs by index; a page that navigates mid-check (top-frame change clears `live`) can leave `report.runs` shorter, which is handled (exit 1), but repeated tool names rely purely on order. Receipts already bind input identity; binding tool-name receipts per run (not just per catalog entry) would remove the residual ambiguity.

### P3 notes
- `useWebMcpBrowserStore.ts:108-110` comments still say drafts/results are "keyed by tool name"; they are keyed by `invocationID:definitionDigest` (correctly, per round 19) — comment drift only.
- `clearProject` (`desktop-webmcp-browser.js:1175-1183`) forgets dormant addresses before closing live views; a refused live close drops that address memory while pages are preserved. No work is lost.
- `webmcp-page.js:74-76` includes non-password text-input values (≤100 chars) in read outlines sent to the agent — consistent with runtime read semantics, noting for completeness.

**Verdict: no P1.** The four round-19 fixes are correctly implemented; I found nothing new at P1 severity.