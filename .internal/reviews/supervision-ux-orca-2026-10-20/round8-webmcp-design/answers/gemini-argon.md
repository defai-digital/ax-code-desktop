Developers who **build** or **use** WebMCP apps (`navigator.modelContext` / `document.modelContext` per the W3C Web Machine Learning / WebMCP explainer; exact API surface still evolving [uncertain: final spec details]) value **contract visibility** (exact tool names, JSON schemas, descriptions), **session continuity** (preserving URL, auth state, and agent access across UI layout changes), **transparent supervision** (seeing exact arguments before approving and real errors when calls fail), and **reliable model execution** (even on smaller/faster models).

### PLUS (+): High-Value Capabilities to Add

1. **Live per-page tool inspector & "Try it" drawer**
   - **Value:** Builders verify registered tool contracts (`name`, `description`, `inputSchema`) and test handlers before involving an LLM; users see what a page can do before enabling access.
   - **Evidence:** Audit P2 ("Tool names, descriptions and schemas appear nowhere; only a count"), Idea 3, PRD CS-21 & CS-22.
   - **Task:** T6 (WebMCP use/supervision) & W-Build (authoring/debugging page tools).
   - **Cost:** Desktop only.
   - **Acceptance check:** Opening a page with 2 registered tools displays both tool names, descriptions, and input schemas even with agent access off, and allows manual test invocation.

2. **Persistent per-project browser state (URL, session storage, and access toggle)**
   - **Value:** Eliminates repetitive re-navigation, re-login, and re-enabling access whenever closing the panel, opening Settings, or switching sessions.
   - **Evidence:** Audit Journey (07b, 13, 14), Audit P1.2 (`EmbeddedWebMcpBrowser.tsx:95-125`; storage wipe at `desktop-webmcp-browser.js:108-123`), PRD CS-20.
   - **Task:** T6 & W-Resume (returning to an active web app workflow).
   - **Cost:** Desktop only.
   - **Acceptance check:** Closing and reopening the panel or opening Settings preserves the current URL, cookies/storage, and active agent access state instead of resetting to `about:blank`.

3. **Argument-aware approval cards and transcript rows**
   - **Value:** Users can safely supervise consequential actions by seeing the target element, submit flag, input text, and `invoke` JSON arguments, plus clear pass/fail transcript titles.
   - **Evidence:** Audit P1.4 (`PermissionCard.tsx:367-403`), Audit P2 ("Transcript rows all read 'Desktop webmcp'; collapsed failures look like successes (11)").
   - **Task:** T6 (approving and auditing agent browser actions).
   - **Cost:** Needs AX Code runtime (`act` fields are Desktop only; `invoke` arguments and `always` scope require runtime metadata).
   - **Acceptance check:** Approval cards and transcript rows display the specific tool/action name, target/arguments, explicit "Always allow" scope, and distinct failure badges when collapsed.

4. **Model guardrails for `desktop_webmcp` (invoke templates, pre-invoke schema validation, `nextAction` hints)**
   - **Value:** Prevents weaker/faster models from hallucinating tool arguments or getting stuck in retry loops, making WebMCP dependable across model tiers.
   - **Evidence:** Audit Idea 5, PRD CS-24, PRD 4a ("weaker models misusing tools").
   - **Task:** W-Use (running multi-step WebMCP tasks on cost-efficient models).
   - **Cost:** Needs AX Code runtime.
   - **Acceptance check:** The WebMCP probe passes end-to-end with `deepseek-flash` and one additional non-frontier model on the pinned runtime.

5. **Actionable error banner with Chromium/runtime error codes and a fix button**
   - **Value:** Replaces opaque failure text with the actual cause (e.g., `ERR_UNSAFE_PORT (-312)`, runtime disconnected) and a one-click remediation.
   - **Evidence:** Audit P1.3 (`EmbeddedWebMcpBrowser.tsx:211-219`), Audit Idea 4, PRD CS-20.
   - **Task:** T6 & W-Debug (diagnosing navigation and tool failures).
   - **Cost:** Needs AX Code runtime (Desktop can surface Chromium net errors immediately; structured runtime reason codes need runtime support).
   - **Acceptance check:** Navigating to an unsafe port or triggering a runtime rejection displays the exact error code/reason and a recovery action button instead of generic text.

