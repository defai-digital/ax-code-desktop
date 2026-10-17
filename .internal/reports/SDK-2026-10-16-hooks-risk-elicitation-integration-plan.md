# Plan: consume hook activity, permission risk and MCP elicitation from the next SDK

Date: 2026-10-16
Status: WP1 to WP4 done on runtime 7.26.4 and SDK 2.6.26. See `RUNTIME-2026-10-17-7.26.4-and-sdk-2.6.26.md`.
Inputs: reference review of 2026-10-16 (missing high-value features), AX Code ADR-204, ADR-211, ADR-212.

## Why

The reference review ranked three supervision features above the rest that AX Code Desktop could not build on the
published SDK 2.6.22:

| Feature | Reference | Runtime source | Runtime commit (ax-code `main`, unreleased) |
| --- | --- | --- | --- |
| Approvals ordered and badged by risk | OpenHands risk alert | ADR-212 `riskClass`, `interactiveOnly` on `PermissionRequest` | `a8d2f4e74` |
| Hooks page and hook activity | Goose, Cline, OpenHands | ADR-211 `GET /hooks` (`hooks.get`), `hook.completed` event | `b95e98818` |
| MCP form elicitation | Goose | ADR-204, routed through `question.asked` | `bc591cce3` |

Desktop consumes only an exact published JSR SDK version and a pinned signed runtime (AGENTS.md hard rules), so all
work waits for a release that contains these three commits.

## Prerequisite: release and pin (not authorized by this plan)

1. AX Code publishes a runtime and an SDK built from a `main` that contains `bc591cce3`, `a8d2f4e74` and
   `b95e98818` (the SDK source is at 2.6.25 today; the release picks the next version).
2. Desktop bumps the pins following `RUNTIME-2026-10-14-7.25.7-and-sdk-2.6.17.md`:
   - `config/ax-code-sdk.json` (version, specifier, producer commit) and the exact specifier in
     `desktop/packages/{ui,web,electron}/package.json`, then `pnpm install` so only the SDK changes in the lockfile;
   - `config/ax-code-runtime.json` per-target size, sha256 and signature digests after Minisign verification;
   - confirm the installed SDK exports `hooks.get`, `HookWorkspace`, `HookCompleted`, `EventHookCompleted` and the two
     new `PermissionRequest` fields before any UI change;
   - run `check:runtime-pin`, `check:release-contract`, typecheck, lint, `check:boundaries`, `check:locales`, test,
     build, and record the upgrade in its own report.

Publishing and the pin bump are outward-facing and need explicit approval at the time.

## Work packages (after the pin)

### WP1: risk-ordered approvals

Data already flows: `permission.asked` is reduced in `ui/sync/event-reducer.ts` into `State.permission`, and every
consumer reads those objects, so the new optional fields arrive without reducer changes.

- `ui/lib/supervision/requests.ts` and `ui/lib/needsYou.ts`: inside the existing permission/question tier, order by
  `interactiveOnly` first, then `riskClass` (`risk` > `unknown` > `safe`), then the current order. A missing field
  sorts as `unknown`, so requests from an older runtime keep their position relative to each other.
- `ui/components/chat/PermissionCard.tsx` and `ui/components/supervision/RequestActionCard.tsx`: a small badge
  (`Needs you to decide` for `interactiveOnly`, `Risky` for `risk`, nothing for `safe`). `PermissionCard` already reads
  `metadata.requireInteractive`; `interactiveOnly` replaces that guess where present.
- Tray: `ui/hooks/useTraySync.ts` `collectApprovals` carries `interactiveOnly` and `riskClass`;
  `ui/lib/tray/traySnapshot.ts` normalizes them; `electron/src/tray.mjs` sorts the approval submenu the same way and
  drops Allow always for `interactiveOnly` requests (the runtime refuses an `always` reply for them). Allow once and
  Deny stay: a click in the tray is still a human decision.
- Tests: `needsYouSurface.test.ts`, a new ordering test in `ui/lib/supervision`, `traySnapshot.test.ts`,
  `useTraySync.test.tsx`, a `PermissionCard` badge test, and the electron tray test for the hidden Allow.

### WP2: Hooks settings page

- Registry: add `hooks` to `SettingsPageSlug` and `SETTINGS_PAGE_METADATA` in `ui/lib/settings/metadata.ts`, an icon
  in `ui/lib/settings/navIcons.ts`, and cases in the three slug switches of `ui/components/views/SettingsView.tsx`.
- `ui/components/sections/hooks/HooksPage.tsx` and `HooksSidebar.tsx`, using `SettingsProjectSelector` and
  `axCodeClient.getScopedSdkClient(directory).hooks.get()`; the web server proxy already passes `/api/*` through, so no
  server route is needed.
- Content: trust state with the exact remedy (`AX_CODE_TRUST_PROJECT_CONFIG=1`); the file path with exists/valid and
  the parse error; the effective entries in run order (event, matcher, command, protocol, block on failure, source);
  built-in packs with enabled state; an Open file action through the existing open-in-editor path.
- Read-only by ADR-211 decision 3: no editing, enabling packs or toggling trust from the GUI.
- Tests: page states (untrusted with file, trusted, invalid file, missing file, runtime error), `metadata.test.ts`.

### WP3: hook activity

- Route `hook.completed` in `onEvent` (`ui/sync/sync-context-impl.tsx`) beside the scheduled-task side channel into a
  small store (`ui/stores/useHookActivityStore.ts`): a per-session ring buffer of the last 50 runs plus per-project
  counters of `blocked` and `failed` since the user last looked. Add `hook.completed` to `getSessionIdFromPayload` in
  `ui/sync/event-routing.ts`.
- Not through the reducer: hook runs are observational and frequent, and keeping them out of `State` avoids
  re-rendering the message tree. Update `ui/sync/DOCUMENTATION.md` with the side channel so
  `event-coverage.test.ts` keeps its drift guard.
- Render blocked and asked runs as one-line rows in the session (next to `ActivityBreadcrumb`), and surface blocked
  counts in `SinceYouLeftStrip` and the Mission Control peek. Successful runs stay in the Hooks page's recent
  activity list only, so a pack that runs on every edit does not flood the timeline.
- Tests: store ring-buffer bounds and counters, routing, and that an unknown-session event is dropped.

### WP4: MCP elicitation

No code is required for the prompt itself: the runtime asks through `question.asked` and `QuestionCard` already
answers it. After the pin bump, verify with a local MCP server that sends `elicitation/create` (form mode): the card
renders, accept returns typed values, dismiss declines, and autonomous mode declines without a card. A source label
("Requested by MCP server X") needs a runtime field on `QuestionRequest` that ADR-204 does not add; propose it in
AX Code only if the unlabeled card proves confusing in that check.

### WP5: release notes and docs

User-facing notes for the Desktop release that ships WP1 to WP3, and a line in `docs/` only once a public settings
guide exists.

## Order and size

WP1 (small) and WP2 (medium) are independent and can run in parallel worktrees; WP3 (medium) depends on nothing but
the pin; WP4 is a verification step. i18n follows the existing pattern: keys in `en.ts`, translations merged into the
13 locale catalogs, `check:locales --write-native`.

## Out of scope

- Writing `.ax-code/hooks.json`, enabling packs or project trust from the GUI (needs its own AX Code decision).
- Finer risk scoring than `riskClass`.
- Cost or budget features.
