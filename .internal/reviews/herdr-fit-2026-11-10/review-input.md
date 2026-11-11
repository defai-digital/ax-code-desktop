# AX Code Desktop and Herdr: independent design consultation

Date: 2026-11-10. This is research and advisory review, not implementation approval.
User request: assess the existing AX Code Desktop experience against Herdr, consult Claude Code Opus 5.5,
Grok CLI 4.7 and Muse CLI Wonder 1.0, then recommend our best fit rather than copying Herdr.

You receive the same curated evidence as the other reviewers. You have no tools, repository access, web access,
or delegation. Answer directly in English. Do not claim you inspected or executed anything yourself.
Distinguish observed implementation, inference, proposal, and unknown. Challenge the evidence and the framing.

## Product constraints

- Desktop owns portfolio UI, human-added project registry, desired state, exceptions and project-management UX.
- AX Code owns coding tools, sessions, goals, verification and worktrees. Consume its published SDK and signed runtime;
  do not create a second coding runtime or import sibling source.
- AX Agent owns durable manager workflows, approvals, leases and recovery. Accepted Desktop ADR-007 defers its production
  integration until a released versioned contract and consumer tests are available. This research has not established
  whether a newer AX Agent release satisfies that condition. A historical deferral is not proof of current absence.
- AX Trust owns enterprise policy, credentials, grants and audit. AX Telemetry owns observability.
- No automatic merge/release, permission expansion or increased budgets. Parallel writers require isolated worktrees.
- Boundary changes require proposed PRD/ADR/spec and acceptance before implementation. Research may propose alternatives.

## Current source baseline and scope

Desktop HEAD: 84d684f8c06f65dc15cae7b5495a94de56efa685; version 7.30.16.
Pinned runtime: 7.30.16. Pinned SDK: 2.6.69. Local runtime HEAD is newer; runtime facts below were checked against
the pinned v7.30.16 Git tag, commit 565368bcb237d7814ac7bf725a548565d85e1ccb, not inferred from its newer HEAD.
No application was launched for this research. Existing tests may be read; execution results will be reported separately.

### D1. Multiple providers/models already exist

`ui/src/types/multirun.ts`: each model selection contains providerID, modelID, optional variant/displayName.
A MultiRunGroup contains one prompt and several models. CreateMultiRunParams has multiple groups, one shared agent,
optional base branch, isolation flag, files and setup commands.

`ui/src/stores/useMultiRunStore.ts`: validates 1-5 models per group; Git runs default to separate worktrees unless
isolateRuns=false; non-Git runs share the directory. Creates one AX Code session per lane, persists metadata.multiRun,
then dispatches prompts concurrently with each lane's providerID/modelID/variant and the shared agent selection.
Reports created session IDs separately from startedRunCount. Sessions/worktrees are created in a loop; prompt sends
use Promise.all. This is source-level capability, not live provider concurrency qualification.

`components/multirun/MultiRunLauncher.tsx`: user supplies grouped prompts and models; one agent selector applies to the
launch. `ModelMultiSelect.tsx` offers provider/model selection, duplicate model instances and variants.
The agent selector refers to an AX Code agent definition, not a Claude Code/Grok/Muse executable.

### D2. Multi-model consultation is also already exposed

`lib/workMode.ts` re-exports the public SDK WorkMode contract; Agent is the new-chat default. Council and Arena route
through existing runtime slash commands, with a compatibility fallback prompt if a command is unavailable.
`components/chat/WorkModeSelector.tsx` is mounted in ChatInput-impl.tsx.
Pinned runtime council.ts fans out structured multi-provider reviews with policy, budgets, preflight and member errors.
Pinned arena.ts supports plan comparison and an implement mode using isolated worktrees and verification-first ranking.
This does not mean those features are discoverable, understood or live-qualified in Desktop.

### D3. Runtime subagent coordination already exists

Pinned AX Code tools include task, task_parallel, waitfor, list_background_tasks and message_background_task.
task creates parent-linked child sessions; optional background work is queued and has a completion handoff.
task-model-pool.ts resolves approved agents.model_pool aliases to provider/model; arbitrary unknown aliases are rejected.
Precedence is explicit alias/primary, agent model pin, pool default, then parent model.
task_parallel contains per-writer worktree creation and cleanup. These are AX Code agents using model providers,
not proof of a native Claude Code, Grok CLI or Muse CLI integration.
A targeted search of Desktop settings found no dedicated agents.model_pool editor. That is a bounded search finding,
not proof that configuration cannot be edited through other surfaces.

### D4. Attention, children and evidence already have a product model

`hooks/useSupervisionRows.ts` builds one row per root session across projects, rolls loaded child states up, and
publishes shared state for titlebar/sidebar/Portfolio. `ChildSessionSummary` currently has ID, title, state, updatedAt;
it does not expose role, model/provider, assignment, last handoff, worktree or revision in that summary type.
`SupervisionRow` includes project/directory identity, child list, goal, checks, PR, activity and multiRun identity.
`sessionState.ts` distinguishes permission/question/goal, error/review, running/idle. Permission/question win;
tree running takes precedence over a finished child's error/review; details retain individual child state.
The current summary soft limit is four high-touch sessions, a UI hint rather than an execution cap.

