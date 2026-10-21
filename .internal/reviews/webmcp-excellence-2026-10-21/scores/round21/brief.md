# WebMCP excellence rubric: round 21 judgment at 15f40f1d (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at 92775899 (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). The pinned runtime is v7.28.2 (config/ax-code-runtime.json); its desktop_webmcp tool sends definitionDigest and a redacted inputPreview in approval metadata (../ax-code tag v7.28.2, packages/ax-code/src/tool/desktop_webmcp.ts:216-228). Credit what Desktop renders from that shape; give no credit for runtime fields that are not sent.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Round 21 (verify in source; git log 4b7f80db..HEAD; scores/round20/ for the previous ballots): every WebMCP argument, result
and error display uses one shared redactor; sensitivity passes from field-naming keys to sibling value keys; input projections
no longer drop properties, and a truncated projection suppresses missing-property findings and export. Compare with round 20
and say which steps moved. A step passes when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
IMPORTANT: your FINAL message must contain the complete table (A1-A8, B1-B5 with scores and one sentence each), the means and
the three changes.
