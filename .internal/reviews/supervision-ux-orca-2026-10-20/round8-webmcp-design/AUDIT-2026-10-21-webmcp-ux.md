# WebMCP UX audit (2026-10-21), input to the round-8 design discussion

Method: the isolated development profile with the stub runtime, driven over CDP. The stub has no desktop-browser endpoints, so its
per-launch copy was patched in the temporary directory to allow enrolment; a WebMCP permission and transcript were written into the
scenario. No real model ran: permission replies and page-tool results are from source reading. Screenshots 01 to 14 and the drive log
are kept in the session scratch directory (not committed). No tracked files were changed by the audit.

## Journey today

- From a draft, the panel shows two identical "Start a session & enable agent access" buttons; the address bar is editable while Go
  is disabled (02).
- Enabling at about:blank shows "Waiting for a page" plus "The agent cannot open pages itself" (05).
- A page with tools shows "Agent access on · 2 tools", never the tool names (07). Closing and reopening the panel gives about:blank
  with access off (07b). A page without tools shows "0 tools available" (08). A bad URL shows the same generic text twice (10).
  Opening Settings silently turns access off (13, 14).

## P1

1. Any dialog cuts agent access without explanation: `EmbeddedWebMcpBrowser.tsx:144-150` sends a zero size and
   `desktop-webmcp-browser.js:475-478` disconnects; a pending approval stays visible but can no longer succeed.
2. Nothing persists: URL, login and access reset on panel close, session switch or restart (`EmbeddedWebMcpBrowser.tsx:95-125`;
   storage wipe at `desktop-webmcp-browser.js:108-123`).
3. Errors are discarded: the main process logged `ERR_UNSAFE_PORT (-312)` while the pane said "The browser action could not
   complete." (`EmbeddedWebMcpBrowser.tsx:211-219`).
4. The approval card hides what will happen: it drops the element, submit flag and text the runtime already sends for `act`
   (`PermissionCard.tsx:367-403`). For `invoke` the runtime sends no arguments (needs an AX Code change).
5. Wrong copy: "The agent cannot open pages itself" (`en.ts:2660`) is false for runtime 7.28; "Update the bundled runtime" also shows
   when the runtime simply did not report support (`useWebMcpBrowser.ts:107`).

## P2

- Tool names, descriptions and schemas appear nowhere; only a count.
- Transcript rows all read "Desktop webmcp"; collapsed failures look like successes (11).
- Approval titles say "Approval needed: webmcp" without the tool name; "Always allow" does not say what it covers, and the runtime
  sends no always-scope.
- Three different things are called "WebMCP": the project browser, a Chrome-bridge allowlist, and an MCP server named `webmcp`.
- The native page covers the Services dropdown (10b).
- A page without tools does not say the agent can still read and click it.
- No guide for developers making their own page usable by the agent.

## P3

"1 tools" plural; white error page; the panel always reopens on the Preview tab.

## Ideas

1. Live per-page activity strip (call, arguments, result, time). Basic version Desktop-only; full arguments need runtime metadata.
2. One-click "Let the agent use this page", with resume after restart. Desktop-only.
3. Tool badge on pages that register tools, even with access off, plus a "Try it" form. Desktop-only.
4. Plain-language failures with a fix button. Needs stable reason codes from the runtime.
5. Guard rails for weaker models: invoke templates in list results, schema validation before invoke, `nextAction` on errors.
   Runtime change.
