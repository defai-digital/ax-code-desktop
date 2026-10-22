**Round 24 at `5193b0c8`: A = 8.13/10; B = 7.80/10.**

Read-only review; `92775899` is an ancestor. Verified `15f40f1d..HEAD` and v7.28.2’s actual approval payload; no credit for unsent runtime fields. Shared-redaction tests: **18 passed**; Electron suites could not load because Vitest is missing. No native journeys or screenshots verified; no files modified.

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and explicit catalog limits support discovery, but capabilities remain behind a technical disclosure tree (`UI/components/mcp/WebMcpToolPanel.tsx:921`). |
| A2 enable and scope trust | 9 | Project/session ownership, access scope, independent revocation and explicit project sign-out make trust understandable and controllable (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The initially open call strip provides arguments, duration, digest, result and approval/transcript navigation, although its evidence remains abbreviated (`UI/components/mcp/WebMcpCallStrip.tsx:107`). |
| A4 approvals | 8 | Call-derived effects, filtered previews and digest-matched definitions inform decisions, but disappearing requests still lack authoritative expiry or terminal-decision records (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | 8 | Bounded initialization and retained-page recovery improve resilience, but initialization failures collapse into a generic page-load error and rejection extraction remains heuristic (`E/native-webmcp.js:114`; `E/desktop-webmcp-browser.js:1122`; `UI/lib/webMcpDiagnosis.ts:186`). |
| A6 evidence after task | 8 | Recaps provide ordered outcomes, durations, digests, rejection details and never-called tools, but approval-derived input evidence remains bounded and memory-only (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:56`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and distinguish stopped from still-finishing work without claiming rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:565`). |
| A8 several sessions | 8 | Owned pooled pages, independent revocation, waiting-page controls and recovery after owner loss support concurrency, though recovery has no equally rich user-facing explanation (`UI/components/mcp/WebMcpPages.tsx:101`; `E/desktop-webmcp-browser.js:520`). |
| B1 registered tools | 8 | Raw schemas, hints, advisory lint and named catalog rejections are inspectable, but advisory checks cannot establish runtime-validator compatibility (`UI/components/mcp/WebMcpToolPanel.tsx:710`; `:947`). |
| B2 try and compare | 7 | Journal comparison is useful, but replay can retain an out-of-enum value absent from the select’s options and submit it after a warning (`UI/lib/webMcpToolForm.ts:169`; `UI/components/mcp/WebMcpToolPanel.tsx:337`; `:584`). |
| B3 iterate | 8 | Registration history, retained drafts and stale-result markers support iteration, but schema differences still render as JSON and omit nested/root-only changes (`UI/components/mcp/WebMcpToolPanel.tsx:982`; `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis and safely filtered runtime rejections avoid invented findings, but missing approval receipts and unsupported constraints limit coverage (`UI/lib/webMcpDiagnosis.ts:227`; `:235`). |
| B5 onboarding docs | 8 | A runnable example covers registration, manual testing, agent comparison and export, with honest receipt limits, but onboarding remains documentation-led (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **39/5 = 7.80**.

Compared with round 21’s Codex ballot, **B2 moves 8→7** following the verified replay defect; this is reassessment, not a round-24 regression. Other integer scores hold. Indexed/quoted-path and inherited-sensitivity redaction, JSON masking, initialization deadlines and owner recovery strengthen correctness (`S/webmcp-redaction.mjs:99`; `:160`; `UI/components/mcp/WebMcpToolPanel.tsx:500`; `E/desktop-webmcp-browser.js:476`). Majority passage still requires the other ballots.

Three highest-impact changes:

1. Show replayed off-list enum values explicitly, or retain them in JSON mode (**B2**).
2. Deliver completed-call receipts and authoritative approval outcomes beyond observed permission metadata (**B2/B4/A4/A6**).
3. Render nested/root schema changes as readable before/after rows (**B3/B1/B4**).

