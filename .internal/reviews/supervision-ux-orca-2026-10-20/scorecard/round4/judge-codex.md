At HEAD `13a9161f`, **AX remains worse than Orca and better than opencode for this persona**. I read the supplied evidence and all round-3 judgments, then checked the implementations independently. This is a source assessment; I did not rerun UI journeys. Unknown competitor capabilities and inferred absences receive no penalty.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview — 40% | 8.6 | 9.0 | 6.2 | 7.5 | 8.5 |
| Workspace / layout — 25% | 8.0 | 9.0 | 7.0 | 8.0 | 9.0 |
| Review changes — 35% | 8.3 | 8.7 | 7.6 | 8.7 | 8.8 |
| **Weighted overall** | **8.35** | **8.90** | **6.89** | **8.05** | **8.73** |

**Overview — AX vs Orca:** AX’s updated-since-visit filter and manual unread action improve return-to-work triage ([MissionControlFilters.tsx:113](desktop/packages/ui/src/components/supervision/missionControl/MissionControlFilters.tsx:113), [useSupervisionStore.ts:210](desktop/packages/ui/src/stores/useSupervisionStore.ts:210)). Orca retains stronger continuous awareness through its event feed and child rows; AX’s previews require loaded data and children remain inside Details ([activityPreview.ts:109](desktop/packages/ui/src/lib/supervision/activityPreview.ts:109), [MissionControlPeek.tsx:107](desktop/packages/ui/src/components/supervision/missionControl/MissionControlPeek.tsx:107)).

**AX vs opencode:** AX’s global request inbox and inline permission/question responses materially reduce interruption handling across repositories ([NeedsYouPopover.tsx:110](desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:110), [RequestActionCard.tsx:148](desktop/packages/ui/src/components/supervision/RequestActionCard.tsx:148)). Opencode’s verified unread tabs and unseen-session shortcuts help navigation, but its per-session prompts and lack of a board fit this supervision workload less well.

**Workspace — AX vs Orca:** AX now opens another project’s session beside the current conversation, preserving its directory ([openSessionBeside.ts:9](desktop/packages/ui/src/lib/supervision/openSessionBeside.ts:9), [ContextPanel-impl.tsx:2726](desktop/packages/ui/src/components/layout/ContextPanel-impl.tsx:2726)). Orca’s pane trees remain stronger for simultaneous investigation because AX’s embedded surface renders chat without its own review/tool workspace ([App.tsx:217](desktop/packages/ui/src/App.tsx:217)).

**AX vs opencode:** Same-window session pairing earns AX a meaningful advantage over opencode’s documented unsplit layout ([openSessionBeside.ts:13](desktop/packages/ui/src/lib/supervision/openSessionBeside.ts:13)). The native journey checks both conversations’ presence and the second frame’s visibility, but does **not** explicitly assert both composers, so I credit narrower verification than the README claims ([supervision-workspace-webmcp.mjs:476](desktop/packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs:476)).

**Review — AX vs Orca:** Persisted threads, conservative re-anchoring, resolve/reopen and targeted re-send substantially close iterative-review gaps ([useReviewThreadStore.ts:75](desktop/packages/ui/src/stores/useReviewThreadStore.ts:75), [reanchorThread.ts:6](desktop/packages/ui/src/lib/reanchorThread.ts:6), [ReviewThreadList.tsx:70](desktop/packages/ui/src/components/views/ReviewThreadList.tsx:70), [DiffCommentSummaryBar.tsx:99](desktop/packages/ui/src/components/views/DiffCommentSummaryBar.tsx:99)). Orca retains the smoother merge/landing workflow, while AX’s persisted Git marks use server blob identities but fall back to counts when identities are unavailable ([service.js:1753](desktop/packages/web/server/lib/git/service.js:1753), [useReviewProgressStore.ts:92](desktop/packages/ui/src/stores/useReviewProgressStore.ts:92), [useReviewProgressStore.ts:285](desktop/packages/ui/src/stores/useReviewProgressStore.ts:285)).

**AX vs opencode:** AX earns a review preference through its concrete hunk actions and durable feedback loop, without assuming opencode lacks undocumented staging ([DiffView.tsx:503](desktop/packages/ui/src/components/views/DiffView.tsx:503)). Session/Last-turn editor opening reduces follow-up friction, although opencode’s tree and turn undo/redo remain valuable ([SessionChangesView.tsx:255](desktop/packages/ui/src/components/views/SessionChangesView.tsx:255)).

**AX vs Orca: worse**  
**AX vs opencode: better**

Three smallest targeted changes most likely to flip the result:

1. Load bounded previews for visible, unopened sessions; expose freshness and summarize changes since the visit ([activityPreview.ts:145](desktop/packages/ui/src/lib/supervision/activityPreview.ts:145)).
2. Add a session-scoped Review/Files switch inside the embedded chat, preserving its composer and directory ([App.tsx:217](desktop/packages/ui/src/App.tsx:217)).
3. Bind session marks to both content sides and visibly invalidate unverifiable marks instead of retaining count-based confidence ([SessionChangesView.tsx:270](desktop/packages/ui/src/components/views/SessionChangesView.tsx:270), [ReviewFileRail.tsx:147](desktop/packages/ui/src/components/views/ReviewFileRail.tsx:147)).