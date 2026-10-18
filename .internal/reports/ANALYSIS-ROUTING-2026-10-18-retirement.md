# Analysis routing: retire dedicated Streamlit execution

Status: Implemented and source-qualified on 2026-10-18. This is not publication or installed-app qualification.
PRD: PRD-2026-10-18-analysis-routing-v5.md. Decisions: Desktop ADR-017, AX Code ADR-257, AX BI ADR-0007. Contract: SPEC-2026-10-18-analysis-routing-v2.md.

## Result and ownership

Desktop no longer offers a dedicated Streamlit recipe editor, Run/Prepare dialog, automatic Python-app discovery, Python provisioning/bootstrap, progress-token protocol or assistant application Run card/event. Historical ax-code-app fences are ordinary readable code in all authorship/streaming states. General project actions, terminal, explicit Stop, web preview and Mermaid remain available for arbitrary user-requested frameworks.

The canonical runtime skill prefers static/Mermaid outputs for one-off work, AX BI MCP for governed reusable datasets/SQL/charts/dashboards, and normal project development for custom applications. BI availability never blocks ordinary static analysis. The opt-in AX BI MCP template is disabled, uses an environment key reference, and preserves existing trust/auth/loopback admission. With no configured key, the disabled template makes no startup request.

AX BI adds no analytics engine or Python process manager. Its existing SDK provides a bounded multipart uploader using the current REST API, while discovery, query, preview and save stay on normal MCP tools. Existing external Streamlit catalog behavior is untouched. A live SDK notification Accept-header defect was reproduced and corrected in the BI peer commit.

## Compatibility and invariants

- Valid stored version-1 recipes become opaque generic actions, preserving IDs, names, explicitly edited commands, selected interpreter/port and preview fields. A recipe without a fixed port now uses the ordinary Streamlit default 8501; retired automatic free-port allocation is not retained. Without an explicit interpreter, the saved generic command selects an already-existing local environment or python3. It never provisions anything.
- Conversion is pure and repeated read/save is stable. Unknown/invalid metadata cannot become a generated command; the stored command remains readable. Existing user files are never deleted and existing processes are never stopped on configuration read/upgrade.
- Generic POSIX shell admission and readiness helpers remain framework-neutral. A reused terminal whose cwd drifted runs the command inside its owning project using a quoted subshell, preserving the user's interactive shell directory. Real sh/bash/zsh argv tests include quote/command-substitution characters in both directory and interpreter names.
- Duplicate starts, stale session/project cancellation, terminal replacement, explicit Stop and delayed-preview protections remain covered. Persisted terminal metadata cannot restore retired progress/run state or autostart a process.
- No updater identity, SDK pin, signed runtime pin, process permissions, release policy or runtime ownership changed. Historical accepted decisions/specifications remain intact; supersession is explicit in the new records and indexes.

## Cross-repository commits

| Repository | Candidate |
| --- | --- |
| AX Code | `04a7c2dbed6c02ff72b9b6687f3abc9ca5428e2e` — canonical routing, disabled MCP template and behavioral checks |
| AX BI | `66f71a858d967f7373887f3dc2f85ff65fdd9c59` — existing-interface upload/MCP improvements and disposable qualification |
| AX Code Desktop | The commit containing this report, based on `bfb5e3fe`, branch `refactor/analytics-bi-routing` |

All changes were made in isolated worktrees. Unrelated primary-checkout changes and AX BI's external application catalog were preserved. These are local commits; no merge, push, release or pin update is implied.

## Verification

| Check | Result |
| --- | --- |
| Full Desktop UI suite | 506 files, 3,296 tests passed |
| Desktop typecheck and lint | Passed across all workspace packages |
| Production Desktop build | Passed; existing large-chunk warnings remain |
| Ownership / IPC / pin / release boundaries | Passed |
| Locales | 14 locales, 4,902 keys, 63,726 translated entries passed; obsolete spelling exceptions removed |
| Native Mermaid regression | 39 render/export/ASCII/large-diagram checks plus interactions passed on macOS Electron |
| Runtime skill/template checks | 15 tests passed, including actual no-network disabled-template startup; typecheck, skill standard and structure passed |
| Runtime script suite | 422 passed, 96 skipped |
| BI SDK | 128 tests passed on Node 24.18.0; ESM/CJS/declaration builds passed; earlier 127-test suite also passed on Node 26.12.0 |
| BI Python | 90 MCP configuration, registration, API-key and RBAC tests passed; Ruff passed |
| Live source journey | Built upload binary, actual authorized web/MCP services and native AX Code MCP client; synthetic query total 850, unauthenticated 401, denied dataset access, dry-run without new charts/dashboards, then authorized draft save with correct public URL |

The reproducible verifier and sanitized receipt are in AX BI `.internal/reports/ax-code-analytics-20261018/`. It creates a fresh isolated metadata database and passes ephemeral credentials through child environments. All runtime proof/state lives in that fixture; servers stop after qualification. The planner used its deterministic profile-aware fallback, not an external model. This is not a provider-wide model routing study or rendered BI browser acceptance.

The existing BI Python virtualenv does not contain mypy, so no mypy pass is claimed. Windows, signed installation, hosted identity/SSO, release upgrade/rollback and published builtin/client availability remain outside this source-only change.

## Grok collaboration and disposition

The completed planning consultation is preserved in `.internal/reviews/analytics-routing-20261018/`. Adopted: reuse the existing MCP client, require real disposable integration evidence, keep migration pure/idempotent, and avoid a second config/status/preview CLI. The practical transfer helper is upload-only in AX BI's existing SDK. Rejected: moving PRDs outside internal records, which contradicts repository governance; interpreting unknown recipe versions as supported execution contracts.

The broad code review timed out after 180 seconds without output; a smaller follow-up timed out after 120 seconds without output. Neither is review approval. Their prompts and terminal receipts are retained. Completion relies on the recorded source checks, behavior tests and actual integration journey, with the qualifications above.
