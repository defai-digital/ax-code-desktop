# Official Wiki viewer consumption

The user approved the separate official viewer window on 2026-10-17. This consumes the existing AX Code ownership boundary: Desktop owns the launcher and window; the pinned runtime owns snapshot validation, HTML, scripts, styling, and the reading workspace. No source ownership or runtime contract moves between repositories.

The public SDK remains exactly 2.6.26 and the signed runtime remains 7.26.4. Read-only comparison against `/Users/akiralam/code/ax-code` at `8e8d77116` found matching Wiki visualization/maintenance and `desktop.webmcp.v1` provider contracts. No sibling source was modified. Muse's bounded integration review found no concrete API incompatibility in that scope.

Desktop invokes the bundled Node executable and `lib/index-node-tui.js wiki viz --export <temporary HTML>` with the project as cwd. It does not launch another coding server, generate a wiki on opening, publish private packages, link sibling workspaces, or copy the canonical viewer. Direct argv avoids cmd.exe interpretation of paths on Windows. Generation/refresh remains an explicit SDK action.

The exported document opens as a fixed snapshot in a separate sandboxed BrowserWindow without a preload or Node integration. Its canonical CSP remains intact. New windows, navigation, webviews, permissions, and downloads are denied. Export is bounded by 30 seconds and 1 MiB of process output. Child errors are not forwarded to the renderer. Temporary exports are removed on close, failure and shutdown. Reopening after refresh obtains a new snapshot.

The original Desktop canvas, sidebar, graph layout, camera and file-opening helpers were removed. Portfolio state and native WebMCP authentication remain unchanged. The main renderer CSP is unchanged; the runtime's frame-ancestor restrictions are not weakened.

A native Electron 44.7.0 smoke using the downloaded, pinned, Minisign-verified 7.26.4 runtime successfully exported and displayed a synthetic Guide page. DOM inspection and a reviewed screenshot showed the canonical Evidence map, Overview, Read and Modules tabs. The renderer had no Node require, and the canonical hashed-script CSP retained `connect-src 'none'`. Screenshot, structured observations and runtime-staging receipt are retained with operator evidence. The runtime test tree was isolated from staging unit tests, which intentionally replace the development staging directory.
