# Streamlit value and intent routing

Date: 2026-10-18. Product judgment informed by source and five requested CLI reviewers; not an adoption study or measured ROI ranking.

## What Aider actually does

[Aider's browser documentation](https://aider.chat/docs/usage/browser.html) describes an experimental browser interface launched with `aider --browser`. Its [main.py](https://github.com/Aider-AI/aider/blob/main/aider/main.py) checks the optional browser dependency, then starts packaged `gui.py` through Streamlit. [gui.py](https://github.com/Aider-AI/aider/blob/main/aider/gui.py) reuses the existing Coder and renders file selection, chat, streamed answers, diffs, and undo. The checked local reference has the same structure in `.internal/reference/aider/aider/{main,gui}.py`.

Borrow the single launch action, dependency check, and reuse of the existing coding engine. Aider is using Streamlit to implement its own coding interface; it is not implementing a generic project-app runner. AX Code Desktop already has native chat, supervision, terminal, and preview. A second chat frontend would add maintenance without resolving the user's problem. Aider's process-global cached Coder must not be transplanted into Desktop's project ownership model. Its application-specific magic and file-watcher flags are not universal defaults for users' apps.

The pre-existing reference README calls Aider terminal-only. That statement is incomplete; the user's unrelated modifications to that file were preserved. The correction is recorded here rather than replacing their changes.

## Highest-value uses

| Priority | Use | Value | Cost and limits |
| --- | --- | --- | --- |
| 1 | Reusable Python tools with parameters, file input, result download | Replaces repeated command editing with a form; useful for non-programmers using agent-created scripts | Needs Python dependencies and explicit handling of side effects |
| 1 | CSV/data exploration with filters, tables, and charts | Immediate visible result; the same app can analyze the next file | Data quality and analytical correctness still require verification |
| 2 | Model/evaluation demos and what-if comparisons | Convenient parameter controls and comparison tables | Credentials, cost, slow jobs, and reruns require deliberate handling |
| Low | One-off static chart or report | Static output is easier to export and share | Starting a server adds effort without useful interaction |
| Exclude | Another AX Code chat or supervision frontend | Duplicates existing product capabilities | Creates competing state and maintenance obligations |

The first two are examples of the same capability, not separate platform features. DeepSeek and Qwen put parameterized scripts first; GLM and MiniMax put data exploration first. Grok's completed compact discussion recommends routing by interaction needs. The useful consensus is the shared local execution path. Reviewer recommendations are not proof of user preferences. The user's estimated Docker share is treated as a design constraint, not measured telemetry; this implementation has no Docker dependency or container setup path.

## Skill, pipeline, or workflow?

Use an **intent-aware skill in the canonical AX Code runtime**, backed by a **deterministic Desktop execution workflow**. Do not make users choose an engine or workflow. Do not trigger a Streamlit server for every mention of a chart.

| User request | Suggested output | Streamlit run needed? |
| --- | --- | --- |
| “Analyze this CSV and show the monthly trend” | Verified findings plus an image, HTML chart, or report | Usually no |
| “Let me filter by region and month” | Interactive data explorer | Yes |
| “Make this script usable with a form” | Small local Python app | Yes |
| “Compare model results while changing parameters” | Evaluation app with explicit submission and caching | Often |
| “Export this chart for a presentation” | Standalone image or document | No |

Read-only verification of `../ax-code/packages/ax-code/src/tool/skill.ts` and `../ax-code/docs/reference/skills-and-plugins.md` confirms the runtime already exposes eligible skill descriptions and a skill-loading tool. This supports model-selected invocation when a task matches, subject to invocation policy and permissions; it is not a guaranteed keyword trigger. No sibling repository was changed.

Proposed skill behavior:

1. Choose the smallest useful output from the requested task. Prefer a static result unless interaction or repeated use provides value.
2. Use the existing agent to create project-owned files and declare dependencies using the project's existing convention. Prefer a conventional `streamlit_app.py` entrypoint for a new interactive tool.
3. Use forms for expensive or side-effecting work, cache expensive pure computations appropriately, and keep per-user interaction in session state. Do not put model credentials into generated prompts, action metadata, or logs.
4. Return the artifact and a short explanation. Desktop detects the app and offers Run; if preparation is required, the user chooses Prepare and run with the dependency source disclosed.
5. Keep Stop and reopening the preview available. Closing the preview does not stop the app. Nothing starts merely because a project is opened.

The skill and agent-to-Desktop artifact/run handoff are **proposed**, not installed or implemented by this Desktop change. An automatic handoff needs a reviewed canonical runtime contract and ownership decisions in the affected repositories. The completed work is the local project execution path. It does not create a second agent, require a model for every Run, or claim that all agents lack process execution capabilities.

## Alternatives and tradeoffs

- Static PNG/SVG/HTML/report: smallest learning curve for a single result; limited reusable controls. Default for one-off analysis.
- Project-local Streamlit: good for Python-native forms and data tools, but needs an environment and a live process. Reuse existing environments; provide explicit local setup rather than terminal instructions.
- Browser-only Streamlit Playground: no local installation and good for learning, but the official documentation calls it a limited version. It is not a general replacement for local project dependencies or filesystem integration.
- Universal ephemeral `uv --with streamlit`: useful for experiments, but layered packages can differ from a maintained project's locked environment. Not the default here.
- Rebuilding native Desktop in Streamlit: poor return for this problem; retain the existing React/Electron frontend and canonical runtime.

Measure first-use success without shell edits, actions until preview, repeat-use time, setup failures, and orphan-free Stop before expanding to templates or automatic handoff. The timings in the implementation receipt are local samples, not population benchmarks. Do not infer a higher competitive UI ranking from them.

## Primary references

- [Streamlit architecture](https://docs.streamlit.io/develop/concepts/architecture/architecture): local development runs Python backend and browser on the same computer.
- [Forms](https://docs.streamlit.io/develop/concepts/architecture/forms): batch inputs before execution.
- [Data editor](https://docs.streamlit.io/develop/api-reference/data/st.data_editor): interactive tabular editing.
- [Playground](https://docs.streamlit.io/get-started/installation/streamlit-playground): installation-free but limited browser version.
- [uv synchronization](https://docs.astral.sh/uv/concepts/projects/sync/): locking, syncing, and check behavior; `uv run --locked` is not an installation-free guarantee.

Requested reviewer receipts and dispositions: [review directory](../../reviews/streamlit-ease-of-use-2026-10-18/).
