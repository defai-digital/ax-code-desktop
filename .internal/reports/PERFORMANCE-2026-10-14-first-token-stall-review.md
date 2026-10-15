# First-token stalls in AX Code Desktop: review and root cause

Date: 2026-10-14

Subject: session `ses_-e5ec2d6b645ffejUHk38AZnrx` (project `/Users/akiralam/code/srfax`, prompt
"please create a system block diagram to show design"), which took about 6.5 minutes of wall clock
for ten model turns before the user aborted it.

Question asked: why is that session slow, and why does the same work feel fine in the TUI?

## Outcome

**The stall is a shared bottleneck on the path to the `defai-01-ax-trust-com` gateway, not Desktop
code.** Every client-side candidate was tested against the runtime's own records and refuted. The
one fork left open is *remote gateway/upstream* versus *a shared on-machine hop in front of the
socket*; the evidence below narrows it to the gateway, and the report closes with the single
measurement that would settle it.

Reported by the runtime, per turn, in ms (`latencyMs` / `firstContentMs` / new input tokens / cache
read / output tokens):

| turn | total | first content | new input | cache read | output | notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 161454 | **160445** | 58282 | 5376 | 157 | first call after a model switch |
| 2 | 4661 | 3740 | 60003 | 5248 | 210 | |
| 3 | 4404 | 3402 | 4517 | 65408 | 191 | |
| 4 | 5460 | 4516 | 11549 | 70144 | 225 | preceded by one logged provider error and retry |
| 5 | 58197 | **57208** | 24737 | 63872 | 303 | |
| 6 | 3546 | 2352 | 10942 | 81920 | 226 | |
| 7 | 25325 | 2089 | 1990 | 93056 | 2649 | +3173 reasoning tokens: generation time, not a stall |
| 8 | 4334 | 3226 | 37664 | 63360 | 189 | |

`setupMs` was 5.6-7.7 ms on every turn. The session's 27 tool calls took 0.0-0.3 s each. Sample:
[measurements.json](first-token-stall-2026-10-14/measurements.json).

## What was refuted

Each of these was a live hypothesis raised either by me or by an external reviewer, and each is
refuted by records the runtime already writes.

| Hypothesis | Test | Result |
| --- | --- | --- |
| Client work before dispatch (request assembly, provenance hashing of a 335 KB body) | `timing.setupMs` on all 8 turns | 5.6-7.7 ms, including on the 160 s turn |
| Event loop blocked, so an already-arrived chunk could not be read (`firstContentMs` is stamped in JS when the adapter sees the first chunk) | loopback handlers answered during the 160 s window | 56 requests, every handler <= 3 ms (mean 0.7 ms), longest gap between completions 10.0 s. The loop was scheduling and parsing throughout |
| Hidden retry inside the provider SDK inflating the first-token wait | `timing.attempt` on all 8 turns | always 1; the one real retry appears as `stepIndex 1` plus a logged `AI_APICallError` |
| Tool or system prefix churn invalidating the prompt cache | per-request `systemHash`, `toolDefinitionsHash`, `optionsHash` | identical from turn 2 onward; only `messagesHash` changes, as expected when messages are appended |
| Prefill volume explains the wait | TTFT versus new tokens | turn 1 sent 58282 new tokens and waited 160 s; turn 2 sent 60003 new tokens and waited 3.7 s. No correlation |
| Cold cache explains the wait | TTFT versus cache state | 329 new + 231936 *cached* tokens waited 40 s; 76326 new + 1280 cached waited 107.7 s, while 20998 new + 180096 cached waited 108.9 s. Neither state predicts it |
| The Desktop GUI's own load explains it | measured traffic | 282 runtime requests in the same 286 s (about 1/s) is millisecond-scale work; it can add jitter, not 40-160 s of silence |

## What the evidence points at

**Three independent runtime processes stalled in the same three-minute window, on two different
upstream models:**

- process `...9c6885b2`, `deepseek-flash`: stream events at +0.2 s and +9.1 s, then nothing until
  **+119.7 s** (its session records TTFT 108957 ms)
- process `...d318fd44`, `glm-5.3`: +8.9 s, **`stream error` at +69.1 s**, then +99.1, +115.4,
  +133.9, +188.2 s
- process `...b124a6e3` (the Desktop-supervised runtime serving the subject session),
  `deepseek-flash`: request at +10.4 s, nothing until **+171.9 s**

Different processes, different sessions, different projects, different models, one wall-clock
window. Nothing inside a single client process can synchronize three of them.

