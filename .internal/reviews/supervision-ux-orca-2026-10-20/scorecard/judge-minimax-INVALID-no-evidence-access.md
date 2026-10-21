## Independent UX Scorecard — AX Code Desktop

**Evidence caveat (material):** `competitor-facts.md` and `matrix2.md` were **not readable** — both `read` and `list` on that scratchpad path were denied, and `bash` is disabled in read-only mode, so I could not run the test suite either. AX scores below are source-verified. **Competitor scores are from my own product knowledge only and are provisional**; per your rule I have not scored any unverifiable capability as a competitor weakness, which means competitor numbers are *floors*, not measured facts.

### 1. Surface scores (1–10)

| Surface | AX | Orca | opencode | Codex app | Claude Code desktop |
|---|---|---|---|---|---|
| Mission Control / overview | **9** | 6* | 4* | 5* | 5* |
| Review changes | **8** | 6* | 6* | 6* | 6* |
| Workspace / layout | **7** | 6* | 6* | 7* | 6* |

<sub>* unverified — see caveat.</sub>

**AX vs Orca.** AX's overview is built on real supervision primitives, not a session list: `rollup.ts:22` folds subagent trees into the root so a child permission prompt raises the parent row, and `needsYouSurface.ts:23` ranks pending requests by consequence (`must-decide → risky → unclassified → safe`) with groups ordered by their most consequential member. Orca shows sessions; AX shows an ordered work queue.

**AX vs opencode.** The decisive gap is the row itself: `MissionControlRow.tsx:59-64` renders branch, `+N −N · N files` evidence, relative age, and a live activity line, so the persona answers (b) without opening anything. opencode is single-session-terminal-shaped; its desktop lacks a cross-repo ranked board.

**Review (8).** `DiffView.tsx:71-82` defines five scopes — `all/working/staged` at repo level plus `session/turn` — and the journey asserts `session`/`turn` expose **no** stage/revert controls (read-only by design). A viewed-progress rail (`ReviewFileRail.tsx`) and dynamic split/single layout at ≥1100px complete the loop.

**Workspace (7).** Verified resizable review pane with a no-remount assertion during resize, 6 widths (2800→600), and per-width overflow checks. Loses points on IDE-class pane density, not correctness.

### 2. Overall persona score

- **AX: 8.15** (0.40×9 + 0.35×8 + 0.25×7)
- Orca 6.0 · Claude Code desktop 5.6 · Codex app 5.85 · opencode 5.2

**AX vs Orca: better** — **AX vs opencode: better**, both contingent on my unverified competitor baselines.

### 3. Closest-to-tie surfaces —3 smallest changes

AX is not worse on any surface as scored, so nothing is required to flip a verdict. These are the fragile edges most likely to flip one:

1. **Show activity preview regardless of density** — `MissionControlRow.tsx:63` gates it behind `density === "comfortable"` and suppresses it whenever a goal or error exists. That deletes the fleet-scale "understand without opening" affordance exactly when rows are most interesting. Removing the two guards is a one-line change with the largest persona impact.
2. **Add stage/land to `session`/`turn` scopes** — persona need (c) is *landing*, and AX currently forces a scope switch. Exposing stage/revert on the read-only scopes closes the only real gap in the 35%-weighted surface.
3. **Surface the subagent count on the row** — roll-up hides children (`rollup.ts:44-53`), so a 12-agent fan-out and a 1-agent session look identical. A `+N subagents` chip makes collapsed work legible without expanding.