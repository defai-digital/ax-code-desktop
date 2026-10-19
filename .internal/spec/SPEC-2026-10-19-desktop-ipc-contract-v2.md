# Desktop IPC contract v2

Status: Accepted for implementation on 2026-10-19.
Decision: ADR-019.

## 1. Contract format

`desktop/packages/electron/src/desktop-ipc-contract.json`, `version: 2`. Each command:

```json
{ "command": "desktop_set_launch_at_login", "safeForRemote": false, "args": "object",
  "params": { "enabled": { "type": "boolean" } } }
```

- `params` is optional. When present, `args` must be `"object"`.
- Param schema: `type` is one of `string`, `number`, `integer`, `boolean`, `object`, `array`, `string[]`; optional
  `optional: true`, `nullable: true`, `maxLength` (strings and arrays), `enum` (strings).
- Missing required params and wrong types are errors. Unknown keys are ignored.

## 2. Main process

- `electron/src/ipc-args.js` exports `validateCommandArgs(contractEntry, args)` returning `{ ok: true }` or
  `{ ok: false, error }` with the first failing path, and `loadCommandContract()`.
- `handleCommand(name, fn)` looks up the entry once at registration. Before calling `fn`, it validates; on failure it
  throws `Error("Invalid arguments for <name>: <error>")`. Commands without `params` are not validated.

## 3. Renderer types

- `desktop/scripts/generate-desktop-ipc-types.mjs` writes `ui/src/lib/desktopIpcContract.gen.ts` with
  `DesktopCommandName` and `DesktopCommandArgs` (a map from name to an argument type; `Record<string, unknown>` for
  untyped commands, `Record<string, never>` for `args: "none"`).
- `invokeDesktop` and `invokeDesktopCommand` accept `<C extends DesktopCommandName>(command: C, args?: DesktopCommandArgs[C])`
  with a fallback overload for a non-literal string.
- `check-desktop-ipc-contracts.mjs` regenerates in memory and fails when the committed file differs, and prints the count
  of commands that still lack `params`.

## 4. First migration batch

Window, launch-at-login, badge, open-path/reveal/open-external, mini-chat, focus-main-window and supervision-window
commands get `params` in v2. The rest follow as their handlers are touched.

## 5. Tests

Validator cases for every type and flag, unknown-key tolerance, handler rejection message, generator output snapshot,
stale-file detection, and renderer type-check for the migrated call sites.
