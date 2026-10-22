Confirmed: Mission Control rows show browser origin + enabled state (MissionControlRow.tsx:93-102,254-268), but no per-row *waiting call* signal; the session grid has no WebMCP surface at all. Enough evidence — scoring now.

## Independent UX Scorecard — Round 24 (HEAD `5193b0c8`)

### 1. Per-surface scores (1–10)

| Surface | AX | Orca | opencode | Codex app | Claude Code |
|---|---|---|---|---|---|
| Mission Control / overview | **9.3** | 9.0 | 6.6 | 7.6 | 8.5 |
| Workspace / layout | **9.1** | 9.1 | 6.4 | 7.5 | 8.2 |
| Review changes | **9.4** | 9.2 | 7.4 | 8.0 | 8.6 |

**AX vs Orca (overview).** AX now beats Orca on the persona's "what needs me" loop: multi-select PR-state *and* checks facets with live counts and removable chips (`MissionControlFilters.tsx:118,132-159,250-268`), child agents as indented openable rows (`MissionControlRow.tsx:22,90`), and a stale preview that states its own age with a Retry that never selects the row (`MissionControlRow.tsx:81-90,25`). Orca's board remains a tighter read at a glance, and AX's rows lack any *waiting page-call* signal — `useWebMcpPages` reaches Needs You (button/popover/queue) but no row field shows it (`MissionControlRow.tsx:93-102` only carries origin/enabled), so a call blocked on the browser is invisible on the board.

**AX vs opencode (overview).** opencode has no multi-agent board at all (competitor-facts.md:19) — per-session docks, no global inbox (:21), no PR/checks surface on rows. AX is roughly three orders of magnitude ahead here, and the ~9.3 is measured against a 6.6 floor that no AX gap can threaten.

**AX vs Orca (workspace).** Both are now equivalent, and I can point to the exact file that closed the gap: AX's grid is a real free-arrangement binary tree with swap/dock edges and four splits, not presets (`sessionGrid.ts:19-30,53,220`; `SessionGrid.tsx:147-151,254-255,303-320`), with pop-out under single-browser ownership (`SessionGrid.tsx:14,358-365`) and remembered ratios (`SessionGridPreferences.ts`, `SessionGrid.tsx:437-450`). The palette matches Orca item-for-item: `#` PR search, Tab scope, Shift+Enter split-open (`CommandPalette.tsx:677,829-833,892-897`). Orca's residual edge is nested pane *trees* per worktree, where AX caps at four slots.

**AX vs opencode (workspace).** opencode has no split panes at all — one resizable right panel with terminal/review/files/browser (competitor-facts.md:22). AX's multi-pane supervision is the whole product for this persona; ~+2.7 is not in play.

**AX vs Orca (review).** AX lands agents' work from the scopes a supervisor actually reads, and the guard is real rather than cosmetic: the landing action re-checks the mark, the index `before` blob, the worktree `after` blob, and file mode, falling back to an explicit "Stage all" click (`ReviewLanding.tsx:75-89,104-119`). Add the collapsible resizable rail (`ReviewFileRail.tsx:169,290-327`), re-anchoring threads with Resolve, and a browser recap beside landing whose *copy* covers the whole turn while the visible list is capped (`ReviewLandingBrowserEvidence.tsx:79-102`). Orca still has two things I could not find in AX: inline three-way merge (only a `ConflictDialog` that delegates resolution to an agent — `ConflictDialog.tsx:24-31,149`) and an arbitrary compare base (AX remembers one base per repo: `BranchChangesView.tsx:159,185-192`).

### 2. Weighted overall (overview 40% / review 35% / workspace 25%)

| Product | Weighted |
|---|---|
| **AX Code Desktop** | **9.29** |
| Orca | 9.10 |
| Claude Code | 8.43 |
| Codex app | 7.71 |
| opencode desktop | 6.79 |

**AX vs Orca: better** (+0.19, led by review; the PRD's 0.2 margin is just missed at my weighting).
**AX vs opencode: better** (+2.50).

### 3. Three smallest flips if I were wrong about Orca

1. **Per-row waiting-call chip** — reuse the existing `page.waiting` filter (`NeedsYouButton.tsx:27-28`) inside `MissionControlRow` next to the browser origin chip (`MissionControlRow.tsx:254-268`); ~15 lines, closes the one real hole in the board.
2. **Inline three-way merge** — surface the three hunks Orca shows inside `ConflictDialog`, which already fetches conflict details (`ConflictDialog.tsx:10,41`); the data is already there, only the editor is missing.
3. **Arbitrary compare base** — `baseChoice` is already a state plus a remembered default (`BranchChangesView.tsx:159,287`); a free-text ref option converts a fixed base into a switchable one.