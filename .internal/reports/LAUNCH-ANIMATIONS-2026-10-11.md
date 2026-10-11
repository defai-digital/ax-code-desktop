# Paired desktop launch and quit animations

Date: 2026-10-11

## Implementation

AX Code's canonical TUI artwork is rendered offline into 36 matching opening
and ending pairs. Desktop owns the media consumer and lifecycle UI. It does
not import a TUI component, terminal transport, or another coding runtime.
The exporter requires an explicit, clean producer source tree and is never
invoked by builds, CI, packaging, or startup.

Producer: `defai-digital/ax-code` at
`45b8e49ad01312a4d7cf3c5720978dc0737d6643`. The manifest records producer
source hashes and each clip's SHA-256 and byte count. The producer's
Apache-2.0 license, MIT license, and NOTICE accompany the artwork. There are 72 silent VP9/WebM
clips, each 960 x 540 at 24 fps for three seconds; total media size is
15,712,412 bytes. Producer source was read without modification.

One pair is chosen per application launch. Opening playback runs concurrently
with runtime and server initialization; the main window shows after the
opening finishes or is skipped. Normal quit plays the matching ending while
services stop. Repeated quit requests remain held until both steps settle.
The player has a six-second bound and releases its window and IPC listener
on timeout, failure, renderer crash, skip, or disposal. Early quit guards
prevent subsequent startup work and dock activation from reopening a window.

Escape and Skip animation dismiss playback. Disable animations persists a
Desktop-local preference using serialized atomic writes; the native application
menu can enable it again. `AX_CODE_DESKTOP_ANIMATIONS=0` overrides the preference.
System reduced-motion settings skip playback, including changes during playback.
All new native strings have translations in the existing 14-locale catalog.

The media and minimal player are included inside `app.asar`. The player uses
a separate ephemeral session, sandboxing, context isolation, local-only CSP,
denied permissions/navigation/popups, and a dedicated preload exposing only
completion. Completion IPC checks the exact window, main frame, and local
player URL. No new network listener or runtime command is exposed.

On macOS, closing the main window keeps the app running and does not play
an ending. Dock activation does not replay the opening. Restart, update
installation, and startup failure bypass the ending. Forced termination
cannot guarantee playback.

## Verification

- `pnpm run test`: 2,978 passed, one pre-existing skipped test. The new
  animation suites cover 23 cases for pair matching, IPC sender rejection,
  completion deduplication, bounded cleanup, obsolete callbacks, reduced
  motion, persistence, media integrity, required attribution, and repeated/concurrent quit handling.
- Focused animation suites were rerun with Vitest after the final player
  fixture adjustment and attribution check: 23 passed.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`,
  `pnpm run check:boundaries`, and `pnpm run check:release-contract`: passed.
- `pnpm run check:locales`: all 14 locales and the native catalog passed.
- `pnpm run check:launch-animations`: all 36 pairs / 72 media hashes and
  recorded sizes passed. FFprobe confirmed the declared dimensions, codec,
  frame rate, three-second duration, and absence of audio for all 72 clips.
- `pnpm run smoke:launch-animations` and
  `pnpm run smoke:launch-animations -- --asar`: the pinned Electron
  `45.0.0-beta.1` decoded and completed both clips in the Digital Code,
  foliage, and Singapore pairs. Each of the six results reported 72 frames
  and `ended`. ASAR playback was rerun after correcting content dimensions
  and video scaling; captured opening/ending screenshots were visually checked.

## Qualification limits

Playback evidence is local macOS arm64 using an isolated player process and
temporary user data. It does not start a second canonical worker or qualify
the complete Desktop application's signed startup/shutdown flow. Windows and
Linux playback and signed package, upgrade, and rollback evidence remain
pending. Public release remains disabled; SDK/runtime pins, source ownership,
bundle identity, and the existing release policy are unchanged.
