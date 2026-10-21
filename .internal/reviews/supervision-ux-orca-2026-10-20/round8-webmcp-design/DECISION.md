# Round 8 WebMCP design decision (2026-10-21)

Method: PRD-2026-10-21 section 4a. Independent answers in `answers/` (codex, grok, MiniMax-M3, Gemini 3.8 Flash visual critique of
the audit screenshots, and one Gemini 4 Argon answer written before that model was withdrawn for lack of credit). Synthesis by
Kimi K3 (`SYNTHESIS-kimi.md`), verification by glm-5.3 (`VERIFY-glm.md`): every load-bearing citation opened; all confirmed except
two imprecise points (the "Try it" grounding in ADR-009 decision 4 is consistent by inference, not stated; "0 tools available"
exists at `en.ts:2648` for the access-off state). No proposed requirement violates PRD section 5.

Accepted requirements (two or more supporters, evidence confirmed): CS-25 to CS-32 in the PRD, with glm's boundary conditions.
Runtime contract proposals R1 to R5 need AX Code ADRs before any Desktop dependency.
Deferred: remember sign-in (opt-in under ADR-009 decision 6; one supporter, needs CS-25 first), authoring handoff, workflow
evidence bundle (folded into R4), visual halo and card-to-page beacon (visual polish round), single-supporter grouping items.
Recorded bug: the native page covers the Services dropdown (audit 10b).
