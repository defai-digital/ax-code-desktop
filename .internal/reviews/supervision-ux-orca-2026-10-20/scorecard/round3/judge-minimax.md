# Round-3 scorecard (judge 3, read-only; all AX claims verified in source)

**1. Per-surface scores (1-10)**

| Surface | AX | Orca | Codex app | Claude Code | opencode |
|---|---|---|---|---|---|
| Mission Control / overview | 7.8 | 8.8 | 7.9 | 8.4 | 6.3 |
| Workspace / layout | 7.1 | 8.9 | 8.2 | 9.0 | 7.0 |
| Review changes | 7.6 | 8.9 | 8.2 | 8.4 | 6.6 |

**AX vs Orca — overview:** Round 3 closed the compound-filter gap for real (`MissionControlFilters.tsx:64-179`: project multi-select with counts that follow the other facets, Has-changes, removable chips, Clear all) and the message-preview gap is gone (`activityPreview.ts`, rendered ungated in every density, `MissionControlRow.tsx:140-148`, credential-scrubbed), with "+N agents" plus a per-child state list in Details (`MissionControlRow.tsx:170-179`, `MissionControlPeek.tsx:101-120`). Orca still scans faster per unit of attention: kanban columns, inline child rows, a cross-worktree Agents feed with unread badge, a PR/MR facet, manual mark-unread (AX has none — tray badge is present, `useTraySync.ts:200`), and `Tab`/`Shift-Enter`/`#PR` in Cmd-J.

**AX vs opencode — overview:** AX keeps a decisive, evidence-backed lead: a global actionable Needs-You inbox plus Peek, per-session activity previews, child agents, working sets, bulk stop/archive, and multi-run compare against opencode's projects/recent-session list with no board at all. opencode's only edge is titlebar session tabs with unread/progress.

**AX vs Orca — workspace:** "Open this session in a separate window" (`openSessionWindow.ts`, wired in `WorkspaceNavigation.tsx:80-89` and the palette) is genuine two-session visibility, but it opens the chat-only mini-chat window (`renderElectronMiniChatApp.tsx` → `ElectronMiniChatApp`), so the second session has no diff, review, terminal or browser — exactly the surfaces a supervisor needs when comparing two agents. Orca's per-worktree pane trees with drag-to-split (terminal/editor/browser/diff/PR) remain a different class of surface.

**AX vs opencode — workspace:** Both are effectively single-session with a tool panel on the right; AX wins on tool breadth (Files/Diff/Git/Terminal/Plan/Context/Wiki/Board, resizable right rail, bottom terminal dock, InspectorRail change badges) and on pop-out, opencode wins narrowly on titlebar session tabs. Close, not a rout.

**AX vs Orca — review:** Selectable base vs merge-base is real and safe (`BranchChangesView.tsx`, server `getGitBranchDiff` at `service.js:2408-2537`: branch allow-list, merge-base, renames, 300-file/16 MiB/30 s caps), and the comment target picker sends to another same-project session with that session's own agent and model (`DiffCommentSummaryBar.tsx:37-100`). Orca keeps the edge in the part that makes review *durable*: comments pinned across edits plus Resolve threads, inline 3-way merge, F7 change navigation, a single Stage→Commit→Push button, and a file tree; AX's branch scope is read-only (no staging inside it) and viewed marks stay in memory (`useReviewProgressStore`, no persistence), so a restart silently resets review progress.

**AX vs opencode — review:** AX is clearly ahead — six scopes, per-hunk stage/unstage/revert, image diffs, commit with Cmd/Ctrl+Enter, PR composer, batch comments, editor-open from Git and Branch rails (still missing on the session/Last-turn rail, `SessionChangesView.tsx:326-332`).

**2. Weighted overall (overview 40 / review 35 / workspace 25)**

- AX Code Desktop **7.56** · Orca **8.86** · Claude Code desktop **8.55** · Codex app **8.08** · opencode **6.58**
- **AX vs Orca: worse**
- **AX vs opencode: better**

**3. Three smallest changes most likely to flip AX vs Orca**

1. **Give the session window the inspector rail** — mount `InspectorRail`/`ContextPanel` in `ElectronMiniChatApp` so the second window carries review/diff/terminal. This is the heaviest-weighted surface gap and mostly wiring of components that already exist.
2. **Turn Since You Left into a cross-session activity feed with unread** — every input already exists (`activityPreview`, `useNotificationStore`, tray badge); Orca's feed is the "don't open every session" advantage AX still cannot match.
3. **Persist viewed marks and make Branch scope actionable** — disk-persist reviewed signatures per scope, and allow per-file/per-hunk stage + revert inside Branch. Closes Orca/Codex parity on "review the whole branch and land it".

（以上評分依任務要求以英文輸出。）