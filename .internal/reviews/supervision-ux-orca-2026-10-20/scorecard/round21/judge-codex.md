Independent, read-only judgment at **HEAD `15f40f1d`**. Competitors use the supplied verified facts; undocumented capabilities receive no penalty. This is source-based assessment, not a comparative usability trial.

Source paths below are relative to `desktop/packages/ui/src/` unless stated otherwise.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.15** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.25** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** Direct permission answers and counted, multi-select PR/check facets give AX a narrow intervention advantage over Orca’s strong dashboard (`components/supervision/RequestActionCard.tsx:148`; `components/supervision/missionControl/MissionControlFilters.tsx:130`). Preview age and in-place Retry improve scanning reliability, although they do not establish superior information density (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:205`).

**Overview — AX vs opencode.** AX consolidates decisions and waiting browser pages in one inbox, reducing navigation compared with opencode’s documented per-session docks (`components/supervision/NeedsYouPopover.tsx:121`). Activity previews, session-bound browser context and PR/check signals better support understanding parallel work without opening every session (`components/supervision/missionControl/MissionControlRow.tsx:193`, `:253`, `:284`).

**Workspace — AX vs Orca.** Drag-to-swap/dock, keyboard movement with following focus, and per-session page switching/revocation combine adaptable arrangement with supervision beyond Orca’s browser pane (`components/sessionGrid/SessionGrid.tsx:142`, `:175`; `components/mcp/WebMcpPages.tsx:113`, `:124`). Orca’s mixed-tool pane trees remain more general than AX’s session-focused grid and four-pane ceiling, keeping the advantage small (`components/sessionGrid/SessionGrid.tsx:402`; `lib/supervision/sessionGrid.ts:462`).

**Workspace — AX vs opencode.** AX’s simultaneous sessions support comparison better than opencode’s documented unsplit layout (`components/sessionGrid/SessionGrid.tsx:402`). For browser work, approval arguments and digest-matched page definitions make intervention more informed (`components/chat/PermissionCard.tsx:478`; `components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX binds session review credit to before/after content and file mode, then places jumpable browser steps, durations and definition identity beside landing (`components/views/git/ReviewLanding.tsx:77`; `components/views/git/ReviewLandingBrowserEvidence.tsx:141`). Orca retains the more direct documented inline three-way merge; AX delegates conflict resolution and its landing freshness check remains a preflight with a subsequent mutation interval (`components/views/git/ConflictDialog.tsx:164`; `components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** Session/turn landing and the collapsible, adjustable file rail give AX a strong evidenced inspection-to-delivery workflow (`components/views/SessionChangesView.tsx:420`; `components/views/ReviewFileRail.tsx:160`, `:279`). opencode’s turn undo/redo remains useful, and its undocumented landing controls are not scored as absent.

**Compared with round 20:** scores remain unchanged from round20/codex. Round 21 improves evidence integrity through shared redaction, field-context sensitivity and explicit rejection of incomplete inputs for diagnosis, replay or export; this is valuable hardening rather than broader supervision capability (`desktop/shared/webmcp-redaction.mjs:83`; `lib/toolHelpers.ts:412`; `lib/webMcpDiagnosis.ts:140`; `components/mcp/WebMcpToolPanel.tsx:1009`). Approval receipts remain memory-only and capped at 256 (`stores/useWebMcpApprovalOutcome.ts:31`, `:56`).

Twelve shared-redaction tests passed locally; native journeys and exact-HEAD CI were not rerun.

**AX vs Orca: better** — weighted lead **+0.28**.  
**AX vs opencode: better** — weighted lead **+2.18**.

