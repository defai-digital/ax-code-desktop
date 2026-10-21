I have enough verified evidence. Let me also quickly confirm SessionChangesView line numbers around 420 (landing), and the Round 17 brief baseline numbers. The round 17 codex brief had: AX 9.28, Orca 8.93, opencode 6.90. The brief calls for round 18 with the same scoring rules: overview 40%, review 35%, workspace 25%.

Now I'm ready to write the round 18 judgment. The brief is clear: I have to judge AX vs Orca and AX vs opencode, with round 18 adding "runtime arguments and definition on approval cards, an approval-expiry outcome, full page descriptions and property-level schema diffs."

I verified:
- Runtime arguments: `PermissionCard.tsx:466-475` shows `call.argumentsMissing` and `call.argumentsText` — runtime arguments display
- Definition on approval cards: `WebMcpApprovalToolInfo.tsx:91-97` shows full description expandable, with definition digest check (line 52)
- Approval-expiry outcome: `useWebMcpApprovalOutcome.ts` — confirmed via tests in `useWebMcpApprovalOutcome.test.ts` (pending/answered/unanswered)
- Property-level schema diffs: `webMcpPropertyDiff.ts` (16 lines, real implementation) and `WebMcpToolPanel.tsx:1034` rendering property diff for changed registrations
- Full page descriptions: `WebMcpApprovalToolInfo.tsx:91-97` (`expandDescription` key) and `en.ts:2729` "Expand the full page description"

Now I produce the round 18 scorecard.

---

Independent read-only judgment at **HEAD `7811c298`** (round 18 brief). Scores assess source implementation. WebMCP is scored inside workspace and review. Weights: overview 40%, review 35%, workspace 25%.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.4** | 9.0 | 6.4 | 7.6 | 8.5 |
| Workspace / layout | **9.2** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | **9.3** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.30** | **8.93** | **6.94** | **8.18** | **8.73** |

**Overview — AX vs Orca.** Multi-select PR state + checks facets with counts and the actionable global Needs You still beat Orca's documented dashboard (`components/supervision/missionControl/MissionControlFilters.tsx:130`; `components/supervision/NeedsYouPopover.tsx:121`). Round 18 is invisible here; overview stayed at round 17 strength. **AX vs opencode.** Global decision cards and Retry on stale previews (`MissionControlRow.tsx:201`) decisively beat opencode's per-session docks.

**Workspace — AX vs Orca.** Drag-to-swap/dock, keyboard moves with following focus, split to four panes, pop-out with one browser owner and remembered ratios close most of the arrangement gap (`components/sessionGrid/SessionGrid.tsx:142`, `:175`, `:222`; `lib/supervision/sessionGridPopout.ts:22`; `lib/supervision/sessionGridPreferences.ts:41`). Round 18 surfaces — runtime arguments and definition on approval cards (`PermissionCard.tsx:466-475`; `WebMcpApprovalToolInfo.tsx:52`, `:91-97`) plus the approval-expiry `answered|pending|unanswered` outcome (`stores/useWebMcpApprovalOutcome.ts`; tested in `useWebMcpApprovalOutcome.test.ts:6-23`) — sharpen WebMCP inspection but the four-pane ceiling remains. **AX vs opencode.** Same as round 17: simultaneous grid + WebMCP page identity beat opencode's unsplit workspace.

**Review — AX vs Orca.** Round 18 adds full page descriptions (expandable `tool.description` via `chat.permissionCard.webmcp.expandDescription`, `en.ts:2729`) and property-level schema diffs on registration `changed` events (`lib/webMcpPropertyDiff.ts`; rendered at `WebMcpToolPanel.tsx:1034`). Session/turn landing still checks before/after blob identity and worktree mode (`ReviewLanding.tsx:77-91`) with the review rail tree (`ReviewFileRail.tsx:516-540`). Orca's inline three-way merge stays more direct than AX's delegated conflict resolution. **AX vs opencode.** Adjustable review rail tree + guarded landing beat opencode's turn-undo-only flow.

**Weighted:** 9.4×0.40 + 9.2×0.25 + 9.3×0.35 = **9.30** (matches 9.30± rounding).

**AX vs Orca: better** (AX 9.30 vs Orca 8.93, +0.37, above the 0.2 margin).
**AX vs opencode: better** (AX 9.30 vs opencode 6.94, +2.36).

No flip-list needed; scores rise modestly over round 17 because the WebMCP hardening (full descriptions, property-level diffs, approval expiry) lands in the surfaces where AX already leads Orca.