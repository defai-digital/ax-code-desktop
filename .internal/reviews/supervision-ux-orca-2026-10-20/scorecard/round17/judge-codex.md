Independent, read-only judgment at **HEAD `7f63b436`**. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. Scores assess source implementation, not measured usability; I reran no journeys and excluded uncommitted runtime pins.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.4** | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | **9.2** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | **9.2** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.28** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview **40%**, review **35%**, workspace **25%**.

Source references below are relative to `desktop/packages/ui/src/`, except `electron/`, which means `desktop/packages/electron/src/`.

**Overview — AX vs Orca.** AX combines counted multi-select PR/checks facets with an actionable global inbox, giving it an intervention advantage over Orca’s documented dashboard (`components/supervision/missionControl/MissionControlFilters.tsx:130`; `components/supervision/NeedsYouPopover.tsx:121`). Its lead remains bounded because PR projection requires an already-known integration entry (`hooks/useMissionControlPullRequests.ts:97`).

**Overview — AX vs opencode.** AX’s global decision cards and waiting-browser entries reduce session switching compared with opencode’s documented per-session prompts (`components/supervision/NeedsYouPopover.tsx:121`). Stale-preview Retry and activity-feed rendering insulated from streaming updates further support unattended supervision (`components/supervision/missionControl/MissionControlRow.tsx:201`; `components/supervision/ActivityButton.tsx:46`).

**Workspace — AX vs Orca.** AX now provides drag docking, keyboard moves with following focus, native pop-out ownership reconciliation and remembered split ratios, substantially closing Orca’s arrangement advantage (`components/sessionGrid/SessionGrid.tsx:142`, `:175`; `lib/supervision/sessionGridPopout.ts:22`; `lib/supervision/sessionGridPreferences.ts:41`). Session-specific page switching/revoke and acknowledged cancellation add useful web-app supervision beyond Orca’s browser pane, although AX retains a four-pane ceiling (`components/mcp/WebMcpPages.tsx:101`; `electron/desktop-webmcp-browser.js:339`; `components/sessionGrid/SessionGrid.tsx:232`).

**Workspace — AX vs opencode.** AX’s simultaneous session grid is materially stronger for comparing agents than opencode’s documented unsplit workspace (`components/sessionGrid/SessionGrid.tsx:222`). WebMCP page identity, waiting state and per-session revoke make concurrent browser work inspectable, while opencode’s unread titlebar tabs remain useful for rapid switching (`components/mcp/WebMcpPages.tsx:104`).

**Review — AX vs Orca.** AX’s session/turn landing checks reviewed before/after content and file mode, then rereads index identity before commit; the browser recap adds exact-call navigation and whole-turn copying (`components/views/SessionChangesView.tsx:420`; `components/views/git/ReviewLanding.tsx:77`, `:252`; `components/views/git/ReviewLandingBrowserEvidence.tsx:96`, `:158`). This earns a narrow safe-delivery edge, while Orca’s inline three-way merge remains more direct than AX’s session-delegated conflict resolution (`components/views/git/ConflictDialog.tsx:164`).

**Review — AX vs opencode.** AX’s adjustable tree rail and guarded landing provide a cohesive review-to-delivery workflow (`components/views/ReviewFileRail.tsx:521`; `components/views/git/ReviewLanding.tsx:223`). opencode retains valuable turn undo/redo; its undocumented commit controls are not treated as absent.

Compared with round 15, I retain the scores: unsaved-work close confirmation strengthens confidence, but does not establish another substantial usability gain (`electron/desktop-webmcp-browser.js:1494`); approval descriptions still truncate at 200 characters (`components/chat/WebMcpApprovalToolInfo.tsx:95`).

**AX vs Orca: better** — **+0.35**, exceeding the PRD’s 0.2 comparison margin.

**AX vs opencode: better**

The conditional three-change flip list is unnecessary.

