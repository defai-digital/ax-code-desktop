Verification complete. Round 21's single change (unified redaction in `desktop/shared/webmcp-redaction.mjs`, consumed by 20+ call sites) is a safety/consistency hardening — it removes a divergence class but adds no new supervision capability, so it earns no score movement.

## 1. Per-surface scores

| Surface | AX Code Desktop | Orca | opencode | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview (40%) | **9.30** | 9.00 | 6.75 | 8.20 | 8.70 |
| Workspace / layout (25%) | **9.10** | 9.00 | 6.90 | 8.30 | 8.95 |
| Review changes (35%) | **9.20** | 8.90 | 7.30 | 8.85 | 8.85 |

**Overview — vs Orca.** AX answers permissions, questions and waiting browser pages from one triage point (Needs You folds waiting pages into the same count and list: `NeedsYouPopover.tsx:64,121`; `NeedsYouButton.tsx:27`), and its PR/check facets are genuinely multi-select with per-value counts (`MissionControlFilters.tsx:130-163`), which Orca's documented single PR/MR filter does not match. **vs opencode:** opencode has no multi-agent board at all — only a home list plus per-session permission docks (`competitor-facts.md:19,22`) — so "notice what needs me" is structurally absent, not merely thinner.

**Workspace — vs Orca.** AX's grid does drag-to-swap/edge-dock with a computed drop edge (`SessionGrid.tsx:124-152`), arrow moves (`SessionGrid.tsx:175`), pop-out with tracked window ownership (`SessionGrid.tsx:14,360`) and remembered ratios (`SessionGrid.tsx:440-450`); per-session page revoke and named pool capacity are real (`WebMcpPages.tsx:24,129-132`). The edge is capped at four panes (`sessionGrid.ts:53,462`) while Orca's pane trees host any tool type, so the advantage is small. **vs opencode:** one resizable right panel with no splits (`competitor-facts.md:22`) cannot show two agents at once; AX shows four sessions each with Changes and Terminal.

**Review — vs Orca.** Landing from This session and Last turn applies only while the mark, index before-blob, worktree after-blob **and file mode** all still match (`ReviewLanding.tsx:77-91`), with a second explicit click for unreviewed files (`:116-130`); the rail is a collapsible, width-draggable tree (`ReviewFileRail.tsx:169,290-327,567`). Orca keeps inline three-way merge, which AX does not have — `ConflictDialog.tsx:186,165-176` only lists unmerged files and opens a *new session* to resolve them. **vs opencode:** its tree, mode switches and comment chips (`competitor-facts.md:23-25`) are pleasant, but there are no stage/commit controls in review, so work cannot be landed where it was reviewed.

## 2. Weighted overall

| Product | Weighted | vs AX |
|---|---:|---|
| **AX Code Desktop** | **9.21** | — |
| Claude Code desktop | 8.83 | behind |
| Orca | 8.96 | behind |
| Codex app | 8.44 | behind |
| opencode desktop | 7.00 | far behind |

**AX vs Orca: better** (+0.24, at the PRD's 0.2 margin but with no headroom).
**AX vs opencode: better** (+2.21).

I scored this ~0.04 below round 20's consensus (9.25). Round 21 delivered no new supervision capability — `desktop/shared/webmcp-redaction.mjs` is one module now imported by 20+ sites, which closes a divergence class but is invisible to this persona.

## 3. If not better than Orca — not applicable; three changes that would widen the lead

1. **Inline three-way merge** in the review diff. The only documented capability Orca holds that AX lacks (`ConflictDialog.tsx:186`). Highest persona impact: blocked landings currently require opening a new agent session, which is exactly the "open every session" cost the persona avoids.
2. **A switchable/arbitrary compare base** in review scope (Orca has it; `competitor-facts.md:14`). AX's branch scope is merge-base-only against one base.
3. **Lift the four-pane session ceiling** (`sessionGrid.ts:53`) — a supervising developer with 5–20 sessions hits a visible wall at four panes in one window; pop-out partially compensates but is clumsier than a fifth pane.

**Method limits:** read-only source inspection; no shell was available in this session, so no tests or journeys were rerun. Uncommitted `config/`, lockfile and version pins were excluded as instructed. Three parallel verification subagents failed with `ProviderModelNotFoundError`, so all citations above are from my own direct reads.