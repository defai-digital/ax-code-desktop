# AkiTTY Web

`@ax-code/akitty-web` is the in-app canvas terminal for AX Code Desktop. It is part of the AkiTTY project but is a
separate implementation from the macOS Rust/Swift terminal: it renders to an HTML canvas and parses terminal output
with Ghostty's VT parser compiled to WebAssembly.

It started from [coder/ghostty-web](https://github.com/coder/ghostty-web) v0.4.0 and is now maintained independently
of it. It exposes an xterm.js-style API. Origin, licenses and the wasm pins are recorded in
[PROVENANCE.md](PROVENANCE.md).

## Platforms

AkiTTY Web is the Windows and Linux terminal in this project. The installable AkiTTY app is macOS-only
(Apple Silicon, macOS 14+). This package has no native Windows or Linux build because it does not need one:
it draws to an HTML canvas and parses terminal output with WebAssembly, so the same library runs in a browser
on Windows, Linux, and macOS.

What that covers:

- Rendering, VT parsing, selection, and keyboard input in the page. Ctrl, Alt, and Meta come from the browser.
  Ctrl+C is the interrupt on every platform. Command-click and Ctrl-click both open links.
- Loading `ghostty-vt.wasm` from a Windows `file://` URL (`/C:/…` is normalized to `C:/…`) as well as from
  `fetch` in the browser.

What stays with the host:

- The shell. This package does not spawn a PTY. AX Code Desktop, or another host, starts the process on that
  operating system and writes its output with `term.write()`. Keystrokes leave through `term.onData()`.
- There is no AkiTTY installer or `.exe` for Windows or Linux. People on those systems use AX Code Desktop,
  which embeds this terminal.

Checks in this repository type-check the package and run Vitest under Happy DOM. They run on the macOS CI job.
There is no separate Windows or Linux browser suite here.

## Status

- The package is **private** (`"private": true`) and is **not published** to npm or GitHub Packages. Consume it from
  source, for example through a workspace or Git dependency.
- It exports TypeScript source (`lib/index.ts`) and `ghostty-vt.wasm`; there is no prebuilt bundle. The consuming
  application's build compiles it.
- It was first developed in `defai-digital/ax-code-desktop` (`desktop/packages/akitty-web`) and migrated here.
  Desktop's copy is not updated automatically, so the two can diverge until Desktop switches to this one.
- The wasm file is the ghostty-web 0.4.0 release artifact, not a local rebuild. A rebuild has not been compared byte
  for byte.
- Some comments inside `lib/` may still mention `@cmux/ghostty-terminal`; the package name to import is
  `@ax-code/akitty-web`.

## Usage

```ts
import { init, Terminal } from "@ax-code/akitty-web"

await init() // loads ghostty-vt.wasm once
const term = new Terminal({ fontSize: 14, lineHeight: 1.15 })
term.open(document.getElementById("terminal")!)
term.write("Hello\r\n")
term.onData((data) => {
  /* send keystrokes to the shell or PTY */
})
```

`@ax-code/akitty-web/ghostty-vt.wasm` is also exported for hosts that need to serve the wasm file themselves.
Addons (such as `lib/addons/fit.ts`) follow the xterm.js addon interface.

Notable behavior:

- `lineHeight` sets the row height as a multiple of the glyph height.
- Empty, out-of-range and surrogate cell codepoints render as a space instead of throwing.
- A terminal whose container is off-screen (hidden tab or pane, per `IntersectionObserver`) stops drawing but keeps
  parsing output, then redraws fully when shown again. Without `IntersectionObserver` it always draws.
- A frame that throws is logged once and the next frame is a full redraw; the render loop keeps running.

## Reading terminals from agents

Read-only access for programs that need the terminal's text rather than pixels (the canvas has no DOM text):

```ts
import { TerminalSessionRegistry, TerminalReader, createTerminalTools, registerWebMcpTools } from "@ax-code/akitty-web"

const reader = new TerminalReader(term)
reader.readScreen() // { rows' text, cursor, title, buffer: "normal" | "alternate", revision, ... }
reader.readOutput({ lines: 100 }) // newest text incl. scrollback; page back with nextOffset

const sessions = new TerminalSessionRegistry()
const remove = sessions.add("tab-1", term, "build") // the host picks stable ids

const tools = createTerminalTools(sessions) // list_sessions, read_screen, read_output, as plain JSON tools
const webmcp = await registerWebMcpTools(sessions) // optional; no-op unless document.modelContext exists
webmcp.dispose()
```

- Reads are bounded (at most 1000 rows and 100000 characters per call) and carry a `revision` that changes whenever
  the terminal is written to, so a caller can tell whether two reads saw the same state. Paging through history while
  output is still arriving is approximate.
- Every tool result includes a notice that terminal text is untrusted, and the tools are marked `readOnlyHint` and
  `untrustedContentHint`. Callers that give the text to a model must still treat it as data, not instructions.
- There are deliberately no tools for sending input or running commands. `term.write()` draws output; it does not
  execute anything. Execution needs the host's PTY service, an authorization check and a rule for who controls the
  terminal, and that has to be enforced by the host, not by tool descriptions.
- Command results (exit code, per-command output) need shell integration or backend events and are not provided.
- WebMCP is a new browser API (`document.modelContext`); the adapter feature-detects it, and the tools work without it.

## Development

Requires Node 22+. The package has its own `package-lock.json` and is installed separately from the repository root.

```sh
cd packages/akitty-web
npm ci --ignore-scripts
npm run type-check
npm test          # Vitest with Happy DOM; older bun:test files run through test/bun-test-shim.ts
```

From the repository root, `scripts/verify.sh` runs the same install, type-check and tests.

`npm run build:wasm` rebuilds `ghostty-vt.wasm` from the pinned Ghostty commit and `patches/ghostty-wasm-api.patch`. It
needs Zig 0.15.2 and network access. Zig is needed **only** for this step; building and running AkiTTY and this
package does not require it. If the patch, pin or wasm changes, update the hashes in `PROVENANCE.md`.

## Licenses

MIT. See [LICENSE](LICENSE) (ghostty-web, Copyright (c) 2025 Coder) and [LICENSE-GHOSTTY](LICENSE-GHOSTTY).
