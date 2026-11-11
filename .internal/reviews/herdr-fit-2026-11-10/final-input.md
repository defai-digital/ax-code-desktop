# Final correction: the existing external CLI integration changes the fit

Answer in English, directly, at most 450 words. No tools, delegation, or approval. This is a final correction to the
two independent/challenge consultations. Do not assume an untested product journey passed.

The coordinator found material evidence omitted from the first packet and wants you to reconsider rather than
preserve a mistaken consensus:

1. Installed SDK 2.6.69 public provider-connect contract lists bundled CLI provider IDs:
   claude-code, codex-cli, grok-build-cli, muse-cli. The Desktop ProvidersPage has handleUseCliProvider, saves the CLI
   marker through the existing provider auth flow and reloads configuration. docs/providers.mdx explicitly advertises
   local CLI provider bridges. Therefore "external harnesses absent" and "subscription support needs a new adapter"
   were overbroad conclusions. Ordinary raw PTY terminal hosting also already exists.
2. Verified against PINNED runtime v7.30.16 (565368bc), not its newer HEAD:
   packages/ax-code/src/provider/cli/config.ts maps those providers to real claude/codex/grok/muse executables and output
   parsers. Claude uses --print --verbose --output-format stream-json, Codex uses exec --json, Grok uses --prompt-file,
   Muse uses exec --json with --approval-mode never --disable-approval --trust-workspace and --workspace.
   These defaults are existing implementation facts, not authorization to copy them into new workflows.
3. cli-language-model.ts builds the CLI command with --model when selecting a concrete model, sets the current AX
   instance working directory and sanitized environment, parses output, propagates cancellation and has timeout/process
   cleanup. prompt.ts flattens AX conversation history into a per-turn prompt, includes CLI web-search guidance, and
   explicitly warns that each CLI process is ONE-SHOT: background jobs die when the turn's process exits and notifications
   cannot arrive across turns. Native CLI tools are not globally disabled in these default definitions. Therefore it is
   also wrong to describe these as strictly model-API-only or universally read-only bridges.
4. supported-providers.md at the same pinned tag states the CLI bridges reuse local vendor login/session, with a local
   marker in AX Code. native-models.ts reads CLI model metadata caches. This is existing integration, not fresh proof
   every currently installed CLI version/model works end-to-end through Desktop.
5. Live direct consultations succeeded for Claude Code claude-opus-5-5, Grok requested grok-4.7 (receipt reports
   grok-4.7-build), and Muse muse-wonder-1.0, using tools-disabled consultation commands. They establish direct CLI
   feasibility only; they do NOT qualify the existing AX bridge, production permission mapping, or Desktop journeys.
6. Mounted-component identity probes now REPRODUCED the fusion findings: existing seven fixture tests pass; a test
   expecting another metadata group with the same title slug to be excluded gets 3 sources instead of 2; a renamed
   representative with intact metadata gets 0 sources instead of 2. Product code was not modified; probes were temporary
   and removed, with script/log/receipt saved. This is a confirmed source-selection defect under mocked-store conditions.
7. MultiRunLauncher ALREADY computes plannedRunCount minus startedRunCount and shows a partial-start error toast. Do
   not recommend adding the already-existing aggregate warning as a missing feature. Per-lane persistent receipts and
   accepted-send versus actual-execution visibility remain distinct possible improvements.
8. SDK AssistantMessage already has actual provider/model/agent/variant/path and tokens; model_pool is already in Config.
   MultiRun metadata has no variant. Running-parent rollup intentionally preserves individual child state without paging
   the user for every child error. ACP is a possible interoperability option, not proof all these CLIs implement it, and
   neither capability negotiation nor cancellation notification guarantees durable recovery or process-tree termination.

Revised candidate: strengthen the EXISTING AX-native and CLI-bridge execution paths as one task-first collaboration
experience. First fix identity and qualify the existing bridges with exact CLI versions/models, Council/Arena/task pool
selection, partial member failures, cancel/timeout and worktree boundaries. Expose execution kind (API/local model/CLI
bridge/manual terminal), configured vs last-observed model and lifecycle limits in existing surfaces. Reuse producer-owned
admission/verification and retain independent dissent. Evaluate persistent native-agent sessions, reliable native tool/
approval provenance and detached execution only as separately gated evolutions of canonical producer contracts, after
matched-task user evidence. Do not build a new provider adapter or terminal multiplexer by default.

Please state:
- What you retract after this evidence, and whether the revised recommendation is now the best fit.
- The smallest useful first slice and one concrete end-to-end acceptance journey through existing CLI bridges.
- Your strongest remaining objection, especially around native CLI tools/permissions and one-shot versus persistent
  session semantics. Identify the producer owner; do not declare this safe solely because it already exists.

No consensus or invented numerical success threshold is required.
