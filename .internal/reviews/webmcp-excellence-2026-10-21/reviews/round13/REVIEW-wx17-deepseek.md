# Round 13 WX-17 review: builder CLI (deepseek-flash, read-only)

## Review: WX-17 builder CLI (`webmcp:check`)

**Verdict: not ready — 1 HIGH, 4 MEDIUM, 2 LOW.** No blocking defect in the argument/origin rules, exit-code precedence, or the `executeJavaScript` string building (those are sound), but the tool has one high-impact correctness bug in its registration window, one origin-rule bypass, and several teardown/timeout paths that turn a failure into a 45 s stall with the wrong exit code.

**Verification limit:** this session had no shell (`bash` unavailable; a delegated probe also returned `BLOCKED`), so nothing below was executed — no `pnpm test`, no live run. Findings 1, 2, 4, 5 are read directly off the control flow with in-repo precedent cited; they are not benchmarked. Where a claim is inference I say so.

---

### HIGH

**1. The registration wait collapses to ~500 ms, so a page that registers after load is reported as "no page tools" (exit 2)**
`desktop/packages/electron/scripts/webmcp-check-entry.cjs:43-47`

```js
let previous = -1
for (let waited = 0; waited < Math.min(config.timeoutMs, 5000) && live.size !== previous; waited += 500) {
  previous = live.size
  await delay(500)
}
```

Trace: sample 1 at t=0 sets `previous = size(0)`, waits 500 ms; sample 2 at t=500 compares `size(500)` with `size(0)` — equal ⇒ loop exits. **The `Math.min(config.timeoutMs, 5000)` bound is only reachable when the count keeps changing every 500 ms**; if nothing arrives in the first half second, the "5 s grace" the comment promises is actually 0.5 s. The stability test compares *sizes*, so a remove+add that keeps the count constant also ends it early.

Impact: tools registered from a React `useEffect`/hydration or after an initial fetch routinely land >500 ms after `did-finish-load` (when `loadURL` resolves and `WebMCP.enable` runs). Those pages get `tools: []`, `The page registered no page tools.`, exit **2** — indistinguishable from a page with no tools, on a slow CI runner. This directly contradicts the guide's own advice (docs/webmcp-page-tools.md:119: "it ran before `document.modelContext` existed … register after load"). Aggravating factor (inference): the window is `show: false` and `backgroundThrottling` is not disabled, so a hidden renderer's timers can be delayed further — the project browser itself treats a hidden browser window as paused (`onOwnerHidden` → `pause`, `desktop-webmcp-browser.js:434-436`).

Fix: wait on a signature + real deadline, and expose it.

```js
// wait until the catalog has been stable for a quiet period, or the deadline passes
const start = Date.now()
const deadline = start + Math.min(config.timeoutMs, 5000)
let last = null, quietSince = start
while (Date.now() < deadline) {
  const signature = [...live.keys()].sort().join("\n")
  if (signature !== last) { last = signature; quietSince = Date.now() }
  else if (Date.now() - quietSince >= 750) break
  await delay(250)
}
```
Plus `webPreferences: { backgroundThrottling: false }`, and a `--settle <ms>` / `--wait-for-tools <ms>` flag. Minimum viable: when `--expect-tools` is given and nothing appeared, say so specifically ("no page tools appeared within 500 ms") instead of the generic exit 2.

---

### MEDIUM

**2. The start-URL rule is not enforced after load: cross-origin redirects and self-navigation are followed and exit 0**
`webmcp-check-entry.cjs:25-35` (no `will-redirect`/`will-navigate` handler; `checkableUrl` in `webmcp-check-lib.mjs:13-23` only validates the command-line value)

`contents.loadURL(config.url)` follows server redirects; nothing re-checks the committed URL. `http://127.0.0.1:4173/x` → `302 http://10.0.0.5/` (or `https://…` → `http://…`) loads a non-loopback insecure origin, and its `WebMCP.toolsAdded` tools are then listed and **run**, exit 0. A page that calls `location.assign()` mid-check is the same path. The project browser treats this as mandatory, and this repo already documents the reason: `desktop-renderer-guards.js:112-117` — "Blocks every navigation … (renderer-initiated AND server-side redirects) … `will-navigate` alone does not cover a redirect chain", applied for the project browser at `desktop-webmcp-browser.js:377-383`. So `docs/webmcp-page-tools.md:112-113` ("The same rules apply as in the project browser") is false for anything but the first URL, and a check can silently certify a *different* origin than the one named — including an internal-network target reachable from a CI runner (SSRF-shaped), with the operator's `--run` inputs invoked against it.

Fix: mirror the project browser.

```js
const allowed = (value) => checkableUrl(value) !== null   // reuse the lib rule
contents.on("will-navigate", (event, url) => { if (!allowed(url)) event.preventDefault() })
contents.on("will-redirect", (event, url, _inPlace, isMainFrame) => {
  if (isMainFrame !== false && !allowed(url)) event.preventDefault()
})
// and after load: if (contents.getURL() !== config.url) treat as a reported failure
```
Add `--allow-origin <origin>` (repeatable) if testing a multi-origin app is a real use case.

