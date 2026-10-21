Good — the per-project/session keyed store + pool (WX-15) is real in HEAD. I now have enough source evidence to fill out all 13 steps and the comparisons cleanly. Below is the complete answer; this message is the final answer.

---

## Round 13 judgment — judge 3 (MiniMax-M3), HEAD

Read-only source check; ADR-266 fields absent from the pinned runtime get no credit. Compared with `scores/round12/judge-minimax.md` and `scores/README.md`.

### Supervisor A

| Step | Round 12 → 13 | Anchor and sentence |
|---|---|---|
| **A1 discover** | 7 → **9** | Raw JSON schema, hint badges (readOnly/untrusted/consequential), origin, named truncation and rejected-catalog reason render before any agent access ([WebMcpToolPanel.tsx:148-167, 198-230, 555-595](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx)) — no remaining credit gap. |
| **A2 enable and scope trust** | 7 → **9** | Enable / Pause / Resume / Disconnect are explicit, per-session bound by `viewKey(directory, sessionID)`; `waitUntilVisible` enforces the visible-to-act rule and the status pane names origin, paused and waiting ([EmbeddedWebMcpBrowser.tsx:460-516](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx)) — single surface now reads as one. |
| **A3 watch live** | 6 → **9** | The page-bound strip shows outcome, formatted duration, redacted arguments, filtered result preview, failure reason, an "earlier page state" marker and a button that opens the call in the conversation via `setPendingMessageNavigation` ([WebMcpCallStrip.tsx:40-117](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx)). |
| **A4 approvals** | 8 → **9** | Idle "Allow once" displays the runtime-stamped `autoOnceAt` countdown and the client never submits on its own ([PermissionCard.tsx:140-170](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx)) — masked args and scope call-data-only already in; countdown + never-submit close the gap. |
| **A5 failure recovery** | 7 → **9** | Structured `{error:{field,constraint,got}}` is classified as `failed` with the 12-reason vocabulary (`desktopWebMcpResultOutcome`), application errors stop reporting `completed`; provider-gone yields `uncertain` without retry ([WebMcpToolPanel.tsx:319-338](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx)). |
| **A6 evidence after the task** | 8 → **9** | The landing recap lists each step with operation, outcome and failure reason, never-called tools and is anchored to the session's own message window; strip rows also jump to the transcript ([ReviewLandingBrowserEvidence.tsx:64-112](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx)). |
| **A7 pause and take over** | 6 → **9** | `pause` and `disconnect` are distinct commands with a `stoppedCalls` acknowledgement banner, the page and generation are preserved and resume is by visible keyboard control ([EmbeddedWebMcpBrowser.tsx:460-516, 320-345](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx)). |
| **A8 several sessions** | 3 → **9** | `views = Map(directory+sessionID)` capped at `maxLiveViews=4`, a per-project partition (`partitionFor = sha256(projectKey)`) so cookies and sign-ins never cross projects, `revokeSession` removes only its view, `clearProject` removes all views on a partition, and the store keeps keyed drafts, runs and the registration timeline per pane ([desktop-webmcp-browser.js:116-180, 557-580, 766-836](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js); [useWebMcpBrowserStore.ts:85-313](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts)). |

**A mean 9.0** (round 12 was 6.5).

### Builder B

| Step | Round 12 → 13 | Anchor and sentence |
|---|---|---|
| **B1 see registered tools** | 4 → **9** | Schema block (`<pre data-webmcp-schema data-webmcp-schema-truncated>`), kind badge, annotation hint badges, advisory `LintNotes` and the visible truncation note cover what a builder needs to inspect and fix a catalog ([WebMcpToolPanel.tsx:148-230, 555-595](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx)). |
| **B2 try and compare** | 8 → **8** | Honest Try it (exact strings, absent/empty/zero/false, JSON fallback, distinct outcomes, advisory warnings, Send anyway) is kept; the manual journal plus `recordToolRun` are real per-keyed-view stores, so the gate (≥8 from two judges) holds ([WebMcpToolPanel.tsx:279-342](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx)). |
| **B3 iterate** | 5 → **9** | Registration events are appended with `added` / `changed` / `removed` (registration timeline, `REJECTION_TEXT` named reasons for `duplicate-name` / `invalid-schema` / `invalid-description` / `invalid-name` / `definition-too-large` / `catalog-too-large`), drafts survive across reloads keyed by tool name + digest + viewKey, and changed digests mark stored runs stale ([WebMcpToolPanel.tsx:23-66, 555-610](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx); [useWebMcpBrowserStore.ts:295-330](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts)). |
| **B4 diagnose misuse** | 5 → **8** | Manual run, stored run, page generation and failure reason are visible side-by-side; the catalog rejection names the offending tool and field, advisory lint explains property descriptions and opaque keywords — the rubric's runtime-correlated compare still depends on ADR-266, so credit caps here ([WebMcpToolPanel.tsx:23-95, 582-595](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx)). |
| **B5 onboarding docs** | 8 → **9** | The guide documents `pnpm run webmcp:check` (headless list/run, exit codes 0/1/2/3/64, Linux `xvfb-run`, loopback-only URL rule, form-vs-script caveat) and an in-CI section so a developer can take it into their own CI ([docs/webmcp-page-tools.md:124-152](/Users/akiralam/code/ax-code-desktop/docs/webmcp-page-tools.md); [`package.json:40`](/Users/akiralam/code/ax-code-desktop/package.json)). |

**B mean 8.6** (round 12 was 6.0).

### Moved vs round 12

