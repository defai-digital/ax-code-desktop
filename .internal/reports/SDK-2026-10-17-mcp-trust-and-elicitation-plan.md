# Plan: trust project MCP servers from the app and show declined MCP input requests

Date: 2026-10-17
Status: Plan. Blocked on an AX Code release that carries ADR-254 and ADR-255; nothing here is implemented.
Inputs: the end-to-end elicitation check in `RUNTIME-2026-10-17-7.26.4-and-sdk-2.6.26.md`, a best-practice review
with muse and grok, AX Code ADR-254 and ADR-255.

## What the runtime now provides (ax-code `main`, unreleased)

| Commit | Contract |
| --- | --- |
| `80617c446` | `mcp.elicitation.resolved`: server, session, call, mode, action, closed `category`, field count, up to 8 field names, URL host. No values, labels, message, URL path or query. |
| `3848050a3` | `needs_trust` status `review`; `POST /mcp/{name}/trust` `{ fingerprint }` (404, 409 `not_pending` / `fingerprint_mismatch`); `POST /mcp/{name}/untrust` (404, 409 `trusted_by_source`); `mcp.trust.changed`. |
| `deb20dca4` | Review hardening: WebMCP profile and launched argv, argv secret redaction with `redacted`, remote `queryKeys` and `hasCredentials`, check-and-write under the connect lock, events only on real changes, schema bounds. |

## Agreed design (muse and grok)

- Keep declining elicitation in Auto mode; never park requests in the inbox. Make each resolution visible instead.
- Trust from the GUI only after showing the runtime-built review, bound to the fingerprint on screen; one explicit
  gesture; a 409 forces a fresh review; no trust-all, no auto-trust, hooks trust stays separate.
- No OS notification for declines (nothing is actionable after the fact), no per-server policy, no Desktop-side
  fingerprinting, config parsing or audit store.

## Work packages (after the SDK and runtime pin)

### WP1: review and trust on the MCP page

- `ui/src/components/sections/mcp/mcpStatus.ts` and `McpPage.tsx`: replace the "run `ax-code mcp trust`" card with a
  review card rendered from `status.review` only: transport; for local the argv in monospace, environment variable
  names, the WebMCP profile (origins, executable path, persistent profile, vendored, tiers) when present; for remote
  the URL, query key names, header names and a "URL contains credentials" notice; a "Some values are hidden" note when
  `redacted`; the source file path; a short copyable fingerprint; the line "Trusting runs this command from the
  project's configuration on your machine. It does not trust the project's hooks."
- One action, "Trust and connect", posting the displayed fingerprint through the SDK. On 409
  `fingerprint_mismatch`, reload the status and show "The configuration changed. Review it again." without retrying;
  on 409 `not_pending`, refresh. After success the status map from the response replaces the store's.
- An "Untrust" action on a trusted project server's management row; hide it for 409 `trusted_by_source` sources.
- Tests: the card renders every review field and never anything else; 409 paths; the untrust action.

### WP2: declined input requests in sessions and supervision

- Route `mcp.elicitation.resolved` through the same side channel as `hook.completed` into a small store (per-session
  ring buffer, per-directory decline counts), never the reducer.
- Session row beside the hook rows for `decline` outcomes other than `user_declined`: "MCP server X asked for 3 fields
  (project, issue, label); declined in Auto mode." with a "Switch to Manual" action when `category` is `autonomous`,
  and short explanations for `unsupported_form`, `no_active_call` and `invalid_url`.
- Count declines in the since-you-left strip and the Mission Control peek.
- Optionally refresh the MCP page on `mcp.trust.changed` so a CLI trust shows up without a manual refresh.
- Tests: store bounds, routing, row copy per category, the Manual action.

## Order

WP1 and WP2 are independent. Both need the next runtime and SDK release and the pin bump procedure in
`RUNTIME-2026-10-14-7.25.7-and-sdk-2.6.17.md`.
