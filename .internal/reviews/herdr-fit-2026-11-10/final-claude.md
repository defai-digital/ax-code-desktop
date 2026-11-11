## Retractions

I retract three earlier claims:
- **"External harnesses are absent."** Four CLI bridges ship in SDK 2.6.69, are wired through ProvidersPage, and are implemented in runtime v7.30.16.
- **"Subscription support needs a new adapter."** The bridges already reuse local vendor login with an AX marker.
- **Any implied need for a terminal multiplexer, or for a new partial-start warning.** PTY hosting and the plannedRunCount − startedRunCount toast already exist.

I also retract any description of these bridges as model-API-only or read-only.

The revised recommendation is now the best fit: strengthen and qualify the existing paths rather than build new ones. My support is conditional on the permission objection below. "Exists" is not "qualified."

## Smallest useful first slice

1. **Fix the confirmed fusion identity defect.** Select sources by stable run or member identity, not by title slug or representative name. Promote the two reproduced probes to permanent regression tests.
2. **Record qualification receipts for one bridge.** For claude-code, capture the exact CLI version, the requested model, and the last-observed model.
3. **Show execution kind and observed model in existing run surfaces.** Prefer AssistantMessage fields. MultiRun metadata lacks variant, so state that gap rather than infer it.

## Acceptance journey

1. In Desktop ProvidersPage, choose "Use CLI provider" for claude-code. Confirm the config reloads.
2. Start a Council or Arena task in a dedicated worktree with three members: an AX-native model, the claude-code bridge, and a second member that is forced to fail or time out.
3. Cancel one in-flight CLI member.

Expected results:
- The cancelled member's process tree is gone, verified at OS level, not just in UI state.
- The failed member shows its individual state without paging the user per error. The partial-start toast fires only if start actually failed.
- Each lane shows execution kind "CLI bridge," the configured model, and the observed model.
- File changes are confined to the worktree, checked by diffing outside it.
- Fusion cites exactly the surviving members' sources.
- Dissent from the non-fused member remains visible.

## Strongest remaining objection

Native CLI tools run under vendor permission semantics, not AX's.
- Default definitions do not disable vendor tools.
- Muse runs with `--approval-mode never --disable-approval --trust-workspace`.
- Setting the working directory is not a sandbox. A worktree boundary is a convention unless something enforces it.

In Council or Arena, several bridges could edit or execute concurrently. AX would have no approval gate and no tool-call provenance beyond parsed output.

The one-shot design adds risk:
- Flattened history drops vendor-side tool state.
- Background jobs die silently when the turn's process exits.
- A user may read a "completed" turn as completed work.

**Producer owner:** the ax-code runtime's `provider/cli` module (`config.ts`, `cli-language-model.ts`, `prompt.ts`) owns:
- the permission and flag mapping,
- lifecycle and cancellation,
- which output is parsed into provenance.

Desktop is a consumer and should display what the runtime declares, not invent guarantees. Vendor CLIs own actual tool behavior and can change it between versions. That is why receipts need exact versions.

Before multi-agent write workflows use the bridges, the runtime should declare a per-bridge capability and permission profile, and Desktop should surface it. Persistent sessions, detached execution and ACP stay separately gated, as you proposed.

## Uncertainties

- I don't know whether the Desktop build under review actually pins runtime v7.30.16. HEAD differences could change the flags.
- The Grok result (requested grok-4.7, observed grok-4.7-build) shows why configured and observed models must be distinct fields.
- The direct-CLI consultations prove nothing about the AX bridge path.
