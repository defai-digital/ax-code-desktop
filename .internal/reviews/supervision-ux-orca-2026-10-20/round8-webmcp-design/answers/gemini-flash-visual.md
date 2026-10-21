### 1. Per-Screenshot Visual Hierarchy Critiques

* **02 (`02-browser-open-from-draft.png`)**: The eye is pulled to the massive dead-center empty-state button ("start a session..."), ignoring the critical, low-contrast "Approval needed: webmcp" card queued on the left.
* **05 (`05-enable-at-blank.png`)**: The red/orange chat card dominates, but the browser bar reads `about:blank` while the permission targets `http://127.0.0.1:47811`, creating jarring spatial dissonance.
* **07 (`07-enable-on-probe.png`)**: The stark, unstyled white page canvas washes out the thin, low-prominence status strip ("Agent access on... · 2 tools") and the floating chat permission below.
* **08 (`08-no-tools-page.png`)**: A misleading green status dot signals operational health even though the subtext admits "no page tools registered" (agent capability is actually zero).
* **10 (`10-unreachable-page.png`)**: The generic red "action could not complete" banner provides zero diagnostic context (e.g., connection refused vs. timeout) while competing with the unrelated left card.
* **11 (`11-transcript-and-permission.png`)**: The assistant transcript explicitly declares failure ("could not create the ticket..."), yet directly beneath it sits an active "Permission required" prompt for the same call.
* **12 (`12-permission-card.png`)**: Raw technical metadata (`Patterns:`, duplicated URL lines, `Operation invoke`) crowds out what actually matters: tool intent and arguments.
* **14 (`14-after-dialog-closed.png`)**: Access drops to "Agent access off" (orange dot) without any clear banner or transition explaining *why* closing a modal revoked access *(guess: session unbind on dialog dismissal)*.

---

### 2. Five Visual Proposals for Trustworthy Agent Access

1. **DIVIDE (Group) — Unified Browser & Capability Header**
   Merge the separate status bar and tab line into one integrated toolbar. Group the origin URL, connection pill, and an inspectable "Tool Pill" badge (e.g., `[● WebMCP · 2 Tools]`) in the browser header directly beside navigation buttons so status and target are never split.

2. **PLUS (Add) — Active Agent Action Halo**
   Introduce a subtle, pulsing perimeter glow (2px emerald/cyan border) around the browser pane only while an agent tool call or snapshot is actively executing, giving immediate peripheral awareness that the agent is driving the view.

3. **MINUS (Remove) — Technical Jargon from Permission Cards**
   Strip repetitive lines (`Patterns:`, raw `Website:` URL duplication, and `Operation invoke`). Replace them with a clean semantic pill (`create_ticket`) and the target origin, placing the actual arguments/payload front and center.

4. **MULTIPLY (Decompose) — Two-Tier Status Model**
   Decompose the single green dot into two explicit states: **Page Connection** (Connected/Disconnected) and **Capability Scope** (Ready with N tools / No tools found / Schema mismatch). Never show a green dot on zero-tool pages like screenshot 08.

5. **PLUS (Add) — Bi-directional Card-to-Page Anchor**
   When a WebMCP permission card appears in chat, add a matching visual beacon or highlight chip inside the browser's header (or over the target frame). Clicking the beacon reveals tool schemas inline, visually tying chat intent directly to the embedded page.

---

### 3. AX Advantage Over Orca & Pattern to Avoid

* **Where AX Can Look Clearly Better**: Orca treats its browser as a passive, dumb utility tab among editor splits. AX can visually establish the browser as an **active agent collaborator**: displaying tool counters, inspectable schema drawers, and real-time execution pulses that prove the agent understands and manipulates page state semantically, not just as raw pixels.
* **Pattern to Avoid**: **Detached Ghost Permissions**. Never render permission prompts in the chat stream without an explicit spatial anchor to the right-hand browser pane, especially when page state has diverged, failed, or reset to `about:blank`.