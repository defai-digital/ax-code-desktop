# ADR-016: Analysis artifacts use the existing skill and project runner

Status: Accepted for the user-authorized implementation on 2026-10-18.
PRD: PRD-2026-10-18-analysis-app-handoff-v4.md.

AX Code owns the builtin analysis-output skill and agent-generated project files. AX Code Desktop owns rendering a declarative app artifact and the existing terminal-backed project action. No runtime fork, new tool, SDK schema, server route, process supervisor, background workflow, or permission grant is added. The skill follows ADR-088 invocation restrictions. Invocation is model-selected, not a keyword promise; explicit /analysis-output is available.

Use a versioned Markdown code fence as a backwards-compatible presentation contract. An old consumer shows ordinary text. The payload identifies only an engine and project-relative Python file; it cannot supply commands, interpreters, ports, environment variables, URLs, or installation authority. Only a user click in finalized assistant text requests execution, bound to its session and resolved working directory. Existing setup/run/stop and permission semantics remain in effect. Saved user execution settings take precedence over artifact defaults.

The paired decisions are Desktop ADR-016 and AX Code ADR-256. Specification: SPEC-2026-10-18-analysis-app-handoff-v1.md. Distribution is through the runtime's existing builtin-skill bundle and Desktop build, with exact signed runtime pins qualified separately. Rolling back either side leaves readable Markdown and the manual project runner. No copying runtime skills into Desktop or hidden user configuration.
