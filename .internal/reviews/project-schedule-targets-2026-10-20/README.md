# Project and schedule target advisory attempts

AX Code CLI received the English [supplied-code prompt](prompt.txt) in separate temporary working directories with
`--sandbox read-only`, a 90-second CLI timeout and a 110-second outer deadline. The prompt prohibited tools/delegation.
[Commands](run.py) record the invocation. The input predates the screenshot-discovered Projects Home toolbar repair.
The archived prompt removes trailing whitespace from blank diff-context lines only. The original payload SHA-256 is
`f9adb8f96839ca02d34881ad4adc23a201de6337d9037257fc8cc10ad6a28bc7`.

| Reviewer | Receipt | Outcome |
| --- | --- | --- |
| DeepSeek Flash | [process](deepseek.status.json), [events](deepseek.jsonl) | Exit 124 at 91 seconds; terminal `result.status=timeout`, no text |
| GLM 5.3 | [process](glm.status.json), [events](glm.jsonl) | Exit 124 at 91 seconds; terminal `result.status=timeout`, no text |
| MiniMax M3 | [process](minimax.status.json), [events](minimax.jsonl) | Exit 124 at 91 seconds; terminal `result.status=timeout`, no text |

The wrapper's `completed` means the process exited on its own; it does not mean the review completed. All three emitted
a step-start and then a timeout result, reporting zero usage. No substantive review or approval was obtained, and no
retry was launched. Do not infer the provider-side cause or billing from these client receipts.

Earlier user-requested completed reviews remain recorded in [Settings](../webmcp-settings-2026-10-20/README.md).
The most recent [Muse/Grok label/layout review](../live-project-identity-2026-10-20/README.md) covers the previous Live
repair, not this new diff. Mounted and native evidence independently supports this repair.
