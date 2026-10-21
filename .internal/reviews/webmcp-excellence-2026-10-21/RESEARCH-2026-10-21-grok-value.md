# What an excellent WebMCP experience is worth to coders

The 20 October 2026 draft (not a W3C standard) puts tools on `document.modelContext`. That IDL settles the earlier note that the move off `navigator.modelContext` was only a secondary report. https://webmachinelearning.github.io/webmcp

In an app that already embeds the page, WebMCP adds no reach: the browser can already read, click, and type, and a host-permission extension can inject script without it. https://developer.chrome.com/docs/agents/security The gain is a name, a schema, a JSON result, and a log on the user's session. Tools die with the tab. https://blog.openreplay.com/webmcp-vs-mcp/

## 1. Value for the AI coder

**Session, then a function.** On one publishing task, a screenshot agent and Playwright MCP each had to log in again; a resident browser reused the session, and canvas was invisible to the accessibility tree. https://juejin.cn/post/7698058565157896218

**Checkout, measured by Stripe.** Sixty runs, six models, half with tools: every run completed payment. The tool arm used 42% fewer tokens, 38% fewer actions, and was 39% faster (about 60 seconds). Baseline: 1.8 million tokens, 38.83 actions, over 2.5 minutes. They credit progressive disclosure (`submit_payment` only once the form is valid) and declarative forms that share the human UI's code. https://stripe.dev/blog/how-stripe-is-designing-checkout-for-ai-agents

**Lookups, one author.** Paul Conroy, gpt-4o-mini, 10 questions × 10 runs, page-text versus five tools: median about 27× fewer tokens and about 1/22 the cost (range 4.8×–82×; one search 47,315 vs 1,024). He drives the tools himself and calls this a ceiling once discovery works. The browse arm is extracted text, so raw HTML would look worse. https://www.conroyp.com/articles/making-my-website-agent-friendly-webmcp-field-test

**Vendor benchmark, disclosed bias.** WindTunnel, 49 tasks × 3, eight sites. Board of 18 October 2026: WebMCP solves 48–49/49, median 3.4× faster and 9× cheaper. https://webmcp.com/benchmark The authors wrote the tools in `goldens/` and disclose it. https://github.com/nekuda-ai/WindTunnel/blob/main/docs/SPEC.md Plouffe found no independent replication, and on Chromium 153 an object where the build wanted a JSON string returned `UnknownError: Failed to parse input arguments`. https://dplouffe.ca/2026/10/10/webmcp-browser-agent-tools/

**Text is not always cheaper.** Nine Playwright MCP calls on a signup flow returned 124,300 tokens. Snapshots averaged 13,800; a 1280×800 screenshot about 1,400. https://dev.to/ji_ai/playwright-mcp-token-usage-9-tool-calls-62-of-my-context-4on2

**Coding tasks.** Confirming a row, a failed job, or a filter is one call and a JSON oracle in the logged-in tab. A form the agent just built can be a declarative tool, so the schema tracks the fields (Stripe). GitHub, CI, or an admin page pays off only after that site registers tools. ChatGPT's desktop browser consumes "site tools" with no origin-trial token, and still asks before a purchase. https://help.openai.com/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app https://blog.tobira.ai/webmcp-adoption-2026/ On 21 October an OpenAI engineer wrote that WebMCP is on for MCP Apps in ChatGPT Desktop. https://x.com/ndmccormack/status/2112701653098930296 GPT-5.6 Luna has site tools off. https://learn.chatgpt.com/docs/webmcp A July review found almost no mainstream caller and no published pilot counts. https://www.spronta.com/blog/state-of-webmcp-july-2026/ A September crawl claims 2,236 live sites; not re-checked. https://www.thelazyweb.com/webmcp/ Layout stays human: agents walk past ugly UI unless asked. https://x.com/kunchenguid/status/2094609213532332528 Chrome's agent tools can `list_webmcp_tools` and `execute_webmcp_tool`. https://developer.chrome.com/docs/devtools/agents/webmcp-debugging

