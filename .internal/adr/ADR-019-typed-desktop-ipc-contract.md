# ADR-019: Typed desktop IPC contract

Status: Accepted for user-authorized implementation on 2026-10-19.
PRD: PRD-2026-10-19-competitive-quality-v1 (Phase 2, item 9). Specification: SPEC-2026-10-19-desktop-ipc-contract-v2.

## Context

`desktop-ipc-contract.json` lists 57 commands, but 56 declare only `"args": "object"`. Each handler in `main.js` re-checks
its arguments by hand, and renderer calls (`invokeDesktop`, `invokeDesktopCommand`, `__TAURI__.core.invoke`) are typed
`Record<string, unknown>`. A renamed or mistyped argument fails silently at run time. OpenCode validates every IPC payload
with Effect Schema; the AX Code runtime forbids Effect in core, and Desktop should not take the dependency either.

## Decision

1. The contract JSON remains the single source. Each command may declare `params`: a map from argument name to a small
   schema (`string`, `number`, `integer`, `boolean`, `object`, `array`, `string[]`, with `optional`, `nullable`,
   `maxLength`, `enum`). `args: "none"` and `args: "object"` stay valid during migration.
2. `handleCommand` validates arguments against the declared `params` before calling the handler and rejects a mismatch
   with a named error. Undeclared extra keys are ignored, so older renderers keep working.
3. A generator writes `ui/src/lib/desktopIpcContract.gen.ts` (command names and argument types). The renderer's invoke
   helpers use it, so a literal command name with wrong arguments fails type-check. The IPC contract check fails when the
   generated file is stale.
4. No dependency is added; the validator is a small module with tests.
5. Splitting `main.js` proceeds by moving each window type and command group into its own module as it is touched
   (the supervision window is the first). There is no big-bang rewrite.

## Consequences

Argument drift between renderer and main becomes a type error or a clear runtime rejection. Handlers may still keep
defensive checks. Migrating all commands to `params` is incremental; the checker reports how many remain untyped.
