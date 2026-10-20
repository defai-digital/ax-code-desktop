# Test the Desktop UI with WebMCP

AX Code Desktop can expose its own UI as native WebMCP tools in an explicitly enabled, unpackaged development instance.
This is separate from using website tools through the project browser. The tools operate the rendered UI and its event
handlers, so agents can inspect controls, click them, fill ordinary fields and check the resulting screen.

Build the renderer and shell, then start the isolated development lab:

```sh
pnpm --dir desktop/packages/web run build
pnpm run build
pnpm run dev:webmcp
```

The lab prints a connection-file path and keeps the window open. It uses a temporary project/profile and a stub AX Code
runtime. No model account is required. In another terminal, use the printed path:

```sh
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json list
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_get_ui_state '{}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_click '{"ref":"REF_FROM_LATEST_STATE"}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json call ax_desktop_fill '{"ref":"REF_FROM_LATEST_STATE","value":"search text"}'
pnpm run dev:webmcp -- --connection /printed/path/ui-webmcp-connection.json screenshot /tmp/desktop-ui.png
```

Read the state first and use its exact control references. Every state read or successful action replaces those references.
If `nextOffset` is non-null, pass it as `offset` to read the next page of controls. An action preserves the current control
page. Open a select or menu and read again to discover its ARIA options/menu items. Read-only shortcut inputs support
click-to-focus but cannot be filled. Ordinary email, URL, telephone and number inputs also support fill.
Read again to verify asynchronous rendering; a successful click means the event was dispatched, not that the feature passed.
Input values and chat content are omitted. Password, credential, payment and file fields cannot be filled. Hidden, disabled,
removed or renamed controls cannot be acted on. Controls are bounded to 100 rendered items per page; this is not a full
accessibility tree. Fill leaves focus in the edited field; click another control to test blur validation. Native select/OS
pickers, shadow trees, trusted user gestures, live model execution and pixel accuracy require other checks.

Run the repeatable native discovery/invocation check, with optional screenshots and logs:

```sh
pnpm run e2e:desktop:webmcp -- --artifacts /tmp/ax-desktop-ui-webmcp
pnpm run e2e:desktop:settings-webmcp -- --artifacts /tmp/ax-desktop-settings-webmcp
```

For portfolio identity and navigation, run:

```sh
node desktop/packages/electron/scripts/e2e/portfolio-identity-webmcp.mjs --artifacts /tmp/ax-portfolio-identity
```

This seeds two temporary projects with identical labels and session titles. Native WebMCP discovers distinct Needs You
actions and opens each project's fixture conversation. It also selects both conversations through the Live sidebar in
default and minimal display modes, checking that a session exposes one working action. DOM and screenshot checks verify
readable directory context at 800 and 600 CSS pixels, explicitly opening the responsive sidebar for its checks and
including a light-theme check. The narrower emulated viewport is a rendering stress case, not a
new native minimum-window-size promise. This is fixture-backed navigation verification, not concurrent provider execution.

For same-name project headers and scheduled definitions, run:

```sh
node desktop/packages/electron/scripts/e2e/project-schedule-targets-webmcp.mjs --artifacts /tmp/ax-project-schedule-targets
```

This uses two projects with the same label and tasks with the same title/ID. It verifies project collapse isolation,
opens each editor against a distinct fixture prompt, checks the new-task project picker, and records narrow/light/dark
rendering. Editors are cancelled and the final receipt checks that no scheduled definitions were written. Runtime project
IDs and Desktop registry IDs are separate; the journey joins their observed controls by directory.

For Projects Home cards and child actions, run:

```sh
node desktop/packages/electron/scripts/e2e/project-home-webmcp.mjs --artifacts /tmp/ax-project-home
```

This discovers same-name cards, checks project/draft selection and opens each project's attention conversation. It also
pins one project, reads the isolated settings file, reloads to check persistence and unpins it. Screenshots include
populated narrow/light/dark views. No prompt is submitted; profile changes stay within the harness's temporary directory.

For shortcut capture and keyboard navigation, run:

```sh
node desktop/packages/electron/scripts/e2e/shortcut-capture-webmcp.mjs --artifacts /tmp/ax-shortcut-capture
```

WebMCP discovers/focuses the recorder and invokes save/reset/overwrite. CDP delivers keyboard events to the foreground
test window. The journey checks Escape/Tab navigation, draft preservation, explicit Tab capture, conflict overwrite,
saved-profile reload and restoration of both affected bindings. It does not add a keypress tool to the developer adapter.

The smoke journey invokes all three native tools, opens Settings, filters its navigation through a WebMCP field fill,
restores it, verifies the DOM and checks CSP and renderer errors. The Settings audit inventories all 15 tabs and paged
controls, exercises select options, numeric editing/reset, reversible local preferences, shortcut search/focus and Hooks
error/retry, and captures light/dark/narrow-window views. External login, downloads, native dialogs, destructive actions
and all nested editors are not qualified by this audit. The client uses native `WebMCP.enable` / `WebMCP.invokeTool`; it does not call a JavaScript mock of the
provider. The matching Node client is in `desktop/packages/electron/scripts/e2e/ui-webmcp-client.mjs` for additional journeys.