An 89% token cut and an 85% to 98% accuracy jump have no method attached. Unverified. https://chanl.ai/blog/webmcp-every-website-tool-ai-agents The current best-practices page does not state the 500/150/30/1.5K caps the earlier review gave that URL. Unverified against the page fetched here. https://developer.chrome.com/docs/ai/webmcp/best-practices

## 2. Value for the human coder

A call is a reviewable event on the page the person is watching. The call also runs as the logged-in user (Conroy). OpenAI still confirms a purchase after a site approval, and says a site tool cannot authorize sharing data. https://help.openai.com/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app

2026 complaints are about babysitting:

- "By the 40th approval I'm not reviewing anything." https://x.com/ManiishSharma_/status/2111090287703478772 Same week, a ChatGPT/Codex user on approving every five minutes. https://x.com/BradGroux/status/2109421689633227257
- HN's permission-fatigue game (386 points): daily auto-allow, and sandboxes that then allowlist a whole command forever. https://news.ycombinator.com/item?id=48308376
- A 10-developer approval gateway: agents skipped it for the direct server. A click has no intent to gate. https://www.reddit.com/r/aiagents/comments/1x31t5b/we_piloted_an_mcp_approval_gateway_with_10_devs/ Dropping the prompt, a growth agent posted alone and Reddit removed it in under a minute. https://www.reddit.com/r/AI_Agents/comments/1x8ewm9/week_4_of_letting_a_claude_code_agent_run_growth/
- WebMCP does not help scraping sites that never register tools. https://news.ycombinator.com/item?id=46969572 "Auth and permissions become the hard part." https://x.com/saen_dev/status/2112764393976913966

Chrome's bar: one job per tool, register it only when it applies, accept raw strings, validate in code, return an error the model can retry. https://developer.chrome.com/docs/ai/webmcp/best-practices

## 3. Owning the code and the running app

| Idea | Already shipping | Still open |
| --- | --- | --- |
| Add a tool, then see it register | Chrome's agent prompt "implement `book_flight`", then `list_webmcp_tools`. https://developer.chrome.com/docs/devtools/agents/webmcp-debugging | Scaffold bound to the handler in the diff. Same function. Declarative if it is a form. |
| Test the surface | `playwright-webmcp`: `toMatchCalls`, schema smoke, `expectedCall` evals, ESLint, TOOLS.md. https://pascalbirchler.com/testing-webmcp-with-playwright/ Chrome evals use `expectedCall`. https://developer.chrome.com/docs/ai/webmcp/evals | Run that gate before the agent says the UI works. |
| Replay one call | DevTools pane: list, counts, replay with editable input. https://developer.chrome.com/docs/devtools/application/webmcp | Replay from the agent transcript. |
| Record a test from use | Playwright codegen and Test Agents record clicks. https://playwright.dev/python/docs/codegen | No product found that turns a session's WebMCP call into a committed test. Absence unverified. |
| Call jumps to source | Not found. | Novel. |
| One evidence bundle | DevTools logs input, output, status. | Args, result, duration, screenshots, console, and the diff hunk, on the turn. Not found as one object. |

## 4. Ten acceptance tests

Earlier approval-card, pause, and stop criteria still stand.

**Human.** (1) A form tool updates the on-screen fields before the next step. A state change with no DOM change is badged "no visible effect" and cannot auto-run. https://developer.chrome.com/docs/ai/webmcp/best-practices (2) Auto-run only for project origin + tool name + schema hash + `readOnlyHint`. One new schema property prompts again. A consequential tool prompts once per hash per session. Any other origin always prompts. Chrome: assume mutation unless `readOnlyHint` says otherwise. https://developer.chrome.com/docs/agents/security (3) A fixture call writes args, result, duration, two screenshots, console, and a source path, and a reviewer opens it without a re-run. (4) Every step is tagged tool, snapshot, or screenshot. An untagged recap fails.

