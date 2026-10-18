# Streamlit project execution v3

Status: Authorized for implementation by the user's 2026-10-18 request to research alternatives with Grok CLI and AX Code DeepSeek, Qwen, GLM, and MiniMax, select the least learning and human effort, then plan and implement the improvement.

This is additive to supervision-usability-v2-streamlit-preview. It changes the Streamlit execution workflow, not the desktop framework or canonical coding runtime. The accepted v2 remains unchanged. Evidence and reviewer dispositions belong in `.internal/reviews/streamlit-ease-of-use-2026-10-18/` and a corresponding implementation report.

## Decision

Provide a deterministic project-aware Run workflow using existing project actions, terminal ownership, and ordinary preview. Resolve the app and project environment, offer an explicit project-isolated setup when needed, then run. A repeated run must not require a prompt, shell command, interpreter path, port, or separate save step under supported project conventions.

| Method | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Ask the existing coding agent every time | Natural-language intent; handles unusual repositories | Repeat behavior varies; no verified Desktop-owned persistent-launch agent contract | Agent may prepare project dependencies; it is not the execution controller |
| Project-aware Run with explicit Setup and run | Repeatable; reuses project dependencies and existing process owner | Requires bounded detection and actionable failures | Implement |
| Always use ephemeral `uv --with streamlit` | Convenient for small experiments | Layered dependencies may conflict with project constraints; not the project environment | Not the maintained-project default |
| Docker or hosted app | Useful where already part of project operations | Extra infrastructure, image/volume/network or hosting setup | Existing custom actions/URLs remain available; not required |

The five corrected workflow reviews all recommend the project-aware approach. Suggestions to auto-run on project open, kill an existing process on duplicate clicks/project switches, reverse-parse arbitrary commands, silently rewrite locks, or treat `uv run --locked` as installation-free are rejected. Model agreement is advisory, not user-testing evidence.

## Requirements

1. A user can invoke Streamlit from the existing project action area without editing a shell command or visiting a separate settings Save action. Read-only candidate discovery checks bounded conventional entrypoints; it does not execute the app. Ambiguity requires a file choice. A user-selected relative file is remembered in additive, versioned recipe metadata. Existing custom commands remain opaque and functional.
2. Normal Run never installs packages, creates an environment, or rewrites a dependency manifest/lock. Prefer the project's environment and declared dependency workflow over global packages. Support existing project environments, locked uv projects, requirements-based projects, and explicitly prepared simple Streamlit scripts. Do not infer a package-manager recipe from arbitrary imports or treat all multipage files as independent apps.
3. Setup and run is a separate explicit operation, explaining the project-local environment and dependency source. A locked uv project uses locked synchronization; requirements projects use their requirements. A manifest-less simple script can explicitly prepare a project-local environment with a bounded Streamlit version. Respect existing environments; never install into global Python, delete an existing environment, silently change installers, or change an existing lock. Unsupported project conventions and missing Python/uv receive specific guidance rather than an invented setup.
4. Run/setup commands execute on the project's terminal host. Reuse the existing terminal/process lifetime, cancellation, Stop, and ordinary preview; no new background supervisor or coding runtime. Nothing starts on project open. Repeated activation and project switching cannot target another project or restart/kill unrelated processes. Closing preview keeps the app running; opening it again does not restart it.
5. Default port selection is automatic on the execution host, with a fixed-port advanced override. An available port is only a hint until Streamlit binds. Readiness must come from the current run's startup output, not command echo, an unrelated URL, or a stale terminal. Preserve loopback/headless operation and Streamlit CORS/XSRF behavior; account for the app base URL path.
6. Surface preparation, setup-required, launch, and failure information on the owning action. Missing Python, missing Streamlit, missing file, missing uv, invalid/stale lock, failed installation, unsupported configuration, and busy fixed port must not all become a generic missing-URL message. Preparation may take longer than the existing 15-second preview wait; a timeout is not proof that installation failed. Keep terminal output accessible.
7. Direct and auto-discovered launches preserve the same identity, recipe, shell, readiness and preview behavior. Do not reconstruct a reduced generic action that discards fields. Persist user choices for repeat runs, but never persist a standing permission to install dependencies on future normal runs.
8. Keep shipped locales complete. Retain the existing supported POSIX shell scope; native macOS evidence does not establish Windows support.

## Implementation sequence

1. Add versioned recipe metadata and an execution-host project runner with read-only normal-run preflight and explicit setup. Cover selection, dependency source, lock safety, quoting, cancellation and failure cases using disposable projects.
2. Connect conventional app discovery and direct Streamlit execution to the existing project-action owner; preserve full discovered actions. Merge first-run choice persistence into execution and expose preparation/recovery from the owning action.
3. Validate a ready environment, first setup, repeat run without installation, two-project automatic ports, fixed-port conflict, offline/setup failure, cancellation, and stale project/terminal output. Run relevant unit/integration tests and the repository checks. Record actual native boundaries.

## Acceptance

- A conventional ready project runs and opens preview without typed interpreter/port/command fields; a returning user does not recreate configuration.
- A requirements project with no environment needs one explicit setup operation, installs into its project environment, then runs; normal repeat Run makes no install request.
- Locked uv setup does not change `uv.lock`; missing tooling/stale locks remain actionable failures. Generic shell commands are never reverse-parsed into recipes.
- A simple app without a manifest can explicitly prepare Streamlit locally; arbitrary missing application dependencies are not guessed from import names.
- Duplicate activation, switching projects, reopening preview, cancelling setup, and Stop preserve ownership. Concurrent projects use distinct available ports; a conflict never kills its holder.
- The native preview's already-qualified widget and upload/download behavior remains; execution-workflow evidence is added separately. No unsupported native platform, installation, or release claim is made.

## Primary research

- [Streamlit installation](https://docs.streamlit.io/get-started/installation/command-line): project virtual environments and module invocation.
- [Streamlit run](https://docs.streamlit.io/develop/api-reference/cli/run): explicit entrypoints and multipage router distinction.
- [Streamlit configuration](https://docs.streamlit.io/develop/concepts/configuration/options): CLI precedence over project configuration.
- [uv synchronization](https://docs.astral.sh/uv/concepts/projects/sync/): normal `uv run` may synchronize; locked operation preserves the lockfile, not the environment.
- [uv CLI](https://docs.astral.sh/uv/reference/cli/): ephemeral dependencies and environment check options. Locally inspected uv 0.12.2 help confirms `uv sync --check` and `--locked`.
