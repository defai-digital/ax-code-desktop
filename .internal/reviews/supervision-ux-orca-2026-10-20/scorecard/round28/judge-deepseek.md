## Independent UX scorecard, round 28 — AX HEAD `e36aad55`

**Method.** Read-only source verification at HEAD; git tree clean. No shell in this session, so I did not rerun gates, journeys or the stated three-platform CI; every AX claim below is a line I read. Competitors are the supplied `competitor-facts.md` snapshot; unknown competitor capabilities are not penalties. Uncommitted `config/`, lockfile and version pins ignored.

### 1. Per-surface scores

| Surface (weight) | AX | Orca | opencode | Codex | Claude |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (.40) | **9.30** | 9.00 | 6.80 | 8.20 | 8.70 |
| Workspace / layout (.25) | **9.20** | 9.05 | 6.90 | 8.30 | 8.90 |
| Review changes (.35) | **9.25** | 8.95 | 7.40 | 8.85 | 8.85 |

**Overview — vs Orca.** Rows settle "what needs me" in place: stale previews carry last-read age and a Retry that never selects the row (`missionControl/MissionControlRow.tsx:198-224`), a waiting-page chip and page/origin chip sit on the row (`:258-286`), and PR-state plus checks facets are multi-select with counts and removable chips (`MissionControlFilters.tsx:118-160`, `:250-267`); waiting pages also join Needs you (`NeedsYouPopover.tsx:64-65`). Orca still wins ambient signal (cross-worktree feed, date buckets, consistent glyphs), so this is an edge in consolidated decisions, not broad dominance.
**vs opencode.** opencode has no multi-agent board and only per-session permission docks (`competitor-facts.md:19,22`); AX adds the unread Activity feed (`ActivityButton.tsx:22`, ref-based panel `:46-49`), previews and supervision-only runtime check/budget evidence.

**Workspace — vs Orca.** Four panes host complete sessions with drag-swap/edge-dock (`SessionGrid.tsx:97-155`, `sessionGrid.ts:431-460`), arrow moves with focus, split, pop-out and remembered ratios (`SessionGrid.tsx:248-258`, `:303-322`, `:356-379`, `:434-465`), each pane with its own page switcher (`:289`). Orca's recursive pane trees still host more tool types, so AX leads on session comparison, not tool generality.
**vs opencode.** A single resizable right panel with no split panes cannot show two agents concurrently; AX shows four, each with Chat/Changes/Files/Terminal plus per-session WebMCP pages, revoke and named capacity (`WebMcpPages.tsx:17-102`).

**Review — vs Orca.** Landing from This session/Last turn applies only while mark, index `before`, worktree `after` and file mode still match (`git/ReviewLanding.tsx:77-91`), unreviewed files need a second explicit click (`:116-130`), and the commit preflight re-reads index identity (`:252-284`); the rail is a collapsible tree with clamped drag/keyboard width (`ReviewFileRail.tsx:169-171`, `:279-328`, `:567`) and a recap with durations, definition identity and jump-to-step (`ReviewLandingBrowserEvidence.tsx:139-171`). Orca keeps inline three-way merge (AX still delegates conflicts to a session, `ConflictDialog.tsx:149,164`) and an arbitrary compare ref.
**vs opencode.** Its tree, mode switch and comment chips are pleasant, but it has no stage/commit at the diff (inference); AX binds delivery to reviewed bytes.

### 2. Weighted overall (overview 40%, review 35%, workspace 25%)

| Product | Overview | Workspace | Review | Weighted |
|---|---:|---:|---:|---:|
| AX Code Desktop | 9.30 | 9.20 | 9.25 | **9.26** |
| Orca | 9.00 | 9.05 | 8.95 | **9.00** |
| Claude Code desktop | 8.70 | 8.90 | 8.85 | **8.80** |
| Codex app | 8.20 | 8.30 | 8.85 | **8.45** |
| opencode desktop | 6.80 | 6.90 | 7.40 | **7.04** |

**Rounds 24→28 delta.** The Windows Last-turn fallback (`SessionChangesView.tsx:185-193`), approval receipts (`ToolPart-impl.tsx:2049`) and round-27/28 redaction (echo masking, value-based input masking; `desktop/shared/webmcp-redaction.mjs`) raise trust, not supervision breadth, so I add nothing over round 27 beyond that evidence.

**AX vs Orca: better** (+0.26).
**AX vs opencode: better** (+2.22).

### 3. Flip list

Not required — AX leads both. Margin-protecting, smallest first: inline three-way merge, an arbitrary compare ref beside the Branch base, and a grid pane that can host one tool instead of a whole session.