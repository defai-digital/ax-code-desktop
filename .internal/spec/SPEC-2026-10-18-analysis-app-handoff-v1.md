# Analysis app handoff v1

Status: Accepted for implementation on 2026-10-18 under paired ADR-016 / ADR-256.

After writing and checking an interactive app, the runtime skill emits exactly:

```ax-code-app
{"version":1,"kind":"streamlit","entrypoint":"streamlit_app.py"}
```

The JSON object is limited to these three keys and 2048 characters. Entrypoint is a nonempty relative POSIX path ending .py, at most 1000 characters; reject absolute paths, empty/dot/parent components, backslashes, control characters, URI/drive syntax and leading-option components. No shell command or setup flag is accepted. No artifact for a static chart. Existing files and dependencies must be preserved. CLI users receive a normal file link and local execution instructions without a fabricated running URL.

Desktop recognizes the fence only in finalized nonstreaming assistant text carrying a session identity. It resolves the source session's directory/worktree; no fallback to an unrelated active project. The button requests a cancelable in-process event with session ID, resolved directory and parsed artifact. A matching mounted project-action controller claims it synchronously once. It rechecks session, directory, mount state after asynchronous config reads. It reuses a saved managed action for that entrypoint, including advanced settings; otherwise it creates a managed recipe with automatic local Python and port. Running apps reopen, preparation is not duplicated, setup-required and failed runs reopen recovery. No listener means a visible error, not a claimed launch.

Runner realpath containment and file existence are the final filesystem guard, including symlinks; existing shell argument quoting applies. Artifact reception never installs or starts anything. Setup is authorized only by the existing preparation control. Chat payload is inert untrusted data, not a permission source. Runtime permissions and managed invocation policies remain authoritative.

Validate parser rejection cases, renderer role/completion gates, source-session/worktree binding, controller single claim and stale async cancellation, saved-action preservation, ready reopen, setup recovery and existing launch lifecycle. Verify runtime builtin discovery, model eligibility, manual command exposure and packaging scan. Source integration qualification is separate from model routing quality and signed installed-app release evidence.
