Independent, read-only assessment at **HEAD `5193b0c8`**. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. Scores assess source-supported workflows, not comparative usability trials.

Paths below are relative to `desktop/packages/ui/src/` unless prefixed with `desktop/`.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.15** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.25** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX earns a narrow intervention advantage through directly answerable requests and counted, multi-select PR/check facets (`components/supervision/RequestActionCard.tsx:148`; `components/supervision/missionControl/MissionControlFilters.tsx:130`). Orca’s documented dashboard, feed, child rows and jump palette remain strong; AX’s preview age and Retry improve recovery without proving superior scanning density (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:205`).

**Overview — AX vs opencode.** AX brings requests and waiting browser pages into one triage surface, reducing navigation compared with opencode’s per-session docks (`components/supervision/NeedsYouPopover.tsx:121`, `:134`). Activity previews and session-bound page, PR and check signals better support understanding parallel work without opening every session (`components/supervision/missionControl/MissionControlRow.tsx:193`, `:253`, `:284`).

**Workspace — AX vs Orca.** Drag swap/dock, keyboard movement with following focus, and pop-out substantially close the arrangement gap (`components/sessionGrid/SessionGrid.tsx:142`, `:175`, `:360`). Orca retains more general mixed-tool pane trees, while AX’s four-pane ceiling limits simultaneous comparison at this persona’s scale (`lib/supervision/sessionGrid.ts:53`).

**Workspace — AX vs opencode.** AX’s simultaneous sessions, each offering Chat/Changes/Files/Terminal, support comparison beyond opencode’s documented unsplit layout (`components/sessionGrid/SessionGrid.tsx:402`; `App.tsx:93`). Per-session page switching/revocation and digest-matched approval definitions add meaningful web-app supervision (`components/mcp/WebMcpPages.tsx:113`, `:124`; `components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX combines content-and-mode-bound review credit with jumpable browser steps, durations and definition identity beside landing (`components/views/git/ReviewLanding.tsx:77`; `components/views/git/ReviewLandingBrowserEvidence.tsx:141`). Orca retains direct inline three-way merge; AX delegates conflict resolution, and its fresh-state check remains a preflight before mutation rather than an atomic guarantee (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** Session/Last-turn landing and the collapsible, adjustable review rail provide a strong inspection-to-delivery workflow (`components/views/SessionChangesView.tsx:420`; `components/views/ReviewFileRail.tsx:160`, `:279`). opencode’s verified turn undo/redo remains valuable; its undocumented landing controls are not scored as absent.

**Compared with round 21:** my scores match round21/codex. Rounds 22–24 improve reliability through target-bound close confirmation, retained pages on host-renderer loss, and bracketed/nested credential redaction; these preserve workflow trust without expanding supervision breadth (`desktop/packages/electron/src/desktop-webmcp-browser.js:373`, `:1089`; `desktop/shared/webmcp-redaction.mjs:97`, `:170`). Approval receipts remain ephemeral and capped at 256 (`stores/useWebMcpApprovalOutcome.ts:31`, `:56`).

All **18 shared-redaction tests passed**. Native journeys and exact-HEAD CI were not rerun.

**AX vs Orca: better** — weighted lead **+0.28**.  
**AX vs opencode: better** — weighted lead **+2.18**.

No flip list is required.