Routing was checked for a shared local hop: the active provider
`defai-01-ax-trust-com` resolves to `https://defai-01.ax-trust.com/v1`, no proxy environment
variables are set on the machine, and the alternate local base URL found in the config
(`http://127.0.0.1:38080/v1`) has no listener. So the shared hop is the remote gateway.

## External review

Two rounds, five models, one prompt each (all read-only, no tools). Round 1 carried the raw
measurements; round 2 added the loopback-responsiveness and cross-process findings so the reviewers
could re-test their own round-1 reasoning. Transcripts and both briefs are in
[first-token-stall-2026-10-14/](first-token-stall-2026-10-14/).

| Reviewer | Round 1 | Round 2 |
| --- | --- | --- |
| `grok-4.6` (grok CLI) | ranked gateway variance first; client SQLite/GC last | could not localize the shared hop without a packet capture or gateway log |
| `muse` (muse CLI) | flagged case (2) as the hidden-retry risk | "mostly settled: shared upstream, not per-process blocking"; named the shared 10 GB SQLite as the one surviving local path |
| `claude` (claude CLI) | ranked gateway first, then cache-tier paging; raised prefix churn | - |
| `defai-01-ax-trust-com/glm-5.3-flash` | estimated effective prefill ~400 tok/s and called cache-hit luck an amplifier; raised prefix churn and silent gateway rerouting | A+B settle the client process question but not which hop |
| `defai-01-ax-trust-com/xiaomi/mimo-v2.6-pro` | timed out at 300 s in round 1 | "high confidence" shared bottleneck; preserved the local delivery/persist fork |
| `defai-01-ax-trust-com/claude-sonnet-5-5` | wrong model ID in the brief | run aborted: `upstream rejected the request` - the same gateway failing mid-review |

Their agreement, in one line: a shared bottleneck upstream of the client, with a cold first turn and
mid-session model switching as amplifiers; SQLite, hashing and event-loop blocking explicitly
disranked. Their one surviving alternative - a shared on-machine hop between socket arrival and
chunk delivery, such as the shared session database gating stream persistence - is what the routing
check above weakens and the measurement below would close.

## Recommended next measurement

Catch a stall live and take a wire-level reading at the same time: from the same machine, run a
concurrent `curl -N -w '%{time_starttransfer}'` (or capture the first payload byte with `tcpdump`)
against the same endpoint and model.

- Wire slow: the gateway and everything behind it is confirmed, and the client is fully excluded.
- Wire fast while `firstContentMs` is still ~160 s: the stall is on the machine, between socket
  arrival and chunk delivery.
- Either way, record the gateway request id from the response headers for the stalled calls. Three
  rows - UTC start, model, request id, first-byte time - in one window is the smallest artefact the
  gateway's owner can act on; without request ids the report cannot be grepped in their logs.

Independent of that, add monotonic timestamps at three points in the provider adapter: request
written, first byte on the socket, first chunk delivered to JS. Today only the last of the three
exists, which is why "provider slow" and "client could not read" are indistinguishable from the
runtime's own records.

## Desktop-side findings found along the way

Not causes of the stall, and each independently fixable:

- **Cross-project session retry loop.** The GUI fetched a session that belongs to another project
  directory 84 times in 286 s; the runtime rejected every one with HTTP 409 ("belongs to a different
  project directory") and the client kept retrying every ~3 s.
- **Polling rate.** 282 runtime requests in the same 286 s, dominated by `/experimental/session`
  (62), `/session/status` (58) and `/global/health` (20).
- **Cold start per conversation.** A new Desktop conversation is a new session, so its first request
  pays a cold prefill of the whole fixed block: 78114 bytes of system, 78771 bytes of messages and
  178686 bytes of tool definitions across 63 tools.
- **The session opened on `claude-code/claude-opus-5-5`**, whose capability resolution reports
  `protocol: "cli"` - a provider that spawns an external agent CLI per request. It was aborted after
  4.2 s and the session restarted on `defai-01-ax-trust-com/deepseek-flash` 11.3 s later, which
  discarded the prompt cache for the model that was actually used. The shared runtime config names
  `alibaba-token-plan/qwen3.8-max` as the `build` agent default, which is not what the Desktop
  requested.

## Not verified

- The stall was never reproduced on demand, so no wire-level reading exists yet.
- The reviewers' remaining fork (remote gateway versus a shared on-machine hop) is narrowed, not
  closed.
- Only the last three minutes of log files retained on this machine were available; older runtime
  logs were already rotated.
- The comparison against the TUI is by symptom, not by measurement. The sessions analysed here ran
  under the Desktop-supervised runtime, and the retained `tui-backend` logs reference no session
  ids, so no TUI session could be isolated for a direct TTFT comparison. Supplying one TUI session
  id that felt fast would settle that question with a single query.
