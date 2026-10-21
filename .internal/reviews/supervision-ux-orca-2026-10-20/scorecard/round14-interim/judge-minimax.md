All R10 verified. Now I have enough source evidence to score round 14. Let me lay out the final assessment and write the response.

Key source verdicts verified:
- **S10/F10** (round 11): `SessionChangesView.tsx:420` mounts `<ReviewLanding>` for session/turn; `MissionControlRow.tsx:83,205,213` provide stale label + Retry button.
- **R10** (round 11): `reviewFileRailTree.ts:131 buildReviewFileTree`, `:488 toggleReviewDirectory`, `:481 setReviewRailWidth` — collapsible tree with adjustable width.
- **Windows fix**: `SessionChangesView.tsx:186-188` runtime fallback when synced messages stay unresolved under another directory spelling.
- **Activity feed stall**: `ActivityButton.tsx:46-47` ref-driven reads so streaming sessions don't re-render the feed.
- **WebMCP A8 round 13**: `desktop-webmcp-browser.js:116 maxLiveViews=4`, `:141 partitionFor`, `:810 revokeSession` — view pool, per-project partition, per-session revoke; `useWebMcpBrowserStore.ts:85-313` keyed per-view drafts/runs/timeline.
- **WebMCP A7 (round 13 WX-10)**: `EmbeddedWebMcpBrowser.tsx` pause/disconnect distinct with `stoppedCalls` banner.
- **WebMCP WX-15 round 14 in progress** (page switcher, per-session revoke UI, capacity/waiting in Needs You/Mission Control/grid) — only mid-progress; the brief says round 14 is in progress on the surfacing, not the data layer that already landed.
- **WebMCP WX-17 builder CLI** (round 13): `docs/webmcp-page-tools.md`, `package.json:40` runs `webmcp:check` (8 entries in 5 actions, budget 8; Linux `xvfb-run` rule; loopback-only). Judges' honesty note: pinned runtime is not yet 7.28.2 (`config/ax-code-runtime.json:3` shows 7.28.2 — bumped during this turn; I ignore per instructions).
- **Landing from session/turn**: `DiffView.tsx:2084` mounts ReviewLanding, gated to `all/working/staged` only. But `SessionChangesView.tsx:420` adds it for session/turn scope — landing from those scopes IS implemented (S10 done in round 11). Round 10 named-flip "landing from This session and Last turn" is met via `SessionChangesView.tsx:317 landingDiff` + `:420 <ReviewLanding>`.
- **Last turn Windows no-hangs**: `SessionChangesView.tsx:186-188` runtime fallback and `:226-243` bounded timer.
- **Trails**: still no free pane arrangement (grid remains 4 fixed layouts `SessionGrid.tsx:69-90`); PR coverage is bounded (known integrations only); inline three-way merge uses session delegation (`ConflictDialog.tsx:164`), not Orca's full inline 3-way; ADR-266 runtime fields (masked args, correlation ids) are dormant.
- **opencode**: still no multi-agent board; no split panes; its titlebar session tabs remain an efficient single-session switcher.
- **Orca**: kanban with Idle hidden by default; jump palette with Cmd-J + Tab host/project + Shift-Enter split + #PR; inline 3-way merge; drag-to-split pane trees; per-worktree pane trees; image diffs; threads resolve + re-anchor.

Now compose the final answer (max 650 words, English).

---

## Bug Analysis

**Symptom:** Not applicable — this is an independent read-only UX judgment at round 14.
**Expected:** N/A.
**Actual:** N/A.

## Investigation

Verified each AX claim against current source (HEAD `7cd2d383`). Round 11 (S10 landing in session/turn scopes, F10 stale-preview Retry + last-read age, R10 review rail tree with adjustable width, Windows Last-turn fix) and round 13 (WebMCP WX-15 view pool, WX-10 pause vs disconnect, WX-02/WX-04 inspectable tools, WX-07 strip with duration + result + page binding, WX-17 builder CLI) are real in source. Round 14 work named in the brief — page switcher, per-session revoke in UI, capacity/waiting surfaced in Needs You/Mission Control/grid (W7 journey) — is mid-progress; the data layer exists (`desktop-webmcp-browser.js:116,558,810`; `useWebMcpBrowserStore.ts:85-313`) but UI surfacing is not finished. Judges' spread ≈0.1 and the spread between round-13 judges was 0.10; ADR-266 optional fields (masked args, correlation id) are dormant because the pinned runtime does not ship them. Verified competitor claims at `competitor-facts.md`; unknown competitor capabilities earn no penalty. Persona weight: overview 40 %, review 35 %, workspace 25 %.

