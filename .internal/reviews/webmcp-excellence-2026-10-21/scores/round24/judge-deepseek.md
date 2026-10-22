**Round 24 at `5193b0c8`: A 8.13/10; B 8.00/10.** Read-only; no files modified. No test runner was available in this session, so this is source judgment, not execution evidence. I ignored the uncommitted `config/`, lockfile and version-pin edits.

I verified the round 22–24 hardening in source: quoted/indexed compound paths (`shared/webmcp-redaction.mjs:102`), bracketed assignments (`:72`), inherited field sensitivity across nested diagnostics (`:159`), JSON drafts masked when redaction would change them (`UI/components/mcp/WebMcpToolPanel.tsx:500`, `:815`), bounded native init (`E/native-webmcp.js:114`), owner close gated on confirmation (`E/desktop-webmcp-browser.js:481`) with page recovery (`:527`). The round-23 P1s are addressed; the round-22 300-character field-description P2 is not.

`UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`.

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Expanded tools give full description, schema, hints and lint, but the list stays a technical tree with no capability grouping (`UI/components/mcp/WebMcpToolPanel.tsx:684`). |
| A2 enable and scope trust | 9 | Origin, project, session, access state, per-page revoke and project sign-out sit in one place and apply to the next call (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:482`). |
| A3 watch live | 8 | The open strip shows outcome, duration, redacted arguments, digest, result and a transcript jump, but arguments truncate at 140 characters (`UI/components/mcp/WebMcpCallStrip.tsx:108`). |
| A4 approvals | 8 | Effect sentence, origin, tool, element and scope-once are clear and digest-matched, yet a vanished ask only reports that no answer was recorded (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:25`). |
| A5 failure recovery | 8 | Outcomes are distinct and rejection paths mapped, and a stalled native init now fails bounded instead of hanging, but there is no one-action retry (`E/native-webmcp.js:139`; `UI/components/mcp/WebMcpToolPanel.tsx:646`). |
| A6 evidence after the task | 8 | The recap lists steps, kinds, durations, digests, rejections and never-called tools and copies the whole turn, but carries no inputs (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`). |
| A7 pause and take over | 8 | Pause keeps the page and is separate from Disconnect, with stopped-versus-finishing acknowledgements and no rollback claim (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545`; `:595`). |
| A8 several sessions at once | 8 | Bounded pool, per-session pages, independent revoke and waiting announcements work, and pages now survive renderer loss and owner close (`E/desktop-webmcp-browser.js:481`; `:527`). |
| B1 see registered tools | 8 | Schemas, hint badges, lint, named rejections and truncation are inspectable, though field aids still cut descriptions at 300 characters silently (`UI/lib/webMcpToolForm.ts:30`). |
| B2 try by hand and compare | 8 | Full forms, masked drafts, replay, side-by-side manual/agent comparison and test export exist, but exact agent input depends on approval receipts (`UI/components/mcp/WebMcpToolPanel.tsx:815`; `:210`). |
| B3 iterate | 8 | Registration history, retained drafts, stale marks and structured property diffs support iteration, though the diff renders as a JSON block (`UI/components/mcp/WebMcpToolPanel.tsx:982`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis plus runtime rejection details name property and rule, bounded to supported rules and known definitions (`UI/lib/webMcpDiagnosis.ts:55`; `:186`). |
| B5 onboarding docs | 8 | The guide is runnable end to end and linked in-app, but onboarding remains a document rather than an in-product loop (`docs/webmcp-page-tools.md:12`; `UI/components/mcp/WebMcpBuilderHint.tsx:6`). |

**Means:** A **65/8 = 8.13**; B **40/5 = 8.00**.

**Movement versus round 21:** no step moved. Rounds 22–24 removed failure modes rather than adding capability: A5 and A8 are more reliable (bounded init, veto-safe close, retained pages) and B2 is safer (masked drafts), but each step's ceiling is unchanged because the same evidence and recovery gaps remain. Round 21's approximation of completeness still holds.

Three changes with the widest effect on the 8s:

1. Runtime-issued receipts for every mediated call, not only approvals — redacted input, definition digest, duration, terminal outcome and correlation id — joined into strip, recap and comparison (**A3, A6, B2, B4**).
2. Authoritative approval terminal states (expired, denied, cancelled) with timestamps, shown in the card, strip and recap (**A4, A5, A6**).
3. Finish the discovery/edit surface: remove the silent 300-character field-description cap, render the property diff as rows, and add capability grouping or search (**A1, B1, B3**).