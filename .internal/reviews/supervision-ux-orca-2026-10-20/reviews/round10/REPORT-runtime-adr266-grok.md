# ADR-266 Desktop WebMCP contract v1

Branch `feat/webmcp-desktop-contract-v1`. No commit, push, or release.

SDK / OpenAPI regeneration: none. Route response schemas did not change (`inputPreview`, `reason`, `nextAction`, and list `invoke` templates are tool metadata, tool output, or `DesktopBrowser.Failure` data, not route success bodies). Generated `packages/sdk/js/src/gen/` and `packages/sdk/openapi.json` were not edited. `pnpm --dir packages/sdk/js run build` was not run.

Typecheck resolves `@ax-code/sdk/*` through the package `exports`, which point at gitignored `dist/`. That directory was absent in this worktree, so the first `pnpm --dir packages/ax-code run typecheck` failed with `TS2307` on `@ax-code/sdk/v2` (and the focused vitest run failed to import `@ax-code/sdk/provider-connect`). Compiling the existing SDK sources only, `pnpm --dir packages/sdk/js exec tsc --build --force`, wrote `dist/` and left git status unchanged. The commands below are the passing runs after that compile.

## R1 — invocation preview

Change. `desktop_webmcp` still calls `ctx.ask` with `always: []`. For `invoke`, the same metadata object passed to `WebMcpAutoApproval.bindDesktop` and to `ctx.ask` gains `inputPreview`. `DesktopBrowser.inputPreview` JSON-encodes a redacted copy of the already-detached input and truncates the UTF-8 encoding to 2048 bytes without splitting a code unit. Keys are split on camelCase and non-alphanumerics; a token of `password`, `passwd`, `secret`, `token`, `authorization`, `cookie`, `key`, or `apikey` replaces that value with `"[redacted]"` at any depth. Substring matches are not used, so `keyboard` stays visible. The preview is display-only. The native request still receives the detached input. Input values are not logged. No standing grant and no new auto-approval were added. Full-access Auto still admits a bound invoke without a prompt; that path is the existing runtime policy, and the preview is attached before it runs.

Tests. `test/mcp/desktop-webmcp-contract.test.ts` turns autonomous mode off (`AX_CODE_AUTONOMOUS=0`) so the prompt is observable, enrolls an `{ type: "object" }` tool so extra keys are schema-legal, and invokes with `sessionKey`, nested `access_token`, `keyboard`, and a 4000-character note. It expects `always` to be `[]`, a preview of at most 2048 bytes containing `[redacted]` and `visible-key` and not the secret strings, and the polled native `input` to still hold the real secrets.

Probe. Replaced `JSON.stringify(redactSecrets(input))` with `JSON.stringify(input)` in `inputPreview`.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "previews the detached"`

Exit 1. `invoke permission metadata previews the detached input and keeps always empty` failed (retry x2): `expected '...' to contain '[redacted]'` at `desktop-webmcp-contract.test.ts`. The received preview contained the raw `sessionKey` value. Reverted the stringify call. The restored line is `JSON.stringify(redactSecrets(input))`.

## R2 — reason codes

Change. `DesktopBrowser.Failure` data is `{ reason, message, nextAction, path? }`. `reason` is the closed set `no-page`, `page-changed`, `tool-not-found`, `definition-changed`, `invalid-input`, `provider-gone`, `timeout`, `native-failure`. `message` stays the existing human sentence, and `NamedError` still promotes `data.message` to `Error.message`. Unknown messages, and unknown thrown errors inside the tool, map to `native-failure` with the fixed sentence `The project browser operation failed.` The caught message is not copied, so an input value cannot ride into the error. Permission and question rejections (`PermissionRejectedError`, `PermissionCorrectedError`, `PermissionDeniedError`, `QuestionRejectedError`) are rethrown unchanged. Before a failure is rethrown, the tool calls `ctx.metadata` with `{ operation, reason, nextAction, path? }`. The reply route treats an expired browser response by `error.data.message === "Response belongs to an expired browser request"` (that failure is `page-changed`) and still returns `false`.

Tests. The contract test covers `provider-gone` (no enrollment), `no-page` (blank page), `tool-not-found`, `definition-changed`, `timeout` (abort), `native-failure` (native status `Error`), and an unknown `list` rejection whose serialized error does not contain the thrown text. Existing `desktop-browser.test.ts` assertions that compared `data.reason` to the human sentence now expect the code, with the sentence on `data.message`.

Probe. No separate mutation. R2 is the classification itself; R1 and R3 probes did not change it.

## R3 — guard rails

Change. `list` still returns each tool plus its digest, and adds `invoke: { action: "invoke", toolName, digest, input }`. The example input is derived from the JSON schema (required properties only; `{}` when none; depth cap 6). `prepareInvocation` detaches the input, then validates that copy with a fresh Ajv compiler (`strict: false`, formats off, `$schema` and `$id` stripped) before the credential walk and before `ctx.ask`. The first schema error becomes `invalid-input` with `path` set to the JSON pointer (`missingProperty` / `additionalProperty` included) and message `Input does not match the tool schema at ${path}`. A schema that cannot be checked fails closed as `native-failure` (`The tool schema could not be checked`) without logging the schema or the input. Every failure from `failure()` includes one `nextAction` sentence. The tool description tells the model to use the invoke template and to follow `nextAction`.

Tests. The contract test lists the strict echo tool and expects `invoke.input` of `{ query: "" }`. Invoking `{ query: 1 }` rejects with `invalid-input`, `path` `/query`, a one-sentence `nextAction`, and the ask spy is not called. Tool metadata records the same reason and path. `desktop-browser.test.ts` list deep-equality includes the template for the default `{ type: "object" }` echo tool (`input: {}`).

Probe. Removed the `assertInputSchema(...)` call in `prepareInvocation`.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "schema failures happen before permission"`

