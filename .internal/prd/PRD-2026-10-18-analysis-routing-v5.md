# Analysis routing v5: retire the dedicated Streamlit path

Status: Accepted for user-authorized implementation on 2026-10-18.
Supersedes the product path in analysis-app-handoff-v4 and Streamlit-project-run-v3; historical records remain unchanged.

AX Code keeps one-off analysis, Mermaid, static artifacts and ordinary project development. AX BI owns governed datasets, SQL, charts and dashboards through its existing MCP service. Desktop removes its dedicated Streamlit installer/bootstrap, recipe editor, discovery, progress protocol and assistant Run card. This does not remove general project actions, terminal, browser preview or support for developing a framework explicitly requested by a user.

Acceptance:
1. Historical `ax-code-app` fences render as inert ordinary code, with no execution event or Run card.
2. Existing saved recipes become generic project actions preserving identity, user-edited commands, interpreter, port and preview behavior. No installation, file deletion or server termination occurs during migration. Repeated load/save is stable.
3. New projects do not discover or offer Streamlit-specific actions. Obsolete UI, runtime helper, state and locale keys are removed. Generic POSIX-shell validation, readiness, duplicate-start and terminal cancellation protections remain.
4. Runtime guidance and AX BI MCP workflow are implemented in their owning repositories; static analysis never requires BI, Docker or credentials.
5. Full UI tests, typecheck, lint, locales, build and ownership checks pass; targeted behavior tests prove retirement and migration. Record peer commits and qualification limits.

No runtime/SDK pin, publication, updater identity, user data location or enterprise permission change is authorized by this implementation.
