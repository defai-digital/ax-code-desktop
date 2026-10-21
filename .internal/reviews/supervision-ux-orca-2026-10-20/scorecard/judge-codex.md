AX is strong at actionable supervision, but Orca remains the stronger overall fit for this persona.

Scores assess the supplied verified evidence and AX’s current source. Unknown competitor capabilities receive no penalty; inferred absences are excluded. Native rendering verification is accepted as supplied, not independently rerun. These are judgment scores, not measured productivity results.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 8.0 | 8.5 | 5.5 | 7.0 | 8.0 |
| Workspace / layout | 7.0 | 9.0 | 7.0 | 8.0 | 9.0 |
| Review changes | 7.0 | 9.0 | 7.5 | 9.0 | 8.5 |
| **Weighted overall** | **7.40** | **8.80** | **6.58** | **7.95** | **8.43** |

Overall = overview × 40% + review × 35% + workspace × 25%. Codex’s overview score has lower confidence because its Activity view remains unverified.

**Mission Control / overview**

**AX vs Orca:** AX’s actionable inbox and Peek reduce interruptions, while Orca’s compound filters, child-agent rows and cross-worktree event feed provide stronger fleet awareness. The new AX preview narrows the gap, but [source confirms](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:62) it disappears in compact density and whenever a goal or error is present; its message fallback also requires loaded content.

**AX vs opencode:** AX clearly better supports finding and answering requests across repositories through its global inbox, ranked navigation and grouped overview. opencode’s verified session-local prompts and absence of a multi-agent board impose more session switching, despite useful unread/progress tabs.

**Workspace / layout**

**AX vs Orca:** AX’s resizable chat/tool layout, terminal dock and overview pop-out support focused work well. Orca’s independent agent panes and drag-to-split layouts better support watching one session while investigating another; AX’s right pane remains a tool surface.

**AX vs opencode:** Both provide a capable single-session workspace with adjacent tools, without two independent sessions side by side. AX’s explicit workspace navigation and terminal dock balance opencode’s session tabs with unread/progress indicators, leaving neither clearly ahead for this persona.

**Review changes**

**AX vs Orca:** AX offers meaningful hunk controls, five scopes and batched comments, but Orca better supports repeated review through selectable bases, anchored/resolvable comments, recipient selection and three-way merge. AX also has a concrete reliability defect: [Git “viewed” signatures](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useReviewProgressStore.ts:27) use counts/status, so an equal-count rewrite can remain marked reviewed.

**AX vs opencode:** AX’s Git operations are valuable, but opencode’s presumed lack of those controls is unverified and earns AX no comparative advantage. opencode’s verified branch scope, resizable file tree and turn undo/redo provide a slight review advantage over AX’s flat rail, missing branch comparison and incomplete review invalidation.

**AX vs Orca: worse**  
**AX vs opencode: better**

The three smallest concrete interventions with the best chance of changing the surface verdicts are:

1. **Overview:** Show the existing activity line alongside goals and in compact rows, retaining prominent errors; explicitly distinguish unavailable previews. This directly improves scanning and could combine with AX’s actionable inbox to overtake Orca.
2. **Workspace:** Add one “Open session beside current” action with independent session selection and composers in a fixed two-session layout. This could beat opencode and substantially narrow Orca’s advantage without implementing arbitrary pane trees.
3. **Review:** Add branch/base comparison with reviewed marks bound to the complete before/after diff identity. This addresses both missing comparison coverage and false review confidence, making an opencode reversal plausible.

These changes would not guarantee superiority over Orca’s broader layout and review workflows.

