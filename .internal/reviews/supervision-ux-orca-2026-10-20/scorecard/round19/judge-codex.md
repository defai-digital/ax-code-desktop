Independent assessment at **HEAD `f06cea02`**. Scores use verified source and the supplied competitor snapshot; unknown capabilities receive no penalty. Runtime-pin changes are excluded; apps and CI were not rerun.

Source paths below are relative to `desktop/packages/ui/src/`, except explicit `desktop/shared/` paths.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.3** | 9.0 | 6.8 | 8.2 | 8.7 |
| Workspace / layout | **9.1** | 9.0 | 6.9 | 8.3 | 9.0 |
| Review changes | **9.2** | 8.9 | 7.5 | 8.85 | 8.85 |
| **Weighted overall** | **9.22** | **8.97** | **7.07** | **8.45** | **8.83** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX combines counted, multi-select PR/check facets with actionable global requests, earning a narrow intervention advantage over Orca’s strong dashboard (`components/supervision/missionControl/MissionControlFilters.tsx:130`; `components/supervision/RequestActionCard.tsx:148`). Stale-preview age and Retry improve scanning reliability, although these are refinements rather than another major capability (`components/supervision/missionControl/MissionControlRow.tsx:81`, `:205`).

**Overview — AX vs opencode.** AX’s global inbox consolidates requests and waiting browser pages, reducing navigation compared with opencode’s documented per-session docks (`components/supervision/NeedsYouPopover.tsx:121`). Its activity previews, PR/check information and browser context better support understanding parallel work without opening every session (`components/supervision/missionControl/MissionControlRow.tsx:193`, `:260`, `:284`).

**Workspace — AX vs Orca.** AX’s drag-to-swap/dock and keyboard movement close much of the arrangement gap, while page switching and per-session revocation add useful supervision beyond Orca’s browser pane (`components/sessionGrid/SessionGrid.tsx:142`, `:175`; `components/mcp/WebMcpPages.tsx:113`, `:124`). Orca’s mixed-tool pane trees remain more general than AX’s four-session limit, keeping AX’s advantage small (`lib/supervision/sessionGrid.ts:462`).

**Workspace — AX vs opencode.** AX’s simultaneous session splits better serve comparison than opencode’s documented unsplit layout (`lib/supervision/sessionGrid.ts:463`). Digest-matched approval definitions and displayed runtime arguments also support informed intervention during web work (`components/chat/WebMcpApprovalToolInfo.tsx:35`; `components/chat/PermissionCard.tsx:473`).

**Review — AX vs Orca.** AX checks reviewed before/after content and file mode before treating session changes as reviewed, then places jumpable browser steps, durations and definition identity beside landing (`components/views/git/ReviewLanding.tsx:75`; `components/views/git/ReviewLandingBrowserEvidence.tsx:162`). Orca retains the more direct documented inline three-way merge; AX’s fresh-state commit guard is valuable but remains a preflight rather than an atomic transaction (`components/views/git/ReviewLanding.tsx:254`, `:285`).

**Review — AX vs opencode.** AX’s session/turn landing integration and adjustable directory tree provide a strong evidenced inspection-to-delivery workflow (`components/views/SessionChangesView.tsx:420`; `components/views/ReviewFileRail.tsx:160`, `:290`). opencode’s turn undo/redo remains useful, and its undocumented landing capabilities are not treated as absent.

Compared with round 18’s recorded **9.24–9.32**, I score AX slightly lower despite verified improvements: stable tool IDs distinguish redacted names, schema diffs preserve sensitivity context, and unresolved associations suppress “not called” claims (`desktop/shared/webmcp-catalog-projection.cjs:51`; `lib/webMcpPropertyDiff.ts:10`; `components/views/git/ReviewLandingBrowserEvidence.tsx:98`). These protect existing workflows rather than justify automatic score increases.

Two remaining defects constrain confidence: an in-memory probe confirmed that `headers: [["x-api-key", "synthetic-audit-value"]]` survives redaction, and draft storage silently drops property names exceeding 256 characters (`desktop/shared/webmcp-redaction.mjs:115`; `stores/useWebMcpBrowserStore.ts:501`). The former directly undermines trust in displayed/exported browser evidence.

**AX vs Orca: better** — **+0.25** before rounding.  
**AX vs opencode: better** — **+2.15**.

No flip list is required; the lead remains modest, not defect-free.