6. **Builder onboarding & fallback guidance on `0 tools` pages**
   - **Value:** Tells users the agent can still read/click the DOM via snapshot fallback, while giving builders a starter snippet to register `navigator.modelContext` tools.
   - **Evidence:** Audit P2 ("A page without tools does not say the agent can still read and click it", "No guide for developers making their own page usable").
   - **Task:** W-Build & W-Use on non-WebMCP pages.
   - **Cost:** Desktop only.
   - **Acceptance check:** A page with 0 registered tools states that DOM read/click access remains available and links to a copyable WebMCP registration guide.

### MINUS (-): Things to Remove or Stop Showing

1. **False "The agent cannot open pages itself" copy**
   - **Value:** Stops misleading users about runtime 7.28+ navigation capabilities.
   - **Evidence:** Audit Journey (05), Audit P1.5 (`en.ts:2660`).
   - **Task:** T6 (initial browser setup).
   - **Cost:** Desktop only.
   - **Acceptance check:** String `en.ts:2660` (and all 14 locale equivalents) is removed or updated to reflect agent navigation support.

2. **Duplicate "Start a session & enable agent access" button and duplicate bad-URL error text**
   - **Value:** Removes visual clutter and confusing redundant CTAs/messages in draft and error states.
   - **Evidence:** Audit Journey (02, 10).
   - **Task:** T6 (starting a session from a draft or recovering from a typo).
   - **Cost:** Desktop only.
   - **Acceptance check:** Draft view renders exactly one primary CTA button, and invalid URLs render a single error message.

3. **Zero-size resize disconnect when modals/dialogs open**
   - **Value:** Prevents opening Settings or any modal from silently killing active agent access and stranding pending approvals.
   - **Evidence:** Audit P1.1 (`EmbeddedWebMcpBrowser.tsx:144-150`, `desktop-webmcp-browser.js:475-478`).
   - **Task:** T6 (checking Settings or handling a dialog mid-run).
   - **Cost:** Desktop only.
   - **Acceptance check:** Opening a modal or Settings over the browser panel keeps WebMCP enrolled and allows a pending approval to succeed upon return.

4. **Overloaded "WebMCP" naming across three unrelated surfaces**
   - **Value:** Eliminates confusion between the embedded project browser, the Chrome-bridge allowlist, and an external MCP server named `webmcp`.
   - **Evidence:** Audit P2 ("Three different things are called 'WebMCP'").
   - **Task:** T6 & configuration discovery.
   - **Cost:** Desktop only.
   - **Acceptance check:** UI labels distinctly name "Project Browser (WebMCP)", "Chrome Extension Bridge", and external MCP servers across all 14 locales.

5. **Native WebContentsView z-index overlap over the Services dropdown**
   - **Value:** Restores access to top-bar navigation controls while the embedded browser is visible.
   - **Evidence:** Audit P2 ("The native page covers the Services dropdown (10b)").
   - **Task:** T6 (switching services while using the project browser).
   - **Cost:** Desktop only.
   - **Acceptance check:** Opening the Services dropdown while a native page is loaded renders the menu cleanly above or hides/insets the native view.

### MULTIPLY (x): Tangled Flows/Controls to Decompose

1. **Runtime readiness vs. version mismatch vs. page enrolment state**
   - **Value:** Stops blaming "Update the bundled runtime" when the runtime merely hasn't reported support yet, and prevents showing "Agent access on" when the runtime rejects the page.
   - **Evidence:** Audit P1.5 (`useWebMcpBrowser.ts:107`), PRD CS-20.
   - **Task:** T6 (troubleshooting connection states).
   - **Cost:** Desktop only.
   - **Acceptance check:** State machine separates `unreported/connecting`, `unsupported-version`, `page-rejected`, and `enrolled`, with "Agent access on" shown only in `enrolled`.

