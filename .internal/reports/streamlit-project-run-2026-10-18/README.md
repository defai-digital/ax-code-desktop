# Streamlit project execution: implementation and evidence

Date: 2026-10-18. Base: `f736cc54`. Scope authorized by the user's request to research, discuss with the supplied LLM resources, plan, and implement a simpler Streamlit execution workflow. The additive [v3 PRD](../../prd/PRD-2026-10-18-streamlit-project-run-v3.md) preserves the accepted v2. This is local source work, not publication, installation, or updater qualification.

## User flow

For a project with one conventional Streamlit entrypoint, Start Preview detects and runs it. Alternatively, choose **Run Streamlit app** in the project action menu, select the entry file, and Run. Python and port are automatic; explicit overrides are under Advanced options. The choice is remembered without a separate settings Save step.

If setup is needed, a separate **Prepare and run** action explains the dependency source. It prepares a local environment using `uv.lock`, `requirements.txt`, or pinned Streamlit 1.66.0 for a manifest-less script. Normal Run never creates environments or installs packages. Returning to the same app reuses its saved action; an active app opens its preview with a separate Stop control.

The launcher uses the existing terminal owner and existing preview. No container engine, additional coding runtime, model call, or background service is added. A full local Streamlit app still needs a Python process. Closing the preview keeps the process running; Stop acts on the owning terminal.

## Implementation

- Versioned structured recipe metadata survives configuration sanitization. Existing custom commands remain opaque; editing a recipe's command converts it to a custom action.
- Root candidate discovery checks `streamlit_app.py`, `app.py`, and `main.py` with a Streamlit import. Multiple candidates open a choice; helpers and multipage files are not recursively treated as entrypoints.
- Discovery preserves an existing action's identity, shell requirement, expected URL, and readiness condition. It no longer reconstructs an incomplete generic action.
- Readiness is tied to the current run token, owning terminal, selected automatic port, and Streamlit startup output. Setup can outlast the normal preview timeout. Preparation, setup-required, launch, and errors are distinct states.
- The bootstrap selects a project-local interpreter or an explicit advanced override. Locked uv normal runs use a read-only check; setup uses locked sync with Python downloads disabled. Requirements setup uses the selected local Python and an explicit local install prefix. Unsupported conventions receive guidance instead of a guessed installer.
- Invalid config shape, missing Python/file/uv, broken environments, installation failure, and fixed-port collisions are surfaced. No existing environment is deleted. Available-port selection happens on the execution host; the subsequent bind can still race.
- Real PTY testing exposed dropped large command input. The source is compressed for transport and sent in bounded bursts with cancellation/session checks. The helper replaces itself with Streamlit; it does not become another process supervisor.
- All 14 locales contain the new messages. Qwen supplied translations, followed by key/placeholder validation and review of representative translations; there was no professional linguistic certification.

## Verification

See [validation.json](validation.json) and [source-inventory.json](source-inventory.json) for the final candidate checks and file hashes.

- Repository typecheck, lint, full tests, Desktop build, locale check, and boundary/release contracts.
- React regression tests cover setup consent, slow preparation, split/current-token readiness, discovery parity, repeated starts, retries, and failed configuration persistence. An old assertion that searched source text for a particular cleanup variable was replaced with an actual repeated-click/exit/retry behavior test.
- [Real Python receipt](runner-receipt.json): fresh local setup, repeat without installation, base URL path, two projects, occupied port preservation, Stop, requirements setup, locked uv setup/repeat, and stale-lock refusal without rewriting the lock.
- [Real PTY receipt](pty-receipt.json): Bash and Zsh consume the generated command and report setup-required without creating an environment.
- [Native preview receipt](native/receipt.json): actual DesktopBrowserPane in Electron on macOS, widgets, forms, incremental streaming, upload/download bytes, reload, two projects, port collision, restart/reconnect, hiding the preview, and offline recovery. [Screenshot](native/alpha.png). The preview uses the existing sandboxed webview policy; this is not the Agent Browser. The shared browser cookie partition is unchanged and is not project credential isolation.

The native harness exercises the real runner and preview. The launcher state machine is exercised by React integration tests and the terminal command by real PTYs; this is not a signed installed-app end-to-end receipt. Windows shells, Linux native packaging, remote port forwarding, cross-platform installers, and signed upgrade/rollback are not qualified here.

An initial full suite had a Vitest worker teardown error despite passing cases; the retry completed. An early native harness click raced widget creation, so it now waits for an enabled button. A subsequent restart exposed the port-probe TIME_WAIT issue; `SO_REUSEADDR` fixed that while the occupied-listener test remained rejecting. Those failed receipts are retained, not counted as passing evidence.

## Review and research

[Aider and value research](RESEARCH.md) explains the recommendation: use an intent-aware canonical skill to choose static output versus an interactive app; use deterministic Desktop execution for the app. Static charts do not need a Streamlit server. The skill and automatic agent-to-Desktop run handoff are proposed, not installed by this change.

Grok CLI and AX Code DeepSeek, Qwen, GLM, and MiniMax all supplied substantive workflow advice. The corrected value discussion includes four AX Code models and a compact Grok response. DeepSeek's source review produced several reproduced fixes; a later broad Grok implementation review timed out without output and is unavailable, not approval. [Dispositions](../../reviews/streamlit-ease-of-use-2026-10-18/review-disposition.json) distinguish adopted, rejected, and independently discovered findings. No user adoption percentages or higher competitive rank are claimed.

## Reproduce

```sh
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run check:locales
pnpm run check:boundaries
node .internal/reports/streamlit-project-run-2026-10-18/verify-pty.mjs
python3 .internal/reports/streamlit-project-run-2026-10-18/verify-runner.py
AX_PREVIEW_FIXTURE=1 node .internal/reports/streamlit-project-run-2026-10-18/harness/build.mjs
AX_STREAMLIT_PYTHON=/absolute/fixture/.venv/bin/python AX_STREAMLIT_EVIDENCE=/tmp/ax-streamlit-native pnpm --filter @ax-code/electron exec electron "$PWD/.internal/reports/streamlit-project-run-2026-10-18/harness/streamlit-smoke.cjs"
```

The Python qualification script uses an installed `/opt/homebrew/bin/python3.12` and uv in disposable temporary projects. It downloads test dependencies only inside those projects. The fixture location is recorded in the receipt. The unrelated `.internal/reference/README.md` changes remain outside this implementation.