Mission Control already has project grouping, facets, bulk UI, child links, activity preview, verification and PR details.
Workspace and Portfolio are primary areas. Session grid and pop-outs also exist. Earlier October reviews that called
batch actions or a ranked palette unimplemented must not be copied forward without checking current code.
`SinceYouLeftStrip.tsx` displays changed state, diff counts, hook-block counts, age and review action.

### D5. Comparing/fusing is not the same as integrating code

`MultiRunCompare.tsx` shows lane cards with state, diff counts, age, permission/question cards, Open, Review changes
and Fuse results. `MultiRunFusionDialog.tsx` collects the last assistant text from source sessions, starts a new fusion
session with selected provider/model/agent, and submits those texts with fusion instructions.
It is text synthesis; the inspected path is not a branch merge, a patch integration receipt or independent verification.
Source selection in this dialog still uses parsed group titles and project resolution; comparison elsewhere prefers
metadata.multiRun identity. Repeated launches/renames deserve a bounded behavioral investigation, not an unproven bug claim.

### D6. Runtime lifetime is tied to Desktop shutdown in supervised mode

Electron main.js stopBackgroundServices stops the web server and runtimeSupervision.stop during real application quit.
Closing a view/window is not necessarily quitting. External runtime connections have different ownership.
There is no basis here to promise Herdr-style execution survival after Desktop quits or after machine restart.
Saved session history, queue recovery and continued original process execution must be distinguished.

### D7. Existing assurance and its limits

Tests next to MultiRun store, fusion, child rows, verification and state ranking cover behavioral branches.
The November workspace report records fixture-backed native development UI qualification and screenshot evidence;
it explicitly excludes live-model throughput and user-study claims. Existing six-task dispatch evidence uses a mocked
prompt boundary and excludes real providers, MCP/tools and full cancellation. Do not label it live multi-agent proof.

## Fresh primary-source research

These are official documentation observations retrieved on 2026-11-10, not executed competitor qualification.

### H1. Herdr App/core and Herdr TUI are separate

https://herdr.dev/ states the new native App uses herdr-core, while original TUI uses its own server and agents do not
appear across them. App/core runs real terminal processes; clients can close while the runtime continues.
OSC 7501 status reporting is required for semantic agent status in the App. A process lacking reporting still runs.
The App FAQ distinguishes reboot recovery from continuing the original program.

### H2. Cooperation and reach

https://herdr.dev/core/ documents hc run/send/wait/read/attach, helper-parent relationships and reports, and SSH machines.
It supports different coding CLIs by running their programs. Providers/models are selected by those programs.
Parent/child process lifecycle and terminal status are not AX goal verification or durable cross-project manager contracts.

### H3. Original TUI detection and automation

https://herdr.dev/tui/docs/agents/ documents screen-manifest detection plus integration-reported state; unknown screen
shapes can fall back to idle. Muse can report its own state; several other CLI kinds are recognized.
https://herdr.dev/tui/docs/agent-automation/ documents launching named agents, prompt/wait/read operations and argument
passthrough. A wait observes lifecycle, not an identified turn's correctness.
https://herdr.dev/tui/docs/session-state/ distinguishes detach, restart, layout, optional screen history and native resume.
Do not describe TUI screen scraping as a limitation of the newer App/core status protocol.

### O1. Adjacent product check

https://www.onorca.dev/docs describes an agent/worktree/browser workspace and serious diff review.
https://www.onorca.dev/docs/cli/orchestration documents programmatic orchestration. These make worktree isolation,
parallel agents and a browser insufficient as claims of unique AX differentiation.

## Questions for your independent review

Keep the answer under 1,300 words, with concrete recommendations rather than a feature wishlist.

1. What user job should AX Code Desktop prioritize? Distinguish multi-model, multi-agent, multi-harness and durable
   orchestration. Which apparent Herdr gaps are already implemented, which are product-flow gaps, and which need producers?
2. Compare at least three alternatives: improve AX-native team workflows; add arbitrary CLI/PTY hosting; integrate external
   agents through a canonical bounded adapter owned by an appropriate existing producer. Recommend a fit and state what
   user evidence would change it. Do not assume refusal of external agents or their universal necessity.
3. Propose a minimal workflow that uses existing surfaces. Cover assignment, review/handoff, model/provider visibility,
   failure/retry/cancel, worktree ownership and integration. Avoid automatic consensus/approval/merge.
4. Separate the first Desktop-only increment from AX Code/SDK work, AX Agent contract work and optional external-agent work.
   Name specific fields/contracts only as proposals when not verified. Do not invent existing APIs.
5. Identify the strongest argument against your own recommendation, the highest-risk assumption, and a falsifiable pilot
   with outcomes, cost and human attention measures. Explain how to retain a minority reviewer objection.
6. Identify any concrete correctness issue in the evidence that deserves a focused follow-up before new features.

This is advisory input. The coordinating reviewer will independently check claims, preserve disagreement and write a
proposed decision; model agreement is not approval or proof.
