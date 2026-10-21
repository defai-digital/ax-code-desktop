# Make your web app usable by the agent (WebMCP page tools)

AX Code Desktop has a project browser where the coding agent can use the web app you are building. Pages can register **page
tools** through WebMCP: named functions with a description and an input schema that the agent can list and call. A tool call
runs in that tab as the signed-in person, and each call asks you before it runs.

This guide takes about ten minutes. It uses the example in [`examples/webmcp-quickstart/`](examples/webmcp-quickstart/index.html).

This is about your own app. For the separate development surface that exposes AX Code Desktop's own controls to an agent, see
[development-webmcp.md](development-webmcp.md).

## 1. Serve the example

The project browser lets the agent use `https://` pages and `http://` pages on `localhost`, `127.0.0.1` or `[::1]`.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs/examples/webmcp-quickstart
```

Use the same host in the address bar (`127.0.0.1`). `localhost` may resolve to `[::1]`, which this server does not listen on.

## 2. Open it in the project browser

1. In a project, choose **WebMCP** in the title bar. The project browser opens beside the conversation.
2. If the **Preview** tab is selected, choose the **Project browser (WebMCP)** tab. Page tools exist only there; Preview is a
   plain preview of your app.
3. Enter `http://127.0.0.1:4173` and choose **Go**.
4. **Page tools (4)** appears once the page registers its tools. Open it to see `search_tasks`, `list_tasks`, `add_task` and
   `complete_task`. A page without tools shows "This page registers no page tools." and a link back to this guide.

If no tools appear, see [Troubleshooting](#troubleshooting).

## 3. Try a tool yourself

Open a tool to see a form generated from its input schema; schemas that are nested or too large for fields get a JSON editor
instead. **Try it** runs the tool on the page as you; the agent is not involved and nothing is added to the conversation.

The open tool also shows:

- The full accepted description (up to 4096 characters), including line breaks. The collapsed row stays short.
- **Form** or **Script**. A form is a declarative tool on the page. A script is a function the page registered.
- Hint badges for `readOnlyHint`, `untrustedContentHint` and `consequentialHint` (the browser's shorter annotation names
  count too). Hints never approve a call and never grant the agent access. A tool with no hints is not an approval either.
- **Input schema**, collapsed until you open it. It is a redacted, bounded schema display as read-only text. The panel does not treat that text
  as HTML.
- Authoring notes: a long name or description, a missing description, an opaque value, or the schema keywords `pattern` and
  `patternProperties`. These notes are advice. **Try it** still runs. The page and the AX Code runtime decide what is valid.

If the page registers more than the panel lists, the panel says so, for example "Showing 64 of 65". The list stops at 64
tools or 256 KiB of definitions, whichever comes first. Tools past that cap stay registered; they are left off this list.

When the page's latest registration is rejected, the panel names the tool and the reason. A duplicate name, a schema this
browser cannot accept, a name over 256 characters, a missing or over-long description, a definition over 32 KiB, or a
catalog over 128 tools or 256 KiB are named. Tools already accepted stay listed. The project browser stays connected.

**Registration** lists tools added, removed, or changed on this page, each with a short digest of the definition. A result
from before a definition change is marked stale. Text you typed is kept when the same definition is registered again,
including a reload. Drafts, the registration list, results, and the manual journal stay in memory for this page view.
Opening another origin clears them. They are not written to disk.

**Manual journal.** Each **Try it** that is actually sent is kept for this page view, newest first, up to 32 runs. A row
records the tool, the input, the outcome, how long it took, and the definition digest it ran against. Choose **Replay**
on a row to fill the form with that input. You can edit the input and choose **Try it** again. Replay does not run the
tool by itself, and it does not discard the result already shown. Sensitive journal input values are replaced with
`<fill in>` before retention; re-enter those values before replaying.

**Compare with the agent.** Open a tool to see your latest manual run beside the agent's most recent call to that tool
in the transcript. The agent's side shows the redacted arguments the transcript already shows. When both runs record a
definition digest and those digests differ, the panel says the runs used different definitions. A missing digest is not
treated as a difference.

**Schema check.** For your manual run and for the agent's call, the panel checks the input against the tool's current
schema. It names the failing property, the rule (`required`, `type`, `enum`, `minimum`, `maximum`, `minLength`, or
`maxLength`), and the kind of value (`absent`, `null`, `string`, `number`, `integer`, `boolean`, `array`, or `object`).
The check is advisory and never blocks **Try it**. It shows the definition digest the call ran against when that digest
is known, and it says when that definition is not the one registered now. When the runtime did not send an arguments
object and did not send an input preview, the panel says that the runtime did not provide arguments and does not guess
an input.

**Regression export.** From a journal run, or from the agent's call when its input is a JSON object, **Copy test** copies
a snippet that loads the tool with `document.modelContext.getTools()` and calls it through
`document.modelContext.executeTool` with `JSON.stringify(...)`, then asserts the recorded outcome. **Copy --run
argument** copies the same input for `pnpm run webmcp:check`. Export is available only for completed and
application-error outcomes. Timeout, cancellation, uncertain transport, and admission failures have no export because a
standalone page call cannot reproduce the adapter deadline, cancellation, or admission context.

- Run `add_task` with a title and watch the list update.
- Run it with a title of only spaces. The form sends it exactly as typed, the page's own check rejects it, and the panel shows
  the page's error: `{ "error": { "field": "title", "constraint": "minLength: 1", "got": "   " } }`. (An empty title is stopped
  by the form first, because the schema marks `title` as required.)

