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

- Run `add_task` with a title and watch the list update.
- Run it with a title of only spaces. The form sends it exactly as typed, the page's own check rejects it, and the panel shows
  the page's error: `{ "error": { "field": "title", "constraint": "minLength: 1", "got": "   " } }`. (An empty title is stopped
  by the form first, because the schema marks `title` as required.)

## 4. Let the agent use it

1. Start or select a coding session, then choose **Enable agent access**.
2. Ask the agent, for example: "Add a high-priority task called Ship the beta, then complete the release notes task."
3. Each call shows an approval card that says in one sentence what will happen, with the page and the tool (and its input, on
   runtimes that send it). After the first call, **Agent calls (N)** appears under the page with each call and its outcome, and
   the conversation records each one. Beside **Stage, Commit and Push**, a recap lists what the agent did in the browser during
   its latest turn, including page tools it never called.

**Disconnect agent** turns access off. Agent access also pauses while the project browser cannot be seen: when it is closed,
covered by a dialog, or the window is minimized or hidden. Choose **Resume agent access** to continue.

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
  could stall the agent); validate formats in your `execute` function instead.
- The project browser shows at most 64 tools per page, and fewer if their definitions together exceed 256 KiB.
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

Exit codes: 0 every check passed, 1 the page did not load, left the allowed origins, or an expected tool is missing, 2 no
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
| Agent access stopped by itself | the browser was closed, covered by a dialog, or the window was minimized or hidden | show it again and choose **Resume agent access** |
| A tool is missing after an action | it was unregistered by its `AbortSignal` | expected when it no longer applies |
| **Try it** shows an error result | your `execute` returned an error, or threw | prefer returning `{ error: { field, constraint, got } }`; it tells the agent what to fix |
| The agent picks the wrong tool, or never calls one | overlapping tools or vague descriptions | merge or rename tools; state inputs and results in the description; the landing recap lists tools never called |
