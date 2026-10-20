# WebMCP Settings advisory reviews

These English outputs are bounded, read-only reviews of supplied source and task descriptions, not runtime evidence or
approval. They were requested by the user. The first prompts included `desktopUiWebMcp.ts`, `hooksLoad.ts` and the observed
Settings findings. Smaller retries used task descriptions. No review here certifies visual appearance from screenshots.

| Reviewer | Model or route | Completion |
| --- | --- | --- |
| [Grok CLI](grok.md) | Local `grok` default | Initial request timed out at 150 seconds; targeted retry completed |
| [Muse CLI](muse.md) | Local `muse` default | Source review completed, exit 0 |
| [DeepSeek via AX Code](deepseek.md) | `defai-01-ax-trust-com/deepseek-flash` | Completed terminal result, exit 0 |
| [GLM via AX Code](glm.md) | `glm-5.3-flash`, then `glm-5.3` | Initial request timed out at 110 seconds; targeted retry completed |
| [MiniMax via AX Code](minimax.md) | `defai-01-ax-trust-com/MiniMax-M3` | Completed terminal result, exit 0 |

Reproduced/accepted leads: read-only shortcut field focus; paging beyond 100 controls; preserving page position after an
action; disabled/fillable consistency; broader ordinary text-entry types; credential-hint exclusions; independent outcome
and persistence verification. Regressions and native retests are tracked in the implementation plan and completion report.

Not accepted as source facts: MiniMax's claim that this app's numeric/shortcut controls use shadow-root custom elements;
the local code uses React/light DOM. Do not add recursive shadow traversal on that assertion. Native select operability is
not silently promised: existing Settings uses ARIA select controls; the adapter's contract records its actual support.

Do not clamp or normalize numeric inputs inside the test adapter: this would hide the application's validation behavior.
Fill leaves a field focused, as normal editing does; a subsequent click changes focus and exercises blur. A distinct blur
or trusted-keyboard contract is future scope. Nullable optional Hooks fields require checking the producer schema; an
unverified claim that every valid backend emits null is not a reason to loosen validation. The developer naming heuristic
is not a complete accessibility-name algorithm; DOM/AX and visual review remain separate checks.

Orca's setting keys, types and values are not a parity requirement. The useful comparison is discoverability, feedback,
recovery and user task completion within AX Code's accepted ownership boundaries.