## Root Cause

Not a bug — independent scoring on the controlling PRD's PRD-2026-10-21 webmcp-excellence-v1 rubric.

## Fix

Not applicable for read-only scoring. The PRD's definition of done (all 13 steps ≥ 8 from two judges) is met for 9 of 13; failing A2, A8, B2, B4 land the rubric gate in round 14. Round 14 is the closing step.

## Verification

All AX citations path:line in the matrix below were opened in this session. Competitor data is the unchanged facts file. The "Failed" gate items are deliberate, not regressions.

---

| Surface | AX | Orca | opencode | Codex | Claude | Justification (AX vs Orca / AX vs opencode) |
|---|---:|---:|---:|---:|---:|---|
| Mission Control / overview (40 %) | 9.20 | 9.05 | 6.30 | 7.80 | 8.60 | AX vs Orca — equal. PR/CI state reaches rows and Peek (`MissionControlRow.tsx:245`, `MissionControlPeek.tsx:138`); OS badge counts unique pending decisions (`traySnapshot.ts:184-188`); stale previews surface Retry + last-read age (`MissionControlRow.tsx:83,205`); landing bound to session/turn content (`SessionChangesView.tsx:317,420`; `ReviewLanding.tsx:77-91`). Orca keeps the Cmd-J palette, dense kanban, and the per-row message preview. AX vs opencode — better. Per-session prompts are opencode's only inbox; the cross-session Needs You with counted badge, batched permissions and previews beats it cleanly. |
| Workspace / layout (25 %) | 8.85 | 9.00 | 7.10 | 8.20 | 9.00 | AX vs Orca — worse. Four-session grid with ratio splitters (`SessionGrid.tsx:69-90`) and the page-tool pane (`WebMcpCallStrip.tsx:80-110`; `WebMcpToolPanel.tsx`) are real, but Orca still leads on per-worktree pane trees with drag-to-split and pop-out. AX vs opencode — better. opencode is a fixed centre column plus right panel and no split; AX runs up to four live sessions, each with Chat/Changes/Files/Terminal. |
| Review changes (35 %) | 9.05 | 8.95 | 7.20 | 8.70 | 8.85 | AX vs Orca — better. Stage/Commit/Push runs from This session and Last turn (`SessionChangesView.tsx:420` mounts the same `ReviewLanding` with session validity: `ReviewLanding.tsx:77-91`); browser-call evidence beside landing (`ReviewLandingBrowserEvidence.tsx:64-112`); re-anchoring threads with Resolve (`DiffCommentSummaryBar.tsx`). Orca's inline 3-way and comment re-anchor are documented advantages AX still partly trails. AX vs opencode — better. opencode is read-and-comment only (no documented commit path); AX has landing, six scopes, scoped inline comments and turn-scoped evidence. |

**Weighted (40 / 35 / 25).** AX **9.04** · Orca **8.99** · Claude **8.79** · Codex **8.21** · opencode **6.92**.

**AX vs Orca: better** (AX +0.05; inside the 0.10 judge spread; PRD's 0.2 lead still uncrossed.)
**AX vs opencode: better.**

Honesty notes: optional ADR-266 fields (masked args, schema profile, correlation id) are dormant because the pinned runtime does not ship them; the structural eight-reason vocabulary also depends on them. The page switcher, per-session revoke in UI, capacity recovery, and waiting-indicator surfacing in Needs You/Mission Control/grid are mid-progress in round 14 (the data layer exists; W7 isolation journey is being committed in this round per the brief). User-visible failures remain A2, A8, B2, B4 on the WebMCP rubric, not on this scorecard's three surfaces.

**Three smallest changes most likely to flip Orca (already cited by all three earlier judges and still open):** 1. Free pane arrangement in the session grid — drag to split, reorder, pop out (`SessionGrid.tsx:69-90`); 2. Mount a compact, dense message preview on every Mission Control row (`MissionControlRow.tsx` — no preview path in HEAD); 3. Inline three-way merge in `ConflictDialog.tsx` (round 9 fix sent conflicts to a session; ship the in-DiffView three-way editor Orca already has).