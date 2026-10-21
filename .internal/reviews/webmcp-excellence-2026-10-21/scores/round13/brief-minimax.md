# WebMCP excellence rubric: round 13 judgment at HEAD (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at HEAD (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). Optional runtime fields (ADR-266) are not in the pinned runtime: give them no credit.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Round 13 added (verify in source; .internal/reviews/webmcp-excellence-2026-10-21/scores/README.md "Round 13 evidence" and
reviews/round13/): several sessions and projects using the project browser at once (WX-15: view pool per project and session,
per-project storage, visible-to-act gate, per-session revocation, keyed store); inspectable page tools and registration truth
(WX-02/WX-04: raw schema, hint badges, truncation, advisory lint, named catalog rejection, registration timeline, stale results,
drafts); a page-bound call strip with duration, filtered result, earlier-page marker and opening the call in the conversation
(WX-07); pause and take over (WX-10); structured page errors shown as errors; a headless builder check `pnpm run webmcp:check`
(WX-17); native journeys W1, W2 and W5 (idle) passing on macOS, Windows and Ubuntu for W1. Compare with round 12 in
scores/round12/ and say which steps moved. Note: a step counts as passing when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: they belong to another session's
runtime update, not this work.
IMPORTANT: your FINAL message must contain the complete answer: a table with every step (A1-A8, B1-B5), its 1-10 score and one
sentence with a path:line, then the means and the three changes. Do not end with only a summary.
