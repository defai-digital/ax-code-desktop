# Supervision Workspace: Act on Agents Across Projects

Status: Accepted for implementation; user approved on 2026-10-15.

Date: 2026-10-15

## Problem

AX Coder exists to supervise many coding sessions across many projects, but the current layout is
built around one chat at a time:

- The portfolio surfaces (Projects home, Needs You queue) render only on the empty or draft chat
  screen. Once a session is open, cross-project signal is reduced to sidebar dots and the bell count.
- Needs You rows only navigate. Approving a request takes queue, session, scroll and click. The
  notification center has inline Allow/Deny, so the two surfaces disagree.
- Permission and question cards scroll with the transcript. The pending chip hides a single request.
- Git, files, diff, plan and context open from up to four places, and the full-cover views hide the
  chat and agent progress.
- Thousands of historical sessions carry the same weight as live ones in the sidebar.
- Multi-run lanes scatter into sidebar sessions with no comparison surface.

A 2026 supervision-dashboard study (Long et al.) raised throughput and awareness but not control or
trust: awareness without a direct path to act and to the evidence does not help. Practitioner
reports put the useful ceiling at three to four high-touch agents.

## Goal

Reduce the time from "a session needs me" to "I acted on it", keep agent progress visible while the
user reviews evidence, and make the live working set, not history, the default view.

## Requirements

### Phase A: act on interruptions everywhere

1. One shared request action component serves the Needs You queue, a titlebar popover and the
   notification center. Permissions offer Allow once and Deny; "Always" stays in the in-session card
   where its patterns are shown. Questions with one single-choice prompt can be answered inline;
   others open the session.
2. A titlebar "Needs you" counter, visible in every view, opens the popover.
3. A keyboard action moves to the next session that needs the user, in urgency order.
4. Pending permission and question cards are pinned above the composer instead of scrolling with the
   transcript; the pending summary shows from one request.
5. The sidebar opens with a Live section (needs you, running, ready to review, error) across all
   projects, ahead of per-project history.

### Phase B: one supervision workspace

6. Mission Control: a persistent portfolio board of live sessions across projects with state,
   project, evidence (diff size, files, age) and one primary action per row. History is behind a
   filter. Keyboard: move, open, peek.
7. Peek: a row expands to show the pending request, the evidence line and actions without opening
   the session.
8. Secondary views (changes, files, git, plan, context) open beside the chat through one rail;
   the terminal stays in the bottom dock. Chat is never fully covered.
9. Command palette supervision commands: Mission Control, next needs-you, switch project, review
   changes; a second binding for the palette.
10. A "since you left" strip on a session with activity since the user last viewed it.
11. A return stack that cycles recently viewed live sessions.

### Phase C: review and scale

12. Ready-to-review is a first-class state: finished with uncommitted changes, surfaced in the
    board, the Live section and the peek with a Review action that opens the changes beside chat.
13. Multi-run compare: lane cards for one run group with status, evidence, open and fuse actions.
14. Work-in-progress signal: a passive count of high-touch sessions with a soft hint above four.
    It never blocks dispatch.
15. Notifications for finished and failed runs fire on state transitions only, never for the session
    the user is looking at.
16. Working sets: named groups of sessions that filter Mission Control.
17. Quick dispatch: a keyboard-launched dialog to start a task in a chosen project, with an opt-in
    global shortcut that brings the app forward.

### Scope addition (user request, 2026-10-15): parity with the AX Code TUI

18. WebMCP allowlist: for MCP servers with a WebMCP profile, list, add (origin and capability) and remove
    the user's per-project WebMCP approvals, matching the TUI `/webmcp-allowlist` dialog, through the
    runtime's `mcp.webMcpApprovals`, `grantWebMcpApproval` and `revokeWebMcpApproval` calls. The runtime
    stays the only writer of `webmcp-approvals.json`; the managed `webmcp.allowedOrigins` settings are not
    edited. These approvals cover Chrome-bridge servers, not the embedded `desktop_webmcp` browser, and the
    UI says so.
19. Wiki graph: a side panel beside the chat, opened from the inspector rail, renders the repository wiki
    graph from `wiki.visualization` (pages, sources, symbols; freshness), shows omitted counts, follows
    `wiki.maintenance` revisions while open, and offers an explicit refresh when no snapshot exists.

## Out of scope

Rebranding the visible product name (the compatibility identity in `config/desktop-identity.json`
stays "AX Code"), a second policy store for standing grants, cost or current-tool columns that the
runtime does not project, and changes to the AX Code runtime.

## Ownership

AX Code owns session execution state, permission and question semantics, diffs, worktrees and the
reply operations; AX Coder sends intents only through the existing SDK calls. AX Trust owns standing
grants; cross-session surfaces never create "always" rules. AX Coder owns the portfolio projection,
ranking, presentation, navigation, working sets and notification routing. Portfolio surfaces show
bounded, redacted snippets only.

## Acceptance

- A pending permission in another project can be allowed or denied from the titlebar popover and the
  Needs You queue without opening its session.
- The next-needs-you action reaches every blocked session in urgency order.
- Mission Control lists live sessions across projects and opens, peeks and reviews them by keyboard.
- Opening changes, files, git or plan keeps the chat visible.
- Typecheck, lint, unit tests, locale and boundary checks pass.