**Agent.** (5) A tool registered mid-task is in `getTools()` within one second, with description, schema, and hints, and the agent calls it without being told the name. The result names any tool it just unlocked (Conroy's backstop; the spec does not force a re-poll). (6) Twenty `expectedCall` prompts × three runs match name and key arguments on ≥90%, or the description failed. https://developer.chrome.com/docs/ai/webmcp/evals (7) A bad argument returns `{field, constraint, got}`, and a corrected second call succeeds with no human. Plouffe's parse error fails this.

**Tool author.** (8) Adding a form field changes the declarative schema with no second file (Stripe). An imperative schema whose keys differ from the function fails lint. (9) A description that is only a prohibition ("don't use this for weather") fails lint, as do overlapping tools. https://developer.chrome.com/docs/ai/webmcp/best-practices (10) CI fails on a zero-width character in a description, `toolautosubmit` on a card field, and a tool that returns third-party text beside a consequential tool. https://pascalbirchler.com/testing-webmcp-with-playwright/

## 5. Risks

Chrome names two doors: hostile definitions (name, parameters, description) and contaminated outputs (comments, reviews). Delimiter spotlighting is cheap and can be escaped; their high-risk example is base64, about 33% more tokens. `untrustedContentHint` is a label, not a filter. https://developer.chrome.com/docs/agents/security https://contextbolt.com/blog/webmcp-security-checklist/ `readOnlyHint` can lie after a refactor, and the tool list can change after consent, so bind approval to a hash and keep parameter lists small. https://blog.agentailor.com/posts/before-you-add-webmcp https://www.vietanh.dev/blog/2026-07-06-webmcp-agent-ready-website An always-allow that survives a schema edit trains a rubber stamp. https://nhimg.org/faq/what-breaks-when-approval-prompts-are-not-enough-for-ai-coding-agents/ Chrome's Prompt API can reject `null` silently, https://pascalbirchler.com/testing-webmcp-with-playwright and a zero invocation count means the tool was never chosen. https://developer.chrome.com/docs/devtools/application/webmcp An agent that can also click will click past a gate (the Reddit pilot). Plouffe reads WebKit #670 as oppose (no consent or reversibility) and Mozilla #1412 as neutral; those threads were not re-read here. https://dplouffe.ca/2026/10/10/webmcp-browser-agent-tools/ https://github.com/WebKit/standards-positions/issues/670 https://github.com/mozilla/standards-positions/issues/1412

## 6. Twelve features, ranked

Human value / AI value / effort / novelty, for this app.

1. **Prefer a tool, and label the path** (tool, snapshot, or screenshot). H / H / S / low.
2. **Schema-hash approvals**, test 2. H / H / M / medium.
3. **Evidence bundle on the turn**, test 3. H / M / M / medium.
4. **Scaffold the tool in the same diff** as the feature, same function, declarative for forms. M / H / M / high.
5. **Save the call as a regression test** (args, JSON assertion, one screenshot). H / H / M / high.
6. **Error wrapper** `{field, constraint, got}`. M / H / S / low.
7. **Click a call, open `registerTool`.** H / H / M / high.
8. **`expectedCall` gate** before "the UI works." H / H / H / medium.
9. **Untrusted-output channel.** Hinted results are data and cannot satisfy an approval. H / M / M / low.
10. **Tools-never-called recap** after a verify task. H / M / S / low.
11. **Progressive-disclosure lint.** Unregister with `AbortSignal` when the precondition fails. M / H / M / medium.
12. **Visible-effect badge**, test 1. H / L / S / medium.

Leave out a global always-allow, a tool that is not in the diff, and `toolautosubmit` on anything consequential.

**Unverified here:** whether this Electron build exposes `document.modelContext` without a flag; the Lazyweb count of 2,236; any product outside these sources that already links a call to source or writes the bundle.
