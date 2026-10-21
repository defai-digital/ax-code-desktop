Independent, read-only judgment at HEAD `fc645985`. Competitors use the supplied [verified facts]( /Users/akiralam/code/ax-code-desktop/.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/competitor-facts.md); unknown capabilities receive no penalty. Scores assess source-supported UX, not independently measured usability; I reran no journeys and give no credit to uncommitted runtime updates.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | **9.3** | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | **9.0** | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | **9.2** | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **9.19** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview **40%**, review **35%**, workspace **25%**.

**Overview — AX vs Orca.** AX earns a narrow intervention advantage through its [actionable global inbox and waiting-page entries]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:121), reducing the need to enter individual sessions. Orca retains broader documented PR/MR filtering, while AX’s [PR projection still requires an already-known integration entry]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/hooks/useMissionControlPullRequests.ts:97).

**Overview — AX vs opencode.** AX’s global inbox above better supports cross-project triage than opencode’s documented per-session permission docks. AX’s [stale-preview warning and direct Retry]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:193) also make understanding progress less dependent on opening conversations.

**Workspace — AX vs Orca.** AX’s [page switcher with session-specific revoke]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:94) and [call durations, outcomes and earlier-page markers]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:78) provide meaningful supervision beyond Orca’s browser pane. I score them equal because Orca’s pane trees remain more adaptable than AX’s [four prescribed grid layouts]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:78), while AX defaults to [four live browser pages]( /Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:117) and [hidden-page calls can wait for visibility]( /Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:517).

**Workspace — AX vs opencode.** AX’s cited session grid provides simultaneous inspection that opencode’s documented unsplit workspace lacks. The [manual-versus-agent tool comparison]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:282) adds useful debugging context, but receives only modest weight because this persona primarily supervises coding work.

**Review — AX vs Orca.** AX now offers [session/turn landing]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/SessionChangesView.tsx:420), [review recognition bound to before/after content and file mode]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:77), and [fresh staged-identity checks before commit]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:252), giving it a small safe-delivery advantage. Those checks remain read-before-write guards, and Orca’s inline three-way merge is more direct than AX’s [delegation of conflict resolution to a session]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ConflictDialog.tsx:156).

**Review — AX vs opencode.** AX’s [tree/list rail and adjustable width]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:521) close a navigation gap, while its [session-specific browser recap]( /Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:23) helps assess what the agent actually attempted before landing. opencode retains valuable turn undo/redo; its undocumented commit capabilities are not treated as absent.

**AX vs Orca: better** — narrowly, by **0.26**, exceeding the requested comparison’s 0.2 margin for this judge.

**AX vs opencode: better**

No conditional flip list is needed; this is one independent judgment, not a three-judge acceptance result.

