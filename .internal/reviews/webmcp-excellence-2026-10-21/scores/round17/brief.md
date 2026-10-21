# WebMCP excellence rubric: round 17 judgment at 7f63b436 (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at 92775899 (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). Optional runtime fields (ADR-266) are not in the pinned runtime: give them no credit.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Since round 15 (scores/round15/), rounds 16 and 17 hardened the same surfaces after seventeen fresh P1 audit passes (verify in
source; scores/README.md "Rounds 16 and 17" and git log 92775899..HEAD): credential redaction everywhere page or agent text is
shown, logged, stored or exported; origin-only address history; manual Try it and queued navigation bound to the displayed
document and definition (stale-form outcome); one definition-digest vocabulary across approval, compare, diagnosis and recap;
receipts kept for self-unregistering tools; exports limited to reproducible outcomes; webmcp:check identity receipts,
top-level-only tools and contamination after timeouts; sign-in popups in the isolated profile with the agent waiting, and
Sign out (WX-14); unsaved-work protection with a bounded confirmation for eviction, close, sign-out, quit, restart and update;
masked sensitive and JSON inputs; a landing recap that counts and copies the whole turn. Compare with round 15 and say which
steps moved. A step passes when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
IMPORTANT: your FINAL message must contain the complete table (A1-A8, B1-B5 with scores and one sentence each), the means and
the three changes.
