# Analysis routing and retirement contract v2

Status: Accepted for user-authorized implementation on 2026-10-18.
Supersedes the executable presentation contract in SPEC-2026-10-18-analysis-app-handoff-v1.md. Historical documents are retained.

- `ax-code-app` has no special renderer, event listener or execution semantics. Render it with the ordinary code block component in every author/streaming state.
- Only legacy configuration migration may recognize `streamlit`. Remove it from the active project-action type. A valid generated recipe becomes an opaque POSIX action with safely quoted entrypoint/interpreter and the selected fixed port (or ordinary default 8501), loopback/headless flags and no installation. Without an explicit interpreter, select an existing project `.venv`/`venv` Python, then system Python. Invalid metadata never becomes a command. Preserve the original stored command and preview settings if the recipe was edited or invalid.
- Conversion is pure; saving a converted action does not require retaining the legacy recipe. No filesystem or terminal mutation occurs on read. Generic actions start only through their existing user controls.
- Generic POSIX actions pin a drifted or unknown terminal cwd to their owning project in a safely quoted subshell.
- Remove Streamlit-specific statuses, token/progress payloads and setup controls. Generic readiness stays bound to the current terminal session. Preview close and process Stop remain separate user actions.
- AX BI is optional. Its unavailability cannot block static outputs or ordinary project execution. Runtime guidance uses existing authorized MCP discovery, dry-run previews and explicit write/upload authority.
- Verification: legacy conversion and roundtrip, malformed metadata, explicit interpreter/port quoting, custom commands, inert old fence, absence of auto-discovery, generic start/stop/readiness, full UI and workspace gates.
