# Runtime search path and automatic default model

Status: Implemented and locally validated; not released.
Authority: Maintainer request on 2026-10-23 to review, plan, implement, test and commit the fix for a project that silently ran on the `claude-code` provider while failing with `claude CLI not found in PATH`.
Relation: Extends the model-download environment rule in [Reliable model download contract](SPEC-2026-10-19-reliable-model-downloads.md) item 4. That accepted text is not edited; this record widens the forwarded set by exactly one variable.

## Evidence

A packaged app launched from the Dock supervised the runtime with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. `claude` lives in `/opt/homebrew/bin`, so the `claude-code` provider failed three consecutive turns and the session stopped. The same runtime also could not see Homebrew `node` or `git` for any tool it spawned. The web server process already merged the login-shell PATH; the runtime did not.

Separately, a project directory with no stored selection and no usable configured default fell through to the first provider in list order that had any selectable model. That is `claude-code`, an external program whose presence Desktop cannot observe from the provider list.

## Contract

1. Electron main forwards exactly one additional login-shell variable to the main-supervised runtime: `PATH`. All other shell variables stay out of main and out of the runtime unless they are on the model-download allowlist.
2. The runtime search path is the ordered, de-duplicated union of the login-shell PATH, the inherited launcher PATH, then `/usr/bin:/bin:/usr/sbin:/sbin`. Only absolute segments without control characters are kept. The inherited process environment is never mutated.
3. A missing, malformed, incomplete or oversized capture leaves the launcher PATH unchanged, except on macOS, where `/opt/homebrew/bin` and `/usr/local/bin` are appended after every existing entry so a slow shell init does not hide Homebrew tools. A successful capture is authoritative and gets no guessed directories. Windows and Linux fallbacks are unchanged.
4. The last-resort automatic default skips the external-CLI providers `claude-code`, `codex-cli`, `muse-cli` and `grok-build-cli`, including when one of them is the preferred provider. Explicit settings defaults, agent preferences and manual selections may still choose them. When only external CLIs are offered there is no automatic default and the user chooses.

## Accepted trade-offs

- On macOS the appended fallback directories are user-writable under some Homebrew layouts; they come last so they cannot shadow any other entry.
- A user-writable directory in the login-shell PATH can shadow a system tool for runtime-spawned processes. This matches what the user's own terminal and the web server process already do.
- The external-CLI list is a Desktop-owned identifier set. The SDK `Provider` type carries no capability or availability field, so the set must be extended when a new CLI provider is added.

## Deferred, not decided here

- Runtime-reported availability for external-CLI providers (`available`, `unavailable`, `unknown` with a structured reason) so the picker can disable a provider whose binary is missing. It needs a runtime contract change.
- A typed non-retryable error for a missing executable so the runtime stops retrying a deterministic failure. It belongs to the AX Code runtime.
- Most-recently-used or cross-project default inheritance, which can change billing or data destination without an explicit choice.

## Verification

Unit tests cover the merge order, de-duplication, hostile segments, degraded captures, Windows, secret exclusion and input immutability, and the provider fallback for each CLI identifier, a preferred CLI, CLI-only catalogues and blocked ordinary models. Each production guard was mutated once to confirm a seeded failure.