The call strip and landing recap retain a redacted result preview for structured application errors, even when the
runtime provides no failure reason. Page and agent text is filtered before display, copying, or durable history storage.
Address history persists only the HTTP(S) origin; paths, queries, fragments, and user info are never saved. Existing
history is scrubbed on read. Reopening a session starts at that origin with agent access off.

## 4. Let the agent use it

1. Start or select a coding session, then choose **Enable agent access**.
2. Ask the agent, for example: "Add a high-priority task called Ship the beta, then complete the release notes task."
3. Each call shows an approval card that says in one sentence what will happen, with the page and the tool (and its input, on
   runtimes that send it). After the first call, **Agent calls (N)** appears under the page with each call and its outcome, and
   the conversation records each one. Beside **Stage, Commit and Push**, a recap lists what the agent did in the browser during
   its latest turn, including page tools it never called.

**Pause agent** stops the agent's calls and leaves you in control of the same page. The page and its document stay; nothing
is rolled back. The browser says "You have control of the page. The agent's calls wait until you resume." If a call was
stopped, it also says that the changes already made on the page stay. Choose **Resume agent** to let waiting calls
continue. Pausing one coding session does not pause another.

**Disconnect agent** turns access off. That is separate from **Pause agent**.

New agent calls wait while the project browser cannot be seen: when its pane is closed or covered by a dialog, or the
window is minimized or hidden. Show that session's page again to wake eligible waiting calls automatically; there is no
separate visibility-resume step. Calls whose deadline has passed do not run. Work already executing is not cancelled by
hiding the page. If you explicitly chose **Pause agent**, showing the page does not resume access: choose **Resume agent**.

### Several sessions

The project browser keeps one live page for each coding session, and at most four live pages at once. Sessions of one
project share that project's sign-in. Another project has its own. The agent acts only on the page you are showing. A
call for a hidden page waits, and the browser says "Agent call waiting for this page to be visible." Switching sessions
hides a page instead of closing it. **Pages** in the browser pane lists every page this window holds, with its project,
session, origin and access state, and lets you show a page or revoke one session's agent access. A waiting call also
appears in Needs you, on that session's Mission Control row and in its session-grid slot. When four pages are live, opening
another may unload the least recently used hidden page only when it is idle and has no detected unsaved-work signal or
`beforeunload` handler. Pages with editable, custom/shadow, frame or drawing surfaces, prior keyboard/mouse input, or
manual/agent actions are conservatively retained. An inconclusive probe also retains the page. Automatic closure honors
`beforeunload`, including a handler installed after the probe. A safely unloaded page keeps its address in memory and
reopens with agent access off. If no page can be unloaded, the existing pool-full state lists the retained pages so you can
return to the named page, save your work, and decide which page to close.

Quit, restart (including menu and appearance restarts), and update installation first ask the project-browser pages to
close. A refusal cancels shutdown before background services stop or the process exits, and brings the retained page and
its window to the front. Save your work or close the page explicitly, then retry. Inconclusive probes retain their bounded
deadline and use the same unsaved-work confirmation as explicit page closure; cancelling keeps the app running. Confirmation
is bound to the current documents, so navigation while a prompt is open cannot authorize discarding a replacement document.

## 5. Write tools the agent gets right

Register with `document.modelContext.registerTool(tool, { signal })`. (Early Chrome builds used `navigator.modelContext`; the
engine in AX Code Desktop does not, so the example does not fall back to it.)

