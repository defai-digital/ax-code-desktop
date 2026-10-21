# Round 8 WebMCP design synthesis

**Verification note.** PRD §4a calls for a glm-5.3 verification pass; no glm answer exists in the folder, so I spot-checked the load-bearing citations myself against current source. Nearly all confirmed; two were imprecise (noted below). Nothing was modified.

## 1. Merged items

| id | item | supporters | evidence check | cost | user task | acceptance check |
|---|---|---|---|---|---|---|
| P1 | Live tool panel: names, descriptions, schemas, visible with access off | codex, grok, minimax, argon | confirmed: adapter stores name/description/inputSchema (`native-webmcp.js:129-134`); status publishes only a count (`desktop-webmcp-browser.js:135`); audit P2 | Desktop | T6, build | fixture page lists 2 tools with schemas, access off |
| P2 | "Try it" manual invocation as the user, no agent grant | grok, minimax, argon | confirmed via cited ADR-009 decision 4; new UI path | Desktop | T6, build | Try-it result shown; no session tool part added |
| P3 | Per-call strip: operation, page tool, args, result, decision | grok, minimax, argon | confirmed: metadata exists (`PermissionCard.tsx:367-403`); invoke args absent (audit P1.4) | Desktop + runtime | T6 | list+invoke show distinct results in order |
| P4 | Approval cards show origin, operation, target element, submit, redacted text | all five | confirmed: card drops act element/submit/text (`PermissionCard.tsx:367-403`) | Desktop (act) / runtime (invoke args) | T1, T6 | act card shows element+submit; invoke shows args when runtime sends them |
| P5 | Actionable failures: native cause + one fix action | codex, grok, minimax, argon | confirmed: errors collapse to 3 codes (`EmbeddedWebMcpBrowser.tsx:211-219`, `en.ts:2640`) while main logged `ERR_UNSAFE_PORT` (audit P1.3) | Desktop | T6, repair | unsafe-port fixture shows named cause + recovery |
| P6 | Restore last page; persist URL per project/session | codex, grok, minimax, argon | confirmed: fresh browser per session (`EmbeddedWebMcpBrowser.tsx:95-125`); storage wipe (`desktop-webmcp-browser.js:108-123`) | Desktop | T6, resume | reopen restores last URL, access off |
| P7 | Remember sign-in, explicit opt-in | grok | confirmed wipe; ADR-009 decision 6 requires opt-in | Desktop | resume | deferred — 1 supporter |
| P8 | Zero-tools honesty: agent can still read/click DOM | grok, minimax, argon | partially contradicted: copy is already neutral ("no page tools registered", `en.ts:2647`); real defect is tone `"success"`/green dot (`webMcpSummary.ts:113-121`) | Desktop | T6 | zero-tool page is not green and names DOM fallback |
| P9 | Guided authoring handoff to coding session | codex | audit P2 (no guide) | Desktop | build | deferred — 1 supporter |
| P10 | Reproducible workflow evidence bundle | codex | not re-verified (`docs/development-webmcp.md`) | runtime | repair | deferred → runtime list |
| P11 | Model guardrails: invoke templates, pre-invoke schema check, `nextAction` | minimax, argon | audit idea 5; CS-24 | runtime | T6 on weak models | runtime contract proposal |
| P12 | WebMCP activity on Mission Control + Activity feed | grok, minimax, argon, codex (/2) | CS-23; pane binds sessionID (`EmbeddedWebMcpBrowser.tsx:101`) | Desktop (indicator) / runtime (call feed) | T2, T5 | browser session shows origin indicator, clears on close |
| P13 | Agent-action halo on pane | flash | visual only | Desktop | T6 | deferred — 1 supporter |
| P14 | Card-to-page anchor beacon | flash | visual only | Desktop | T1 | deferred — 1 supporter |
| M1 | Remove false "agent cannot open pages itself" | codex, grok, minimax, argon | confirmed: `en.ts:2663-2664` (answers citing :2660 are line-drifted); `navigate` exists since 7.25.8 (PRD-2026-10-15:9-11); pinned runtime is 7.28.0 (`config/ax-code-runtime.json:3`) | Desktop | T6 | string gone in all 14 locales |
| M2 | No "Update bundled runtime" when probe didn't report | codex, grok, argon | confirmed: `Boolean(result?.compatible)` coerces missing to false (`useWebMcpBrowser.ts:107`, copy `en.ts:2633`) | Desktop | repair | probe without `compatible` shows "unknown", not "update" |
| M3 | Transcript rows: named tool + distinguishable outcome | codex, grok, minimax, argon | confirmed: unknown-tool titling (`toolHelpers.ts:197-203`); error tone only for error/failed (`ToolPart-impl.tsx:986`) | Desktop | T6 | collapsed failed invoke names tool and shows failure |
| M4 | Approval title is the page tool, not "webmcp" | grok, minimax, flash | confirmed: title forced (`PermissionCardTools.ts:27-28`) | Desktop | T1 | invoke title = tool name |
| M5 | No "Always allow" without named origin+capability scope | codex, grok, minimax | confirmed: save button (`PermissionCard.tsx:159-162,502`); runtime sends no always-scope (audit P2); PRD §5 bars standing grants | Desktop | T1 | scope-less request offers Allow once / Deny only |
| M6 | One primary enable action; Go independent of enable | grok, minimax, argon | confirmed via audit journey 02 (two identical buttons, disabled Go) | Desktop | T6 | draft shows exactly one primary action |
| M7 | Disambiguate the three "WebMCP" surfaces | grok, minimax, argon | confirmed: allowlist is per Chrome-bridge server (`WebMcpAllowlistSection.tsx:25-29`) | Desktop | config | distinct titles in all 14 locales; bridge section only when connected |
| X1 | Restore page ≠ restore authorization | codex, grok | confirmed (same lines as P6) | Desktop | resume | old grants/element refs unusable after reopen |
| X2 | Explicit access lifecycle: loaded/offered/granted/paused/disconnected with recovery | codex, grok, minimax, argon | confirmed: zero-bounds disconnect (`desktop-webmcp-browser.js:475-478`, trigger `EmbeddedWebMcpBrowser.tsx:144-150`) | Desktop | T6 + settings | opening Settings pauses, never silently kills or auto-executes |
| X3 | Decompose browse / enroll / execute, one next action each | codex, grok, argon | confirmed via audit journey | Desktop | first use | each state exposes exactly one progression action |
| X4 | Status distinguishes DOM fallback vs page tools | argon, flash, grok | confirmed (webMcpSummary states above) | Desktop | T6 | badge distinguishes "DOM access · 0 tools" from "N tools ready" |
| D1 | One project-browser workspace (tools + activity + access in one drawer/header) | codex, argon, flash | confirmed: counts duplicated across header/Services/Settings | Desktop | T6 | every entrypoint reaches the same panel |
| D3 | One failure sentence, same on pane/tooltip/Services | grok, minimax | confirmed: `describeWebMcpError` collapses (`webMcpSummary.ts:22-37`) | Desktop | repair | unsafe-port shows identical sentence in all surfaces |

