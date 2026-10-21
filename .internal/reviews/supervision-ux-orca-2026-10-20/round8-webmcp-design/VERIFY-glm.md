Verification complete. All citations opened against current source.

## Evidence verdicts

| id | claim (abridged) | verdict | actually seen | note |
|---|---|---|---|---|
| P6/X1 | Fresh browser per session; storage wipe | CONFIRMED | EmbeddedWebMcpBrowser.tsx:95-125; desktop-webmcp-browser.js:109-123 | Comment at :95 states it; wipe is clearStorageData |
| X2 | Zero-bounds dialog → disconnect | CONFIRMED | desktop-webmcp-browser.js:475-478; EmbeddedWebMcpBrowser.tsx:144-150 | Trigger and disconnect both as cited |
| X3 | Entry flow tangled (audit) | CONFIRMED | AUDIT-2026-10-21-webmcp-ux.md:10-15 | Audit-based; no direct source line in row |
| M1 | False "cannot open pages"; 7.25.8 navigate; pin 7.28.0 | CONFIRMED | en.ts:2663-2664; PRD-2026-10-15-agent-page-interaction.md:9-11; config/ax-code-runtime.json:3 | All three exact |
| M2 | Missing `compatible` coerced false → "Update runtime" | CONFIRMED | useWebMcpBrowser.ts:107; en.ts:2633 | `Boolean(result?.compatible)` at :107 exactly |
| P5 | Errors collapse to 3 codes | CONFIRMED | EmbeddedWebMcpBrowser.tsx:211-219; en.ts:2640 | Command-path catch yields exactly 3 codes |
| P8 | Copy neutral; defect is success tone | CONFIRMED | en.ts:2647; webMcpSummary.ts:113-121 | `tone:"success"` on tools===0 at cited lines |
| X4 | Summary distinguishes 0-tool vs N-tool | CONFIRMED | webMcpSummary.ts:112-128 | enabledNoTools vs enabledWithOrigin |
| D3 | One error sentence shared everywhere | CONFIRMED | webMcpSummary.ts:22-37, 40-44 | Shared by Services/Settings/pane per comment |
| P4/P3 | Card shows origin/tool/operation only; drops act detail & invoke args | CONFIRMED | PermissionCard.tsx:367-403 | Runtime-sends-no-args half is audit-only (AUDIT:25-26) |
| M4 | Title currently forced to "webmcp" | CONFIRMED | PermissionCardTools.ts:27-28 | Defect confirmed; fix would use page tool name |
| M5 | Save button; no always-scope | CONFIRMED | PermissionCard.tsx:159-162, 502 | Runtime always-scope half rests on AUDIT:34-35 |
| P1 | Adapter stores schemas; status sends count only | CONFIRMED | native-webmcp.js:129-134; desktop-webmcp-browser.js:135 | Exact lines |
| P2 | ADR-009 decision 4 grounds Try-it | IMPRECISE | ADR-009-embedded-native-webmcp-provider-v1.md:33-34 | Decision 4 sets authority boundary only; never mentions user-driven invocation — consistent by inference |
| D1 | Counts duplicated across surfaces | CONFIRMED | webMcpSummary.ts:41-43 | Row cited no path; comment names all 3 surfaces |
| M3 | Unknown-tool titling; error tone gated | CONFIRMED | toolHelpers.ts:197-203; ToolPart-impl.tsx:986 | Exact lines |
| P12 | Pane binds sessionID | CONFIRMED | EmbeddedWebMcpBrowser.tsx:101 | `updateSnapshot({ directory, sessionID })` |
| M6 | Two identical buttons, disabled Go | CONFIRMED | AUDIT-2026-10-21-webmcp-ux.md:10-11 | Audit evidence only |
| M7 | Allowlist is per Chrome-bridge server | CONFIRMED | WebMcpAllowlistSection.tsx:25-29 | Doc comment verbatim |
| C1 pause | §5 forbids implicit grants | CONFIRMED | PRD-2026-10-21-competitive-supervision-ux-v1.md:122 | X2 lines verified above |
| C2 persist | Opt-in via ADR-009 d6; URL per normalizeProjectPath | CONFIRMED | ADR-009…v1.md:37-39; projectResolution.ts:4 | Grants don't persist per P6 wipe |
| C3 zero-tools | Neutral copy; tone defect | CONFIRMED | en.ts:2647; webMcpSummary.ts:113-121 | — |
| C4 try-it | Grounded in decision 4 | IMPRECISE | ADR-009…v1.md:33-34 | Same as P2 |
| C5 drift | :2660→2663-2664; "0 tools available" wrong | SPLIT | en.ts:2660 ("Go"), 2663-2664, 2648 | Line drift confirmed; but "0 tools available" **exists** at :2648 (readyWithOrigin, access-off state) — not pure drift |

## PRD §5 compliance (PRD-2026-10-21-competitive-supervision-ux-v1.md:119-127)

No CS-25…CS-32 requirement as written violates §5. Boundary conditions to preserve during implementation:
- **CS-28/P2**: Try-it must stay human-driven Desktop-only; any agent-grant side effect would violate :122.
- **CS-25/C1**: paused-state re-presentation must never auto-execute (:122); wording already complies.
- **C2**: persisted URL per `(normalizeProjectPath, session)` satisfies :123-124; grants must stay non-persistent.
- **CS-26**: failure "fix action" must not expand permissions without AX Trust policy (:122).
- Locale split (A→B→C, 14 locales) matches :125 if fail-closed check covers merged keys.

Caveats: runtime-side claims (invoke args, always-scope, ERR_UNSAFE_PORT) rest on the audit, not verifiable in this repo. Note also two colliding `ADR-009` files exist; citations resolve to the embedded-WebMCP one.