# WebMCP excellence synthesis (Kimi K3, 2026-10-21)

Brief: `answers/brief-kimi.md`. Verification: `VERIFY-glm.md`.

# WebMCP excellence v1 — merged requirements, rounds, task suite, runtime asks

Inputs: PRD (`.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md:33-46` baseline, `:50-57` DoD, `:63-67` constraints); audit (`.../AUDIT-2026-10-21-codex-baseline.md:11-48`); SotA (`.../RESEARCH-2026-10-21-state-of-the-art.md:69-88`); grok (`.../RESEARCH-2026-10-21-grok-value.md:47-78`); answers minimax/deepseek/codex. Score deltas are estimates, non-additive (answer-codex.md:3).

## 1. Merged requirements

**WX-01 · MINUS · Honest manual forms.** Drop the 24-property slice and string trimming; render schema constraints inline. B2 4→7. Supporters: audit:39, minimax P2, deepseek #1, codex #3. Desktop-only, S. Acceptance: `"  lead  "` round-trips; 30-property schema yields 30 fields; `minLength` violation renders under the field. Sources: `webMcpToolForm.ts:19,40`, `WebMcpToolPanel.tsx:168-176`.

**WX-02 · PLUS · Inspectable capabilities + advisory lint.** Full descriptions, raw schema disclosure, annotations badges (carried through `readWebMcpCatalog`), origin, truncation visibility, lint for name/description length and ADR-266-rejected `pattern`/`patternProperties`. A1 7→9, B1 3→8. Supporters: audit:13,38, SotA:71,86, minimax P1/P8, deepseek #5/#7, codex #2. Desktop-only, M. Acceptance: 65-tool fixture shows "64 of 65"; `patternProperties` schema renders a warning; badges for `readOnlyHint`/`untrustedContentHint`. Sources: `useWebMcpBrowserStore.ts:216-219`, `native-webmcp.js:138`, `WebMcpToolPanel.tsx:118-122`.

**WX-03 · MULTIPLY · Honest outcomes.** Separate transport success, application error, cancellation, uncertain completion; one refusal vocabulary shared with the transcript (`reason`/`nextAction`, one locale list). A5 6→7, B4 3→5. Supporters: audit:40, deepseek #4/#6, codex #4, minimax:3 (anchors). Desktop-only, S. Acceptance: `{ok:true, output:{error}}` renders error styling; reason-code table shared by `describeWebMcpCall` and the manual mapper. Sources: `desktop-webmcp-browser.js:627-631`, `WebMcpToolPanel.tsx:94-100`, `toolHelpers.ts:372-377`.

**WX-04 · PLUS · Registration truth.** Rejected catalogs get a named reason and an `invalid-catalog` error code instead of vanishing tools; registration timeline with schema diff and definition digest; stale results invalidated; drafts preserved across reload. B3 4→8, B4 3→6, B1 +1. Supporters: audit:43,46, minimax P8/P10, deepseek #2/#8, codex #5. Desktop-only, M. Acceptance: duplicate-name catalog produces a diagnostic naming the tool; same-name re-registration shows a diff row and marks prior results stale. Sources: `native-webmcp.js:123-160,202`, `WebMcpToolPanel.tsx:196,211`.

**WX-05 · PLUS · Manual journal, replay, agent-compare.** Bounded (32) in-memory journal of `{tool,input,status,duration,definitionDigest}`; "replay with editable input"; side-by-side vs the last agent call. B2 7→9, B4 5→7. Supporters: SotA:86, minimax P3, deepseek #9/#12, codex #5/#8. Desktop M; exact agent-argument compare is runtime-pending (masked `inputPreview`, `toolHelpers.ts:366-370`). Never written to transcript or disk (deepseek #9).

**WX-06 · PLUS · Author quickstart.** Runnable example covering registration → schema → descriptions → lifecycle → errors → agent testing, linked from the panel. B5 2→8. Supporters: audit:37, minimax P12, deepseek #3, codex #1, grok:41. Desktop-only, S. Acceptance: native journey follows the example to register, invoke, and diagnose one invalid input. Source: `docs/development-webmcp.md` (explicitly another surface, audit:25).

**WX-07 · MULTIPLY · Page-bound expandable call strip.** Rows carry result preview, duration, timestamp, approval link, and page/document marker; rows from other pages labelled; click lands on the transcript part. A3 5→8, A6 6→7. Supporters: audit:42, minimax P5, deepseek #11, SotA:80. Desktop M; authoritative correlation is runtime-pending (WX-16). Sources: `WebMcpCallStrip.tsx:50-85`, `webMcpCalls.ts:53-84`.