2. **"Start a session" vs. "Navigate to URL" vs. "Enable agent access"**
   - **Value:** Allows users to type a URL and press Go in a draft before starting a session or granting agent access.
   - **Evidence:** Audit Journey (02: "the address bar is editable while Go is disabled"), Audit Idea 2.
   - **Task:** T6 (previewing a local app before enabling agent control).
   - **Cost:** Desktop only.
   - **Acceptance check:** Address bar `Go` works independent of session/enrolment state, and "Let the agent use this page" is a separate one-click toggle.

3. **Semantic WebMCP (`invoke`) vs. DOM fallback (`act`/`snapshot`) status**
   - **Value:** Clarifies whether the agent is using structured page tools or generic DOM clicking/reading.
   - **Evidence:** Audit P2 ("0 tools available" without explaining DOM fallback), WebMCP/recap PRD Section 1.
   - **Task:** T6, W-Build, W-Use.
   - **Cost:** Desktop only.
   - **Acceptance check:** Status badge explicitly distinguishes "DOM access on · 0 page tools" from "Page tools ready (N)".

### DIVIDE (/): Scattered Controls/States to Group

1. **Unified per-page WebMCP Drawer (registered tools + live call strip + approval decision)**
   - **Value:** Consolidates tool discovery, manual "Try it" testing, live call arguments/results, and permission provenance into one collapsible pane alongside the page.
   - **Evidence:** Audit Ideas 1 & 3, PRD CS-21 & CS-22.
   - **Task:** T6, W-Build, W-Verify.
   - **Cost:** Needs AX Code runtime (basic strip is Desktop-only; full `invoke` args and decision provenance need runtime).
   - **Acceptance check:** A single drawer in the project browser shows registered tools and a live chronological log of calls, arguments, results, and approval decisions.

2. **Supervision integration into Mission Control and Activity feed ( plus Recap)**
   - **Value:** Brings browser actions into the same supervision and return-to-project recap surfaces as file edits and shell commands.
   - **Evidence:** PRD CS-23, WebMCP/recap PRD Sections 1 & 2.
   - **Task:** T6 & W-Resume (supervising multi-session work and catching up).
   - **Cost:** Desktop only.
   - **Acceptance check:** A session using WebMCP displays an active browser indicator on its Mission Control row and logs browser tool outcomes in the Activity feed.

---

### Top 3 Items Overall (by User Value per Cost)

1. **Stop zero-size disconnect on dialogs & persist browser state (MINUS #3 + PLUS #2 — Desktop only):** Fixes the two most destructive P1 bugs (`EmbeddedWebMcpBrowser.tsx:95-150`, `desktop-webmcp-browser.js:108-123`, `475-478`) with zero runtime changes, immediately making the browser usable across Settings/session switches.
2. **Live per-page tool inspector & "Try it" drawer + `act` approval details (PLUS #1 + Desktop half of PLUS #3 — Desktop only):** Surfaces tool names/schemas that the page already registers and `act` fields (`PermissionCard.tsx:367-403`) that the runtime already sends, turning a blind counter into a real developer tool.
3. **Model guardrails + `invoke` argument/error metadata in runtime (PLUS #4 + runtime half of PLUS #3/#5 — Needs AX Code runtime):** Highest-leverage runtime change; makes weaker models (`deepseek-flash`) reliable and gives users full supervision over `invoke` calls.

### One Key Risk

**Cross-session storage persistence vs. security/isolation:** Fixing the storage wipe (`desktop-webmcp-browser.js:108-123`) so logins and URLs persist (CS-20) risks leaking authenticated session state across unrelated projects or untrusted pages if storage partitions are not strictly scoped per normalized project path (`normalizeProjectPath`) and origin policy, or if users assume disabling agent access also clears their logged-in browser session.