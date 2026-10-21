# WebMCP state of the art (2026-10-21), input to PRD-2026-10-21-webmcp-excellence-v1

Method: web research by a research agent (Claude), with a source URL for each external claim. Claims without a primary source
are marked unverified. This is an input to the requirements discussion, not a decision.

## 1. Spec status

- A draft Community Group Report of the W3C Web Machine Learning CG (20 October 2026), not on the standards track.
  https://webmachinelearning.github.io/webmcp/
- Entry point: `document.modelContext` (secure contexts) with `registerTool(tool, {exposedTo, signal})` (abort unregisters),
  `getTools({fromOrigins})`, `executeTool(tool, input, {signal})` returning a JSON string, and `toolchange`, `toolactivated`,
  `toolcancel` events.
- Tool descriptor: `name` (1 to 128 characters of letters, digits, `_ - .`), optional `title`, required `description`,
  `inputSchema` (invalid schemas rejected), `execute`, and `annotations`: `readOnlyHint`, `untrustedContentHint`,
  `consequentialHint`, `debugging` (all false by default). No `destructiveHint`. A `tools` Permissions-Policy defaults to
  same site only.
- 2026 history: Chrome 146 behind a flag on `navigator.modelContext` (https://developer.chrome.com/blog/webmcp-epp);
  `provideContext`/`clearContext` removed because a third-party script could overwrite a site's tools
  (https://dev.to/jangwook_kim_e31e7291ad98/webmcps-origin-trial-providecontext-is-already-gone-54j8); the move to
  `document.modelContext` and a Chrome 150 deprecation of `navigator` are from secondary sources only (unverified); origin trial
  Chrome 149 to 156 with shipping planned for 157; no Firefox or Safari position; W3C TAG review pending
  (https://developer.chrome.com/blog/ai-webmcp-origin-trial).
- Declarative forms: `toolname`, `tooldescription`, `toolparamdescription`; the browser focuses and fills the form visibly;
  `toolautosubmit`, `SubmitEvent.agentInvoked`, `respondWith()` (https://developer.chrome.com/docs/ai/webmcp/declarative-api).
- Consent: the draft names tool poisoning, output injection, misrepresented tools, over-parameterized privacy leaks; its only
  confirmation hook is `consequentialHint`; agents must not rely on a site's claims; cross-origin rules are a TODO. Chrome's
  `requestUserInteraction()` guidance was not found in the 20 October draft (unverified or removed).
  https://developer.chrome.com/docs/ai/webmcp/secure-tools

## 2. Builder tooling

- Chrome DevTools Application > WebMCP: live tool list with call counts, invoked-tools log (status, input, output), filters, a
  Play button that replays a call with editable prefilled input, schema mismatch reporting; a zero count marks a tool the agent
  never chose. https://developer.chrome.com/docs/devtools/application/webmcp
- Chrome DevTools MCP: `list_webmcp_tools`, `execute_webmcp_tool` behind `--categoryExperimentalWebmcp`.
- Model Context Tool Inspector extension; MCP-B polyfill with a testing shim; TestingBot guidance for Playwright, Selenium and
  Puppeteer tests.
- Chrome best practices: avoid overlapping tools, opaque values and model-side arithmetic; validate in code; register only tools
  that make sense in the current state; update the UI after an action; actionable errors; description under 500 characters,
  parameter description under 150, name under 30, output under about 1.5K.
  https://developer.chrome.com/docs/ai/webmcp/best-practices

## 3. Browser-agent UX patterns

- Claude in Chrome: manual, auto with a safety check, or skip approvals; per-site approvals revocable in settings; blocked
  high-risk categories. https://support.claude.com/en/articles/12902446
- ChatGPT Atlas: logged-out mode without the user's cookies; watch mode pausing on sensitive sites; no downloads or code.
  https://help.openai.com/en/articles/12628199
- Gemini in Chrome: a separate critic model that sees action metadata and can veto; read-only versus read-write origin sets;
  confirmation before banking or medical sites; repeated vetoes hand control back.
  https://9to5google.com/2025/12/08/gemini-chrome-agentic-security/
- Perplexity Comet: shows what it is doing, stop or redirect mid-task, asks before logins and purchases (secondary source).
- Cline: screenshot plus console logs after each browser action. Cursor: pick an element and send its HTML, CSS and position.
  Playwright MCP: accessibility snapshots with stable element references. MCP Inspector: schema-generated forms, a CLI for CI,
  per-launch token, secrets in the OS keychain.
- MCP tool annotations: clients auto-approve read-only tools and prompt for destructive ones; unannotated tools are treated as
  possibly destructive; hints are not a security boundary.
- No product documentation found on the accessibility of approval or monitoring UI (gap).

## 4. Known pain points

- Claude in Chrome: prompts on every click despite "Always allow"; approvals timing out in another window; popups that never
  appear; tool calls hanging for hours while a prompt waits (anthropics/claude-code issues 67020, 66125; claudeissues 101431).
- Prompt injection: 23.6 % attack success before mitigations and 11.2 % after (Anthropic, August 2025); hidden-text and
  screenshot injection against Comet (Brave).
- Atlas agent mode: slow and error-prone bookings. Playwright MCP: snapshot context bloat (unverified figures), elements under
  dialogs reported as clickable. Cursor: element picking broken in some builds.

## 5. Candidate excellence criteria (persona A supervisor, B builder)

1. [A, B] The tool list follows `toolchange` within a second; each tool shows name, title, description, schema, origin, hints and
   whether it comes from a form or a script.
2. [A] Unannotated tools are treated as consequential; `readOnlyHint` alone never skips approval on an untrusted origin.
3. [A] Trust per origin, tool or session, time-bounded and revocable in one place, effective on the next call.
4. [A] The approval card shows origin, tool, exact masked arguments, hints, the goal it serves and a plain effect statement built
   from call data, not from the site's own description.
5. [A] A pending approval shows a countdown and a clear timeout result; it never blocks a call indefinitely.
6. [A] "Always allow" holds for its stated scope, proven by a test with no second prompt.
7. [A] Output marked `untrustedContentHint` is labelled and passed to the model as untrusted.
8. [A] Every call is logged (time, input, output, status, duration) and can be reopened; form-based calls highlight the form.
9. [A] Pause, Stop and Take over are keyboard and screen-reader reachable and abort an in-flight call so the page sees
   `toolcancel`.
10. [A] Sign-in and payment pages hand control to the person; the agent defaults to a profile without existing cookies.
11. [A] An end-of-task recap: tools called, effects, before and after screenshots, failures with their text.
12. [B] A schema-generated Run form and replay of a logged call with editable input.
13. [B] Lint: invalid schemas, name and description length, opaque enums, overlapping tools, form tools without descriptions.
14. [B] Schema mismatches show the exact JSON path; tools the agent never chose stay visible with a zero count.
15. [B] A headless path lists and runs tools for CI with exit codes.
