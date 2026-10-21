All round-4 claims verified in source at HEAD. Findings:

**Verified round-4 (AX citations):** Threads persist per directory with 200/30/4000 caps (`useReviewThreadStore.ts:13-17,124-133`); re-anchoring matches exact then whitespace-normalized code and **refuses proximity**, marking "original location" when ambiguous (`reanchorThread.ts:5-30`); list shows recipient by title, Resolve/Reopen, Jump (`ReviewThreadList.tsx:41-84`); re-send rewrites coordinates and prepends a stale warning to the message (`DiffCommentSummaryBar.tsx:99-116`). Viewed marks persist (2000 cap, versioned key) and sign **scope-correct blob ids** plus status columns (`useReviewProgressStore.ts:27,46,92-110`), branch = merge-base + before blob + after hash (`:116-149`); server hashes in-process via `O_NOFOLLOW` with ancestor containment, size cap, symlink-by-link-text (`web/server/lib/git/service.js:1671-1725`). Open-beside is real and cross-project: Cmd/Ctrl+click (`MissionControlRow.tsx:79-84`), Cmd/Ctrl+Enter (`MissionControl.tsx:279-294`), own directory in `targetPath` (`openSessionBeside.ts:13-22`), asserted by a native WebMCP click + visible cross-project iframe (`supervision-workspace-webmcp.mjs:466-485`). Unread facet+marker+mark-unread (`missionControl.ts:100,120`; `MissionControlRow.tsx:153-161`; `MissionControlFilters.tsx:115-126`; `MissionControlPeek.tsx:170`). Session/Last-turn rail opens the editor (`SessionChangesView.tsx:247-251,361`). Child agents are inline rows with state and open (`MissionControlRow.tsx:280-313`).

**Still missing (verified absences):** the beside pane renders `ChatView` only — no diff/terminal/review for the second agent (`App.tsx:223`); Branch scope takes no stage callbacks and its compare base is in-memory (`BranchChangesView.tsx:19-25,39-49`); no Commit scope (`DiffView.tsx:77-80`); no turn undo/redo/revert; "since you left" is single-session (`SinceYouLeftStrip.tsx:20-21`); no inline 3-way merge, no findings→per-item fix, no PR/MR facet, no one-button Stage→Commit→Push.

## 1. Per-surface scores

| Surface | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **8.7** | 8.9 | 6.5 | 7.8 | 8.5 |
| Workspace / layout | **8.0** | 9.0 | 7.0 | 8.0 | 9.0 |
| Review changes | **8.6** | 8.8 | 7.3 | 8.6 | 8.8 |

**Overview, AX vs Orca:** AX now matches the filter model and adds what Orca lacks — a global *answerable* inbox, a count-bearing "updated since my last visit" facet (`MissionControlFilters.tsx:115-126`), mark-as-unread, and child agents as real rows (`MissionControlRow.tsx:280-313`). Orca still wins "what happened while I was away": its cross-worktree Agents feed with bell/dock badges narrates change, while AX offers only a boolean dot (`MissionControlRow.tsx:153-161`), and its cards carry PR/MR state. **AX vs opencode:** AX is plainly ahead — opencode has no board, only titlebar tabs and per-session permission docks, so five blocked agents means five opened sessions.

**Workspace, AX vs Orca:** Cmd/Ctrl+click now gives two sessions and two composers in one window, cross-project, keyboard-reachable and journey-verified — real closure of the round-3 "separate OS window" complaint. But the second unit is `ChatView` alone (`App.tsx:223`): comparing two agents' *diffs* still forces a switch, where Orca's per-worktree pane trees carry terminal/diff/PR. **AX vs opencode:** AX wins on tool breadth, resizable panels and genuine two-session supervision; opencode's titlebar tabs remain its edge.

**Review, AX vs Orca:** Round 4 closes the decisive gap: persisted, content-re-anchored, resolvable threads with a target picker — and AX's refusal to guess an anchor is *safer* than proximity-pinning. Content-bound persisted viewed marks match Orca's trust bar. Orca retains inline 3-way merge, one-button Stage→Commit→Push and F7 hunk nav; AX's branch scope is still read-only. **AX vs opencode:** AX wins on staging, commit, scopes and threads; opencode's tree and turn revert stay notable.

## 2. Weighted (overview 40 / review 35 / workspace 25)

**AX 8.49 · Orca 8.89 · Claude 8.73 · Codex 8.13 · opencode 6.91**

**AX vs Orca: worse** (narrowly, −0.40)
**AX vs opencode: better**

## 3. Three smallest changes most likely to flip Orca

1. **Give the beside pane tools.** Mount `InspectorRail`/`ContextPanel` in the embedded realm instead of bare `ChatView` (`App.tsx:223`) — existing components, so the second agent's diff/terminal appear without leaving the window. Kills the last structural deficit.
2. **Make "updated" narrate.** Show *why* a row is flagged (last agent action + change counts + hook blocks, from `activityPreview`) inside the updated facet, not just a dot. Converts Orca's event-feed advantage into a one-glance answer.
3. **Make Branch scope landable.** Per-file stage from the branch rail plus a persisted compare base (`BranchChangesView.tsx:19-25`) — closes Orca/Codex "review the branch and land it".

(1)+(3) together plausibly flip it; (2) closes the overview gap on its own.