**WX-08 · MINUS · Approval card clarity.** Plain effect sentence built from call data (origin + tool + operation + target + submit flag, not the site's description), countdown with explicit timeout outcome, and the covering scope shown. A4 7→9. Supporters: minimax P9, SotA:75-78, codex #6. Desktop-only, S. Sources: `PermissionCard.tsx:143-147,374-457`.

**WX-09 · DIVIDE · One trust surface.** Single "Project browser access" card: origin, grants, per-session scope, revocation effective on the next call; merges pane state with `WebMcpAllowlistSection` semantics. A2 6→8. Supporters: minimax P7, codex #6, SotA:74. Desktop-only, M. Sources: `EmbeddedWebMcpBrowser.tsx:366-401`, `PermissionCard.tsx:199-203`.

**WX-10 · MINUS · Real pause/take-over.** Split the overloaded action slot into *Pause agent* (retain page, revoke provider) vs *Disconnect*; cancellation-complete acknowledgement; keyboard reachable with focus transfer; never claims rollback. A7 6→9. Supporters: audit:45, minimax P6, codex #9, SotA:81. Desktop-only, M. Sources: `EmbeddedWebMcpBrowser.tsx:374-400`, `desktop-webmcp-browser.js:119-124`.

**WX-11 · MINUS · a11y fixes.** Roving-tabindex mode tablist (arrows move focus *and* selection); announced native-view boundary. Cross-cutting, S. Supporters: audit:27, minimax P11, SotA:81. Source: `EmbeddedWebMcpBrowser.tsx:489-498`.

**WX-12 · PLUS · Schema-hash-bound grants (safety).** Every saved grant binds origin + tool name + schema hash; any schema change re-prompts. Auto-execution itself is **deferred** (see conflicts). A2/A4 safety. Supporters: grok:51,59, SotA:73,78. Desktop + AX Trust, M.

**WX-13 · PLUS · End-of-task WebMCP recap.** Tools called, effects, failures with text, per-step path tag (tool/snapshot/screenshot), never-called tools with zero count, bounded per-call viewport evidence. A6 7→9. Supporters: grok:45,51,74, SotA:84,87, audit:18. Desktop M. Sources: `ReviewLandingBrowserEvidence.tsx:21-29`, `ToolPart-impl.tsx:957`.

**WX-14 · MINUS · Sign-in/session continuity without persistence.** Stop stripping query/hash on URL restore; stop obstructing popup-based auth; keep session storage alive across session switches inside an isolated profile with explicit sign-out; sign-in pages hand control to the person. A2 8→9, A8 +1. Supporters: audit:14,47, SotA:83. Desktop-only, M. Source: `desktop-webmcp-browser.js:138-152,375`.

**WX-15 · MULTIPLY · Isolated multi-session contexts.** Bounded isolated browser contexts with visible ownership, independent revocation, no cross-session storage. A8 3→9. Supporters: audit:48, codex #10, minimax:56. **Needs runtime**, L. Source: `desktop-webmcp-browser.js:349-350`.

**WX-16 · PLUS · Runtime metadata pin.** Qualify and pin ADR-266: masked invoke arguments, structured validation paths/reason codes, supported schema profile, capability availability, untrusted-output channel. A4→9, A5→9, B1/B4→9. Supporters: audit:41, codex #7, deepseek #12, grok:73. **Needs runtime**, M–L. Source: `toolHelpers.ts:364`.

**WX-17 · PLUS · Fixture CI gate.** Headless list/run of fixture tools with exit codes, `expectedCall` evals (≥90% name+key-arg match over 20 prompts × 3 runs), lint in CI. Supporters: SotA:88, grok:41,53,72. Desktop harness, L. Feeds DoD item 2 (PRD:52-53).

**WX-18 · PLUS · Call → regression test.** Export a journal entry as an `executeTool` snippet with assertions (or the Desktop UI-WebMCP `call` form). Supporters: grok:69, deepseek #13. Desktop, S–M.

**Deferred:** call→source jump (grok:71 only — single supporter, novel); scaffold-tool-in-diff (grok:68 only); progressive-disclosure lint (grok:75 only); global always-allow, `toolautosubmit` on consequential tools (grok:78; barred by PRD:66); durable credential persistence and screenshot archives (traps, answer-codex.md:47); a duplicate Desktop-side schema *validator* (answer-codex.md:47 — Desktop lint stays advisory).

## 2. Conflicts and resolutions

1. **Auto-run by schema hash** (grok:51) vs **no auto-approval without AX Trust policy** (PRD:66; answer-codex.md:47). Resolution: WX-12 ships hash binding + re-prompt-on-change now (pure safety win); auto-run recorded "Desktop ready, Trust pending" per PRD:56-57.
2. **Persistent sign-in**: audit #11 proposes explicit persistence; codex calls it a trap (answer-codex.md:47); SotA:83 wants human hand-off and a clean default profile. Resolution (WX-14): continuity within isolated session profiles plus explicit sign-out; no durable credential records (PRD:66).
3. **Screenshots as evidence** (grok:51 test 3) vs **screenshot archives as a trap** (answer-codex.md:47). Resolution (WX-13): bounded per-call evidence on the turn, no archive store, credential-bearing captures excluded.
4. **Desktop lint vs duplicate validator**: deepseek #7 wants full lint; codex forbids recreating runtime policy. Resolution: WX-02 lint is advisory authoring guidance; authoritative rejection remains the runtime's ADR-266 schema profile (WX-16).
5. **Annotations as approval signal**: MCP clients auto-approve `readOnlyHint` tools (SotA:56) vs "hints are not a security boundary" (SotA:56,73). Resolution: annotations drive badges and effect wording only; unannotated tools are treated as consequential (SotA:73).

## 3. Rounds

**Round 12 — Desktop-only, S, lowest builder steps first:** WX-01, WX-03, WX-06, WX-08, WX-11. Estimated after: B2 4→7, B5 2→8, B4 3→5, A5 6→7, A4 7→9.
**Round 13 — Desktop-only, M:** WX-02, WX-04, WX-05 (Desktop half), WX-07, WX-09, WX-10, WX-13, WX-14, WX-18. Estimated after: A1→9, B1→8, B2→9, B3→8, B4→7, A3→8, A6→9, A2→8, A7→9, A8 3→4.
**Round 14+ — runtime/Trust-dependent:** WX-16 (pin), WX-15, WX-12 (auto-run), WX-17. Estimated after: A4/A5/A2→9, A3→9, A8→9, B1/B4→9. Until the signed pin lands these stay "Desktop ready, runtime pending" and do not count toward DoD item 1 (PRD:55-57). Remaining sub-9 gaps (B3 8, B4 7→9) close via WX-16 diagnostics + judge re-audit in round 14.

## 4. Task suite (stub runtime + fixture page registering tools)

- **W1 Discover (A1/B1):** open fixture (3 tools, one 30-property schema) → panel shows all tools, raw schema, hint badges, truncation note. Evidence: snapshot + `[data-webmcp-schema]` present. ≤8 actions.
- **W2 Manual correctness (B2):** run with `"  lead  "` and property 25; error-payload tool renders failure styling. Evidence: result block states. ≤10.
- **W3 Lifecycle (B3/B4):** fixture re-registers same-named tool with changed schema → diff row, stale marks; 300-char-name catalog → named rejection reason, no vanishing panel. ≤12.
- **W4 Approvals (A4):** stub agent invokes a consequential tool → card shows origin, masked args, effect sentence, countdown; approve once; second fixture run times out explicitly. ≤10.
- **W5 Pause/take-over (A7), keyboard-only:** start long fixture call, pause mid-flight → cancellation ack, page alive, `toolcancel`; resume without re-navigation. ≤9.
- **W6 Evidence (A6/A3):** 3-call task with one failure → recap lists calls, failure text, zero-count tool; click a strip row → transcript part. ≤8.
- **W7 Isolation (A8, runtime-pending):** two sessions keep independent pages/grants/storage; revoking one leaves the other. Blocked until WX-15; recorded as pending, not failed. ≤12.
- **W8 Builder loop (B1–B5):** follow the quickstart to add a tool, run it manually, replay the last agent call, export as a test, run the `expectedCall` gate. ≤15.

## 5. AX Code runtime asks beyond ADR-266 (proposals for one AX Code ADR)

R1 masked `inputPreview` on approval and transcript parts (`toolHelpers.ts:366-370`; deepseek #12). R2 structured validation diagnostics with JSON paths, reason codes reconciled with Desktop's vocabulary (codex #7; audit:41). R3 advertised schema profile + capability availability so Desktop lint mirrors, not duplicates (WX-02/WX-16 split). R4 call↔document↔definition correlation ids (origin, frameId, generation digest) for WX-07 staleness (minimax P5; codex #8). R5 untrusted-output channel: hinted results delivered to the model labelled as data, never satisfying an approval (grok:73; SotA:79). R6 provider routing for multiple isolated sessions (WX-15; codex #10). R7 cancellation semantics: abort in-flight `executeTool`, surface `toolcancel`, never claim rollback (SotA:81; codex #9). R8 per-call duration/outcome metadata (SotA:80).