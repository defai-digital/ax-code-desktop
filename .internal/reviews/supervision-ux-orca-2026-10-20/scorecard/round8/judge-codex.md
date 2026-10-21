**AX is narrowly behind Orca and clearly ahead of opencode for this persona.** Assessment at HEAD `845db2cf`, read-only; no journeys rerun. Competitors use the supplied facts; unknown capabilities and inferred absences receive no penalty.

| Surface | AX Code Desktop | Orca | opencode desktop | Codex app | Claude Code desktop |
|---|---:|---:|---:|---:|---:|
| Mission Control / overview | 9.1 | 9.0 | 6.3 | 7.6 | 8.5 |
| Workspace / layout | 8.8 | 9.0 | 7.0 | 8.2 | 9.0 |
| Review changes | 8.6 | 8.8 | 7.5 | 8.8 | 8.8 |
| **Weighted overall** | **8.85** | **8.93** | **6.90** | **8.17** | **8.73** |

Weights: overview 40%, review 35%, workspace 25%.

**Overview — AX vs Orca.** Runtime-derived [Checks]( desktop/packages/ui/src/lib/supervision/verificationEvidence.ts:60) and explicitly confirmed [batch decisions](desktop/packages/ui/src/components/supervision/PermissionBatchBar.tsx:38) give AX a small intervention-efficiency advantage. Orca retains stronger PR/MR triage, while AX can silently retain old activity after a failed refresh ([remoteActivityCache.ts:100](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:100)).

**Overview — AX vs opencode.** AX’s [global actionable inbox](desktop/packages/ui/src/components/supervision/NeedsYouPopover.tsx:124) materially reduces session-opening overhead versus opencode’s per-session prompts. Browser supervision adds useful context, but its feed records access transitions rather than individual calls, so I award bounded credit ([browserActivity.ts:24](desktop/packages/ui/src/lib/supervision/browserActivity.ts:24)).

**Workspace — AX vs Orca.** AX’s [four-slot grid](desktop/packages/ui/src/components/sessionGrid/SessionGrid.tsx:78) substantially closes simultaneous supervision, although Orca’s pane trees and drag-to-split remain more adaptable. WebMCP’s [schema-based “Try it”](desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:69) and [revocation on pause](desktop/packages/electron/src/desktop-webmcp-browser.js:100) add meaningful web-app control beyond Orca’s browser pane, without entirely offsetting layout friction.

**Workspace — AX vs opencode.** Independent sessions with their own [Chat, Changes, Files and Terminal surfaces](desktop/packages/ui/src/App.tsx:249) offer a substantial advantage over opencode’s documented unsplit layout. Opencode’s unread/progress titlebar tabs remain a useful switching affordance, but simultaneous inspection matters more for this workload.

**Review — AX vs Orca.** AX now supplies [Stage→Commit→Push](desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:105) and [pane-scoped F7 navigation](desktop/packages/ui/src/hooks/useReviewHunkKeys.ts:141), closing two substantial workflow gaps. I retain Orca’s lead because AX’s commit guard compares filenames and status letters rather than staged blob identities: restaging different content under the same status can escape detection ([ReviewLanding.tsx:140](desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:140)).

**Review — AX vs opencode.** AX’s explicit reviewed-file handoff earns preference over opencode’s documented comment-chip workflow, while opencode’s file tree and turn undo/redo remain strengths; undocumented landing capabilities are not treated as absent. WebMCP improves action review through [target, submit and redacted-text details](desktop/packages/ui/src/components/chat/PermissionCard.tsx:407) and [named, failure-aware transcript helpers](desktop/packages/ui/src/lib/toolHelpers.ts:362), although missing invoke arguments still limit informed approval.

**AX vs Orca: worse**  
**AX vs opencode: better**

Three smallest changes most likely to flip the result:

1. Bind commit confirmation to staged blob identities and HEAD; reject changed content before mutation ([current guard](desktop/packages/ui/src/components/views/git/ReviewLanding.tsx:140)).
2. Show activity-preview last-success age, stale state and Retry after failed refresh ([cache](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:100)).
3. Add a guarded Branch-review handoff for uncommitted files; landing currently appears only in All/Unstaged/Staged ([DiffView.tsx:2077](desktop/packages/ui/src/components/views/DiffView.tsx:2077)).

Platform confidence remains incomplete: the supplied [CI record](.internal/reviews/supervision-ux-orca-2026-10-20/scorecard/README.md:207) reports macOS/Ubuntu passes and Windows fixes awaiting rerun.

