# WebMCP excellence v1: an excellent experience for agents using web apps, and for developers building them

Status: Accepted (direction). On 2026-10-21 the user moved the target "from win Orca to have excellence experience of WebMCP".
This PRD replaces the definition of done of PRD-2026-10-21-competitive-supervision-ux-v1 (section 3) for all later rounds. That
record stays accepted for what it shipped (rounds 3 to 11) and for its constraints, gates and non-goals, which apply here unless
this record says otherwise. Requirements in section 4 are fixed from the research in section 2 before implementation starts.
Related and still authoritative: PRD-2026-10-11-embedded-native-webmcp-v1, PRD-2026-10-20-webmcp-outcomes-and-recap-v1,
ADR-009 (project browser), and AX Code ADR-266 (desktop page-tool contract, on an AX Code branch, not yet in a pinned runtime).
Execution and round tracking: `../plans/PLAN-2026-10-21-webmcp-excellence-v1.md`.
Evidence: `../reviews/webmcp-excellence-2026-10-21/`.

## 1. Why the target changed

Against Orca, the three judges scored AX ahead in rounds 9 and 10 (by 0.02 to 0.17) but kept calling it equal, and the remaining
named gaps were generic layout features. WebMCP is where AX is different: Orca's browser pane has no page-tool concept. Measuring
WebMCP against an absolute bar, instead of a competitor's score, focuses the work on what the user called the winning chance.

## 2. Personas and journeys

- A, supervisor: a developer letting coding agents use web apps through WebMCP while supervising several sessions.
  A1 discover what the agent can do on a page; A2 enable and scope trust (persistence, revocation, sign-in); A3 watch the agent act;
  A4 decide approvals; A5 understand and recover from failures; A6 evidence after the task; A7 pause and take over;
  A8 several sessions and pages at once.
- B, builder: a web developer building a WebMCP-enabled app with the agent's help.
  B1 see the tools a page registers, with schemas and the problems the runtime will reject; B2 try a tool by hand and compare it
  with what the agent sent; B3 iterate (reload, re-registration) without losing state; B4 see why the agent misused or failed a
  tool; B5 docs and onboarding for making a page agent-usable.
- Cross-cutting: accessibility, the 14 locales, macOS, Windows and Ubuntu, performance.

Inputs: an external state-of-the-art review (WebMCP proposal status, developer tooling, browser-agent UX patterns, known pain
points) and a source audit of the experience at HEAD, both in the evidence directory.

### Baseline (codex source audit at `acc31cad`, accepted by the user as the starting point)

| Supervisor step | Score | Builder step | Score |
| --- | --- | --- | --- |
| A1 discover what the agent can do | 7 | B2 try a tool by hand and compare | 4 |
| A4 approvals | 7 | B3 iterate | 4 |
| A2 enable and scope trust | 6 | B1 see registered tools | 3 |
| A5 failure recovery | 6 | B4 diagnose why the agent misused a tool | 3 |
| A6 evidence after the task | 6 | B5 onboarding docs | 2 |
| A7 pause and take over | 6 | | |
| A3 watch the agent live | 5 | | |
| A8 several sessions at once | 3 | | |

Every requirement in section 4 names the steps it raises and by how much; rounds are judged against this table.

## 3. Definition of done

1. Excellence rubric: every journey step in section 2 scores at least 9 of 10 from each of three independent judges (codex,
   deepseek-flash, MiniMax-M3), from source and screenshot evidence, with no step below 8 from any judge.
2. Task suite: the WebMCP tasks in section 6 pass as native journeys with recorded action counts, on macOS locally and in the
   three-platform CI job.
3. Fresh audit: no P1 finding in an audit run after the last round.
4. Runtime: features that need the AX Code runtime are verified against a pinned signed runtime that includes them. Pinning
   needs a signed release and explicit approval under ADR-012; until then such features are recorded as "Desktop ready, runtime
   pending" and do not count toward item 1.

## 4. Requirements

Fixed on 2026-10-21 from the discussion in the evidence directory (`SYNTHESIS-kimi.md`, verified in `VERIFY-glm.md`). Score
changes are estimates and do not add up. "Runtime" means an AX Code ADR and a pinned signed runtime are needed.

