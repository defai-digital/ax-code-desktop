The cheapest gains are builder-facing: expose existing schemas, preserve inputs, and explain failures honestly. Multi-session continuity and authoritative evidence are larger architectural work.

I read the controlling PRD, baseline and research, then checked UI/Electron source at `7696232a`. No files changed; no tests ran. Scores below are **estimated outcomes**, not earned credit; overlapping gains are non-additive.

Paths below use **UI** = `desktop/packages/ui/src/`, **Electron** = `desktop/packages/electron/src/`.

1. **PLUS — Project-app onboarding. Desktop-only; S.**  
   **B5: 2→9 (+7).** Add an author quickstart covering registration, schema validation, lifecycle, actionable errors, manual testing and agent testing. Link it from [UI/components/mcp/WebMcpToolPanel.tsx:191](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:191); the existing development guide explicitly covers another surface.  
   **Acceptance:** Follow the example in a native journey: discover, invoke, unregister and diagnose one deliberately invalid input.

2. **PLUS — Inspectable capabilities. Desktop-only; S.**  
   **A1: 7→9 (+2); B1: 3→7 (+4).** Show full descriptions, raw schema, origin, page-tool versus read/act explanations, and explicit catalog truncation. Apply at [UI/components/mcp/WebMcpToolPanel.tsx:119](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:119) and [Electron/desktop-webmcp-browser.js:157](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:157).  
   **Acceptance:** A 65-tool fixture reports the display limit; keyboard users can inspect complete descriptions and schemas. Runtime compatibility remains “unknown” without authoritative validation.

3. **MINUS — Remove lossy input handling. Desktop-only; S.**  
   **B2: 4→7 (+3); B4: 3→5 (+2).** Replace silent 24-property truncation with complete JSON fallback; preserve string whitespace and distinguish omitted fields from empty strings. Source: [UI/lib/webMcpToolForm.ts:19](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/webMcpToolForm.ts:19).  
   **Acceptance:** Unit tests preserve `" a "`, submit property 25, and distinguish absent, empty, zero and false.

4. **MULTIPLY — Separate transport, application and uncertain outcomes. Desktop-only; M.**  
   **A5: 6→8 (+2); B2: 4→7 (+3).** Manual invocation currently returns transport success as `ok` and collapses exceptions. Add explicit completion states and bounded diagnostics at [Electron/desktop-webmcp-browser.js:627](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:627) and [UI/components/mcp/WebMcpToolPanel.tsx:94](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:94). Arbitrary output is never proof of effect.  
   **Acceptance:** Distinguish application error, timeout, cancellation and normal completion; uncertain effects offer inspection without automatic retry.

5. **MULTIPLY — Separate definitions, drafts and executions. Desktop-only; M.**  
   **B3: 4→9 (+5).** Replace name-only component identity at [UI/components/mcp/WebMcpToolPanel.tsx:211](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:211). Expose generation/digest, retain bounded nonsensitive drafts, show registration diffs, invalidate old results, and require the displayed definition when invoking manually.  
   **Acceptance:** Same-name replacement during editing rejects stale execution; removed/re-added tools retain safe drafts without presenting old results as current.

6. **DIVIDE — One trust summary. Desktop-only; S.**  
   **A2: 6→8 (+2); A4: 7→8 (+1).** Group session, origin, access status, manual-versus-agent authority and revocation explanation beside [UI/components/chat/PermissionCard.tsx:374](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:374). Summarize existing authority; add no grant mechanism.  
   **Acceptance:** Switching sessions clears authority; every entry point shows consistent scope; unsupported “always” remains unavailable.

7. **PLUS — Authoritative compatibility and diagnostics. Needs AX Code runtime; L.**  
   **B1: 3→9 (+6); B4: 3→9 (+6); A4: 7→9 (+2); A5: 6→9 (+3).** Complete the producer contract consumed at [UI/lib/toolHelpers.ts:364](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:364): masked arguments, structured validation paths/reasons, supported schema profile and capability availability. Desktop must not recreate runtime policy.  
   **Acceptance:** The approved signed pin rejects invalid input before permission, supplies matching diagnostics, and safely handles absent metadata.

8. **DIVIDE — One call/evidence workspace. Needs AX Code runtime; L.**  
   **A3: 5→9 (+4); A6: 6→9 (+3); B2: 4→9 (+5).** Connect [UI/components/mcp/WebMcpCallStrip.tsx:49](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:49) to transcript, approval and manual comparison. Runtime must supply trustworthy call/document/definition correlation; masked comparisons explicitly identify missing information.  
   **Acceptance:** Navigate during execution: each call still opens its original context, timing and outcome, never the current page’s schema.

9. **PLUS — Explicit takeover. Desktop-only; M.**  
   **A7: 6→9 (+3).** Expose existing pause/revoke machinery at [Electron/desktop-webmcp-browser.js:119](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:119), with keyboard access, focus transfer and separate “access revoked” versus “effects unconfirmed” feedback.  
   **Acceptance:** Takeover blocks queued actions and late replies; resume requires fresh enrollment. Cancellation never claims rollback.

10. **MULTIPLY — Isolated session/page lifecycles. Needs AX Code runtime; L.**  
    **A8: 3→9 (+6); A2: 6→9 (+3).** Replace the single window entry at [Electron/desktop-webmcp-browser.js:349](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:349) with bounded isolated contexts and runtime-owned provider routing. Preserve live session continuity without persistent credential records.  
    **Acceptance:** Two sessions retain independent pages, revoke independently and cannot exchange calls/storage; repeated open/close does not leak Electron sessions.

Across all proposals, require macOS/Windows/Ubuntu native evidence, 14-locale layout checks, keyboard/screen-reader checks, bounded data, and hostile-content tests. Site hints never authorize actions. Persistent login, unrestricted authentication popups, screenshot archives and a duplicate Desktop validator are traps.

**Top eight by estimated gain per effort:** **1, 2, 3, 6, 7, 4, 5, 8**; this prioritization does not remove mandatory A7/A8 completion.

A user will call this excellent when they can understand, supervise, interrupt and explain every browser action without guessing its authority or outcome.

