# WebMCP excellence rubric: round 15 judgment at 92775899 (read-only, English, max 700 words). Do not modify files.
You are one of three independent judges. Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (personas and
steps in section 2, definition of done in section 3: every step 9/10 or better). Context: .internal/reviews/webmcp-excellence-2026-10-21/
(audit, research). Judge the WebMCP experience of AX Code Desktop as it is in source at 92775899 (desktop/packages/ui/src,
desktop/packages/electron/src, docs/). Optional runtime fields (ADR-266) are not in the pinned runtime: give them no credit.
Score each step 1-10 against an absolute bar of excellence (not against a competitor), with one sentence and a path:line:
A1 discover, A2 enable and scope trust, A3 watch live, A4 approvals, A5 failure recovery, A6 evidence after the task, A7 pause and
take over, A8 several sessions at once; B1 see registered tools, B2 try a tool by hand and compare, B3 iterate, B4 diagnose misuse,
B5 onboarding docs. Then the mean for A and for B, and the three changes that would raise the lowest steps most.
Be strict; do not credit what you cannot find in source.
Round 15 added (verify in source; .internal/reviews/webmcp-excellence-2026-10-21/reviews/round15/ and git log 806602a7..HEAD):
R15a (A7): pausing awaits the native WebMCP cancellation acknowledgement and interrupts the page script of the original document
only; each stopped call is reported as stopped or still finishing, unfinished page requests stay in later stop reports, and a
second window shows which window owns a session's page with Focus that window. R15d (A3, A4, A6): a running call in the call
strip opens its approval; the transcript jumps to and highlights the exact tool part; approval cards for page tools show the
page's own tool definition (hints, inputs with required markers, the page's description, and that hints never approve); the
recap beside landing lists each step as a button with duration, result and tool-definition identity (flagging a changed
definition), caps with "Showing the latest" and copies to the clipboard; secrets become placeholders in exported regressions
and secret-named Try it fields are password inputs. R15b/R15c (workspace): session grid drag, dock, split and pop-out with one
browser owner; PR state and checks facets; palette PR search, scope and split-open. Compare with round 14 in scores/round14/ and
say which steps moved. A step passes when two of the three judges give it 8 or more.
Ignore uncommitted files under config/, pnpm-lock.yaml and package.json version pins: another session's runtime update.
IMPORTANT: your FINAL message must contain the complete table (A1-A8, B1-B5 with scores and one sentence each), the means and
the three changes.