Ctrl+C in the lab terminal (or quit its app) removes the temporary profile and stops that instance's processes. Normal
startup leaves these UI tools off, and packaged applications always disable them. Developers can explicitly set
`AX_CODE_DESKTOP_UI_WEBMCP=1` for their own unpackaged launch; that uses the launch's actual profile/runtime, so the isolated
lab is the default development command. Do not point browser tools at an unrelated running Desktop instance.

The nested configuration journey is available after build:

```sh
node desktop/packages/electron/scripts/e2e/config-editors-webmcp.mjs --artifacts /tmp/ax-config-editors
```

It uses the isolated profile to exercise scope labels, command selectors, required-template validation, agent numeric
steps/editing/clamping/clearing, and narrow control bounds. It does not submit a valid configuration save. For blur-based
validation, the journey brings its own window to the front and verifies `document.hasFocus()`: in an inactive Electron
window, `activeElement` alone can change without the expected blur events. Do not treat that state as proof that the
field's validation failed.

For deferred MCP configuration saves across two projects:

```sh
node desktop/packages/electron/scripts/e2e/mcp-save-webmcp.mjs --artifacts /tmp/ax-mcp-save
```

This journey intercepts every MCP configuration HTTP method before opening the page, seeds disabled remote servers
in memory, delays a save while native WebMCP selects another project, and verifies field/dirty-state readback after
completion. It also checks successful unchanged saves, project return values and populated narrow light/dark views.
The configuration writer receives no fixture mutation. This qualifies Desktop form handling, not actual disk writes,
MCP execution, OAuth or durable runtime concurrency. Never disable interception while fixture writes remain pending.

For edits made while creating an MCP server:

```sh
node desktop/packages/electron/scripts/e2e/mcp-create-webmcp.mjs --artifacts /tmp/ax-mcp-create
```

This fixture intercepts every MCP configuration HTTP method before opening Settings. It checks default/renamed creates,
newer URL edits surviving inventory refresh and draft handoff, exact follow-up update targets, unchanged clean creation,
and the translated unsaved notice. Name and scope stay fixed while creation is pending. Narrow light/dark captures
include the unobscured unsaved action row before submission; delivered wheel input sets up that viewport. The pending
configuration overlay is not accepted as visual proof of the controls behind it. Disabled remote `.invalid` fixture
servers never reach the real configuration writer, MCP execution or OAuth; the last values reside only in the harness's
in-memory inventory.

Snapshots include `documentFocused`; check it before qualifying focus/blur behavior and observe the actual result
after the action. An inactive document can change activeElement without dispatching blur/focusout. Page.bringToFront
alone may not activate a different Electron native window. The isolated comparison below uses the existing native
main-window focus command for setup/restoration; that command is not exposed by the WebMCP UI tools:

```sh
node desktop/packages/electron/scripts/e2e/numeric-focus-webmcp.mjs --artifacts /tmp/ax-numeric-focus
```

It compares foreground/background event delivery with numeric read-back, independently checks documentFocused against
the DOM, restores the unsaved draft and never submits a valid save. Historical failures without focus/event telemetry
remain insufficient to attribute a numeric validation bug.

For populated Hooks and same-name Settings project targets:

```sh
node desktop/packages/electron/scripts/e2e/hooks-targets-webmcp.mjs --artifacts /tmp/ax-hooks-targets
```

This isolated two-project journey checks path-bearing project choices, independent long-command expansion, scoped
refresh, retained content after a refresh error, retry and a completed late response from the previous project.
It captures wide/narrow and light/dark screenshots. It reads fixture Hooks data without executing commands or changing
trust/configuration. Project menu transitions are checked through the specific selector's expanded state.

For fixed Settings groups and Advanced discovery:

```sh
node desktop/packages/electron/scripts/e2e/settings-navigation-webmcp.mjs --artifacts /tmp/ax-settings-navigation
```

This journey checks group/item order through page changes, exact-group and response-style search, empty/clear states,
close/reopen and narrow light/dark layouts. It verifies that filtering does not redirect the selected page and captures
the Advanced Hooks/Behavior entries. It does not edit runtime behavior or activate hooks.

For the nested agent permission editor:

```sh
node desktop/packages/electron/scripts/e2e/agent-permissions-webmcp.mjs --artifacts /tmp/agent-permissions
```

This journey adds, edits and resets unsaved rule overrides, restores the draft's global default, verifies clean state and
checks custom-rule control bounds at 800px. It uses the isolated profile and never saves an agent configuration or changes
runtime permission policy.
