# Cold-start critical path: measurements and fixes

Date: 2026-10-17
Status: Implemented and tested; packaged-build timing of the integrity change not re-measured end to end

## Question

Earlier performance work covered streaming and long histories. Cold start was never measured. The
app already records startup milestones to `~/Library/Logs/AX Code/main.log`, so the baseline came
from the 15 most recent packaged launches on macOS arm64 (p50, ms since process start):

| Milestone                      |  p50 |
| ------------------------------ | ---: |
| `electron.app.ready`           |  240 |
| `runtime.integrity.verified`   |  748 |
| `runtime.supervision.prepared` | 1355 |
| `web.server.bootstrap.start`   | 1508 |
| `web.server.ready`             | 2564 |
| `renderer.first-paint`         | 2644 |

The window stays hidden until the renderer is ready (or the opening animation ends), so everything
above is user-visible latency.

## Causes

All three sit on the serial path `integrity -> prepare -> launch server -> load renderer`.

1. **Integrity check blocked the main thread.** `verifyBundledAxCodeIntegrity` walked and
   SHA-256 hashed 2,837 files / 84.6 MB with synchronous reads: about 200 ms warm and 570 ms cold,
   before the window shell existed.
2. **The "off the critical path" version probe was not.** `resolveBinary()` queued the probe as a
   microtask, but the probe used `spawnSync`. The microtask ran before `prepare()`'s port
   reservation could finish, so the main thread blocked for the whole `ax-code --version`
   (170-400 ms measured). `supervision.start -> prepared` took 545 ms at p50.
3. **The web server waited for the login-shell snapshot before it listened.** `$SHELL -lic "env -0"`
   takes 0.8-1.05 s on this machine and ran inside the server utility process, after main had
   already forked it.

## Changes

- Version probe is a real `execFile` (same timeout and Windows ComSpec invocation).
- `createRuntimeManifestAsync` / `verifyRuntimeManifestAsync` / `verifyBundledAxCodeIntegrityAsync`
  produce byte-identical manifests and the same errors. A test pins equality with the sync
  implementation, including symlinks, native-binary omission and external-symlink rejection. Each
  file is opened once for both the magic-number check and the hash.
- Main starts the integrity check immediately, builds the window shell and opening animation while
  it runs, and awaits it before `prepare()` (the first thing that executes the bundled runtime) and
  before forking the web server. A modified tree still fails closed before any bundled code runs.
  An `isQuitting` check follows the await.
- Main starts the login-shell capture at module load and forwards the raw result to the server fork
  as `AX_CODE_DESKTOP_LOGIN_SHELL_ENV` (base64, POSIX only, at most 48 KB). `server-process.js`
  removes the variable before the server bundle loads and passes the value to
  `startWebUiServer({ hostLoginShellEnv })`. `seedLoginShellEnvSnapshotFromHost` applies it with the
  same rules as the in-process capture. Empty, malformed, oversized or Windows input falls back to
  the previous behavior (the server captures its own). Main never applies the snapshot to its own
  environment, and the fork env always overwrites the variable, so an inherited value is dropped.

Review input from muse and grok changed the design in four places: the quit check after the verify
await, gating the probe behind verification (it is already behind it, because `prepare()` runs after
the await), applying the snapshot on the seed path (otherwise `PATH` would never merge), and
removing the variable before the bundle loads.

## Measurements

Isolated dev instance, animations off, three launches each, `HEAD` against the working tree (ms
since process start). Development mode skips integrity verification, so this isolates changes 1 and 3.

| Milestone                      | before             | after              |
| ------------------------------ | ------------------ | ------------------ |
| `runtime.supervision.prepared` | 388 / 594 / 652    | 196 / 219 / 187    |
| `web.server.ready`             | 2098 / 2501 / 2087 | 1056 / 1105 / 1066 |
| `renderer.did-finish-load`     | 3747 / 4925 / 4475 | 1896 / 2011 / 1924 |

A later interleaved re-run on the final code, taken while the machine was under heavy load (load
average about 40 from other processes), shows the same direction with a smaller gap: `web.server.ready`
2036 / 2287 / 1999 before against 2011 / 1718 / 1512 after, and `did-finish-load` 3248 / 3343 / 2999
against 3241 / 2877 / 2597. Under that load the login-shell capture itself took 1.3-1.7 s, so it is
now the whole critical path. The quiet-machine table above is the better estimate of the typical gain.

The server now reports `web.server.login-shell-env` with `source: "host"` in every launch.

The integrity change was measured on its own against the installed runtime (2,837 files, 84.6 MB).
The synchronous verify blocks the main thread for 200-570 ms. The final asynchronous one reads each
file once through a fixed 64 KiB buffer and takes about 126-131 ms of wall time with the event loop
free (an earlier version that buffered whole files across 16 lanes took 400-470 ms under load and
held up to one file per lane in memory). It overlaps with the shell capture instead of preceding it.
A signed packaged build was not produced for this report, so the combined packaged improvement is
expected to be larger than the dev delta but is not measured.

## Review follow-ups

A second muse pass on the diff found five issues; four were fixed:

- If every shell candidate fails in main, the server used to repeat the same failing captures
  (up to 4 x 2 s again). Main now forwards an `unavailable` marker and the server skips its capture.
  Oversize output and Windows still fall back to the server's own capture.
- The integrity await moved ahead of `purgeDisabledRemoteAccessSettings()`, so a tampered tree fails
  before any settings write, as it did when the check was synchronous.
- The version probe takes an `AbortSignal` that `stop()` aborts, so it cannot outlive supervision.
- Hashing no longer buffers whole files (see above).

Accepted trade-off: the snapshot lives in the server utility process's initial environment block for
the process lifetime. `delete process.env` does not scrub that block, so a same-user process can read
it with `ps eww` (macOS) or `/proc/<pid>/environ` (Linux). It crosses no privilege boundary, because
the same user can run their own login shell and read the same variables, and children never inherit
it (it is removed before the server bundle loads). If that is not acceptable, move the hand-off to
`parentPort` and have `server-process.js` wait for it before bootstrap.

## Not done

- A Chromium trace to split the 67% native share of streaming CPU (see the 2026-10-15 hot-path
  report). Unchanged.
- Rendering the app before the server is ready. Packaged statics come from main's `app://` handler,
  but the preload pins the API origin at load and pre-ready API calls return a plain-text 503, not
  the JSON shape the renderer polls on. It needs renderer-side retry work.
- Starting the server before the login-shell snapshot lands. After these changes the capture is the
  critical path; it would need the server to tolerate a late `PATH` merge.
- A server restart reuses the boot-time login-shell snapshot instead of recapturing it.
