# WebMCP: blank project browser reported as "DesktopBrowserUnavailable"

Date: 2026-10-13.
Authorization: the owner asked for the cause of "webmcp not working" to be found, discussed with the
Grok and Muse CLIs, planned, implemented, tested and committed.

## Incident

In the installed Desktop app (Info.plist 7.25.0, bundled signed runtime 7.25.3) the owner clicked the
composer WebMCP chip from a draft and typed "user webmcp, check trip.com". The agent called
`desktop_webmcp {action:"list"}` twice; both calls failed with the bare error `DesktopBrowserUnavailable`
and the agent told the owner that the project browser was not enabled.

Evidence from `~/.local/share/ax-code/log/2026-10-13T102056-838-main-e7ae78b2.log` and the runtime
event store (`event_log`), times in UTC:

| Time | Event |
| --- | --- |
| 10:20:56 | App start; runtime launched with `AX_CODE_BROWSER_MODE=embedded` and the provider token |
| 10:21:41 | Chip click auto-created session "Project browser" in `/Users/akiralam/code/srfax` |
| 10:21:42 | `GET /desktop/browser/capability` OK, `POST /desktop/browser/provider` OK (enrolled) |
| 10:21:42 onward | `/provider/<id>/next` long-poll every 15 s, healthy for the whole session; zero `PUT /state` |
| 10:22:52, 10:22:55 | `desktop_webmcp` failed; log, event and model text all read only `DesktopBrowserUnavailable` |

The session's tool list contained `desktop_webmcp` and no Chrome bridge tools: embedded routing blocks
`chrome-devtools-mcp` before transport creation, by design (ADR-013).

## Causes

1. The pane was enrolled on `about:blank`. `browserPanel.url` is deliberately not persisted, the chip
   auto-enables about 150 ms after the pane is ready, and the runtime's `forSession` then rejects
   every call because the snapshot has no grantable origin.
2. The rejection reason never surfaced. `DesktopBrowser.Failure` carried only `data.reason`, while
   `NamedError` promotes only `data.message` to `Error.message`; the tool path, the log line and the
   `tool.result` event all use `Error.message`.
3. The UI agreed with the wrong story: `summarizeWebMcpBrowser` reported "Agent access on" with a green
   dot and "0 tools on this page" for `enabled && origin === null`.
4. The runtime's reason text and the bundled `webmcp` skill addressed the model as if it could
   navigate; `desktop_webmcp` cannot open pages, and ordinary sites such as trip.com register no
   WebMCP tools, so an empty catalog is the expected outcome there.

## External review

Both reviewers were given the same brief and ran read-only against this repository.

- Muse: prefer a `message` on the failure itself over a global `NamedError` fallback; keep enroll on
  blank; give the blank state its own label; all 13 translated catalogs must gain the new keys because
  `store.test.ts` asserts key parity; retry-without-change must be forbidden in the tool text.
- Grok: same preference, with `message` required and every construction routed through one helper
  because three throws bypass `fail()`; reword the reasons so they ask the user instead of commanding
  the model; do not steal focus from the composer when enabling; distinguish a blank pane from a loaded
  page whose origin cannot be granted (`http://` on a public host); `tools === 0` on a real origin is a
  normal result, not a warning.

Both were adopted. The `NamedError` fallback was rejected because `reason` is a machine code in other
errors of the runtime.

## Changes

Producer (`defai-digital/ax-code`, ships with the next signed runtime):

- `packages/ax-code/src/mcp/desktop-browser.ts`: `Failure` now carries `reason` and `message`, built by
  one helper. The no-enrollment, no-page and disconnected reasons ask the user for the concrete action
  and say that the tool cannot enable the browser or open pages.
- `packages/ax-code/src/tool/desktop_webmcp.txt`: states the navigation limit, the stop-and-ask rule,
  and that an empty catalog on an ordinary site is normal (`webfetch` for public content).
- `packages/ax-code/skills/webmcp/SKILL.md`: a leading "Desktop project browser" section for sessions
  whose only browser tool is `desktop_webmcp`.
- `packages/ax-code/test/mcp/desktop-browser.test.ts`: message assertions for the no-enrollment, blank
  page, unconfirmed completion and credential cases, the round trip through `toObject()`, and an empty
  catalog listing.

Consumer (this repository):

- `desktop/packages/electron/src/native-webmcp.js`, `desktop-webmcp-browser.js`: status reports
  `page: "blank" | "unsupported" | "ready"`.
- `desktop/packages/ui/src/lib/webMcpSummary.ts`: enabled without an origin now reads "Waiting for a
  page" or "Page not usable by the agent" with a warning tone; an origin with no registered tools reads
  "{origin} · no page tools registered"; the same unsupported-page text applies while access is off.
- `desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx`: the pane shows "Load the page
  the agent should work with in this pane. The agent cannot open pages itself." while enrolled without a
  page, and focuses the address bar after enabling only when no text field has focus.
- i18n: English plus the 13 translated catalogs gained six keys; `webmcp.detail.enabledNoOrigin` was
  removed.

## Validation

- Producer: `pnpm --dir packages/ax-code run typecheck` passed; `test/mcp/desktop-browser.test.ts`,
  `desktop-browser-native.test.ts`, `desktop-browser-chrome-mode.test.ts`, `browser-routing.test.ts`
  and `test/tool/skill-invocation.test.ts` passed. The deterministic CI group result is recorded in the
  commit message of the producer change.
- Consumer: `pnpm run typecheck`, `pnpm run lint` (one pre-existing warning), `pnpm run check:locales`
  (14 locales, 4409 keys), the full UI vitest suite (266 files) and the Electron WebMCP tests passed.

## Boundary

The installed app still runs signed runtime 7.25.3, so the model keeps receiving the bare error name
until a later signed runtime that contains the producer change is published and repinned. The consumer
change is accurate against 7.25.3 because it keys off the pane's own `origin` and `page`, not the error
text. Agent-initiated navigation and a runtime-owned prompt line were left out of this round.