Exit 1. `list templates an invoke and schema failures happen before permission` timed out at 30000ms (retry x2, file duration about 90s). Invalid input was no longer rejected before permission; the ask mock resolved and the call blocked in the native invoke wait until the test timeout. Restored `assertInputSchema(tool.inputSchema, frozenInput)`.

## R6 — enrollment ownership

Change. `DesktopBrowser.enroll` loads the session with `Session.get` (the same lookup `requireCurrentProjectSession` uses). `NotFoundError` becomes `No coding session exists for this browser enrollment`. Otherwise enrollment fails with `Session belongs to another project` unless `info.projectID === Instance.project.id` and `Filesystem.resolve(info.directory) === Filesystem.resolve(Instance.directory)`. `Filesystem.resolve` is the realpath normalization `requestDirectory` uses (ENOENT falls back to `path.resolve`). A resolve throw rejects. The check lives in `enroll`, so a direct call cannot skip the route. The route still returns `c.json(await DesktopBrowser.enroll(...))`. `Session.isCompatibleWithCurrentProject` is not the predicate.

Tests. The contract test accepts `path.join(dir, "missing", "..")` and a symlink whose realpath is the enrolling directory. It rejects another directory and a missing `SessionID.ascending()`. The HTTP `POST /desktop/browser/provider` for a prefixed sibling directory (`${dir}-other`) is not ok and has status >= 400.

Probe. Dropped the `ownsEnrollingDirectory(info.directory)` clause and left only the project-id check.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "normalized enrolling directory"`

Exit 1. `enrollment requires an existing session in the normalized enrolling directory` failed (retry x2): `promise resolved "{ capability, epoch, projectID, providerID }" instead of rejecting` at the foreign-directory `DesktopBrowser.enroll` expectation (`desktop-webmcp-contract.test.ts`). Restored the `ownsEnrollingDirectory` clause.

## Verification

`pnpm --dir packages/ax-code run typecheck`

Exit 0.

`AX_TEST_FILES=test/mcp/desktop-browser.test.ts,test/mcp/desktop-browser-native.test.ts,test/mcp/desktop-browser-chrome-mode.test.ts,test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run`

Exit 0. Test files 3 passed, 1 skipped (4). Tests 33 passed, 1 skipped (34). Duration 11.39s.

`test/mcp/desktop-browser-native.test.ts` is the skip: its only test is `test.runIf(AX_TEST_DESKTOP_ELECTRON && AX_TEST_DESKTOP_HARNESS)`, and those variables were unset. Chrome-mode, the existing desktop-browser suite, and the new contract file ran.

## Review fixes

No commit. SDK / OpenAPI regeneration: none. `session-rejected` is a `DesktopBrowser.Failure` reason, not a route success body. Generated `packages/sdk/js/src/gen/` and `packages/sdk/openapi.json` were not edited.

### 1 — preview truncation marker

Change. `DesktopBrowser.inputPreview` still redacts first, then JSON-encodes. When the UTF-8 encoding is longer than 2048 bytes, the preview is a code-unit-safe prefix plus `… (N bytes, M not shown)`. The marker is reserved inside the 2048-byte budget (`N` is the full encoding, `M` is the bytes not shown). A short payload is returned unchanged. ADR-266 now says the preview is the start of what will be sent, and the entire payload only when nothing was cut.

Tests. The invoke permission test expects the marker, `N > 2048`, and `M = N - shown`, and still expects the preview to be at most 2048 bytes. `inputPreview marks truncation and redacts concatenated or diacritic secret keys` checks a short payload has no marker and a 3000-character `é` note stays valid UTF-8 inside the budget.

Probe. Replaced the marker return with `truncateUtf8(json, PREVIEW_MAX_BYTES)`.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "marks truncation|previews the detached"`

Exit 1. Both tests failed (retry x2): `expected null to be truthy` on the `… (N bytes, M not shown)` match. Restored the marker return.

### 2 — cached validators, no page regex

