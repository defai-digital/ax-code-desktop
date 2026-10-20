# Desktop UI WebMCP development surface v2

Status: Implementation contract for the user-authorized Settings testing/repair slice on 2026-10-20.
Extends [v1](SPEC-2026-10-19-desktop-ui-webmcp-v1.md); its original record is preserved. Related:
[product proposal](../prd/PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md) and
[plan Phase A](../plans/PLAN-2026-10-20-webmcp-outcomes-and-recap-v1.md).

This is the app's developer UI surface, not the embedded website provider. No SDK, worker, runtime authority, public
release, identity, browser-enrollment or credential contract changes.

## Discovery and pagination

`ax_desktop_get_ui_state({ offset?: integer })` returns up to 100 controls plus `offset`, `total`, `nextOffset` and
`truncated`. Offset defaults to zero for a read and is validated from 0 to 100000. A caller reads `nextOffset` until null.
An action returns the page from which its target was obtained. Changing UI content can change the total; another read
starts a fresh observation. Refs are document/snapshot-local and expire on the next snapshot or successful action.

The adapter includes the app's rendered buttons, ordinary inputs/textareas, links, disclosure summaries and ARIA button,
tab, checkbox, switch, radio, combobox, option and menu-item variants. This fixes the omission of custom select/menu choices.
Native select popups, OS controls, arbitrary selectors/JS/IPC, shadow trees and trusted pointer/keyboard delivery are not
claimed. The naming helper is a bounded heuristic, not the complete browser accessibility-name algorithm.

## Editing and focus

Click scrolls the target into view and focuses it before invoking its normal click handler. Ordinary text-entry and
read-only shortcut capture inputs can receive focus. Read-only input values cannot be changed by fill. Disabled, removed,
hidden, renamed, sensitive and unsupported input targets are rejected at invocation.

Fill supports text/search/email/URL/telephone/number fields and textareas. It focuses, uses the native value setter and
dispatches input/change. It leaves focus in the field; another click or focus change exercises blur-based validation.
The adapter does not clamp, normalize or submit on behalf of the app. Number-input browser sanitization still applies.
Maximum input remains 4000 characters; values are not echoed. Password, credential-hinted, payment, file and disabled or
read-only fields are unavailable. Credential hints include placeholder and description text; classification is defense in
depth, not an independent permission system.

The main-process unpackaged/explicit-opt-in gate, secure top-level native registration and abort cleanup from v1 remain.
Neither this extension nor a generated tool annotation authorizes a new runtime permission, automatic spend or production use.

## Settings audit

`pnpm run e2e:desktop:settings-webmcp -- --artifacts <dir>` drives the built app through native WebMCP in the isolated
profile/stub-runtime lab. It inventories all 15 navigation pages and paged controls, captures per-page state/screenshots,
checks naming/overflow/error-boundary behavior and exercises targeted native interactions with independent DOM checks.
Extend the recorded control matrix as nested forms/actions are exercised. A control's presence is not evidence of clicking
it, saving it or qualifying an external service. Live accounts/downloads, actual user assets, OS dialogs, model execution
and destructive actions remain separately qualified. Error/retry is tested for malformed runtime responses.

The ordinary keyboard journey also repeats Open settings before and after document reload. The renderer and native menu
both use an idempotent open action; duplicate delivery cannot toggle the dialog closed. Closing remains a distinct UI
operation. The close button no longer advertises the open shortcut as its close shortcut.
