Independent, read-only judgment at **HEAD `0fb2203e`**. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. This assesses source-supported workflows, without rerunning native journeys or exact-HEAD CI.

Paths below are relative to `desktop/packages/ui/src/`, except explicitly prefixed paths.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.10** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.20** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.22** | **8.97** | **7.07** | **8.45** | **8.83** |

Weighted overall = overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX’s answerable global inbox and counted, multi-select PR/check facets reduce the cost of intervening across repositories (`components/supervision/NeedsYouPopover.tsx:129`; `components/supervision/missionControl/MissionControlFilters.tsx:130`). Orca’s dashboard, child rows, feed and jump palette remain competitive, so AX’s advantage is concentrated in completing decisions from the overview.

**Overview — AX vs opencode.** Against opencode’s documented per-session prompts and absence of a multi-agent board, AX combines actionable requests with activity, PR, runtime-check and change-count signals (`components/supervision/NeedsYouPopover.tsx:134`; `components/supervision/missionControl/MissionControlRow.tsx:193`, `:284`). Stale-preview age and Retry improve confidence without requiring a session visit (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:205`).

**Workspace — AX vs Orca.** Drag swap/dock, keyboard moves with following focus, splitting and pop-out substantially close Orca’s arrangement advantage (`components/sessionGrid/SessionGrid.tsx:142`, `:175`, `:312`, `:355`). Orca retains more general mixed-tool pane trees, while AX’s four-slot ceiling constrains larger simultaneous comparisons (`components/sessionGrid/SessionGrid.tsx:232`).

**Workspace — AX vs opencode.** AX’s simultaneous session panes support comparisons beyond opencode’s documented unsplit workspace (`components/sessionGrid/SessionGrid.tsx:222`). Per-session page switching/revocation, digest-matched approval definitions, and page-call durations/results add useful web-app supervision; Orca’s browser pane has no page-tool concept (`components/mcp/WebMcpPages.tsx:113`, `:124`; `components/chat/WebMcpApprovalToolInfo.tsx:35`; `components/mcp/WebMcpCallStrip.tsx:95`, `:115`).

**Review — AX vs Orca.** AX lands from Session/Last-turn scopes with review credit bound to the before/after content and file mode, and supplies jumpable browser steps, durations and definition identity beside landing (`components/views/SessionChangesView.tsx:420`; `components/views/git/ReviewLanding.tsx:77`; `components/views/git/ReviewLandingBrowserEvidence.tsx:141`). Orca retains inline three-way merge, whereas AX delegates conflict resolution and its fresh-state preflight remains separate from mutation (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** AX’s collapsible, adjustable rail and explicit Stage→Commit→Push progression provide a strong inspection-to-delivery workflow (`components/views/ReviewFileRail.tsx:160`, `:290`; `components/views/git/ReviewLanding.tsx:133`). opencode’s verified turn undo/redo remains valuable, and its undocumented landing controls are not scored as absent.

Compared with round24/codex, the verdict is unchanged; I score workspace and review slightly more conservatively. Subsequent inherited/compound-field redaction fixes preserve trust without warranting additional capability points (`desktop/shared/webmcp-redaction.mjs:97`, `:150`, `:161`).

One round-24 finding needs correction: waiting-page status **does** reach both rows and the grid through `WebMcpSessionPage` (`components/supervision/missionControl/MissionControlRow.tsx:253`; `components/sessionGrid/SessionGrid.tsx:288`; `hooks/useWebMcpPages.ts:11`). Browser calls remain evidence of attempted actions, not verification, and approval receipts remain ephemeral and capped at 256 (`components/views/git/ReviewLandingBrowserEvidence.tsx:27`; `stores/useWebMcpApprovalOutcome.ts:31`, `:56`).

**AX vs Orca: better** — weighted lead **+0.25**.  
**AX vs opencode: better** — weighted lead **+2.15**.

