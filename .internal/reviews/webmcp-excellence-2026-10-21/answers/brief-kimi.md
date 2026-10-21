# Synthesize the WebMCP excellence discussion (read-only, English, max 1600 words). Do not modify files.

Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (baseline table in section 2; target 9/10 per step).
Inputs in .internal/reviews/webmcp-excellence-2026-10-21/: AUDIT-2026-10-21-codex-baseline.md, RESEARCH-2026-10-21-state-of-the-art.md,
RESEARCH-2026-10-21-grok-value.md (value for human and AI coders, novel ideas for an app owning code and running app), and
answers/answer-{minimax,deepseek,codex}.md (plus, minus, multiply, divide proposals from the UI/UX, AI-agent and feasibility lenses).

Produce:
1. A merged requirement list with IDs WX-01..WX-nn. For each: operation(s), one-line requirement, persona steps raised (from -> to),
   supporters (which inputs proposed it), Desktop-only or needs runtime (AX Code ADR), effort S/M/L, acceptance test, and the key
   source paths. Merge duplicates; keep a requirement only if two or more inputs support it OR it is a clear safety fix; list the
   rest as deferred with the reason.
2. Conflicts between inputs and your resolution (e.g. auto-run by schema hash vs no auto-approval without AX Trust policy;
   persistent sign-in as a trap vs a need; screenshots as evidence vs screenshot archives).
3. Rounds: group the requirements into rounds 12, 13, 14+ so each round raises the lowest steps first and Desktop-only work
   ships before runtime-dependent work. Estimate each step's score after each round.
4. A WebMCP task suite W1..W8 for native journeys (stub runtime plus a fixture page that registers tools), each with steps,
   expected evidence and an action-count budget, covering both personas.
5. Which runtime (AX Code) changes are needed beyond ADR-266, as proposals for an AX Code ADR.
Cite path:line from the inputs for every load-bearing claim.
