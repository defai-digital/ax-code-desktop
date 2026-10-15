# Root-cause review, round 2: slow time-to-first-token in AX Code

This is a follow-up. Answer from this brief only. Do not use tools or read files. English, concise, numbered.

## Round 1 conclusion (from seven reviewers, including you)

Provider/gateway TTFT stalls, with cold-cache first turns as an amplifier; client-side SQLite/hashing/event-loop blocking judged unlikely because `setupMs` is 6.8 ms and `firstContentMs` ~= `streamMs` ~= 160 s. One reviewer noted the only loophole: `firstContentMs` is measured when the adapter delivers the first chunk to JS, so a process that is blocked and cannot *read* an already-arrived chunk would charge that time to "provider TTFT".

## New evidence, measured after round 1 (all from the same machine)

**A. The runtime stayed responsive for the whole 160 s stall.**

During the 160 s window, that runtime process served **56 loopback HTTP requests**. Every handler completed in **<= 3 ms (mean 0.7 ms)**. The longest gap between two completions was **10.0 s**; most gaps were ~5 s, matching the GUI's polling interval. So the process was scheduling timers, parsing JSON, and answering requests throughout - it was not blocked from reading a socket.

**B. Three independent processes stalled at the same wall-clock time, on two different upstream models.**

Same ~3-minute window, three separate runtime processes talking to the same gateway `defai-01-ax-trust-com`:

- process 1, `deepseek-flash`: stream events at +0.2 s and +9.1 s, then nothing until **+119.7 s** (a 110 s hole). Its own log records max TTFT 108957 ms for that session.
- process 2, `glm-5.3`: stream events at +8.9 s, **+69.1 s `stream error`**, then +99.1, +115.4, +133.9, +188.2 s.
- process 3 (this one), `deepseek-flash`: request at +10.4 s, nothing until **+171.9 s** (161 s).

Different sessions, different projects, different processes, different models - simultaneous multi-second first-token holes.

## Questions

1. Does A + B settle the root cause? State the strongest alternative explanation that A and B do **not** rule out, and the measurement that would rule it out.
2. If the cause is the shared gateway, what is the single cheapest artefact to hand the gateway's owner so the stall is actionable (for example a timing breakdown, concurrent identifiers, or a raw curl comparison)?
3. Given B, is there any remaining client-side code path that could stall *several independent processes* at once? (They share the machine, the model gateway, and the same 10 GB session SQLite file, but not the same process, and one of them used a different model.)
4. What is the one thing you would still want measured before calling this closed?
