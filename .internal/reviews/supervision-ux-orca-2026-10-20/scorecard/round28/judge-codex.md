Independent assessment at **HEAD `e36aad55`**. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. This is source verification, without rerunning apps, journeys or CI. Citation paths are relative to `desktop/packages/ui/src/`, except paths beginning `desktop/`.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.35** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.20** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.28** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX earns an intervention advantage through directly answerable requests, confirmed batch decisions and counted PR/check facets (`components/supervision/RequestActionCard.tsx:148`; `components/supervision/PermissionBatchBar.tsx:38`; `components/supervision/missionControl/MissionControlFilters.tsx:130`). Orca’s documented kanban, child rows, feed and badges remain strong; feature breadth alone does not establish faster scanning.

**Overview — AX vs opencode.** AX’s global inbox consolidates decisions that opencode documents as per-session docks, reducing navigation across repositories (`components/supervision/NeedsYouPopover.tsx:129`). Preview age, Retry and the per-row waiting-page chip help identify stale information and blocked browser work without opening every conversation (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:210`, `:283`).

**Workspace — AX vs Orca.** AX’s drag docking, keyboard movement and pop-out substantially close the arrangement gap (`components/sessionGrid/SessionGrid.tsx:143`, `:176`, `:356`). Orca retains more general mixed-tool pane trees, while AX’s four-session ceiling limits simultaneous inspection at this persona’s scale (`lib/supervision/sessionGrid.ts:53`).

**Workspace — AX vs opencode.** AX’s independently embedded sessions support simultaneous comparison beyond opencode’s documented unsplit workspace (`components/sessionGrid/SessionGrid.tsx:403`). Page access inside grid panes, per-session revocation and approvals matched to the page’s definition add useful web-app supervision; Orca’s browser pane explicitly lacks this page-tool concept (`components/sessionGrid/SessionGrid.tsx:289`; `components/mcp/WebMcpPages.tsx:129`; `components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX connects session/Last-turn review to landing, granting reviewed status only when the mark, before/after content and file mode match (`components/views/SessionChangesView.tsx:420`; `components/views/git/ReviewLanding.tsx:77`, `:104`). Orca retains direct inline three-way merge; AX delegates conflict resolution, and its fresh-state checks precede mutation rather than providing an atomic guarantee (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** AX’s collapsible, adjustable rail matches important inspection conveniences in opencode, while guarded landing strengthens the delivery workflow (`components/views/ReviewFileRail.tsx:160`, `:279`; `components/views/git/ReviewLanding.tsx:223`). Jumpable browser recaps expose outcomes, durations and definition identity beside landing, but remain evidence of calls rather than correctness; opencode’s documented turn undo/redo remains valuable (`components/views/git/ReviewLandingBrowserEvidence.tsx:141`).

Compared with round 24, the waiting-page chip and grid page access justify a modest uplift. Round 28’s diagnostic masking and cancelled-close binding fixes preserve trust without earning another capability increment (`desktop/shared/webmcp-redaction.mjs:208`; `desktop/packages/electron/src/desktop-webmcp-browser.js:489`).

**AX vs Orca: better** — weighted margin **+0.31**.  
**AX vs opencode: better** — weighted margin **+2.21**.

No flip list is required.