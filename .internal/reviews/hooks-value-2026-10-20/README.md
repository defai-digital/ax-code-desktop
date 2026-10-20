# Lifecycle Hooks product-value discussion

Date: 2026-10-20. The same English [context and question](prompt.txt) was supplied independently to six models.
[Commands](run.py) prohibit tools/delegation and isolate CLI working directories. These are advisory responses to
supplied facts, not independent source inspections, usability studies, execution tests or proof of user demand.

| Reviewer | Process receipt | Substantive response |
| --- | --- | --- |
| Grok | [exit 0, 44.7s](grok.status.json) | [Response](grok.txt) |
| Muse | [exit 0, 13.8s](muse.status.json) | [Response](muse.txt) |
| Claude | [exit 0, 22.0s](claude.status.json) | [Extracted response](claude.md), [raw](claude.txt) |
| DeepSeek Flash through AX Code | [exit 0, 14.2s](deepseek.status.json) | [Extracted response](deepseek.md), [raw](deepseek.txt) |
| GLM 5.3 through AX Code | [exit 0, 58.2s](glm.status.json) | [Extracted response](glm.md), [raw](glm.txt) |
| MiniMax M3 through AX Code | [exit 0, 31.6s](minimax.status.json) | [Extracted response](minimax.md), [raw](minimax.txt) |

Claude's initial invocation omitted the prompt argument and exited before a model call. Its
[setup error](claude-setup.txt) and [receipt](claude-setup.status.json) are retained. The corrected invocation supplied
the prompt and completed; no already-running reviewer was restarted. The archived runner contains the corrected
invocation and accepts reviewer names to run a selected request.

All six recommend retaining the runtime mechanism while reducing the standalone page's prominence. Agreement is not
adoption evidence. They share the same supplied context and may share assumptions. Several details were unsupported:

- MiniMax treats protect-env-files as blocking and test-on-stop as gating. Local source shows warning/reminder behavior.
- Grok proposes a Stop feedback check that assumes it changes a following model action. The inspected Stop caller awaits
  execution but does not consume its returned feedback. A Stop reminder cannot establish task verification.
- Claims that hooks are the only way to protect files or enforce constraints are too broad; canonical permission and
  sandbox policy already have relevant responsibilities. Keep a specific extension job rather than a new policy system.
- GLM's future trust/enable toggle needs a separate authorization contract; runtime ADR-211 explicitly defers write APIs.
- Suggested 1/2/5 percent adoption thresholds, comparisons with scheduler opens and fixed observation windows have no
  AX baseline. They are not adopted removal criteria. Rare, consequential diagnostics cannot be judged by visits alone.
- Rewriting reminder packs as guarantees would change runtime behavior; it is not an incidental Desktop label repair.

The [recommendation](../../reports/PRODUCT-2026-10-20-hooks-value.md) separates verified facts, product judgment and
proposed validation. No removal, navigation move, runtime behavior change or telemetry collection was performed by this
discussion.

The archived Muse output removes terminal blank lines only. Original output SHA-256: `0d6120b8c185e0e6d903671f75e8e0fdb1bfb22cde7593c087382bee0b5a8f88`.
