Independent, read-only assessment at HEAD `acc31cad`. Competitors use the supplied facts snapshot; unknown capabilities receive no penalty. Scores assess implementation, not release qualification or independently rerun journeys.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 9.4 | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | 8.9 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | 8.9 | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.10** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview 40%, review 35%, workspace 25%.

**Overview — AX vs Orca.** AX now combines a [unique pending-decision badge]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/tray/traySnapshot.ts:184), [PR/CI row information]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:245), and [PR filtering]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/supervision/missionControl.ts:136), substantially closing Orca’s triage advantage. AX’s [confirmed batch decisions]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx:38) give it the intervention edge, although [PR coverage requires an already-known integration entry]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/hooks/useMissionControlPullRequests.ts:97).

**Overview — AX vs opencode.** AX’s [answerable global inbox]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:124) reduces the repeated session visits implied by opencode’s documented per-session prompts. Its [activity previews, checks and change counts]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:174) better support understanding twenty sessions without opening each.

**Workspace — AX vs Orca.** AX’s [browser call strip]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:69) makes agent operations and outcomes visible beside the web app, adding useful supervision beyond Orca’s browser pane. However, AX’s [fixed one-to-four-session layouts]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:78) remain less adaptable than Orca’s pane trees and drag-to-split.

**Workspace — AX vs opencode.** AX’s grid and each embedded session’s [Chat, Changes, Files and Terminal]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/App.tsx:93) provide stronger simultaneous inspection than opencode’s documented unsplit workspace. opencode’s titlebar session tabs remain an efficient switching surface.

**Review — AX vs Orca.** AX combines [content-bound commit preflight]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:217) with [latest-turn browser-call evidence beside landing]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:21), appropriately presented as calls rather than tests. That earns a narrow edge, constrained by [session-delegated conflict resolution]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:164) versus Orca’s inline three-way merge.

**Review — AX vs opencode.** AX’s verified [Branch landing integration]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/BranchChangesView.tsx:379) provides a concrete review-to-delivery path; I do not treat opencode’s undocumented commit controls as absent. opencode retains useful documented strengths in its resizable tree and turn undo/redo.

I verified the [eight reason codes]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:258), [filtered preview handling]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:366), and [expanded “Next step” rendering]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:219), but award no current-runtime credit for those optional fields. Their [unpinned runtime dependency]( /Users/akiralam/code/ax-code-desktop/.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md:282) remains material; three-platform CI success is [recorded evidence]( /Users/akiralam/code/ax-code-desktop/.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md:280), not my rerun.

**AX vs Orca: equal** — the 0.17 lead is promising but below the controlling 0.2 margin.  
**AX vs opencode: better**

Three smallest changes most likely to flip Orca:

1. Extend landing into This session and Last turn, removing the [current scope restriction]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/DiffView.tsx:2077).
2. Add Retry and last-success age beside [stale activity previews]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:174).
3. Add collapsible directory grouping and adjustable width to the [flat review rail]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:138).