Single-supporter divide items (D5 router, D6 status menu, D7 count dedupe, D8 z-index over Services dropdown) are deferred; D8 stays on record as a confirmed audit bug.

## 2. Conflicts and resolutions

1. **Dialogs: remove the disconnect (argon) vs. decompose with recovery (codex/grok/minimax).** Resolution: neither silently keep a dead grant nor silently kill access. Introduce an explicit *paused* state (X2); approvals pending at pause are retired or re-presented after revalidation, never auto-executed — PRD §5 forbids implicit grants.
2. **Persistence vs. isolation.** Minimax wants access re-armed after restart; argon flags cross-project storage leakage; codex insists restoration never restores authority. Resolution: persist URL per `(normalizeProjectPath, session)`; storage persistence only via the ADR-009 opt-in (P7, deferred); grants never persist (X1).
3. **"0 tools" defect.** Audit/minimax say the copy reads as failure; source shows the copy is already neutral and the real defect is the success tone/green dot (flash's screenshot-08 critique). Resolution: fix tone and add the DOM-fallback sentence (P8+X4), not another copy rewrite.
4. **Try-it semantics.** Minimax suggests it may need a runtime allow-list call; grok grounds it in ADR-009 decision 4. Resolution: user-driven invocation as the human, Desktop-only, adding no agent grant.
5. **Citation drift.** `en.ts:2660` → actual 2663-2664; "0 tools available" → actual "no page tools registered". Evidence confirmed in substance in both cases.

## 3. Proposed decision

**New requirements (≥2 supporters, evidence confirmed), Desktop-only, ordered by value per cost:**

- **CS-25 (P0)** Restore last page + honest access lifecycle (P6+X1+X2+X3): persisted URL, explicit paused/disconnected states, never "on" while the runtime rejects the page, one next action per state.
- **CS-26 (P0)** Truthful capability copy and actionable failures (M1+M2+P5+P8+X4+D3): no false "cannot open pages" or "update runtime"; named native causes with a fix action; no green tone on zero-tool pages.
- **CS-27 (P0)** Informative approvals (P4-Desktop+M4+M5): act element/submit/redacted text, tool-named titles, no Always-allow without scope.
- **CS-28 (P1)** Live tool panel with discovery and Try-it (P1+P2+D1): schemas visible with access off.
- **CS-29 (P1)** Named, outcome-distinct transcript/activity rows (M3+P3-Desktop).
- **CS-30 (P1)** Supervision integration (P12): Mission Control indicator + Activity feed from existing events.
- **CS-31 (P2)** Entry-flow cleanup (M6); **CS-32 (P2)** naming disambiguation (M7).

**Runtime contract proposals (no Desktop commitment until paired ADRs):** R1 forward invoke arguments + always-scope metadata; R2 stable structured reason codes; R3 model guardrails (CS-24: invoke templates, pre-invoke schema validation, `nextAction`); R4 per-call WebMCP events for feed/recap; R5 coordinated request lifecycle across reconnects.

**Rejected/deferred:** P7 (needs CS-25 first, single supporter), P9, P10 (folded into R4), P13, P14 (visual polish round), D5-D7 (single supporters), D8 (recorded bugfix). P11 not a Desktop requirement — it is R3.

## 4. Suggested round-8 package split (3 packages)

- **A — Browser state and failures (CS-25, CS-26, CS-31):** `EmbeddedWebMcpBrowser.tsx`, `useWebMcpBrowser.ts`, `webMcpSummary.ts`, `useWebMcpBrowserStore.ts`, `desktop-webmcp-browser.js`; owns all `webmcp.*` locale keys.
- **B — Approvals and transcript (CS-27, CS-29):** `PermissionCard.tsx`, `PermissionCardTools.ts`, `ToolPart-impl.tsx`, `toolHelpers.ts`; owns `chat.permissionCard.*` keys.
- **C — Tool panel and supervision (CS-28, CS-30, CS-32):** new panel component, `WebMcpBrowserTools.tsx`, `WebMcpHeaderButton.tsx`, `WebMcpAllowlistSection.tsx`, Mission Control/Activity projections; owns new `webmcp.tools.*` keys.

Locale files are shared: disjoint key prefixes per package, merge order A → B → C to keep the 14-locale fail-closed check green. All packages honor §5: no automatic approvals, no standing grants, runtime owns verification, no credential storage, three platforms via `normalizeProjectPath`, locales translated never English-filled.