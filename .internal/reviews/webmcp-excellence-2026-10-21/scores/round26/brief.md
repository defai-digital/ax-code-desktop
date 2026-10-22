# WebMCP excellence rubric: round 26 judgment at 96f74a34 (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at 92775899 (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). The pinned runtime is v7.28.2 (config/ax-code-runtime.json); its desktop_webmcp tool sends definitionDigest and a redacted inputPreview in approval metadata (../ax-code tag v7.28.2, packages/ax-code/src/tool/desktop_webmcp.ts:216-228). Credit what Desktop renders from that shape; give no credit for runtime fields that are not sent.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Rounds 22 to 24 (verify in source; git log 15f40f1d..HEAD; scores/round24/ and scores/round21/ for the previous ballots) hardened redaction
(indexed and quoted compound paths, bracketed assignments, inherited field sensitivity), masked JSON drafts the redactor would
change, bounded native initialization, and recovered pages when the owner window closes or its renderer is lost, and unified structured field masking. Round 26: a failed call shows its redacted reason and first diagnosis finding on the collapsed transcript row and the call strip; native initialization failures carry a specific reason; replay marks values outside the current enum and asks before sending them; compare explains a missing runtime receipt; Mission Control rows show a waiting-page chip; grid panes reach their session pages. Compare with round 25 (scores/round25/ is not recorded; its ballots scored A5 8/7/7 and B2 7/8/7) and say which
steps moved. A step passes when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
IMPORTANT: your FINAL message must contain the complete table (A1-A8, B1-B5 with scores and one sentence each), the means and
the three changes.