**3. A run has no timeout, so a hung tool reports exit 1 ("engine exited without a report") instead of exit 3**
`webmcp-check-entry.cjs:55-69`; parent kill at `webmcp-check.mjs:31`

`await context.executeTool(...)` is unbounded. A tool that never resolves (a fetch without an abort, an `await new Promise` waiting on a person, a form tool awaiting `toolactivated`) blocks `check()`, no report is ever written, and the parent kills the child at `timeoutMs + 30_000` — 45 s with the default 15 s — then synthesizes `the browser engine exited (N) without a report` → **exit 1**. `docs/webmcp-page-tools.md:110` documents 1 as "the page did not load or an expected tool is missing" and 3 as "a run failed"; a hung run is a run failure, and CI cannot tell the two apart. The same misclassification covers a page that navigates during a run (the harness documents navigation invalidating the catalog, `ELECTRON-45-2026-10-11-candidate.md:47`) and any renderer crash: the whole `check()` throws into the catch at `:70-72` and every already-collected run is discarded.

Fix: bound each run and keep partial results.

```js
const withTimeout = (promise, ms) => Promise.race([
  promise,
  delay(ms).then(() => ({ error: `the tool did not answer in ${ms} ms` })),
])
for (const run of config.runs ?? []) {
  const result = await withTimeout(contents.executeJavaScript(/* … */), run.timeoutMs ?? config.timeoutMs)
  report.runs.push({ name: run.name, input: run.input, ...result })
}
```
Bound a single run at `--timeout` (or a new `--run-timeout`), and write the report from a `finally`/`process.on("exit")` path so a hang still yields exit 3 with the runs that did finish.

**4. Teardown can stall or skip cleanup: `app.quit()` may be vetoed and `fs.rmSync(profile)` runs before the app has stopped**
`webmcp-check-entry.cjs:78-80`

```js
fs.writeFileSync(config.output, JSON.stringify(report))
fs.rmSync(profile, { recursive: true, force: true })
app.quit()
```
Two independent failure modes, both ending in the parent's kill path (so: correct exit code, 45 s wall clock, leaked `ax-webmcp-check-*`):

- **Windows:** the `userData` profile is being written by a live Chromium (Cookies/`Local Storage`/cache). `force: true` only suppresses `ENOENT`; a locked file gives `EPERM`/`EBUSY`, the throw happens *before* `app.quit()`, so the child never exits on its own. (Inference — file locking on Windows is the well-known behaviour, not observed here.)
- **Any platform:** a page with a `beforeunload` guard can veto the window close, and `app.quit()` is then cancelled; the process lives until the parent's `child.kill()`. The repo's own reference probe avoids this by exiting explicitly — `probe-native-webmcp.cjs:273` uses `app.exit(report.passed ? 0 : 1)` rather than `app.quit()`.

Fix: write the report, then `window.destroy()` + `app.exit(0)`, and delete the profile from the *parent* after `exit` (it already owns the report directory cleanup at `webmcp-check.mjs:40`), or from `app.on("will-quit")`. Delete on the kill path too, or each timed-out run leaves a full Chromium profile in tmp.

**5. The launcher has no `error` handler on the child, so a missing/unrunnable Electron binary hangs for the full budget**
`webmcp-check.mjs:22-39`

Only `child.on("exit")` is awaited. If `spawn` fails (`ENOENT` on `path.txt`'s binary because the platform package was never downloaded, `EACCES`, no exec bit), Node emits `error` and may never emit `exit`, so the launcher waits `timeoutMs + 30_000` (45 s) and then reports a fabricated "the browser engine exited (null) without a report". If the `electron` module itself is not installed, `createRequire(...)("electron")` at `:20` throws before the try — the user gets a raw ESM stack trace instead of the `webmcp:check:` message format used at `:16`. First-run UX and CI hang in one place.

Fix: `child.on("error", …)` → print `webmcp:check: cannot start the bundled browser engine (<message>); run pnpm install` and `process.exit(EXIT.failed)`; wrap the `require("electron")` in a try with the same message.

---

### LOW

**6. Hardening parity claim is one handler short, and the flags are implicit**
`webmcp-check-entry.cjs:24-27` vs `desktop-webmcp-browser.js:363-375`, `wiki-viewer.js:28-30`, `launch-animation-controller.js:172-173`

`setWindowOpenHandler(deny)`, `will-download` cancel and `setPermissionRequestHandler(false)` are all present (good), but `setPermissionCheckHandler(() => false)` is missing in every other hardened surface in this package, and `webSecurity: true` / `allowRunningInsecureContent: false` are left implicit rather than stated as in the project browser. Synchronous permission checks (`navigator.permissions.query`, some clipboard/media paths) therefore answer with the default rather than an explicit deny. Low blast radius in a throwaway profile, but the comment at `:24` claims parity the code does not have. Add the two lines for consistency with the cited precedent.

**7. The "In CI" section omits what a Linux CI job needs, and neither `--timeout` nor `--verbose` is documented anywhere**
`docs/webmcp-page-tools.md:99-113`

The recipe is correct on macOS/Windows, but on Linux it fails with the opaque exit 1 from finding 5: the repo wraps every Electron smoke in `xvfb-run -a` (`desktop-ci.yml:151-154`, and `desktop-ci.yml:310` for the journeys), because Electron needs a display server; containers running as root additionally need `--no-sandbox`, which the child cannot receive at all (no switch passthrough — worth a documented `ELECTRON_EXTRA_ARGS` or `--electron-arg`). The section also never states that `pnpm install` is required (the CLI resolves the *dev* `electron` dependency), the 15 s default and `--timeout` (accepted range 1000–120000, `webmcp-check-lib.mjs:43-47`, and `--verbose` at `:36`), or that registration is only awaited briefly (finding 1). Add one Linux line plus a flag table; also consider a one-line note that a run against a *declarative form* tool is not the agent's path (the repo's own probe only ever invokes form tools through CDP — `probe-native-webmcp.cjs:114-195`), which I could not verify for `--run` here.

