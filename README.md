# AX Coder

AX Coder is a persistent desktop application in development for exception-driven supervision of multiple coding
projects. A human adds projects, approves product and architecture contracts, sets priorities and budgets, and
reviews exceptions. AX Coder observes durable project state, proposes the next work, and dispatches bounded
coding tasks to AX Code workers.

## Status

Phases 1 and 2 are complete. The reviewed Desktop history and provenance live under `desktop/` and
`.internal/reports/extraction/`. AX Coder is the sole current GUI source owner under
[ADR-008](.internal/adr/ADR-008-source-cutover-with-release-freeze.md).

Phase 3 signed shadow-release, cross-platform, upgrade, and rollback evidence remains pending. Public release
is disabled. The source cutover does not qualify a public release or change the compatibility identity.

## Product boundary

- AX Coder: portfolio experience, project registry, desired state, exception inbox, and manager UX.
- AX Agent: durable project-manager execution, workflows, leases, approvals, and recovery when contract-ready.
- AX Code: coding worker, repository tools, goal contracts, verification, sessions, and worktrees.
- Human: product scope, accepted architecture, permission and budget expansion, merge, release, and go/no-go.

See [the active PRD](.internal/prd/PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md).

## Repository state

No remote, release channel, package namespace, bundle identity change, or license transition is implied by the
local repository initialization. Those decisions require the ADR and specification sequence described in
`AGENTS.md`.

The AX Code SDK dependency decision is accepted: production will use an exact
`@defai-digital/ax-code-sdk` version from JSR plus a separately pinned signed AX Code runtime. Current pins are
recorded in `config/ax-code-sdk.json` and `config/ax-code-runtime.json` and checked independently of release approval.

## Development

Requirements are Node.js 24 or newer and pnpm 10.33.4 through Corepack.

```bash
corepack enable
pnpm install
pnpm run check:locales
pnpm run check:boundaries
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

The workspace never resolves AX Code from sibling source. Development uses an explicit `AX_CODE_BINARY` or an
installed `ax-code` on PATH; packaged candidates use the signed artifact pinned in
`config/ax-code-runtime.json`.

Start the Electron development app from the repository root with `pnpm run dev`.
Quit any running AX Code desktop app completely first: development shares its
single-instance lock, so another running instance causes the new launch to exit
successfully without opening a development window.

The renderer tries loopback ports **31440–31449**, starting at 31440. Vite
reports its actual bound port to the launcher before Electron starts, so a
busy port cannot redirect the development window to another project's server.
If the whole range is occupied, startup fails with a clear error. The internal
desktop server continues to use an automatically allocated port.

This development range sits near the existing AX family defaults while avoiding
their configured ranges: AX Engine uses 31418 (managed discovery may scan through
31437), AX Studio uses 31419–31420, and AX BI uses 31421–31428. These values were
checked in the sibling workspaces; this does not allocate ports for or change
those projects. Defaults are in `desktop/shared/dev-ports.json`.

To use a specific renderer port, set an override. Explicit ports are fixed;
startup fails if that port is occupied:

```bash
AX_CODE_DESKTOP_RENDERER_PORT=20000 pnpm run dev
```

## Launch and quit animations

The desktop app selects one of AX Code's 36 opening/ending pairs once per
application launch. Silent, three-second local video plays while the runtime
and web server initialize. The matching ending plays on a normal application
quit, concurrently with service cleanup. Closing a window on macOS keeps the
app running and does not play an ending; dock activation does not replay the
opening. Restart, update installation, and startup failures bypass the ending.

Use Escape or **Skip animation** to dismiss a clip. **Disable animations**
persists the preference; the application menu's **Launch and Quit Animations**
checkbox can enable it again. System reduced-motion preferences skip playback.
Media failure or a six-second player timeout continues startup or exit.

For development or unattended runs:

```bash
AX_CODE_DESKTOP_ANIMATIONS=0 pnpm run dev
```

Artwork, its provenance, and the small isolated player are packaged inside
`app.asar`. The player uses local files, has no coding-runtime access, and runs
without Node integration. It requires no new network listener. Forced process
termination cannot guarantee an ending animation.

```bash
pnpm run check:launch-animations
pnpm run smoke:launch-animations
pnpm run smoke:launch-animations -- --asar
```

These smokes use the installed pinned Electron and built player/preload assets
(`pnpm --filter @ax-code/electron run bundle:main`), independently of a running
AX Code desktop instance. The ASAR smoke packages only the player and media; it
does not qualify a complete signed desktop release.

## Electron candidate

Development and unpublished shadow builds currently pin Electron `45.0.0-beta.1`
(Chromium 156). This is a prerelease qualification candidate; public release remains
disabled. macOS 13 or newer is required. Windows and Ubuntu Desktop 24.04+ retain
their existing x64/arm64 packaging targets.

After changing Electron, rebuild `node-pty` for its ABI and run the engine smokes:

```bash
pnpm --filter @ax-code/electron run rebuild:native
pnpm run smoke:electron-compatibility
pnpm run smoke:native-webmcp
```

The native WebMCP smoke runs controlled loopback fixtures in disposable sandboxed
guests, checks a feature-disabled control, and repeats the enabled checks in separate
processes. It uses no installed Chrome or remote debugging port. To compare a different
downloaded engine, pass `--electron /absolute/path/to/electron --output-dir /path/to/evidence`.
Linux requires a display server; CI uses `xvfb-run`. These scripts are never loaded by
the app and do not enable production WebMCP or qualify AX Code provider integration.
Replace the beta with a separately tested exact stable pin before public release.
See [the candidate evidence](.internal/reports/ELECTRON-45-2026-10-11-candidate.md).

## Desktop languages

Settings → Appearance → Language controls the interface and future conversation requests independently.
The interface supports English, Traditional Chinese, Simplified Chinese, Japanese, Korean, French, German,
Indonesian, Italian, Brazilian Portuguese, Russian, Spanish, Turkish, and Vietnamese. Follow system language
resolves the OS preference list and retains its region for number and date formatting. Conversation Auto adds
no language instruction; an explicit preference defers to user requests and project instructions.

Preferences are saved separately in the Electron user-data directory and synchronized across desktop windows.
Catalogs are packaged for offline use, loaded lazily in the renderer, and available immediately to native menus
and recovery dialogs. Add English keys first, translate every catalog, preserve named placeholders, review any
identical wording in `desktop/shared/shared-spelling.json`, then run `pnpm check:locales --write-native`.
CI checks completeness and generated native catalogs. Structural checks do not constitute native-speaker review
or signed cross-platform release qualification; public release remains disabled.
