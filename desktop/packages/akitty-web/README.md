# AkiTTY Web

`@ax-code/akitty-web` is AX Code Desktop's Canvas terminal. Native and Web share
the independently authored AkiTTY Rust VT engine. The browser frontend is an
AkiTTY implementation with an xterm.js-style API. No Ghostty, Alacritty or VTE
engine is linked or bundled. Historical test origins remain documented in
[PROVENANCE.md](PROVENANCE.md).

## Platforms

AkiTTY Web is the Windows and Linux terminal in this project. The installable AkiTTY app is macOS-only
(Apple Silicon, macOS 27.2+). This package has no native Windows or Linux build because it does not need one:
it draws to an HTML canvas and parses terminal output with WebAssembly, so the same library runs in a browser
on Windows, Linux, and macOS.

What that covers:

- Rendering, VT parsing, selection, and keyboard input in the page. Ctrl, Alt, and Meta come from the browser.
  Ctrl+C is the interrupt on every platform. Command-click and Ctrl-click both open links.
- Loading `akitty-vt.wasm` from a Windows `file://` URL (`/C:/…` is normalized to `C:/…`) as well as from
  `fetch` in the browser.

What stays with the host:

- The shell. This package does not spawn a PTY. AX Code Desktop, or another host, starts the process on that
  operating system and writes its output with `term.write()`. Keystrokes leave through `term.onData()`.
- There is no AkiTTY installer or `.exe` for Windows or Linux. People on those systems use AX Code Desktop,
  which embeds this terminal.

Checks in this repository type-check the package and run Vitest under Happy DOM. They run on the macOS CI job.
Playwright also checks real canvas pixels, keyboard input, reset, resize and disposal
in Chromium, Firefox and WebKit. It runs in the macOS gate, with additional Ubuntu
and Windows CI jobs. This component coverage does not establish packaged-host PTY
behavior, physical IME or every OS/font combination.

## Status

- Source version **0.6.12**, in the same tree as native AkiTTY 1.4.1. The package version moves on its own.
- The package is **private** (`"private": true`) and is **not published** to npm or GitHub Packages. Consume it from
  source, for example through a workspace or Git dependency.
- It exports TypeScript source (`lib/index.ts`) and `akitty-vt.wasm`; there is no prebuilt bundle. The consuming
  application's build compiles it.
- It was first developed in `defai-digital/ax-code-desktop` (`desktop/packages/akitty-web`) and migrated here.
  Desktop's copy is not updated automatically, so the two can diverge until Desktop switches to this one.
- `akitty-vt.wasm` is built from this repository's Rust source with Rust 1.99.1.
  `wasm-provenance.json` binds the binary hash to its source/build inputs.

## Migrating to 0.6

Ordinary `Terminal`, events, buffers, addons, selection and read-only agent APIs
remain supported. Engine-specific exports intentionally change:

- Use `AkittyEngine`, `AkittyTerminal`, `TerminalCell`, `getEngine()` and the
  `engine` constructor option instead of the former Ghostty names/option.
- Serve `@ax-code/akitty-web/akitty-vt.wasm`; the former WASM path and ABI are removed.
- `Key` identities follow Unicode/Kitty protocol numbers; consumers using the
  encoder should import the named constants rather than persisting old numbers.
- Dimensions are integers in 1..4096 with at most 1,048,576 cells in total.
  Scrollback is limited to 100,000 rows and a 64 MiB history budget per screen.
  Old requests for 4096 × 4096 grids now fail validation.
- `unicode.activeVersion` reports the width tables (18.0); grapheme boundaries
  use Unicode 17.0. Web enables streaming grapheme mode 2027 by default. Native
  keeps its existing scalar-width profile; shared fixtures qualify both profiles.
- Normal and alternate buffer objects expose their own cursor, retained text and
  wrapping even while inactive. Reads do not switch the active terminal buffer.
  Update TypeScript source and `akitty-vt.wasm` together: the loader requires the
  explicit buffer-read exports in addition to WASM ABI 1.
- Title/BEL events come from the common Rust parser. Theme colors survive RIS
  and OSC palette reset, and synchronized output deadlines flush even while hidden.

## Usage

```ts
import { init, Terminal } from "@ax-code/akitty-web"

await init() // loads akitty-vt.wasm once
const term = new Terminal({ fontSize: 14, lineHeight: 1.15 })
term.open(document.getElementById("terminal")!)
term.write("Hello\r\n")
term.onData((data) => {
  /* send keystrokes to the shell or PTY */
})
```

`@ax-code/akitty-web/akitty-vt.wasm` is also exported for hosts that need to serve the wasm file themselves.
Addons (such as `lib/addons/fit.ts`) follow the xterm.js addon interface.

For bulk PTY output, use `await term.writeAsync(chunk)` to let input and drawing run between parsing turns.
Each terminal admits at most 8 MiB of queued UTF-8 data and 1,024 pending writes; a write exceeding either
bound rejects without accepting any of its data. Await completion before admitting more output to apply
backpressure to the host transport. Accepted byte arrays are copied, so the host may reuse its receive buffer.
Completion means the bytes were parsed, not that they were painted. Parsing uses 8 KiB chunks with a 4 ms
cooperative turn budget; one parser call can exceed that budget on slow hardware or expensive input.

`write()` remains synchronous. While asynchronous output is pending, `write()`/`writeln()` reject attempts
to overtake it; use `writeAsync()` consistently or await all queued output first. Reset, disposal or a parsing
error rejects outstanding asynchronous writes. Reset permits a new output generation afterward.
After a parsing failure, reset or resynchronize the terminal before retrying; a prefix may already have been parsed.

Notable behavior:

- `lineHeight` sets the row height as a multiple of the glyph height.
- Empty, out-of-range and surrogate cell codepoints render as a space instead of throwing.
- A terminal whose container is off-screen (hidden tab or pane, per `IntersectionObserver`) stops drawing but keeps
  parsing output, then redraws fully when shown again. Without `IntersectionObserver` it always draws.
- A frame that throws is logged once and the next frame is a full redraw; the render loop keeps running.
- Sparse screen updates fetch only the rows needed for damage and cursor repair. Clean-row hashes and adjacent
  background fills are reused or batched; full redraws and large changes retain the bulk viewport path.
- Output callbacks observe current viewport data. Events from reentrant writes follow the already queued events;
  callback errors are rethrown after the batch is dispatched, and disposal stops further callbacks.

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

`npm run build:wasm` rebuilds `akitty-vt.wasm` from `crates/akitty-vt` using Rust
1.99.1. Install its `wasm32-unknown-unknown` target, or matching Rust sources and
`wasm-ld` for the distribution-toolchain fallback. No Zig compiler or upstream
source checkout is needed. After an intentional rebuild, run
`python3 scripts/vt-provenance.py --write` from the repository root and commit
both the artifact and manifest. The required gate checks the committed artifact
and runs the same fixtures against a fresh build. Cross-distribution binary
identity is not assumed.

## Licenses

MIT for AkiTTY production code and retained Coder-derived tests/helpers; see
[LICENSE](LICENSE). Ordinary engine dependency licenses are in
[ENGINE_LICENSES.txt](ENGINE_LICENSES.txt). [LICENSE-GHOSTTY](LICENSE-GHOSTTY) is
retained as a historical notice; the former engine implementation is removed.
