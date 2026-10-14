# WebMCP: agent-initiated navigation — producer and consumer both implemented

Date: 2026-10-14

## Question

`WEBMCP-2026-10-13-blank-page-diagnosability.md` recorded "agent-initiated navigation" as left out
of that round. The first version of this note found the Desktop (consumer) side complete and the gap
producer-side only. This revision records the producer change and the consumer work it required.

## Producer (canonical runtime)

`defai-digital/ax-code` `227ec97a5` — *"Let desktop_webmcp open a page on the agent's behalf"*:

- `packages/ax-code/src/mcp/desktop-browser.ts`: the bound-request schema became a
  `BoundRequest | NavigateRequest` union, so a request can be issued while the pane is still blank
  (`origin: null`, `frameId: ""`) and carries only `url`. `navigableUrl()` accepts `https:` anywhere
  plus `http:` on loopback, and rejects embedded credentials. `retire(provider, { keepNavigate: true })`
  keeps a waiting navigation alive across the snapshot change that is its own result, and `respond()`
  checks only the pushed snapshot generation for a navigate reply.
- `packages/ax-code/src/tool/desktop_webmcp.ts`, `desktop_webmcp.txt`, `skills/webmcp/SKILL.md`: the
  tool gained `action: "navigate"` with `url`, asks once for the target origin, and the text no longer
  claims the tool cannot open pages.
- `packages/ax-code/src/mcp/webmcp-auto-approval.ts`: the approved operation set is
  `"list" | "invoke" | "navigate"`, with `fullAccessOnly` for everything except `list`.
- `packages/ax-code/test/mcp/desktop-browser.test.ts`: three new cases; the file's 21 tests pass.

## Consumer (this repository)

`desktop/packages/electron/src/desktop-webmcp-browser.js` gained `serveNavigation()`. A `navigate`
request is not a native tool call — the pane owns the load — so the bridge loads the URL itself with
the same deadline used for the first load, waits briefly for the adapter to observe the new document,
pushes the snapshot through the existing `/provider/:id/state` channel, and only then replies with
`{ requestID, generation, status, snapshot }`. State-before-reply is the order the runtime's
`respond()` requires: it compares the reply generation against the snapshot it already holds.

A URL the pane cannot open (`allowedUrl()` refuses `file:`, `data:` and credentialed URLs) is
answered with `status: "Error"` and no load. The producer's `navigableUrl()` is the stricter gate and
runs first, so the shell's copy is defence in depth.

`desktop/packages/electron/src/desktop-webmcp-browser.test.mjs` gained a pushable provider stream and
two cases: the successful load (asserting the pane really loaded the URL, and that the `/state` push
precedes the `/reply`) and the refused URL. Both fail against the pre-change bridge.

## Boundary

The pinned signed runtime is still 7.25.5, which predates `227ec97a5`. An installed app therefore
keeps the old behaviour until a signed runtime containing this change is pinned and verified. The
change is implemented, tested at the unit level, and does not affect the running app on its own.

## Not verified

End-to-end agent navigation on a real Electron window with a real runtime has not been exercised.
Both sides are covered only by unit tests against a fake guest page and a fake provider stream. If an
end-to-end run fails, check that the shell pushes `/state` before `/reply` and that the generation in
the reply matches the snapshot the runtime holds.
