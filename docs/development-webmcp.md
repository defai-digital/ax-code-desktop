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

For the nested agent permission editor:

```sh
node desktop/packages/electron/scripts/e2e/agent-permissions-webmcp.mjs --artifacts /tmp/agent-permissions
```

This journey adds, edits and resets unsaved rule overrides, restores the draft's global default, verifies clean state and
checks custom-rule control bounds at 800px. It uses the isolated profile and never saves an agent configuration or changes
runtime permission policy.