A1 +2, A2 +2, A3 +3, A4 +1, A5 +2, A6 +1, A7 +3, A8 +6; B1 +5, B2 +0, B3 +4, B4 +3, B5 +1. Big movers: A8 (WX-15 view pool + per-project partition + visible-to-act gate + per-session revocation + keyed store), A7 (WX-10 page-preserving Pause vs Disconnect with `stoppedCalls`), A3 (WX-07 strip), B1 / B3 (WX-02 raw schema + WX-04 registration truth). Definition of done (≥8 from two judges) is now met for every step on this judge's evidence; only B2 / B4 stop short of 9 because the runtime-correlated compare still needs ADR-266 (recorded "Desktop ready, runtime pending").

### Three highest-leverage changes that would still raise the lowest steps most

1. **Pin a signed AX Code runtime that emits ADR-266 masked arguments, correlation ids and a schema-profile header** — turns B2 and B4 from 8 into 9 by giving the manual run a real "what the agent sent" comparison and a verifiable schema version ([PRD §4 WX-16](/Users/akiralam/code/ax-code-desktop/.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md)).
2. **Add a per-pane page switcher (project + session + origin + access state) in the toolbar** so a supervisor with several sessions sees which page belongs to which session without opening the pane ([EmbeddedWebMcpBrowser.tsx:413-450](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx); WX-15 §4).
3. **Drive `pnpm run webmcp:check` plus the W5/long-call keypress into the three-platform CI** so a build proves W2, W5 (during a long call) and the headless builder gate, instead of relying on a single macOS run ([`package.json:40`](/Users/akiralam/code/ax-code-desktop/package.json); WX-17 DoD item 2).

| Step | Score | One-sentence judgment and path:line |
|---|---:|---|
| A1 discover | 9 | Raw JSON schema, hint badges, origin, named truncation and rejected-catalog reason all render before access — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:148-167, 198-230, 555-595`. |
| A2 enable and scope trust | 9 | Enable/Pause/Resume/Disconnect and the visible-to-act gate (`waitUntilVisible`) name origin, paused and waiting on one surface — `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:460-516`. |
| A3 watch live | 9 | Page-bound strip with outcome, duration, redacted arguments, filtered result, failure reason, "earlier page state" marker and a transcript jump — `desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:40-117`. |
| A4 approvals | 9 | Idle `autoOnceAt` countdown ticks the runtime-stamped deadline and the client never submits itself — `desktop/packages/ui/src/components/chat/PermissionCard.tsx:140-170`. |
| A5 failure recovery | 9 | Structured `{error:{field,constraint,got}}` now classifies as `failed`, not `completed`; provider-gone yields `uncertain` without retry — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:319-338`. |
| A6 evidence after the task | 9 | Landing recap lists each step, outcome, failure reason and never-called tools; strip rows also jump to the transcript part — `desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:64-112`. |
| A7 pause and take over | 9 | `pause` and `disconnect` are distinct commands, the page and generation are preserved and `stoppedCalls` is acknowledged in a banner — `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:320-345, 460-516`. |
| A8 several sessions | 9 | `views = Map(directory+sessionID)` capped at 4, per-project partition, `revokeSession` is per-view, drafts/runs/timeline are keyed per pane — `desktop/packages/electron/src/desktop-webmcp-browser.js:116-180, 557-580, 766-836` and `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:85-313`. |
| B1 see registered tools | 9 | Schema `<pre>` (with truncation badge), kind badge, hint badges, `LintNotes` and visible catalog-truncation line cover what a builder needs — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:148-230, 555-595`. |
| B2 try and compare | 8 | Honest Try it (exact strings, absent/empty/zero/false, JSON fallback, distinct outcomes, warnings + Send anyway) is kept; runtime-correlated compare still needs ADR-266 — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:279-342`. |
| B3 iterate | 9 | Registration timeline (`added`/`changed`/`removed`), six named rejection reasons, drafts survive reload and changed digests mark stored runs stale — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:23-66, 555-610` and `desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:295-330`. |
| B4 diagnose misuse | 8 | Manual run, stored run, page generation and failure reason are visible, and rejection names the offending tool/field; runtime-correlated diff still needs ADR-266 — `desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:23-95, 582-595`. |
| B5 onboarding docs | 9 | Guide documents `pnpm run webmcp:check`, exit codes 0/1/2/3/64, the loopback-only URL rule, Linux `xvfb-run`, and an in-CI section — `docs/webmcp-page-tools.md:124-152` and `package.json:40`. |

**Means:** **A = 9.00** (round 12: 6.50), **B = 8.60** (round 12: 6.00). With this third-judge scoresheet, the PRD's "two of three judges at ≥8" gate is met for A1, A2, A3, A4, A5, A6, A7, A8, B1, B3 and B5 at 9/9/9/9/9/9/9/9/9/9/9, and for B2 and B4 at 8/8. Only B2 and B4 stay capped at 8 from this judge because they depend on ADR-266 fields that the pinned runtime does not yet send.

**Three highest-leverage changes to raise the lowest steps most:**

1. **Pin a signed runtime with ADR-266 (masked arguments, schema profile, correlation ids, validation path)** so B2 / B4 jump from 8 to 9 by giving the manual panel a real "what the agent sent" comparison and a verifiable schema version — `desktop/packages/electron/src/desktop-webmcp-browser.js:160-179` is where the headers are set today (no `x-ax-correlation-id`, no `x-ax-schema-profile`).
2. **Add a per-pane page switcher (project + session + origin + access) inside the toolbar** so a supervisor with several sessions sees which page belongs to which session without opening each pane — `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:413-450` (WX-15 §4 only has the data, not the UI).
3. **Wire `pnpm run webmcp:check` plus the W5 long-call pause/resume into the three-platform CI workflow** so W2, W5-during-call and the headless builder gate are not just macOS — `package.json:40` exposes the script; the three-platform CI job runs only the four native journeys, not this one (`desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs:1-167`).