| ID | Op | Requirement | Steps (from -> to) | Needs | Size | Round |
| --- | --- | --- | --- | --- | --- | --- |
| WX-01 | minus | Honest manual forms: every schema property, strings kept exactly, absent versus empty versus zero versus false, constraints shown | B2 4->7 | Desktop | S | 12 |
| WX-03 | multiply | Honest outcomes: transport success, application error, timeout, cancellation and uncertain completion are distinct, with one reason vocabulary shared by the manual panel and the transcript | A5 6->7, B4 3->5 | Desktop | S | 12 |
| WX-06 | plus | Builder quickstart: a runnable example from registration to agent testing, linked from the tool panel | B5 2->8 | Desktop | S | 12 |
| WX-08 | minus | Approval card clarity: an effect sentence built from call data (never the site's description), the scope that covers it, and a visible timeout outcome | A4 7->9 | Desktop | S | 12 |
| WX-11 | minus | Accessibility: roving focus in the browser mode tabs; the native page boundary is announced | cross-cutting | Desktop | S | 12 |
| WX-02 | plus | Inspectable capabilities: full descriptions, raw schema, hint badges, origin, visible catalog truncation, advisory lint (length, runtime-rejected keywords) | A1 7->9, B1 3->8 | Desktop | M | 13 |
| WX-04 | plus | Registration truth: rejected catalogs named instead of vanishing, registration timeline with schema diff, stale results marked, drafts kept across reload | B3 4->8, B4 +1 | Desktop | M | 13 |
| WX-05 | plus | Manual journal (bounded, in memory), replay with editable input, comparison with the last agent call | B2 7->9, B4 5->7 | Desktop; exact compare needs runtime | M | 13 |
| WX-07 | multiply | Page-bound call strip: result preview, duration, approval link, page marker, opens the transcript part | A3 5->8, A6 6->7 | Desktop; correlation needs runtime | M | 13 |
| WX-09 | divide | One trust surface: origin, scope, session binding and revocation in one place, effective on the next call; display only, it adds no grant | A2 6->8 | Desktop | M | 13 |
| WX-10 | minus | Real pause and take over: Pause agent (page kept) separate from Disconnect, cancellation acknowledged, never claims rollback | A7 6->9 | Desktop | M | 13 |
| WX-13 | plus | End-of-task WebMCP recap: calls, effects, failures, how each step was done (tool, snapshot, screenshot), tools never called | A6 7->9 | Desktop | M | 13 |
| WX-14 | minus | Session continuity without stored credentials: the full address (query and hash) is kept in memory for the live session only, while saved history keeps stripping it; sign-in popups allowed inside the isolated profile; explicit sign-out; while a sign-in page is open, agent actions on it wait for the person | A2 8->9, A8 +1 | Desktop | M | 13 |
| WX-18 | plus | Turn a journal entry into a regression test snippet | B2, B4 | Desktop | S | 13 |
| WX-12 | plus | Saved grants bound to origin, tool and schema hash; a schema change asks again. Auto-run waits for AX Trust policy | A2, A4 safety | Desktop and AX Trust | M | 14+ |
| WX-15 | multiply | Isolated browser contexts per session with visible ownership and independent revocation (design below) | A8 3->9 | Desktop; runtime already allows one provider per session, up to 8 per project | L | 13-14 |
| WX-16 | plus | Pin a signed runtime with ADR-266 and the follow-up contract (masked arguments, validation paths, schema profile, correlation ids, untrusted-output channel, cancellation, duration) | A4, A5, B1, B4 -> 9 | Runtime | M-L | 14+ |
| WX-17 | plus | Fixture CI gate: headless list and run with exit codes, expected-call evaluations, lint | DoD item 2 | Desktop harness | L | 14+ |

### WX-15 design: several sessions and projects using WebMCP at once (user question, 2026-10-21)

Today (source at `7696232a`): each window has one project browser view (`desktop-webmcp-browser.js:349`, one partition per
window). Agent access is enrolled for one session, and every request is checked against that session and project
(`desktop-webmcp-browser.js:312-318`). An agent in any other session gets "No project browser is enrolled for this coding session"
from the runtime and must ask the person (`ax-code/src/mcp/desktop-browser.ts:400`). Enabling access for another session, or
switching sessions, closes the view and clears its storage: the first session loses its page, its sign-in and its access, and an
in-flight call fails. Nothing leaks between projects, but only one session can use a browser at a time. The runtime already keeps
one provider per session, up to 8 per project instance (`desktop-browser.ts:301-330`), so the limit is Desktop's.

Design:
1. A bounded pool of browser views keyed by project and session; only the shown one is attached to the window. Each project
   gets its own storage partition, so cookies and sign-ins never cross projects; sessions of one project share it.
2. Each view enrolls its own provider for its own session; revoking one leaves the others.
3. The visible-to-act rule stays: an agent's call on a page the person cannot see waits ("waiting for you to show the page"),
   shown in Needs you, on the Mission Control row and in the session grid. Letting a session act in the background is a later,
   explicit per-session choice under AX Trust policy, not a default.
4. A per-pane page switcher names each page's project, session, origin and access state; Mission Control rows and grid slots
   show their own session's page.
5. Bounds: at most 4 live views (configurable within 1 to 8); the least recently used hidden view is unloaded, keeping its
   address in memory only (no persisted query or hash, see WX-14), and is reloaded on demand with access off.
6. Task suite W7 checks two projects at once: independent pages, sign-ins and grants; revoking one leaves the other; no request
   reaches the wrong view; memory stays within the bound after repeated switches, on macOS, Windows and Ubuntu.

Deferred (single supporter or a recorded trap): jump from a call to its `registerTool` source, scaffolding a tool in the same diff,
progressive-disclosure lint, any global always-allow, `toolautosubmit` on consequential tools, durable credential persistence,
screenshot archives, and a Desktop copy of the runtime's schema validator. Conflict resolutions: `SYNTHESIS-kimi.md` section 2;
WX-09 and WX-14 were narrowed after `VERIFY-glm.md` (no grant from the trust surface; no persisted query or hash).

## 5. Constraints

Section 5 of the competitive PRD applies, in particular: Desktop does not own a second coding runtime (AGENTS.md); no standing
grants, auto-approval or permission expansion without AX Trust policy and approval; no credentials in records, logs or prompts;
page content, page-tool arguments and results are untrusted data; packaged apps keep the development WebMCP surface disabled.

## 6. Task suite

Native journeys against the stub runtime and a fixture page that registers tools; budgets are user actions.

| Task | Steps | Evidence | Budget |
| --- | --- | --- | --- |
| W1 discover (A1, B1) | open the fixture (three tools, one with 30 properties) | every tool, raw schema, hint badges, truncation note | 8 |
| W2 manual correctness (B2) | run with a padded string and property 25; run a tool that returns an error payload | exact input echoed; failure styling | 10 |
| W3 lifecycle (B3, B4) | the page re-registers a tool with a changed schema; then registers an invalid catalog | diff row and stale marks; a named rejection, no vanishing panel | 12 |
| W4 approvals (A4) | the agent invokes a consequential tool; approve once; a second ask times out | origin, masked arguments, effect sentence, explicit timeout | 10 |
| W5 pause and take over (A7), keyboard only | pause during a long call; resume | cancellation acknowledged, page kept, no re-navigation | 9 |
| W6 evidence (A3, A6) | a three-call task with one failure | recap with failure text and a never-called tool; a strip row opens its transcript part | 8 |
| W7 isolation (A8) | two projects, each with a session using its own page | independent pages, sign-ins and grants; revoking one leaves the other; bounded memory (WX-15 design) | 12 |
| W8 builder loop (B1 to B5) | follow the quickstart, add a tool, run it, replay the last agent call, export a test | each step's artifact | 15 |

## 7. Round gates

Section 7 of the competitive PRD applies unchanged (requirement IDs per change, cross-model review, mutation probes, full checks,
native journeys, records, judging after the commit, push after the gates under the standing approval).
