# Round 12 Q12 review: the quickstart read by a first-time builder (MiniMax-M3, read-only)

I read all four artifacts and cross-checked every claim against the implementation, the i18n catalog, and the repo's own native-WebMCP evidence. No files were modified.

**Verification method / caveat:** this was a static review. `bash` was unavailable in this turn, so I could not execute the test suite; every finding below is a source cross-reference, and I flag explicitly where a claim is inferred rather than proven.

---

# Review: WebMCP onboarding (first-time builder)

## HIGH

**H1 — Step 3's "empty title" demo is unreachable; the UI blocks it before the page runs.**
`docs/webmcp-page-tools.md:31-32` says *"Run it with an empty title to see the error the page returns."* But `title` is `required` (`docs/examples/webmcp-quickstart/index.html:73`), Try-it builds a real form from that schema (`WebMcpToolPanel.tsx:61,128-147` via `webMcpToolForm.ts:17-26`), and `toolInput` returns `{ok:false, field:"title"}` for an empty required field *before any page call* (`webMcpToolForm.ts:40-42`) → the panel prints "Check the value of title" (`WebMcpToolPanel.tsx:75` → `en.ts:2688`). The page's `invalid("title","minLength: 1", …)` (`index.html:77`) can therefore only be reached via the agent. A builder following the guide sees a *different* error than promised and concludes the example is broken.

**H2 — Two different surfaces share the label "Project browser (WebMCP)"; the guide collapses them into one ambiguous step, and Preview is the default tab.**
`docs/webmcp-page-tools.md:22` — *"open the context panel and choose **Project browser (WebMCP)**"*. In reality:
- The context panel's own mode is **"Browser"** (`en.ts:1072`), hosting a *different* embedded browser with its own trust notice (`en.ts:1083-1084`). Inside it sits the action **"Open the project browser (WebMCP)"** (`en.ts:1074`, rendered at `ContextPanel-impl.tsx:2147-2150`).
- The project browser pane then has its own tab switcher, "Preview" / "Project browser (WebMCP)" (`en.ts:2734-2735`, `EmbeddedWebMcpBrowser.tsx:515-516`), and **defaults to Preview** (`React.useState(false)`, `EmbeddedWebMcpBrowser.tsx:484`).

Page tools only exist in agent mode — `WebMcpToolPanel` is rendered inside `AgentBrowser` (`EmbeddedWebMcpBrowser.tsx:435`). Mitigated for that one button (it requests agent mode, `useWebMcpBrowser.ts:61-68`), but any other entry point lands on Preview with no page tools and no explanation.

**H3 — Troubleshooting attributes a *returned* error to a message the UI only shows for a *thrown* one.**
`docs/webmcp-page-tools.md:94`: *"your `execute` threw **or returned an error**"*. The "The tool did not complete…" copy (`en.ts:2690`) is emitted only when the adapter rejects (`WebMcpToolPanel.tsx:96-99` ← `desktop-webmcp-browser.js:628-630` ← `native-webmcp.js:224`, `result.status !== "Completed"`). A tool that *returns* `{error:{…}}` completes normally and renders as a **green success box** containing the JSON (`WebMcpToolPanel.tsx:93-95,167-176`). So the guide inverts the behavior for the exact error shape it recommends 40 lines earlier (`docs/webmcp-page-tools.md:54`). (The thrown-error half is inferred from the status check; the returned-error half is certain from the code.)

## MEDIUM

**M1 — "Agent calls" is invisible until the first call, but the guide sends you to look for it.**
`docs/webmcp-page-tools.md:38-39`. `WebMcpCallStrip` returns `null` when there are no calls (`WebMcpCallStrip.tsx:28`) and only renders with a session selected (`EmbeddedWebMcpBrowser.tsx:433`). Same pattern for Page tools at `WebMcpToolPanel.tsx:196`.

**M2 — Four real UI failure states have dedicated copy but no troubleshooting row.**
- no session → `en.ts:2703`, `desktop-webmcp-browser.js:530-532`
- runtime incompatible → `en.ts:2700`, `desktop-webmcp-browser.js:561-564`
- paused (window hidden/minimized) → `en.ts:2629-2631`, `desktop-webmcp-browser.js:432-434,663`
- Chrome bridge paused → `en.ts:2717-2718`

The guide mentions closing/dialogs (`docs/webmcp-page-tools.md:41-42`) but never says **minimizing the window silently drops agent access**.

**M3 — No version requirement anywhere; the guide cannot help you self-diagnose "unsupported".**
The guide states none. The pinned runtime is `7.28.0` (`config/ax-code-runtime.json:3`) and the capability is `desktop.webmcp.v1` (`native-webmcp.js:6`). The UI can say *"Update the bundled AX Code runtime to let the agent use page tools"* (`en.ts:2700`) with no doc counterpart.

**M4 — The `pattern` rule is unverifiable from this repo and stated without a version.**
`docs/webmcp-page-tools.md:68-69` ("Upcoming AX Code runtimes reject them"). Desktop copies `inputSchema` through verbatim (`native-webmcp.js:137`); there is **no** sanitizer on this side, and the runtime is a separately pinned signed artifact. A builder cannot check the rule, and "upcoming" gives no version or date.

**M5 — Binding `127.0.0.1` then browsing `localhost` is a live trap.**
Step 1 binds IPv4-only (`docs/webmcp-page-tools.md:17`) while the troubleshooting row offers `localhost` as an equivalent host (`:91`, accepted at `native-webmcp.js:41`). If `localhost` resolves to `::1` first, the pane shows ERR_CONNECTION_REFUSED (`en.ts:2634`) — which that table attributes to "start the server".

