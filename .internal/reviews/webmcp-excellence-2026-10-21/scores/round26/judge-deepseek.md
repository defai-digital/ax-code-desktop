## Round 26 ballot — final, source-verified (`92775899`, runtime v7.28.2)

Read-only; no files modified. No shell or test runner existed in this session, so this is source judgment, not execution evidence; uncommitted `config/`, lockfile and version pins were ignored. `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

Verified round 26 in source: a failed call renders its redacted reason plus the first diagnosis finding (or runtime rejection) on the collapsed transcript row **and** the strip (`UI/lib/webMcpFailureSummary.ts:9`; `UI/components/chat/message/parts/ToolPart-impl.tsx:1687`, `:1886`; `UI/components/mcp/WebMcpCallStrip.tsx:151`). Native init names the failure kind and stage (`E/native-webmcp.js:153`). Replay keeps an out-of-schema value visible as an off-list option and demands a second confirmation (`UI/components/mcp/WebMcpToolPanel.tsx:361`, `:874`, `:886`). Compare names *why* an agent receipt is absent from a three-way vocabulary (`WebMcpToolPanel.tsx:323`; `UI/lib/i18n/messages/en.ts:3782`). Mission Control rows carry a waiting-page chip (`UI/components/supervision/missionControl/MissionControlRow.tsx:106`, `:283`), and both Mission Control and compact grid panes reach their own session's page (`MissionControlRow.tsx:258`; `UI/components/sessionGrid/SessionGrid.tsx:289`; `WebMcpPages.tsx:181`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Descriptions, raw schema, hints, origin, lint and catalog caps support discovery, but it is still a technical expandable tree with no capability grouping or search (`WebMcpToolPanel.tsx:706`). |
| A2 enable and scope trust | 9 | Origin, project, session, access state, per-page revoke and project sign-out sit in one place and take effect on the next call (`WebMcpPages.tsx:162`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The open strip shows outcome, duration, digest, result, approval link, transcript jump and now the failure reason, but arguments still truncate at 140 characters with no reveal (`WebMcpCallStrip.tsx:113`). |
| A4 approvals | 8 | Effect sentence from call data, origin, tool, element and digest match inform the decision, yet a vanished ask is inferred as "unanswered" rather than a timestamped terminal state (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:25`). |
| A5 failure recovery | 8 | Reason and first finding now reach the collapsed row and strip, and native init says what failed and where, but a failed call still offers no one-action retry (`webMcpFailureSummary.ts:9`; `E/native-webmcp.js:153`; `WebMcpToolPanel.tsx:694`). |
| A6 evidence after the task | 8 | The recap lists steps, kinds, durations, digests, failure reasons, definition drift and never-called tools, and copies the whole turn, but carries no inputs and is memory-only (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:79`, `:107`). |
| A7 pause and take over | 8 | Pause keeps the page and is separate from Disconnect, with stopped versus still-finishing acknowledgement and no rollback claim (`EmbeddedWebMcpBrowser.tsx:545`, `:582`; `E/native-webmcp.js:20`). |
| A8 several sessions at once | 8 | Bounded pool, per-session pages, independent revoke, a waiting chip per Mission Control row and grid panes that reach their page work, though acting still needs the page visible (`MissionControlRow.tsx:283`; `SessionGrid.tsx:289`). |
| B1 see registered tools | 8 | Schemas, hint badges, advisory lint, named rejections and truncation notes are inspectable, but field descriptions are cut at 300 characters without a marker (`UI/lib/webMcpToolForm.ts:30`). |
| B2 try by hand and compare | 8 | Off-list replayed values stay visible and need explicit confirmation, and compare states why a receipt is missing, but exact agent input still depends on approval receipts (`WebMcpToolPanel.tsx:375`, `:886`, `:323`). |
| B3 iterate | 8 | Registration history, retained drafts, stale marks and change detection work, but the diff renders as a JSON block and covers only top-level properties (`UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis, bounded runtime rejections and the surfaced first finding give a concrete path, limited to known rules and retained definitions (`UI/lib/webMcpDiagnosis.ts:186`; `WebMcpCallStrip.tsx:151`). |
| B5 onboarding docs | 8 | The quickstart is runnable, linked in-app and honest about receipts and evidence gaps, but does not yet document the new off-list confirmation and remains documentation-led (`docs/webmcp-page-tools.md:12`, `:305`). |

**Means:** A = 65/8 = **8.13**; B = 40/5 = **8.00**.

**Versus round 25** (A5 8/7/7, B2 7/8/7): **A5 7→8** and **B2 7→8** — round 26 put the answer where the decision is made (reason on the collapsed surfaces; replay gated and receipt gaps named). Nothing else moved: the silent 300-character cap, the JSON-only single-level diff, the 140-character strip arguments and the missing completed-call receipts survived a third round. All thirteen steps sit at 8 on this ballot, so passage now rests on the other two.

**Three changes that raise the lowest steps most**

1. **Receipts for every mediated call**, not only approvals — redacted input, digest, duration, terminal outcome joined into strip, recap and comparison (A3, A6, B2, B4) (`WebMcpCallStrip.tsx:113`; `ReviewLandingBrowserEvidence.tsx:79`).
2. **Authoritative approval terminal states** with timestamps in card, strip and recap, replacing the "unanswered" inference (A4, A5, A6) (`useWebMcpApprovalOutcome.ts:25`).
3. **Finish the inspect/edit surface**: remove the silent 300-character field cap, render property diffs as before/after rows including nested and root changes, add capability grouping (A1, B1, B3) (`webMcpToolForm.ts:30`; `webMcpPropertyDiff.ts:14`).

Corrections after re-verification, no score impact: A2's trust anchor is `EmbeddedWebMcpBrowser.tsx:475` (an earlier draft said 482), A7's take-over anchor is `:582` with `E/native-webmcp.js:20` for stopped-versus-finishing, and A5's no-auto-retry anchor is `WebMcpToolPanel.tsx:694`. Autonomous choices: `runtime pending` fields (correlation ids, full masked arguments, untrusted-output channel) earned no credit, and native-init reason was judged under A5 where a person meets it.