## Review verdict

**No blocking issue found.** W10a secret handling is sound: `args` go through `redactJsonValue` (name- and pattern-based), `inputPreview` and `nextAction` are credential-pattern filtered before display (toolHelpers.ts:368-377), failure `reason` is enum-validated, and older runtimes simply yield `null` fields — backward compatible. No cross-session/directory leak: parts are looked up only by this session's message IDs inside a directory-scoped store. RS-02 is respected — both surfaces say "calls", never verification.

### Findings

**MEDIUM — re-render/recompute storm during streaming**
`WebMcpCallStrip.tsx:16-19`, `ReviewLandingBrowserEvidence.tsx:16-28`
Both subscribe to `state.part`, the directory-wide PartMap that is republished on every streamed token (`sync/DOCUMENTATION.md:254-256`). Each token re-renders the component and re-runs `collectWebMcpCalls`; when the session has fewer than `limit` WebMCP calls the early-exit never fires, so the scan walks **all** messages × their parts on every token. A 1,000-message session with zero browser use pays a full-history scan per token, twice (strip + evidence).
*Fix:* derive from a narrower selector (webmcp-tool-part version per session), or memo on `(messages.length, lastMessagePartCount)` and bound the strip scan to the newest N messages.

**MEDIUM — screen-reader announcement spam**
`WebMcpCallStrip.tsx:39` — `aria-live="polite"` sits on the `<ol>` whose rows mutate on every streamed token (same root cause as above), so assistive tech re-announces the call list continuously during a turn.
*Fix:* drop `aria-live` (the transcript already announces activity) or announce only failure-count changes via a visually-hidden status node.

**LOW — tray menu duplicate rows (badge itself correct)**
`traySnapshot.ts:147-174`, `useTraySync.ts:91-123`. `collectApprovals` iterates every child store; a session lingering in two stores after a project move (acknowledged at useTraySync.ts:144) emits the same request twice. `dockBadgeCount` dedupes by `kind+sessionId+id` (traySnapshot.ts:176-180) — count is right — but the menu `approvals` list has no dedup, so it can show two identical rows while the badge says 1. Child-session requests are included (no parent filter) and double-counting across kinds is impossible in practice.
*Fix:* dedupe the `approvals` array by the same key before slicing.

**LOW — turn-boundary heuristic edge cases**
`ReviewLandingBrowserEvidence.tsx:20-26`. "After the person's last message" reads `role` via a loose cast. If a runtime message shape lacks top-level `role`, `start` stays 0 and the evidence counts the entire history as "this turn" (over-attribution beside the landing action). Conversely, a queued user message with no assistant reply yet hides the completed prior turn's calls.
*Fix:* type the role read against the SDK message union (fall back to `info.role`); consider treating an unanswered trailing user message as "previous turn still relevant".

**LOW — preview length asymmetry**
`toolHelpers.ts:368-369` caps the `args` path at 140 code units but shows up to 600 for `inputPreview` (also fully in the strip's hover `title`, `WebMcpCallStrip.tsx:65`). Both are credential-filtered, so not a leak — just inconsistent truncation.
*Fix:* cap the strip at 140; reserve 600 for the expanded ToolPart view.
## Disposition (Claude)

1. MEDIUM, fixed: the call strip and the landing evidence subscribe through string selectors over a bounded scan (the newest 60
   messages), so streamed tokens re-render nothing unless the recent WebMCP calls change, and a long session is never rescanned in
   full.
2. MEDIUM, fixed: the list has no live region; a visually hidden status announces only the failure count.
3. LOW, fixed: tray menu approvals are deduplicated with the badge's key. Test added.
4. LOW, fixed: the turn boundary reads `role` or `info.role`, within the scan window. Test added. An unanswered trailing user
   message still starts a new turn (shows no calls yet), which matches "this turn".
5. LOW, fixed: the strip caps argument previews at 140 characters and no longer repeats them in a tooltip.
