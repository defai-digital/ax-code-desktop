# Root-cause review: slow time-to-first-token in AX Code

You are reviewing a performance investigation. Answer from this brief only. Do not use tools, do not read files, do not write files. Reply in English, concisely, with numbered answers.

## System under review

- **AX Code**: local-first coding-agent runtime (Node). Sessions are durable SQLite event logs. One runtime process serves several front ends.
- **AX Code Desktop**: Electron GUI that spawns and supervises its own runtime process over loopback HTTP.
- **TUI**: the same runtime, driven from a terminal (same provider config).
- Model provider in every case: `defai-01-ax-trust-com`, an OpenAI-compatible gateway. One provider entry in this system uses `protocol: "cli"` (`claude-code/*`) and spawns an external agent CLI per request.
- Local state is large: main session DB ~10 GB, code-index DB ~7.5 GB, plus ~11k per-session "foreground" DB files and ~10k snapshot directories.

## Symptom

A Desktop session (prompt: "please create a system block diagram to show design", small repo) felt very slow: roughly 6.5 minutes of wall clock for ~10 model turns, then the user aborted. The same user reports that the TUI feels fine.

## Measurements from the runtime's own event log (all in ms)

Per model turn: `latencyMs` / `timing.firstContentMs` (time until the first content token) / new input tokens / prompt-cache read tokens / output tokens:

1. 161454 / **160444** / 58282 / 5376  / 157
2. 4661   / 3740   / 60003 / 5248  / 210
3. 4404   / 3402   / 4517  / 65408 / 191
4. 5460   / 4516   / 11549 / 70144 / 225   (this turn followed one provider error + retry: "AI_APICallError: upstream request failed")
5. 58197  / **57208** / 24737 / 63872 / 303
6. 3546   / 2352   / 10942 / 81920 / 226
7. 25325  / 2089   / 1990  / 93056 / 2649 (+3173 reasoning tokens)
8. 4334   / 3226   / 37664 / 63360 / 189

Other facts about that session:

- 27 tool calls executed in 0.0-0.3 s each (file reads, grep, one write). Tool work is not the problem.
- `timing.setupMs` was 6.8 ms before the stream; `streamMs` 161283 on turn 1.
- Turn 1 used `claude-code/claude-opus-5-5` (protocol `cli`) and was aborted after 4.2 s; the session then restarted on `defai-01-ax-trust-com/deepseek-flash` (protocol `@ai-sdk/openai-compatible`) 11.3 s later, so turn 1 above is the first call on a cold cache.

Across other sessions in the same DB, maximum TTFT:

- 108957 ms with 20998 new + 180096 **cached** tokens (warm)
- 40018 ms with 329 new + 231936 **cached** tokens (warm)
- 124414 ms with 27244 new + 0 cached
- 42619 ms with 32612 new + 61120 cached
- Inside one single session the same ~210k-token context produced TTFT 1840 ms on one turn and 40018 ms on another.

## Request shape

Each turn sends ~335 KB of JSON: system 78 KB, messages 79 KB, **tool definitions 179 KB across 63 tools**. The runtime logs provenance hashes (system, messages, tool definitions, options, whole request) for every request.

## Desktop-only traffic in the same 286 s window

- 282 runtime HTTP requests issued by the GUI (about 1/s): `/experimental/session` 62, `/session/status` 58, `/global/health` 20, plus 19 message-history fetches for the active session (each history payload hundreds of KB).
- 84 fetches of a session that belongs to a different project directory, each rejected by the runtime with HTTP 409; the GUI keeps retrying roughly every 3 s.

## My current conclusion - please challenge it

The stalls are provider-side: the same signature appears with warm caches and tiny inputs (329 new tokens + 231936 cached -> 40 s), and the same context size gives 1.8 s on one turn and 40 s on another. So it looks like the gateway/upstream stalling, not the client.

## Questions

1. Rank the candidate root causes you find most likely, and give the single strongest discriminating measurement for each.
2. Could any client-side mechanism in this runtime plausibly add 40-160 s *before the first streamed token* - for example event-loop blocking from a 10 GB SQLite database plus WAL checkpoints, per-turn request hashing/provenance, memory pressure, or the HTTP polling load above? How would you tell a client-side stall apart from a provider stall using only `setupMs`, `firstContentMs`, `streamMs` and the provider error stream?
3. Is `firstContentMs` (measured by the provider adapter when the first chunk arrives) capable of hiding a client-side stall? If so, what instrumentation would settle it?
4. What is the highest-value next experiment: cheap, decisive, and runnable on this machine?