---

### Checked and sound (no action)

- **Origin rule input side** — `checkableUrl` (`webmcp-check-lib.mjs:13-23`) matches the runtime's own host list exactly (`native-webmcp.js:36-49`: `localhost`, `127.0.0.1`, `[::1]`), rejects credentials, rejects `file:`, and `new URL` normalizes integer/hex IPv4 forms to `127.0.0.1` *before* the host check, so those are not bypasses. Its strictness on `[::ffff:127.0.0.1]` and `0.0.0.0` is deliberate parity, not a bug.
- **Injection safety** — `JSON.stringify(run.name)` and `JSON.stringify(JSON.stringify(run.input))` are the correct double encoding for the Electron 44 engine, which requires a JSON string for `executeTool` (`ELECTRON-45-2026-10-11-candidate.md:46`: "Page `executeTool` accepts object input — Not accepted" on the 44 baseline). Both stay valid JS string literals for any name/input. Argument parsing rejects non-object input, `=`, and bad JSON before anything reaches the page.
- **Exit-code precedence** (`evaluateReport:77-97`) — no tools → 2, missing expected tool → 1, any run not `completed` → 3, else 0. Reusing `manualToolResult` is the right call: `{ error: { field, … } }`, `ok:false`, `isError`, `status:"error"` all map to `application-error`, so a structured error does not pass. Thrown tools land as `error` → `failed` → exit 3, matching the doc.
- **Isolation** — throwaway `userData` set before `ready`, `sandbox`/`contextIsolation` on, `nodeIntegration` off, popups denied, downloads cancelled; no single-instance lock, so parallel checks do not collide.
- **Wiring** — the new `.test.mjs` is picked up by `desktop/packages/electron/vitest.config.mjs:6`; the cross-tree import `../src/webmcp-manual-outcome.js` is same-package, so `script/check-desktop-boundaries.ts:146-148` permits it; `--json` never mixes with child output (stdout is ignored, stderr only on `--verbose`).

### Suggested order

1. Finding 1 (registration window) — makes the tool trustworthy on real SPAs.
2. Finding 2 (redirect/navigation guard) — restores the documented origin rule.
3. Findings 3 + 5 (per-run timeout, spawn `error`) — one failure vocabulary, no 45 s stalls.
4. Finding 4 (teardown) — `app.exit` + parent-side profile cleanup.
5. Findings 6 + 7 (hardening line, docs table).
6. Add an entry-level test with a mocked `electron` (precedent: `desktop-webmcp-browser.test.mjs`) asserting window flags, the navigation guards, the kill path and the "no report" fallback — the current suite covers only the pure helpers, which is why 1, 4 and 5 are invisible to CI.

No files were modified.
## Dispositions

- 1 HIGH registration window: fixed. The check waits until the tool list has been stable for 750 ms, up to `--settle`
  (default 5 s), with background throttling off. Verified: a tool registered 2 s after load is found and runs (exit 0).
- 2 MEDIUM origin rule after load: fixed. Navigations and main-frame redirects to disallowed origins are blocked, and a page
  that ends elsewhere fails the check. Verified: a redirect to `http://example.com/` reports exit 1.
- 3 MEDIUM hung run: fixed. Each run has its own limit and ends as a failed run (exit 3); the report is written after every
  step. Verified: a tool that never answers fails after 3 s with `--timeout 3000` (exit 3, 4 s in total).
- 4 MEDIUM teardown: fixed. The entry destroys its window and calls `app.exit`; the launcher owns one work directory (report
  and profile) and removes it with retries on every path.
- 5 MEDIUM spawn errors: fixed. A missing engine or a failed spawn prints a `webmcp:check:` message and exits 1.
- 6 LOW hardening parity: fixed (`setPermissionCheckHandler`, explicit `webSecurity` and `allowRunningInsecureContent`).
- 7 LOW docs: fixed (option table, `pnpm install`, `xvfb-run` on Linux, the form-tool caveat). The suggested mocked-electron
  entry test is recorded for a later round; the behavior above was verified against the real engine.
