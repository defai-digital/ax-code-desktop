Independent assessment at **HEAD `4b7f80db`**. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. This is source-based scoring, not a fresh usability study or exact-HEAD CI certification; nine shared-redaction tests passed.

Paths below are relative to `desktop/packages/ui/src/` unless stated otherwise.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout | **9.15** | 9.00 | 6.90 | 8.30 | 9.00 |
| Review changes | **9.25** | 8.90 | 7.50 | 8.85 | 8.85 |
| **Weighted overall** | **9.25** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: **overview 40%, review 35%, workspace 25%**.

**Overview — AX vs Orca.** Counted, multi-select PR/check facets and directly answerable requests give AX a narrow intervention advantage over Orca’s strong dashboard (`components/supervision/missionControl/MissionControlFilters.tsx:130`; `components/supervision/RequestActionCard.tsx:148`). Stale-preview age and Retry strengthen scanning reliability, without constituting another major capability (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:205`).

**Overview — AX vs opencode.** AX’s global inbox consolidates decisions and waiting browser pages, reducing navigation compared with opencode’s documented per-session docks (`components/supervision/NeedsYouPopover.tsx:121`). Activity previews, browser context and PR/check information better support understanding parallel work without opening each session (`components/supervision/missionControl/MissionControlRow.tsx:193`, `:253`, `:284`).

**Workspace — AX vs Orca.** Drag-to-swap/dock, keyboard movement with following focus, and per-session page switching/revocation combine adaptable arrangement with supervision beyond Orca’s browser pane (`components/sessionGrid/SessionGrid.tsx:85`, `:142`, `:175`; `components/mcp/WebMcpPages.tsx:113`, `:124`). Orca’s mixed-tool pane trees remain more general than AX’s four-session ceiling, keeping the advantage small (`lib/supervision/sessionGrid.ts:462`).

**Workspace — AX vs opencode.** AX’s simultaneous session splits better support comparison than opencode’s documented unsplit layout (`lib/supervision/sessionGrid.ts:463`). For web work, runtime arguments and digest-matched page definitions make intervention more informed (`components/chat/PermissionCard.tsx:473`; `components/chat/WebMcpApprovalToolInfo.tsx:35`).

**Review — AX vs Orca.** AX binds session review credit to before/after content and file mode, then supplies jumpable browser steps, durations and definition identity beside landing (`components/views/git/ReviewLanding.tsx:75`; `components/views/git/ReviewLandingBrowserEvidence.tsx:141`). Orca retains the more direct documented inline three-way merge; AX’s commit freshness check remains a preflight, leaving a read/write interval (`components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** Session/turn landing and the adjustable, collapsible file tree give AX a strong evidenced inspection-to-delivery workflow (`components/views/SessionChangesView.tsx:420`; `components/views/ReviewFileRail.tsx:160`, `:191`, `:279`). opencode’s turn undo/redo remains useful, and its undocumented landing controls are not scored as absent.

**Round 20 versus round 19:** the improvement is modest but relevant: completed calls recover approval previews/digests, while diagnosis refuses to substitute the current definition when the invoked definition is unavailable (`lib/webMcpCalls.ts:132`; `lib/webMcpDiagnosis.ts:227`). Runtime rejection details now reach the recap (`components/views/git/ReviewLandingBrowserEvidence.tsx:183`; `components/mcp/WebMcpCallDiagnosis.tsx:95`). This supports a small workspace/review increase over round19/codex’s **9.22**, not a broad supervision uplift. Receipts remain ephemeral and capped at 256, limiting retrospective reliability across restarts or heavy workloads (`stores/useWebMcpApprovalOutcome.ts:30`, `:52`).

**AX vs Orca: better** — **+0.28** before rounding.  
**AX vs opencode: better** — **+2.18** before rounding.

No flip list is required; the Orca lead remains narrow.

