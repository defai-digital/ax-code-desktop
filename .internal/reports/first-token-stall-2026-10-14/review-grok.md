1. **Most likely root causes (ranked)**

   1. **Gateway / upstream TTFT variance** (queueing, cold routing, cache-hit that still needs a slow prefill, or overloaded `defai-01-ax-trust-com`). Strongest discriminator: **same ~210k-token context in one session → 1840 ms vs 40018 ms TTFT**; also 329 new + 231936 cached → 40 s. That is independent of client payload size and of tool work.

   2. **Cold / partial prompt-cache on the first Desktop turn** (turn 1: 58k new, only 5k cached, **160 s TTFT** after switching off `claude-code/*` CLI). Strongest discriminator: **turn 1 vs turn 2** on the same session: 160444 ms → 3740 ms with similar new-token counts once cache exists.

   3. **Protocol / adapter mismatch on abort-and-switch** (CLI spawn aborted at 4.2 s, then OpenAI-compatible `deepseek-flash` 11.3 s later). Strongest discriminator: **compare TTFT of the first `defai-…` call after a CLI abort vs a first call that never touched `protocol: "cli"`**.

   4. **Desktop HTTP load as a second-order amplifier** (282 loopback req/s-window, 84× HTTP 409 retries, 19 large history fetches) — plausible jitter, **not** 40–160 s of pre-stream delay by itself. Strongest discriminator: **repeat the same prompt from TUI against the same runtime process** (shared SQLite, no Electron poller). If TUI is fast on the same PID, Desktop I/O is in the path; if TUI is also slow, provider.

   5. **Client SQLite / hashing / GC as primary stall** — **least likely**. Strongest discriminator: **`timing.setupMs` = 6.8 ms** with **`streamMs` ≈ `firstContentMs` ≈ `latencyMs`** on the 160 s turn. All of the wait is inside the stream, after setup.

2. **Could the client add 40–160 s before the first token?**

   Not as the main mechanism given these numbers. A 10 GB DB, WAL checkpoint, provenance hashing of a 335 KB body, or ~1 Hz polling would show up **before** the HTTP stream starts, i.e. in **`setupMs`**, or as event-loop stalls **between** chunks (tools already 0–300 ms). Here **`setupMs` is 6.8 ms** and **`firstContentMs` ≈ `streamMs` ≈ 160 s** with almost no output yet — the clock is sitting in “stream open, no content.”

   How to split client vs provider with only those fields plus the provider error stream:
   - **Provider stall:** `setupMs` tiny, `firstContentMs` huge, `streamMs ≈ firstContentMs`, errors like `AI_APICallError: upstream request failed` (turn 4).
   - **Client pre-request stall:** `setupMs` huge, `firstContentMs` small relative to setup.
   - **Client mid-stream stall (event loop):** `firstContentMs` modest, then `streamMs − firstContentMs` huge with few tokens (you do **not** see that on the 160 s / 57 s turns; turn 7’s 25 s total with 2 s TTFT is generation/reasoning, not TTFT).

3. **Can `firstContentMs` hide a client stall?**

   Yes, in one place: it is measured **in the adapter when the first chunk is delivered to JS**. Anything **after** `fetch`/socket open and **before** the adapter’s “first content” callback — including the runtime blocked so it cannot **read** an already-arrived chunk — is charged to `firstContentMs` and looks like provider TTFT.

   It does **not** hide work **before** the request is sent (`setupMs` already covers that).

   Instrumentation that settles it:
   - timestamps at **socket connect**, **request bytes flushed**, **first TCP/HTTP byte**, **first SSE/data chunk parsed**, **first content token** (hrtime, same process);
   - optional **tcpdump/loopback** or Node `async_hooks` / `perf_hooks` to see if the event loop was busy while bytes sat in the socket buffer;
   - **TUI vs Desktop on the same runtime PID** as a cheap control.

4. **Highest-value next experiment**

   From **TUI**, same model `defai-01-ax-trust-com/deepseek-flash`, same small repo, one short prompt, **while Desktop is closed** (no 409 poller). Log `setupMs` / `firstContentMs` / cache tokens. Then **one identical call with Desktop open and polling**. If TUI-alone TTFT is still tens of seconds, stop looking at SQLite/GUI and capture **gateway timing or a raw curl to the same endpoint with a tiny prompt vs a 210k cached prompt**. If TUI-alone is ~1–4 s and Desktop-open blows up, the 409/history poller is the amplifier — then kill the foreign-session retry loop. Entire test is minutes on this machine, no new code required beyond existing logs.
[usage] null
[end] {"stopReason": "end_turn", "sessionId": "01a13d40-cfba-76c3-a8af-22fb67e0e12f", "requestId": "e0e07cf4-5711-4d05-8502-a93f722d0761", "cwd": "/private/tmp/rootcause-review", "usage": {"input_tokens": 17765, "cache_read_input_tokens": 128, "cache_creation_input_tokens": 0, "output_tokens": 1199, "reasoning_tokens": 26, "total_tokens": 19092}, "num_turns": 1, "total_cost_usd": 0.01454792, "total_cost_usd_ticks": 145479200, "modelUsage": {"grok-4.6-build": {"inputTokens": 17765, "outputTokens": 1199, "cacheReadInputTokens": 128, "cacheCreationInputTokens": 0, "modelCalls": 1, "costUSD": 0.01454792}}}
exit=0 [grok]
