Independent, read-only judgment at **HEAD `1442693e`**. Scores reflect source-supported workflows, not comparative usability trials; unknown competitor capabilities receive no penalty. Tests and native journeys were not rerun.

Source paths below are relative to `desktop/packages/ui/src/`.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.35** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.20** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.28** | **8.97** | **7.07** | **8.45** | **8.83** |

**Overview — AX vs Orca.** AX earns an intervention advantage through directly answerable requests and counted, multi-select PR/check facets (`components/supervision/RequestActionCard.tsx:148`; `components/supervision/missionControl/MissionControlFilters.tsx:130`). Its session-bound waiting-page chip now improves browser-blockage visibility, although Orca’s documented kanban, previews and shared status glyphs remain a strong scanning baseline (`components/supervision/missionControl/MissionControlRow.tsx:106`, `:283`).

**Overview — AX vs opencode.** AX consolidates requests and waiting pages into one inbox, reducing navigation compared with opencode’s verified per-session docks (`components/supervision/NeedsYouPopover.tsx:121`, `:134`). Preview age and Retry help supervisors assess stale information without opening each session (`components/supervision/missionControl/MissionControlRow.tsx:198`).

**Workspace — AX vs Orca.** Drag swap/dock, keyboard movement and pop-out close much of Orca’s arrangement advantage, while session-specific page controls add useful web-app supervision (`components/sessionGrid/SessionGrid.tsx:143`, `:176`, `:289`, `:356`). Orca retains more general mixed-tool pane trees; AX’s four-slot ceiling and compact controls that open the shared browser constrain simultaneous inspection (`lib/supervision/sessionGrid.ts:53`; `hooks/useWebMcpPages.ts:37`).

**Workspace — AX vs opencode.** AX’s simultaneous sessions provide stronger comparison than opencode’s documented unsplit workspace (`components/sessionGrid/SessionGrid.tsx:402`). Page switching, per-session revoke, call outcomes and digest-matched approval definitions extend that advantage to agent use of web apps (`components/mcp/WebMcpPages.tsx:115`, `:129`; `components/mcp/WebMcpCallStrip.tsx:100`; `components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX combines content-and-mode-bound review credit with jumpable browser steps, durations and definition identity beside landing (`components/views/git/ReviewLanding.tsx:77`; `components/views/git/ReviewLandingBrowserEvidence.tsx:141`). Orca retains inline three-way merge, whereas AX delegates conflict resolution, and AX’s freshness checks remain preflight checks before mutation rather than an atomic guarantee (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** Session/Last-turn landing and the collapsible, adjustable rail provide a strong inspection-to-delivery workflow (`components/views/SessionChangesView.tsx:420`; `components/views/ReviewFileRail.tsx:160`, `:324`). opencode’s verified turn undo/redo remains valuable; its undocumented landing controls are not treated as absent.

Codex receives credit for its documented scopes, inline findings and hunk-level Git controls. [Official OpenAI documentation](https://learn.chatgpt.com/docs/code-review).

Compared with round24/codex’s **9.25**, the assessment rises **0.03**, principally for waiting-page visibility and grid page access cited above. Round 27’s masking of sensitive values repeated in diagnostic prose improves trust without warranting another surface-score increase (`desktop/shared/webmcp-redaction.mjs:126`, `:206`).

Weights: **overview 40%, review 35%, workspace 25%**.

**AX vs Orca: better** — weighted lead **+0.31**.  
**AX vs opencode: better** — weighted lead **+2.21**.

No conditional flip list is required.

