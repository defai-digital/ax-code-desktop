At HEAD `d9f1b29d`, **AX remains narrowly worse than Orca and clearly better than opencode for this persona**. This is a read-only source assessment: I read the supplied records and verified implementation, but did not rerun journeys. Competitor scores use the supplied verified facts; unknowns and inferred absences receive no penalty.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 8.9 | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | 8.3 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | 8.6 | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall: 40% / 25% / 35%** | **8.65** | **8.93** | **6.90** | **8.17** | **8.73** |

**Overview — AX vs Orca:** AX closes substantial awareness gaps with actionable [child rows](desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:280), [unopened-session previews](desktop/packages/ui/src/components/supervision/MissionControl.tsx:164), and an [unread activity feed](desktop/packages/ui/src/components/supervision/missionControl/MissionControlActivityFeed.tsx:51). Orca retains a small scanning advantage through PR/MR filters and richer card context; AX’s feed records only observed state changes, while inline children are capped at three ([activityFeed.ts:74](desktop/packages/ui/src/lib/supervision/activityFeed.ts:74), [childSessions.ts:26](desktop/packages/ui/src/lib/supervision/childSessions.ts:26)).

**Overview — AX vs opencode:** AX’s [global request inbox](desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:110) supports [permission decisions and simple answers](desktop/packages/ui/src/components/supervision/RequestActionCard.tsx:148) without entering each conversation. That materially outperforms opencode’s verified per-session prompts for twenty-session supervision, despite useful unread tabs and unseen-session shortcuts.

**Workspace — AX vs Orca:** AX now [widens the beside panel](desktop/packages/ui/src/lib/supervision/openSessionBeside.ts:22) and supplies its own [Chat/Changes surfaces](desktop/packages/ui/src/App.tsx:237), making paired inspection practical. Orca’s pane trees and drag-to-split remain more flexible for simultaneous terminal/editor/diff investigation than AX’s two-tab embedded workspace.

**Workspace — AX vs opencode:** AX’s paired conversations offer a meaningful advantage over opencode’s documented unsplit layout ([App.tsx:264](desktop/packages/ui/src/App.tsx:264)). The native journey now explicitly checks both composers, minimum width, and the second repository’s diff; this is stronger verification coverage, although not a fresh execution result ([supervision-workspace-webmcp.mjs:486](desktop/packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs:486)).

**Review — AX vs Orca:** AX’s [re-anchored threads](desktop/packages/ui/src/components/views/PierreDiffViewer.tsx:219), [inline Resolve](desktop/packages/ui/src/components/comments/ReviewThreadMarker.tsx:27), and [remembered Branch base](desktop/packages/ui/src/components/views/BranchChangesView.tsx:280) substantially improve repeated review. Orca still offers smoother landing through three-way merge and Stage→Commit→Push; AX’s conflict interface delegates resolution to sessions, and commit/sync remain separate ([ConflictDialog.tsx:242](desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:242), [CommitSection.tsx:103](desktop/packages/ui/src/components/views/git/CommitSection.tsx:103), [SyncActions.tsx:45](desktop/packages/ui/src/components/views/git/SyncActions.tsx:45)).

**Review — AX vs opencode:** AX earns preference through [hunk actions](desktop/packages/ui/src/components/views/DiffView.tsx:503), [both-sided session signatures](desktop/packages/ui/src/stores/useReviewProgressStore.ts:167), and [visible fallback warnings](desktop/packages/ui/src/components/views/ReviewFileRail.tsx:202). Opencode’s filterable tree and turn undo/redo remain valuable; its undocumented landing capabilities are not scored as missing.

**AX vs Orca: worse**  
**AX vs opencode: better**

Three smallest changes most likely to flip the result:

1. Add directory-scoped Terminal and Files tabs to the [embedded workspace](desktop/packages/ui/src/App.tsx:237), preserving drafts and selection.
2. Expose preview freshness and retry status: [failed reads currently retain old text](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:100), making stale activity difficult to distinguish.
3. Add an explicit review-to-landing handoff joining the existing commit and sync controls, showing selected files and repository/branch context before each action ([CommitSection.tsx:25](desktop/packages/ui/src/components/views/git/CommitSection.tsx:25), [SyncActions.tsx:69](desktop/packages/ui/src/components/views/git/SyncActions.tsx:69)).

