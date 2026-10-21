# WebMCP excellence rubric: round 14 judgment at HEAD (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at HEAD (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). Optional runtime fields (ADR-266) are not in the pinned runtime: give them no credit.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Round 14 added (verify in source; .internal/reviews/webmcp-excellence-2026-10-21/scores/README.md "Round 14 evidence" and
reviews/round14/): a page switcher naming each pooled page's project, session, origin and access, per-session revoke, a
display-only trust summary, named pool capacity with least-recently-used unloading and cross-window recovery, waiting agent
calls in Needs you, Mission Control and the session grid, interrupted access when the runtime stops answering (R14a, for A8 and
A2); a manual journal with replay, comparison with the agent's latest call, schema diagnosis naming the property and rule, and
regression export (R14b, for B2 and B4); native journey W7 (two projects). Compare with round 13 in scores/round13/ and say which
steps moved. A step passes when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
IMPORTANT: your FINAL message must contain the complete table (A1-A8, B1-B5 with scores and one sentence each), the means and
the three changes.
