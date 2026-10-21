At HEAD `41c651986`, **AX remains worse than Orca and better than opencode for this persona**. Round 3 meaningfully reduces navigation costs, but review reliability and sustained situational awareness still limit AX.

I read all three evidence files and checked the named implementations and their wiring. This is a source-based assessment, not a hands-on usability test; competitor unknowns and inferred absences receive no negative credit, and README test results are reported evidence rather than independently rerun validation.

| Surface / weight | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview — 40% | **8.5** | 9.0 | 6.0 | 7.5 | 8.5 |
| Workspace / layout — 25% | **7.5** | 9.0 | 7.0 | 8.0 | 9.0 |
| Review changes — 35% | **8.0** | 8.5 | 7.5 | 8.5 | 9.0 |
| **Weighted overall** | **8.08** | **8.83** | **6.78** | **7.98** | **8.80** |

**Mission Control / overview.** Against Orca, AX now combines project multi-select, Has changes, removable project/status chips, Clear all, density-independent previews and child Details with actionable requests and bulk operations. Orca still provides a more continuous monitoring experience through its cross-worktree feed, unread handling, PR/MR filters and child rows; AX previews depend on loaded data, while child details require disclosure. ([AX preview logic](desktop/packages/ui/src/lib/supervision/activityPreview.ts:109)) Against opencode, AX’s global actionable inbox and urgency-ranked overview directly reduce the cost of supervising 5–20 sessions. Opencode’s verified tabs and unseen-session shortcuts help navigation, but its documented per-session prompts and absence of a multi-agent board leave more supervisory work to the user.

**Workspace / layout.** Against Orca, AX’s separate-session window enables useful simultaneous monitoring, but opens a compact chat surface rather than providing Orca’s integrated pane trees and drag-to-split workspace. It earns partial closure of the comparison gap, with window arrangement and tool-context switching still imposing friction. ([Window surface](desktop/packages/ui/src/components/mini-chat/MiniChatLayout.tsx:356)) Against opencode, AX’s verified session window and supervision navigation give it a modest advantage for watching concurrent work. Opencode’s titlebar tabs remain a strong switching mechanism, so AX’s advantage is smaller here than in overview.

**Review changes.** Against Orca, AX’s selectable merge-base comparison and same-project comment target picker close substantial gaps; the picker preserves the receiving session’s agent/model and retains drafts after failed sends. Orca retains the stronger iterative review loop through anchored, resolvable comments and inline three-way merge, while AX’s Git viewed marks can survive same-count rewrites and Branch signatures omit the before-content. ([Target picker](desktop/packages/ui/src/components/views/DiffCommentSummaryBar.tsx:65), [viewed signatures](desktop/packages/ui/src/stores/useReviewProgressStore.ts:27)) Against opencode, AX earns a narrow preference through its verified staging, hunk operations, commit workflow and targeted feedback. Opencode’s filterable, resizable tree and turn undo/redo remain substantial strengths; its inferred lack of commit controls is not treated as established fact.

**AX vs Orca: worse**  
**AX vs opencode: better**

The three smallest targeted changes most likely to reverse the Orca verdict are:

1. **Make viewed marks trustworthy:** persist them against repository/worktree, scope, resolved base, path/status and both content sides; invalidate on any difference.
2. **Retain actionable review threads:** preserve sent comments with recipient and Open/Resolved state; re-anchor using stored code/context, explicitly marking ambiguous anchors stale.
3. **Make overview useful before opening sessions:** fetch bounded previews for visible unloaded rows, expose freshness, and add an unread “changed since last visit” filter using existing events.

These target missed work and unsafe review assumptions; they warrant another judgment, not an automatic winning score.