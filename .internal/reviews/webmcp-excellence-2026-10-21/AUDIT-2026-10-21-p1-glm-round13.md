# WebMCP P1 audit — 2026-10-21 (fresh run, read-only)

**Verdict: no P1.** Every file on the audit list was read at HEAD; no P1 (work/data loss, wrong-target or unapproved action, credential leak, false UI claim, unrecoverable hang, broken documented flow) was found. One P2 was registered as a structured finding (9579e0af093a60b5); P3 notes follow it.

## Why each P1 category is closed

**Wrong page/session/project or acting without approval.** The provider loop rejects any request whose providerID, epoch, projectID or sessionID does not match the enrolled connection (`desktop-webmcp-browser.js:467-474`); `enable` re-resolves the session from the authenticated runtime, verifies `projectID`/directory, and deletes a provider that changed mid-enrollment (`:913-932`). Views are bound to their window (`lookup`, `:182-186`) and every command cross-checks `sessionID`/`directory` (`:836-838`). Partitions are per-project (`:141-142`); `clearProject` refuses unless one window owns everything and notifies both outcomes (`:767-809`). `tryTool` creates no grant and returns results to the invoking renderer only (`:963-989`). `PermissionCard.tsx` never self-submits (the `autoOnceAt` countdown is runtime-owned, `:140-154`); "Always" is hidden for the desktop provider without a named scope (`:191-198`); `webMcpEffect` builds the effect sentence from call data, never page text. Pause/disconnect cancel synchronously before reply so a late completion cannot report success (`stopAgentWork`, `:234-243`), and the cancellation message says changes already made stay — never claims rollback.

**False UI claims.** Manual outcomes share the transcript vocabulary: `manualToolResult`/`manualToolFailure` classify transport vs application error vs timeout vs cancelled vs uncertain (`webmcp-manual-outcome.js`), and a vanished IPC reply shows "uncertain", never failure (`WebMcpToolPanel.tsx:333-338`). The call strip and landing recap mark failure only when the runtime status or the result envelope says so, including `{ error: ... }` payloads (`toolHelpers.ts:504-542`); stale results and earlier-page generations are labeled (`WebMcpCallStrip.tsx:94-98`, store `markWebMcpRunsStale`). `revokeSession` and `disconnect` count only actually stopped work.

**Credential leaks.** Saved address history strips query, hash and userinfo before `localStorage` (`useWebMcpBrowserStore.ts:371-413`); the full address lives only in memory for the live session (WX-14). Displayed arguments, act text and result previews are filtered by credential-shape and sensitive-name patterns (`toolHelpers.ts:212-373`). Only fixed reason codes cross IPC; native messages and the provider token stay in main.

**Hangs / unusable panes.** All loads are deadline-bounded; a failed first load leaves the pane usable for a new address (`:679-694`). Renderer poll detects a dead browser after 3 misses and offers reopen (`EmbeddedWebMcpBrowser.tsx:298-311`); every command has a `finally` that clears `busy`, and permission replies are timeout-bounded with retry on failure (`PermissionCard.tsx:99-138`).

**Documented flow.** `docs/webmcp-page-tools.md` claims were checked against code: caps (64/256 KiB panel, 128/256 KiB engine), rejection naming, stale/draft semantics across reload (digest excludes frameId), loopback origin rule identical in `agentOrigin` and `checkableUrl`, quickstart example exists (`docs/examples/webmcp-quickstart/index.html`), `webmcp:check` options/exit codes match `webmcp-check-lib.mjs`, and the entry enforces the origin rule on navigation and redirects. The guide link in `WebMcpBuilderHint.tsx` points at this file.

## P2 (registered finding 9579e0af093a60b5)

**Provider `/next` poll has no independent timeout** — `desktop-webmcp-browser.js:454` passes the connection signal, so `runtimeApi`'s 20 s fallback (`:177`) never applies. Reproduction: enable agent access, then wedge the runtime's HTTP response (half-open connection). The serving loop awaits forever; only Disconnect/Quit (abort) breaks it, while the separate 1 s status polls keep the pane showing access as enabled. Impact: agent calls stall silently until their runtime-side deadlines; manual recovery only, no data loss. Caveat: if `/next` is a long poll, idle and dead are indistinguishable — that observability gap is the finding.

## P3 notes (no action required for this audit)

- `revokeSession` returns `{ revoked: true }` even with no enrolled view (`:821-829`) — vacuously true; no surface found that misreports it.
- A second window cannot open the same project+session browser (`:559-562`) and `clearProject` is refused while another window holds views (`:777-783`) — errors are surfaced; single-view-per-session is the recorded design.
- `PermissionCard`'s webfetch branch shows request headers/body verbatim (`:301-354`) — intentional informed-consent display, but unredacted, unlike the WebMCP branch.

## Scope and caveats

Static source audit at HEAD; uncommitted `config/`, `pnpm-lock.yaml` and `package.json` version pins were ignored as instructed (no other file on the list is dirty). `pnpm run webmcp:check` was not executed (needs the bundled engine and a served fixture); its claims were verified by reading the three scripts. Runtime-side behavior (approval delivery, request deadlines) is inferred from the pinned contract, not executed here.