- **One job per tool**, with a name that says it (`add_task`, not `handle`). Keep names short.
- **Describe what the tool does and returns** in the first sentence. Say where inputs come from ("the task id from
  `list_tasks`").
- **Use plain inputs.** Accept the raw text a person would type; use `enum` for fixed choices instead of opaque codes; do not
  ask the model to do arithmetic or reformat values.
- **Validate in code as well as in the schema**, and return errors the model can act on. The example returns
  `{ error: { field, constraint, got } }`.
- **Register a tool only while it makes sense** and unregister it with the `AbortSignal` when it no longer does
  (`complete_task` disappears when every task is done).
- **Update the visible page after each action**, so you and the agent can see that it worked.
- **Mark read-only tools** with `annotations: { readOnlyHint: true }`. Hints are shown to you; they never approve anything on
  their own.
- **Forms can be tools.** Add `toolname`, `tooldescription` and `toolparamdescription` to a `<form>`. When the agent calls it,
  the browser fills the form where you can see it; answer with `event.respondWith(...)` when `event.agentInvoked` is set. Do not
  use `toolautosubmit` on anything with consequences.

### Schema limits

- Keep schemas to plain JSON Schema objects: `type`, `properties`, `required`, `enum`, `minimum`/`maximum`,
  `minLength`/`maxLength`, `description`, `default`.
- Avoid `pattern` and `patternProperties`. The next AX Code runtime contract rejects them (a page-supplied regular expression
  could stall the agent); validate formats in your `execute` function instead. The page tools panel names those keywords as
  advice. It does not block **Try it**, and it is not the runtime's schema check.
- The project browser's page tools panel shows at most 64 tools, and fewer if their definitions together exceed 256 KiB.
  It says "Showing N of M" when it stops. The browser itself accepts up to 128 tools and 256 KiB; past that, the panel
  names the catalog as too large instead of dropping tools quietly or disconnecting.
- Inputs and results above 64 KiB are refused.

## 6. Test your tools

- Use **Try it** for each tool, including a wrong input.
- Ask the agent to perform a task using only page tools and check **Agent calls**: a tool the agent never chooses usually needs a
  clearer name or description.
- Automated tests can call tools in the page from your browser test runner. Pass the input as a JSON string; the browser engine
  bundled with AX Code Desktop answers an object with `UnknownError: Failed to parse input arguments`. The result is a JSON
  string too:

  ```js
  const tool = (await document.modelContext.getTools()).find((candidate) => candidate.name === "add_task")
  const result = JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify({ title: "Ship the beta" })))
  ```

  The page tools panel copies this shape from a journal run or from the agent's call, and it copies the matching
  `--run '<tool>={"..."}'` argument used by the command below.

### In CI

`pnpm run webmcp:check` (in this repository) loads a page in the browser engine AX Code Desktop bundles, lists the page tools
it registers and runs the ones you name, then exits with a status code:

```sh
pnpm run webmcp:check -- --url http://127.0.0.1:4173 \
  --expect-tools add_task,list_tasks \
  --run 'add_task={"title":"Ship the beta"}' --run list_tasks
```

| Option | Meaning |
| --- | --- |
| `--url <url>` | The page to check (required) |
| `--run <tool>='<json object>'` | Run a tool with this input; repeatable |
| `--expect-tools a,b` | Fail when one of these tools is not registered |
| `--settle <ms>` | How long to wait for late registrations (default 5000) |
| `--timeout <ms>` | Limit for loading the page and for each run (default 15000) |
| `--json` | Print the tools, their schemas and each run's outcome as JSON |
| `--verbose` | Show the browser engine's own output |

Exit codes: 0 every check passed, 1 the browser engine failed or exceeded its deadline, the report is incomplete, the page
did not load, left the allowed origins, or an expected tool is missing, 2 no
page tools, 3 a run failed (the tool is missing, threw, did not answer in time, or returned an error such as
`{ error: ... }`), 64 usage error. The same origin rules apply as in the project browser, to every redirect and navigation:
`https://`, or `http://` on `localhost`, `127.0.0.1` or `[::1]`. It needs `pnpm install` in this repository (it uses the
bundled engine), and on Linux a display server, for example `xvfb-run -a pnpm run webmcp:check -- ...`. Form tools are run
through the page's model context, which is not the path an agent's call takes; check those in the project browser too.

## Troubleshooting

| You see | Likely cause | What to do |
| --- | --- | --- |
| No **Page tools**, page loads | the **Preview** tab is selected, registration threw, or it ran before `document.modelContext` existed | choose **Project browser (WebMCP)**; check the page console; register after load |
| "This page registers no page tools." | the page registered nothing | the agent can still read and act on the page; add tools for reliable actions |
| "Page not usable by the agent" | `http://` on a host other than `localhost`, `127.0.0.1` or `[::1]` | use one of those hosts, or `https://` |
| The page does not load (connection refused) | the server is not running, or it listens on another host than the address bar uses | start it; use the same host in both |
| "Start a coding session to enable agent access" | no coding session is selected | start or select a session, then enable agent access |
| "Update the bundled AX Code runtime to let the agent use page tools." | the bundled runtime does not support the project browser | update AX Code Desktop |
| Agent calls wait for the page to be visible | the browser pane was closed, covered by a dialog, or the window was minimized or hidden | show that session's page again; eligible calls continue automatically. An explicit **Pause agent** still requires **Resume agent** |
| A tool is missing after an action | it was unregistered by its `AbortSignal`, or the panel is showing 64 of N | check **Registration**; a cap leaves later tools off the list and says how many were registered |
| The panel names a rejected registration | two tools share a name in one update, or a name, description, or schema is outside the limits above | the message names the tool; fix that registration. Tools already accepted stay, and the project browser stays connected |
| A previous **Try it** result is marked stale | the page registered a different definition for that tool | run it again if you still want a result for the new definition. The journal row still names the digest it ran against, and the schema check says the definition changed |
| The schema check says the runtime did not provide arguments | the runtime sent no arguments object and no input preview | nothing is guessed. Compare the text the transcript shows. A newer runtime can send an input preview |
| Typed input disappeared | the tool's definition changed, or you opened another page | the same definition keeps what you typed, including across a reload of that page |
| **Try it** shows an error result | your `execute` returned an error, or threw | prefer returning `{ error: { field, constraint, got } }`; it tells the agent what to fix |
| The agent picks the wrong tool, or never calls one | overlapping tools or vague descriptions | merge or rename tools; state inputs and results in the description; the landing recap lists tools never called |

### Credential filtering and identity checks

Credential parameter names are decoded before checking query strings, fragments (including hash routes), and path or
matrix parameters. Nested percent encodings are checked too. Display filtering does not rewrite the address draft used
for navigation. Checker reports redact diagnostic text, but expected-tool and requested-run checks compare original
identities using per-check keyed receipts across the disk boundary; different names that display as `[redacted]` cannot
satisfy each other's checks.

Approval input summaries include every required name even if the schema omits its property definition. Required names
come first; names beyond the twelve-input display limit count toward the total and omitted-required notice.

Manual calls that were sent retain their outcome when registrations change during execution; the journal marks the definition as changed. Browser eviction probes bound every debugger command, including cleanup, to 250 ms. A timeout conservatively retains the page and releases the pool queue. Credential filtering covers signed download URLs (Azure SAS, AWS, Google Cloud and CloudFront) and OAuth callback codes, across previews and checker reports. Advisory input diagnosis also names required properties missing from the schema's `properties` map.

### Sign-in windows and sign-out

Sign-in popups opened with `window.open()` or `target="_blank"` use the opener project's
isolated browser profile. They accept only HTTP and HTTPS navigation. These human-only
windows have no page-tool adapter, preload, Node.js integration, or agent access; downloads
remain blocked. Agent requests on the opener wait while any sign-in window remains open.
Finish signing in and close all of its sign-in windows to resume queued requests, subject to
their original deadline, cancellation, visibility, and pause checks. Closing the opener also closes its sign-in windows after any required unsaved-work
confirmation. Revoking agent access preserves the opener and its sign-in windows. Pages with an open sign-in window are not evicted.

**Sign out of project browser** closes the project's pages and sign-in windows and clears
that project's browser storage. Closing a page alone keeps its sign-in for other project pages.

### Closing pages with unsaved work

Sign out checks every live project page, including hidden sessions and sign-in
popups, using the same sticky interaction flag and bounded document probe as
pool eviction. Close checks the affected page and its popups. If any page may
contain unsaved work, the Desktop confirmation dialog identifies all affected
sessions and pages. Cancel preserves the pages and project storage. Approval is
one-use and bound to the window, action, page inventory and document generation;
a changed document requires a fresh confirmation. Disconnect and revoke stop
agent access while preserving browser pages and sign-in popups.

Manual Try it inputs with sensitive names are masked and disable autocomplete,
including integer PINs and numeric CVVs. Submitted values retain their schema
number type. Copy recap includes the full-turn count and, when capped, the
truncation notice; displayed and copied steps retain their original numbers.


### Credential display and executable input

Credential assignments are filtered case-insensitively, including labels with spaces or hyphens
such as `API key`, `private key`, `access token`, and `x-api-key`, with `:` or `=` and optional quotes.
Filtering occurs before display truncation and before checker reports are written.

The catalog retains an untouched executable schema within its existing size budget. Property keys,
constants, defaults, and enum values retain their exact registered values. Display labels are separately
redacted and bounded; enum controls submit the original value selected by index, including long values
and values whose displayed prefixes collide. The read-only schema block is a display projection only.

JSON input is masked by default when any nested schema property is sensitive or the draft contains
credential-shaped text. Show JSON input / Hide JSON input explicitly controls visibility; autocomplete
and spellcheck are disabled. Restored drafts start masked again. Revealing input never changes the
submitted JSON.

If a checker run times out without confirmed termination, every remaining requested run is recorded
as not run (contaminated). The check fails and no later tool is invoked in that page, preventing a
still-running mutation from contaminating subsequent checks.