**M6 — `navigator.modelContext` fallback is presented as supported.**
`docs/webmcp-page-tools.md:46` and `index.html:50`. In-repo evidence says that path was **unavailable**: *"Legacy navigator.modelContext … Expected unavailable: WebMCP.enable not found"* (`.internal/reports/webmcp-native-2026-10-11/README.md:16`). The example ships a fallback that never worked.

**M7 — Try-it's input affordance is undocumented.**
`docs/webmcp-page-tools.md:30` never says Desktop generates a form from your schema, nor that it silently degrades to a raw **"Input (JSON object)"** textarea defaulting to `{}` (`WebMcpToolPanel.tsx:64,150-157`) for any non-flat schema — nested objects, arrays, non-string enums, or >24 properties (`webMcpToolForm.ts:16,20,27`). Directly relevant to the guide's own "use plain inputs" advice (`:52`).

## LOW / INFO

- **L1** Quoted strings are approximate: `"{origin} · no page tools registered"` (`:92`) is really *"…; the agent can still read and act on the page."* (`en.ts:2714`); the UI renders "Page tools (4)" (`WebMcpToolPanel.tsx:206`) and "Agent calls (n)" (`WebMcpCallStrip.tsx:39`); the address placeholder is `https://` (`en.ts:2726`) while the guide teaches `http://127.0.0.1:4173`.
- **L2** "At most 64 tools per page" (`:70`) is correct (`desktop-webmcp-browser.js:157`) but omits a second cap of 256 KiB of catalog bytes that can cut the list short *below* 64 (`desktop-webmcp-browser.js:158,169`).
- **L3** Never mentions one pane per window — reopening replaces the current page (`desktop-webmcp-browser.js:350`).
- **L4** Example's `got` is inconsistent: the raw string at `index.html:77`, a length at `index.html:78` — and that shape is what the guide tells builders to imitate (`:53-54`).

---

## Where I'd get stuck, in order

1. Open context panel → land in **"Browser"** (the wrong browser) or in **Preview**; no page tools, no explanation → H2.
2. Page tools list empty → is my code wrong? Nothing says the strip appears only after a call → M1.
3. Run `add_task` with an empty title → "Check the value of title", not the page's error → H1.
4. Click **Enable agent access** with no session → *"Start a coding session…"*, not in the table → M2.
5. Minimize the app while testing → access silently paused, no row for it → M2.
6. `localhost` vs the bound `127.0.0.1` → refused connection attributed to "start the server" → M5.

## Does the example follow its own advice?

**Yes, on every §5 bullet** — one job per tool (`:55,64,94`); description states input origin (`:96` "from list_tasks"); plain inputs + `enum` (`:71`); validate in code with actionable errors (`:76-78`); conditional registration with `AbortSignal` (`:86-118`, genuinely good); visible update after each action (`:81,107,120`); `readOnlyHint` (`:59`); declarative form tool with `agentInvoked`/`respondWith` and no `toolautosubmit` (`:20-23,123-130`); no `pattern`/`patternProperties` anywhere.

The one real irony: **the flagship demo cannot demonstrate its own recommended error contract through the first screen the guide tells you to use** (H1).

## Onboarding score (B5): **5 / 10**

Genuinely above-average: real working example, honest 10-minute scope, correct origin rules (`native-webmcp.js:41`), correct 64-tool cap, correct "JSON string" caveat for the pinned Chromium 152 (`docs/webmcp-page-tools.md:77-79` is right — pinned Electron is `44.9.0`/`desktop/packages/electron/package.json:30`, and `.internal/reports/ELECTRON-45-2026-10-11-candidate.md:46` shows object input rejected on Chromium 152), and a troubleshooting table that beats most vendor docs.

Held back by H1–H3: the first-run navigation path is genuinely ambiguous, the demo step produces the wrong observable, and the troubleshooting table encodes a wrong cause for its most likely error. Three of the top six stuck points are caused by the UI hiding state the guide assumes is visible. Fix H1–H3 and the two M1/M2 rows and this is an 8.
## Dispositions

- H1 fixed: step 3 uses a title of only spaces, which the form sends exactly (M12) and the page rejects; the guide shows the
  page's error and explains why an empty title is stopped by the form first.
- H2 fixed: step 2 starts from the WebMCP title-bar control (the path the native journey `project-browser-webmcp.mjs` drives)
  and says to choose the Project browser (WebMCP) tab when Preview is selected.
- H3 fixed: with M12 a returned error is shown as an error; the troubleshooting row now says so and prefers returned errors.
- M1 fixed (Page tools and Agent calls appear when there is something to show, said in steps 2 and 4); M2 fixed (rows for no
  session, runtime update, paused access, connection refused); M3 partly (the runtime row says to update the app; no version is
  stated because the runtime is pinned per release); M4 fixed wording (the next runtime contract, no date); M5 fixed (same host
  in both places); M6 fixed (no `navigator.modelContext` fallback in the example; verified in the bundled engine); M7 fixed
  (form generation and JSON editor described). L1 fixed (exact labels); L2 fixed (256 KiB catalog cap and 64 KiB input and result
  cap); L4 fixed (`got` is the raw value in both checks). L3 (one pane per window) is addressed by WX-15, not documented as
  permanent.