Change. `prepareInvocation` still validates before permission and again from the approval callback. Compiled Ajv validators are stored on the provider, keyed by tool-definition digest, in an LRU of `VALIDATOR_CACHE_LIMIT` (32). `update` clears that map. A schema is rejected before `Ajv.compile` when a schema keyword `pattern` is a string or `patternProperties` is present, including under `not`, `items`, `allOf` / `anyOf` / `oneOf`, and property schemas. A property or `default` named `pattern` is not a keyword. Compile failures still fail closed as `native-failure` with `The tool schema could not be checked`.

Tests. `compiled validators are reused until the catalog updates` expects one `Ajv.prototype.compile` for two prepares, a cached reject of `{ query: 1 }` at `/query`, a new compile after `update` with the same tool digest, eviction of the oldest of 33 digests, and a cache hit on the newest. `pattern and patternProperties fail closed before Ajv compiles them` expects `native-failure` and no compile for a `pattern`, a `patternProperties` map, and a nested `not.pattern`, including inputs that would otherwise validate. A missing `$ref` still fails closed. A schema whose properties are named `pattern` and `patternProperties`, with `default.pattern`, still validates.

Probes.

Removed the `schemaHasUnsafePattern` guard.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "pattern and patternProperties"`

Exit 1, about 552ms, no hang. `pattern and patternProperties fail closed before Ajv compiles them` failed (retry x2): `expected 'invalid-input' to be 'native-failure'`. Restored the guard.

Set the cache lookup to `undefined`.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "compiled validators are reused"`

Exit 1. The same test failed (retry x2): `expected 2 to be 1` at the second `prepareInvocation`. Restored `takeValidator`.

Removed `entry.validators.clear()` in `update`.

Same command.

Exit 1. The same test failed (retry x2): `expected 1 to be greater than 1` after `update`. Restored `clear()`.

### 3 — enrollment inside the project boundary

Change. `ownsEnrollingDirectory` calls `SessionMove.directoryWithinProject`, the same `Filesystem.contains` check session move uses against the instance directory, the worktree (unless it is `/`), and project sandboxes, after `Filesystem.resolve`. A subdirectory and a sandbox are accepted. Another `projectID`, a parent path, and a prefixed sibling are still rejected. A resolve failure is outside.

Tests. The enrollment test accepts `path.join(home, "nested")` and a sandbox created with `Project.addSandbox` outside the instance directory. It rejects `path.dirname(home)`, the other tmpdir, and a session whose `project_id` was updated to `Project.fromDirectory` of that other tmpdir while its directory stayed inside this project.

Probe. Replaced `directoryWithinProject` with exact `Filesystem.resolve` equality.

`AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run -t "normalized enrolling directory"`

Exit 1. `enrollment requires an existing session in the normalized enrolling directory` failed (retry x2): `DesktopBrowserUnavailable: Session belongs to another project` at the nested-directory `enroll`. Restored `directoryWithinProject`.

### 4 — concatenated and diacritic secret keys

Change. Key tokens are diacritic-stripped (NFD, combining marks removed) and lowercased, then split on camelCase and non-alphanumerics. `password`, `passwd`, `secret`, `token`, `authorization`, `cookie`, and `apikey` match anywhere in a token. `key` matches only as the whole token or a suffix, so `keyboard` stays visible. ADR-266 states that value-level secrets under innocuous keys are not promised to be redacted.

Tests. The direct `inputPreview` test expects `[redacted]` for `accesstoken`, `clientsecret`, `bearertoken`, `pässword`, `sessionKey`, `X-Api-Key`, and `api_key`, and expects `keyboard` / `visible-key` and `note: "sk-live-secret"` to remain.

### 5 — enrollment failures are session-rejected

Change. The closed set gains `session-rejected`. A missing session and a session outside this project use that reason. `nextAction` names the supplied session id and does not tell the model to stop. The human messages are unchanged.

Tests. The enrollment test expects `session-rejected` for the outside directory, the other project id, and `SessionID.ascending()`, and expects each `nextAction` to contain that session id and not `stop and report`.

## Verification (review fixes)

`pnpm --dir packages/ax-code run typecheck`

Exit 0.

`AX_TEST_FILES=test/mcp/desktop-browser.test.ts,test/mcp/desktop-browser-native.test.ts,test/mcp/desktop-browser-chrome-mode.test.ts,test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run`

Exit 0. Test files 3 passed, 1 skipped (4). Tests 36 passed, 1 skipped (37). Duration 12.82s.

`test/mcp/desktop-browser-native.test.ts` skipped again: `AX_TEST_DESKTOP_ELECTRON` and `AX_TEST_DESKTOP_HARNESS` were unset.

The probes above ran after that suite and were reverted. `AX_TEST_FILES=test/mcp/desktop-webmcp-contract.test.ts pnpm --dir packages/ax-code exec vitest run` then exited 0 (7 passed).
