import { createAxCodeClient } from "../v2/client.js";
import { AX_CODE_WORKSPACE_HEADER, LEGACY_OPENCODE_WORKSPACE_HEADER } from "../protocol.js";
export function createHeadlessClient(input) {
    const fetchFn = input.fetch ?? fetch;
    const client = createAxCodeClient({
        baseUrl: input.baseUrl,
        directory: input.directory,
        fetch: fetchFn,
        headers: input.headers,
        experimental_workspaceID: input.experimental_workspaceID,
    });
    const send = (command) => sendHeadlessRuntimeCommand({
        command,
        baseUrl: input.baseUrl,
        fetch: fetchFn,
        headers: input.headers,
        directory: input.directory,
        experimental_workspaceID: input.experimental_workspaceID,
        client,
    });
    return {
        client,
        async createSession(session) {
            const result = await client.session.create(session ?? {});
            const created = result.data;
            if (!created?.id)
                throw new Error("Failed to create headless session: response did not include id");
            return created;
        },
        send,
        sendPrompt(sessionID, body, options) {
            return send({ type: "session.prompt", mode: options?.mode ?? "async", sessionID, body });
        },
        sendCommand(sessionID, body, options) {
            return send({ type: "session.command", mode: options?.mode ?? "async", sessionID, body });
        },
        sendShell(sessionID, body, options) {
            return send({ type: "session.shell", mode: options?.mode ?? "async", sessionID, body });
        },
        abort(sessionID) {
            return send({ type: "session.abort", sessionID });
        },
        replyPermission(body) {
            return send({ type: "permission.reply", body });
        },
        replyQuestion(body) {
            return send({ type: "question.reply", body });
        },
        sessionEvidence: {
            load(sessionID, parameters) {
                return loadSessionEvidence(input, fetchFn, sessionID, parameters);
            },
        },
        workflowTemplate: {
            list() {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-templates",
                    method: "GET",
                });
            },
            get(templateID) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-templates/${encodeURIComponent(templateID)}`,
                    method: "GET",
                });
            },
            save(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-templates",
                    method: "POST",
                    body: body,
                });
            },
            promote(templateID) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-templates/${encodeURIComponent(templateID)}/promote`,
                    method: "POST",
                });
            },
        },
        workflowRun: {
            list(parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-runs",
                    method: "GET",
                    query: parameters,
                });
            },
            dashboard(parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-runs/dashboard",
                    method: "GET",
                    query: parameters,
                });
            },
            evalCases() {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-runs/eval-cases",
                    method: "GET",
                });
            },
            create(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-runs",
                    method: "POST",
                    body: body,
                });
            },
            get(runID) {
                return workflowRunCommand(input, fetchFn, runID, "GET");
            },
            artifacts(runID, parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-runs/${encodeURIComponent(runID)}/artifacts`,
                    method: "GET",
                    query: parameters,
                });
            },
            evalSummary(runID, body = {}) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-runs/${encodeURIComponent(runID)}/eval-summary`,
                    method: "POST",
                    body: body,
                });
            },
            evalCase(runID, body = {}) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-runs/${encodeURIComponent(runID)}/eval-case`,
                    method: "POST",
                    body,
                });
            },
            saveTemplate(runID, body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-runs/${encodeURIComponent(runID)}/save-template`,
                    method: "POST",
                    body: body,
                });
            },
            start(runID, body = {}) {
                return workflowRunCommand(input, fetchFn, runID, "POST", "start", body);
            },
            pause(runID) {
                return workflowRunCommand(input, fetchFn, runID, "POST", "pause");
            },
            resume(runID) {
                return workflowRunCommand(input, fetchFn, runID, "POST", "resume");
            },
            cancel(runID) {
                return workflowRunCommand(input, fetchFn, runID, "POST", "cancel");
            },
            retry(runID, parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/workflow-runs/${encodeURIComponent(runID)}/retry`,
                    method: "POST",
                    query: parameters,
                });
            },
        },
        workflowRoutine: {
            create(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-routines",
                    method: "POST",
                    body: body,
                });
            },
            list() {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-routines",
                    method: "GET",
                });
            },
            run(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/workflow-routines/run",
                    method: "POST",
                    body: body,
                });
            },
        },
        taskQueue: {
            list(parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/task-queue",
                    method: "GET",
                    query: parameters,
                });
            },
            enqueue(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/task-queue",
                    method: "POST",
                    body,
                });
            },
            edit(id, body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/task-queue/${encodeURIComponent(id)}/edit`,
                    method: "POST",
                    body,
                });
            },
            pause(id) {
                return taskQueueCommand(input, fetchFn, id, "pause");
            },
            resume(id) {
                return taskQueueCommand(input, fetchFn, id, "resume");
            },
            cancel(id) {
                return taskQueueCommand(input, fetchFn, id, "cancel");
            },
            retry(id) {
                return taskQueueCommand(input, fetchFn, id, "retry");
            },
            sendNow(id) {
                return taskQueueCommand(input, fetchFn, id, "send-now");
            },
            reorder(id, position) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/task-queue/${encodeURIComponent(id)}/reorder`,
                    method: "POST",
                    body: { position },
                });
            },
            remove(id) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/task-queue/${encodeURIComponent(id)}`,
                    method: "DELETE",
                });
            },
        },
        scheduledTask: {
            list(parameters) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/scheduled-task",
                    method: "GET",
                    query: parameters,
                });
            },
            create(body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: "/scheduled-task",
                    method: "POST",
                    body,
                });
            },
            update(id, body) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/scheduled-task/${encodeURIComponent(id)}/update`,
                    method: "POST",
                    body,
                });
            },
            pause(id) {
                return scheduledTaskCommand(input, fetchFn, id, "pause");
            },
            resume(id) {
                return scheduledTaskCommand(input, fetchFn, id, "resume");
            },
            runNow(id) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/scheduled-task/${encodeURIComponent(id)}/run-now`,
                    method: "POST",
                });
            },
            remove(id) {
                return requestJson({
                    baseUrl: input.baseUrl,
                    fetch: fetchFn,
                    headers: input.headers,
                    directory: input.directory,
                    experimental_workspaceID: input.experimental_workspaceID,
                    path: `/scheduled-task/${encodeURIComponent(id)}`,
                    method: "DELETE",
                });
            },
        },
        async *subscribe(options = {}) {
            const subscription = await client.event.subscribe({}, { signal: options.signal });
            for await (const event of subscription.stream) {
                yield event;
            }
        },
    };
}
async function sendHeadlessRuntimeCommand(input) {
    switch (input.command.type) {
        case "session.prompt":
            return postSessionCommand(input, {
                sessionID: input.command.sessionID,
                route: input.command.mode === "sync" ? "message" : "prompt_async",
                body: input.command.body,
            });
        case "session.command":
            return postSessionCommand(input, {
                sessionID: input.command.sessionID,
                route: input.command.mode === "sync" ? "command" : "command_async",
                body: input.command.body,
            });
        case "session.shell":
            return postSessionCommand(input, {
                sessionID: input.command.sessionID,
                route: input.command.mode === "sync" ? "shell" : "shell_async",
                body: input.command.body,
            });
        case "session.abort":
            return postJson(input, `/session/${encodeURIComponent(input.command.sessionID)}/abort`, undefined);
        case "permission.reply":
            return { accepted: true, status: 200, body: await input.client.permission.reply(input.command.body) };
        case "question.reply":
            return { accepted: true, status: 200, body: await input.client.question.reply(input.command.body) };
    }
}
function postSessionCommand(input, command) {
    return postJson(input, `/session/${encodeURIComponent(command.sessionID)}/${command.route}`, command.body);
}
function taskQueueCommand(input, fetchFn, id, command) {
    return requestJson({
        baseUrl: input.baseUrl,
        fetch: fetchFn,
        headers: input.headers,
        directory: input.directory,
        experimental_workspaceID: input.experimental_workspaceID,
        path: `/task-queue/${encodeURIComponent(id)}/${command}`,
        method: "POST",
    });
}
function workflowRunCommand(input, fetchFn, runID, method, command, body) {
    return requestJson({
        baseUrl: input.baseUrl,
        fetch: fetchFn,
        headers: input.headers,
        directory: input.directory,
        experimental_workspaceID: input.experimental_workspaceID,
        path: `/workflow-runs/${encodeURIComponent(runID)}${command ? `/${command}` : ""}`,
        method,
        body: body,
    });
}
function scheduledTaskCommand(input, fetchFn, id, command) {
    return requestJson({
        baseUrl: input.baseUrl,
        fetch: fetchFn,
        headers: input.headers,
        directory: input.directory,
        experimental_workspaceID: input.experimental_workspaceID,
        path: `/scheduled-task/${encodeURIComponent(id)}/${command}`,
        method: "POST",
    });
}
async function loadSessionEvidence(input, fetchFn, sessionID, parameters = {}) {
    const encodedSessionID = encodeURIComponent(sessionID);
    const requests = {
        risk: requestJson({
            baseUrl: input.baseUrl,
            fetch: fetchFn,
            headers: input.headers,
            directory: input.directory,
            experimental_workspaceID: input.experimental_workspaceID,
            path: `/session/${encodedSessionID}/risk`,
            method: "GET",
            query: {
                quality: true,
                findings: true,
                envelopes: true,
                reviewResults: true,
                debug: true,
                hints: true,
            },
        }),
        dre: requestJson({
            baseUrl: input.baseUrl,
            fetch: fetchFn,
            headers: input.headers,
            directory: input.directory,
            experimental_workspaceID: input.experimental_workspaceID,
            path: `/session/${encodedSessionID}/dre`,
            method: "GET",
        }),
        semantic: requestJson({
            baseUrl: input.baseUrl,
            fetch: fetchFn,
            headers: input.headers,
            directory: input.directory,
            experimental_workspaceID: input.experimental_workspaceID,
            path: `/session/${encodedSessionID}/diff/semantic`,
            method: "GET",
        }),
        rollback: requestJson({
            baseUrl: input.baseUrl,
            fetch: fetchFn,
            headers: input.headers,
            directory: input.directory,
            experimental_workspaceID: input.experimental_workspaceID,
            path: `/session/${encodedSessionID}/rollback`,
            method: "GET",
        }),
        branch_rank: parameters.includeBranchRank
            ? requestJson({
                baseUrl: input.baseUrl,
                fetch: fetchFn,
                headers: input.headers,
                directory: input.directory,
                experimental_workspaceID: input.experimental_workspaceID,
                path: `/session/${encodedSessionID}/branch/rank`,
                method: "GET",
                query: { deep: parameters.deepBranchRank },
            })
            : Promise.resolve(undefined),
    };
    const entries = await Promise.all(Object.entries(requests).map(async ([source, request]) => {
        const result = await Promise.resolve(request).then((value) => ({ status: "fulfilled", value }), (error) => ({ status: "rejected", reason: error }));
        return [source, result];
    }));
    const evidence = {
        sessionID,
        rollback: [],
        errors: [],
    };
    for (const [source, result] of entries) {
        const typedSource = source;
        if (result.status === "rejected") {
            evidence.errors.push({ source: typedSource, message: errorMessage(result.reason) });
            continue;
        }
        switch (typedSource) {
            case "risk":
                evidence.risk = result.value;
                break;
            case "dre":
                evidence.dre = result.value;
                break;
            case "semantic":
                evidence.semantic = result.value;
                break;
            case "rollback":
                evidence.rollback = Array.isArray(result.value) ? result.value : [];
                break;
            case "branch_rank":
                evidence.branchRank = result.value;
                break;
        }
    }
    return evidence;
}
async function postJson(input, path, body) {
    const response = await input.fetch(new URL(path, input.baseUrl), {
        method: "POST",
        headers: {
            ...headlessHeaders(input),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Headless runtime command failed (${response.status}): ${text || response.statusText}`);
    }
    if (response.status === 202)
        return { accepted: true, status: 202 };
    const text = await response.text();
    return {
        accepted: true,
        status: 200,
        body: parseHeadlessRuntimeResponseBody(text),
    };
}
async function requestJson(input) {
    const url = new URL(input.path, input.baseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value !== undefined)
            url.searchParams.set(key, String(value));
    }
    const response = await input.fetch(url, {
        method: input.method,
        headers: {
            ...headlessHeaders(input),
            ...(input.body ? { "Content-Type": "application/json" } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Headless runtime request failed (${response.status}): ${text || response.statusText}`);
    }
    return parseHeadlessRuntimeResponseBody(await response.text());
}
export function parseHeadlessRuntimeResponseBody(text) {
    if (!text)
        return true;
    return parseHeadlessRuntimeJsonBody(text);
}
export function parseHeadlessRuntimeJsonBody(text) {
    try {
        return JSON.parse(text);
    }
    catch (cause) {
        throw new Error(`Headless runtime returned invalid JSON: ${text.slice(0, 200)}`, { cause });
    }
}
function headersToRecord(headers) {
    if (!headers)
        return {};
    if (headers instanceof Headers)
        return Object.fromEntries(headers.entries());
    if (Array.isArray(headers))
        return Object.fromEntries(headers);
    return headers;
}
function headlessHeaders(input) {
    const headers = headersToRecord(input.headers);
    if (input.directory) {
        const encodedDirectory = /[^\x00-\x7F]/.test(input.directory)
            ? encodeURIComponent(input.directory)
            : input.directory;
        headers["x-ax-code-directory"] = encodedDirectory;
        headers["x-opencode-directory"] = encodedDirectory;
    }
    if (input.experimental_workspaceID) {
        headers[AX_CODE_WORKSPACE_HEADER] = input.experimental_workspaceID;
        headers[LEGACY_OPENCODE_WORKSPACE_HEADER] = input.experimental_workspaceID;
    }
    return headers;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
