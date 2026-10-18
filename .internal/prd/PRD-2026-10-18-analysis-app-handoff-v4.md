# Analysis output and app handoff v4

Status: Accepted for the user-authorized implementation on 2026-10-18 ("please finish the remaining").
Additive to Streamlit project run v3. No distribution or release approval is implied.

Users describe a result in ordinary language. The canonical AX Code analysis-output skill selects static artifacts for one-off analysis and Streamlit only for reusable inputs, filters, or parameterized tools. Desktop renders a completed assistant artifact as a clearly labeled Run control with the actual entrypoint visible. One click hands it to the existing project-action runner. Missing dependencies retain the explicit Prepare and run step. No Docker, terminal command editing, new agent loop, or automatic server start is required.

Acceptance: builtin skill discovery and explicit slash invocation; static versus interactive guidance; strict inert artifact parsing; only completed assistant text enables handoff; session/worktree-bound dispatch; stale sessions and projects cannot receive execution; existing saved interpreter/port settings survive; duplicate clicks do not launch twice; running app reopens; errors and setup remain recoverable. Malformed, partial, tool, user, and reasoning text never starts anything. The exact built-in skill and consumer are qualified together from source; published pins remain unchanged until release qualification.
