# ADR-009: Embedded Native WebMCP Provider, Version 1

| Field | Value |
| --- | --- |
| Status | Proposed |
| Date | 2026-10-11 |
| Deciders | User; AX Coder and AX Code maintainers |
| Related | PRD-2026-10-11-embedded-native-webmcp-v1; ADR-002; ADR-004 |

## Context

AX Coder embeds Electron 42.5.2 / Chromium 148 and currently displays remote content through
`<webview>` using the shared `persist:openchamber-browser` partition. Native probes show the old
engine lacks the WebMCP CDP domain, even when its legacy page API is enabled.

AX Code already owns a reviewed external `chrome-devtools-mcp@1.8.0` policy in its current source.
Its profile launches an isolated Chrome process and rejects attaching to an existing browser.
The signed worker pinned by AX Coder is 7.10.2, whose tagged source predates that WebMCP module.
An Electron executable cannot be substituted for Chrome in that launch profile.

Electron 44.7.0 / Chromium 152 passes the controlled native probe in `WebContentsView` using
`document.modelContext`, imperative/declarative tools, and the WebMCP CDP domain. This is a
feasibility result, not a production compatibility certification.

## Proposed decision

1. Bundle one qualified Electron browser engine with AX Coder; users never install Chrome for this feature.
2. Create the agent-enabled project surface with main-owned `WebContentsView`, following Electron's
   recommendation for new embedded content. Keep ordinary browser data intact during migration.
3. Use native `webContents.debugger` on the exact enrolled guest. Admit fixed native protocol commands
   only. Never expose a generic CDP proxy, global debugger port, arbitrary evaluation, or renderer-supplied
   target ID. External pages have no privileged preload, Node integration, or worker credentials.
4. Publish an additive AX Code desktop-provider contract. AX Code stays the sole agent-tool and
   permission authority; AX Coder only adapts authorized requests to its native guest.
5. Keep the existing AX Code isolated-Chrome bridge intact. Embedded-provider enrollment is a distinct,
   attested desktop capability, not an arbitrary browser attachment option in project configuration.
6. Default agent access off. Browser cookies use a dedicated project partition, transient by default.
   Remembered sign-in requires explicit opt-in plus existing managed-policy permission. Never reuse
   a Chrome profile or silently enroll the existing shared desktop browser partition.
7. Select the engine by real native capability tests and package regressions. Ship exact pins and
   upgrade the signed worker producer first, then the independent AX Coder consumer.

The proposal extends the worker contract; it does not supersede accepted source ownership,
permission, credential, signing, or release decisions. Paired producer acceptance is required.

## Alternatives

| Alternative | Decision |
| --- | --- |
| Require users to install Chrome | Fails the product requirement |
| Bundle a separate Chrome-for-Testing binary | Possible contingency; adds another browser lifecycle and does not directly provide the embedded GUI surface |
| Enable flags in Electron 42.5.2 | Native probe fails current CDP discovery/invocation |
| Inject a WebMCP polyfill | Does not qualify native Chrome-standard support |
| Point the existing Chrome executable setting at Electron | Existing launch/preflight contract does not support this |
| Expose all Electron targets to the existing bridge | Exposes privileged UI and unrelated projects |
| Reimplement the AX Code permission/tool runtime in AX Coder | Violates ADR-002 and AGENTS.md |

## Consequences and rollback

The adapter and view stay desktop-owned while policy and tool execution stay runtime-owned.
Native protocol drift requires a new qualified compatibility record. Debugger detach makes the
connection unavailable and invalidates pending work; it never automatically reattaches under old grants.
On failure, disable embedded agent access and retain ordinary browsing. Preserve dedicated profile
data and return to the last verified engine/SDK/worker pair. Do not automatically retry uncertain effects.

## Sources and evidence

- [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp/)
- [Native CDP WebMCP domain](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/WebMCP.pdl)
- [Electron embedding guidance](https://www.electronjs.org/docs/latest/api/webview-tag)
- [Electron Debugger API](https://www.electronjs.org/docs/latest/api/debugger)
- [Local native probe](../reports/webmcp-native-2026-10-11/README.md)
