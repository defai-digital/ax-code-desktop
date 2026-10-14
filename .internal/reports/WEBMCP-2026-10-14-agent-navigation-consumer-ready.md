# WebMCP: agent-initiated navigation — consumer side already supports it

Date: 2026-10-14

## Question

`WEBMCP-2026-10-13-blank-page-diagnosability.md` recorded "agent-initiated navigation" as left out
of that round. This note checks whether anything is missing on the Desktop (consumer) side, so the
remaining work can be attributed precisely.

## Finding

Nothing is missing here. The Electron shell already implements programmatic navigation of the
project browser:

- `desktop/packages/electron/src/desktop-webmcp-browser.js:348` — `{ action: "navigate", url }`
  loads the URL in the enrolled project-browser view, after `allowedUrl(...)`
  (`desktop/packages/electron/src/native-webmcp.js`) allows only ordinary web-page URLs, and with the
  same load deadline as the first load so a never-settling page cannot leave the pane busy.
- `desktop/packages/electron/src/main.js` exposes it through the guarded `desktop_webmcp_browser` IPC
  command, which additionally requires the window's main frame.

The gap is producer-side only: the AX Code runtime's `desktop_webmcp` tool and its skill/tool text
state that `desktop_webmcp` "cannot open pages" and that the user must open the exact URL
(verified inside signed runtime 7.25.5 — see `RUNTIME-2026-10-14-7.25.5.md`). Until the producer
relaxes that rule and issues the navigation request, the shell's capability is simply unused.

## Where a fix belongs

`defai-digital/ax-code` (the canonical runtime): the desktop-browser bridge tool (`packages/ax-code/src/mcp/desktop-browser.ts`)
plus its tool text and the `webmcp` skill. Per AGENTS.md this repository must not fork or duplicate
the runtime, and the shell must not open a second path to the same capability, so no Desktop change
is appropriate here.

## What the Desktop side would need once the producer calls it

Nothing structural: the IPC command, the URL allowlist, the load deadline and the pane-state
refresh already exist and are covered by `desktop-webmcp-browser.test.mjs`. A producer change should
be able to navigate by invoking the existing `navigate` action with the requested URL.
