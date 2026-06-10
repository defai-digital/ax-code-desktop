import type { Event, WorkflowRoutineCreateData, WorkflowRoutineRunData, WorkflowTemplateSaveData, WorkflowRunArtifactsData, WorkflowRunCreateData, WorkflowRunDashboardData, WorkflowRunEvalSummaryData, WorkflowRunEvalSummaryResponse, WorkflowRunGetResponse, WorkflowRunListData, WorkflowRunRetryData, WorkflowRunSaveTemplateData } from "../v2/index.js";
import type { HeadlessCommandBody, HeadlessPermissionReplyBody, HeadlessPromptBody, HeadlessQuestionReplyBody, HeadlessRuntimeCommand, HeadlessRuntimeCommandResult, HeadlessShellBody } from "./command.js";
export type HeadlessClientOptions = {
    baseUrl: string;
    directory?: string;
    fetch?: typeof fetch;
    headers?: RequestInit["headers"];
    experimental_workspaceID?: string;
};
export type HeadlessSubscribeOptions = {
    signal?: AbortSignal;
};
export type HeadlessCreateSessionInput = {
    title?: string;
};
export type HeadlessClient = ReturnType<typeof createHeadlessClient>;
export type HeadlessGlobalHealth = {
    healthy: true;
    version: string;
    startup?: {
        startedAt: number;
        uptimeMs: number;
        checkedAt: number;
    };
    readiness?: {
        processAlive: true;
        apiReady: true;
        providersReady: "ready" | "degraded" | "unknown";
        indexReady: "ready" | "degraded" | "unknown";
    };
    runtime?: {
        directory: string;
        services: Array<{
            name: string;
            state: "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";
            pendingTasks: number;
            startedAt?: number;
            stoppedAt?: number;
            lastError?: string;
        }>;
        taskSummary: {
            queued: number;
            running: number;
            completed: number;
            failed: number;
            aborted: number;
        };
    };
};
export type HeadlessRuntimeCapabilities = {
    schemaVersion: 1;
    product: "ax-code";
    version: string;
    compatibility: {
        minDesktopVersion: string | null;
        sdkHeadless: {
            schemaVersion: 1;
            supportsManagedLifecycle: true;
            supportsExplicitBinary: true;
            supportsExplicitArgs: true;
            supportsStructuredDiagnostics: true;
            authSchemes: Array<"basic">;
            defaultTransport: "http-sse";
        };
    };
    endpoints: {
        health: "/global/health";
        events: "/global/event";
        config: "/global/config";
        capabilityCatalog: "/capability";
        fileSearch: "/find/file";
        sessions: "/session";
        providers: "/config/providers";
        agents: "/agent";
    };
    features: {
        sessions: true;
        asyncPrompt: true;
        globalEvents: true;
        fileSearch: true;
        skills: true;
        plugins: true;
        mcp: true;
        worktrees: true;
        providerManagement: true;
        usage: true;
    };
    events: {
        heartbeat: "server.heartbeat";
        connected: "server.connected";
        sessionCreated: "session.created";
        sessionStatus: "session.status";
        sessionError: "session.error";
        permission: "permission";
        question: "question";
    };
};
export type HeadlessTaskQueueKind = "prompt" | "command" | "shell" | "followup" | "subagent" | "review" | "automation";
export type HeadlessTaskQueueStatus = "queued" | "waiting_for_idle" | "running" | "blocked_permission" | "blocked_question" | "paused" | "failed" | "completed" | "cancelled";
export type HeadlessTaskQueueItem = {
    id: string;
    projectID: string;
    directory: string;
    worktree?: string;
    sessionID?: string;
    kind: HeadlessTaskQueueKind;
    status: HeadlessTaskQueueStatus;
    priority: number;
    position: number;
    title: string;
    agent?: string;
    model?: unknown;
    sourceMessageID?: string;
    sourceTaskID?: string;
    payload: Record<string, unknown>;
    error?: string;
    time: {
        created: number;
        updated?: number;
        started?: number;
        completed?: number;
    };
};
export type HeadlessTaskQueueEnqueueInput = {
    sessionID?: string;
    kind: HeadlessTaskQueueKind;
    title: string;
    worktree?: string;
    agent?: string;
    model?: unknown;
    sourceMessageID?: string;
    sourceTaskID?: string;
    payload?: Record<string, unknown>;
    priority?: number;
};
export type HeadlessTaskQueueEditInput = {
    title?: string;
    worktree?: string | null;
    agent?: string | null;
    model?: unknown;
    payload?: Record<string, unknown>;
    priority?: number;
};
export type HeadlessTaskQueueListInput = {
    sessionID?: string;
    status?: HeadlessTaskQueueStatus;
    limit?: number;
};
export type HeadlessScheduledTaskStatus = "active" | "paused" | "disabled";
export type HeadlessScheduledTaskSchedule = {
    type: "once";
    runAt: number;
} | {
    type: "daily";
    time: string;
    timezone?: string;
} | {
    type: "weekly";
    day: number;
    time: string;
    timezone?: string;
} | {
    type: "cron";
    expression: string;
    timezone?: string;
};
export type HeadlessScheduledTask = {
    id: string;
    projectID: string;
    directory: string;
    title: string;
    prompt: string;
    schedule: HeadlessScheduledTaskSchedule;
    status: HeadlessScheduledTaskStatus;
    agent?: string;
    model?: unknown;
    workflowTemplateID?: string;
    workflowStartOptions?: Record<string, unknown>;
    lastQueueID?: string;
    lastWorkflowRunID?: string;
    error?: string;
    nextRunAt?: number;
    lastRunAt?: number;
    time: {
        created: number;
        updated?: number;
    };
};
export type HeadlessScheduledTaskCreateInput = {
    title: string;
    prompt: string;
    schedule: HeadlessScheduledTaskSchedule;
    agent?: string;
    model?: unknown;
    workflowTemplateID?: string;
    workflowStartOptions?: Record<string, unknown>;
};
export type HeadlessScheduledTaskUpdateInput = Partial<HeadlessScheduledTaskCreateInput> & {
    status?: HeadlessScheduledTaskStatus;
};
export type HeadlessScheduledTaskListInput = {
    status?: HeadlessScheduledTaskStatus;
    dueBefore?: number;
    limit?: number;
};
export type HeadlessScheduledTaskRunNowResult = {
    task: HeadlessScheduledTask;
    queueItem?: HeadlessTaskQueueItem;
    workflowRun?: WorkflowRunGetResponse;
};
export type HeadlessWorkflowRunListInput = Omit<NonNullable<WorkflowRunListData["query"]>, "directory">;
export type HeadlessWorkflowRunDashboardInput = Omit<NonNullable<WorkflowRunDashboardData["query"]>, "directory">;
export type HeadlessWorkflowRunCreateInput = NonNullable<WorkflowRunCreateData["body"]>;
export type HeadlessWorkflowRunEvalSummaryInput = NonNullable<WorkflowRunEvalSummaryData["body"]>;
export type HeadlessWorkflowRunSaveTemplateInput = NonNullable<WorkflowRunSaveTemplateData["body"]>;
export type HeadlessWorkflowArtifactListInput = Omit<NonNullable<WorkflowRunArtifactsData["query"]>, "directory"> & {
    artifactID?: string;
};
export type HeadlessWorkflowRunRetryInput = Omit<NonNullable<WorkflowRunRetryData["query"]>, "directory">;
export type HeadlessWorkflowTemplateSaveInput = NonNullable<WorkflowTemplateSaveData["body"]>;
export type HeadlessWorkflowRoutineCreateInput = NonNullable<WorkflowRoutineCreateData["body"]>;
export type HeadlessWorkflowRoutineRunInput = NonNullable<WorkflowRoutineRunData["body"]>;
export type HeadlessWorkflowEvalCaseFindingStatus = "confirmed" | "likely" | "rejected" | "unverified";
export type HeadlessWorkflowEvalCase = {
    id: string;
    name: string;
    description: string;
    fixtureID: string;
    templateID: string;
    baseline: unknown;
    seeds: Array<{
        id: string;
        file: string;
        line: number;
        expectedStatus: HeadlessWorkflowEvalCaseFindingStatus;
        severity: "critical" | "high" | "medium" | "low" | "info";
        summary: string;
        rationale?: string;
    }>;
};
export type HeadlessWorkflowEvalCaseRunInput = {
    caseID?: string;
    now?: number;
};
export type HeadlessWorkflowEvalCaseRunSummary = {
    caseID: string;
    templateID: string;
    fixtureID: string;
    decision: "promote" | "hold" | "rollback";
    reasons: string[];
    missingSeedIDs: string[];
    mismatchedSeedIDs: string[];
    summary: WorkflowRunEvalSummaryResponse;
    metrics: Record<string, unknown>;
};
export type HeadlessWorkflowRunStartInput = {
    allowScaleBeyondDefaults?: boolean;
    allowWriteWorkflows?: boolean;
    durableChildren?: boolean;
    enqueueChildren?: boolean;
};
export type HeadlessSessionEvidence = {
    sessionID: string;
    risk?: unknown;
    dre?: unknown;
    semantic?: unknown;
    rollback: unknown[];
    branchRank?: unknown;
    errors: Array<{
        source: "risk" | "dre" | "semantic" | "rollback" | "branch_rank";
        message: string;
    }>;
};
export type HeadlessSessionEvidenceInput = {
    includeBranchRank?: boolean;
    deepBranchRank?: boolean;
};
export declare function createHeadlessClient(input: HeadlessClientOptions): {
    client: import("../v2/client.js").OpencodeClient;
    health(): Promise<HeadlessGlobalHealth>;
    capabilities(): Promise<HeadlessRuntimeCapabilities>;
    createSession(session?: HeadlessCreateSessionInput): Promise<import("../v2/client.js").Session>;
    send: (command: HeadlessRuntimeCommand) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody): Promise<HeadlessRuntimeCommandResult>;
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput): Promise<HeadlessSessionEvidence>;
    };
    workflowTemplate: {
        list(): Promise<{
            id: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            name: string;
            description: string;
            tags: Array<string>;
            revision: number;
            specHash: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            path?: string;
            time?: {
                created: number;
                updated: number;
            };
        }[]>;
        get(templateID: string): Promise<{
            id: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            name: string;
            description: string;
            tags: Array<string>;
            revision: number;
            specHash: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            path?: string;
            time?: {
                created: number;
                updated: number;
            };
        }>;
        save(body: HeadlessWorkflowTemplateSaveInput): Promise<{
            id: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            name: string;
            description: string;
            tags: Array<string>;
            revision: number;
            specHash: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            path?: string;
            time?: {
                created: number;
                updated: number;
            };
        }>;
        promote(templateID: string): Promise<{
            id: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            name: string;
            description: string;
            tags: Array<string>;
            revision: number;
            specHash: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            path?: string;
            time?: {
                created: number;
                updated: number;
            };
        }>;
    };
    workflowRun: {
        list(parameters?: HeadlessWorkflowRunListInput): Promise<import("../v2/client.js").WorkflowRunEventRecord[]>;
        dashboard(parameters?: HeadlessWorkflowRunDashboardInput): Promise<{
            runID: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            name: string;
            sourceTemplateID?: string;
            currentPhaseID?: string;
            currentPhaseName?: string;
            currentPhaseStatus?: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            elapsedMs: number;
            effort: "normal" | "deep" | "workflow" | "max-workflow";
            models: {
                default?: string;
                cheap?: string;
                strong?: string;
                planner?: string;
                worker?: string;
                verifier?: string;
                synthesizer?: string;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            budgetLimit: {
                maxTotalTokens: number;
                maxInputTokensPerChild: number;
                maxOutputTokensPerChild: number;
                maxWallTimeMs: number;
                maxConcurrentAgents: number;
                maxTotalAgents: number;
                maxToolCalls: number;
                maxRetries: number;
            };
            phaseCounts: {
                queued: number;
                running: number;
                blocked: number;
                paused: number;
                failed: number;
                completed: number;
                cancelled: number;
            };
            childCounts: {
                queued: number;
                running: number;
                blockedPermission: number;
                blockedQuestion: number;
                paused: number;
                failed: number;
                completed: number;
                cancelled: number;
            };
            artifactCounts: {
                summary: number;
                finding: number;
                patch: number;
                verification: number;
                metric: number;
                log: number;
            };
            verificationEnvelopeCount: number;
            evidenceRefCount: number;
            exposedArtifactCount: number;
            evaluation: {
                runID: string;
                sourceTemplateID?: string;
                decision: "promote" | "hold" | "rollback";
                reasons: Array<string>;
                metrics: {
                    status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
                    elapsedMs: number;
                    totalTokens: number;
                    inputTokens: number;
                    outputTokens: number;
                    toolCalls: number;
                    childAgents: number;
                    retries: number;
                    estimatedCostUsd: number;
                    costPerConfirmedFindingUsd: number | null;
                    verifiedCompletionCount: number;
                    costPerVerifiedCompletionUsd: number | null;
                    confirmedFindings: number;
                    likelyFindings: number;
                    rejectedFindings: number;
                    unverifiedFindings: number;
                    falsePositiveFindings: number;
                    artifactCount: number;
                    exposedArtifactCount: number;
                    verificationEnvelopeCount: number;
                    interventionCount: number;
                };
                budgetStatus: "ok" | "warning" | "exceeded";
                budgetWarnings: Array<string>;
                budgetExceeded: Array<string>;
                verificationSatisfied: boolean;
                comparison?: {
                    baselineLabel: string;
                    confirmedFindingsDelta: number;
                    falsePositiveFindingsDelta: number;
                    totalTokensDelta?: number;
                    elapsedMsDelta?: number;
                    estimatedCostUsdDelta?: number;
                    interventionCountDelta?: number;
                };
            };
            blockedReason?: string;
        }[]>;
        evalCases(): Promise<HeadlessWorkflowEvalCase[]>;
        create(body: HeadlessWorkflowRunCreateInput): Promise<import("../v2/client.js").WorkflowRunEventRecord>;
        get(runID: string): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
        artifacts(runID: string, parameters?: HeadlessWorkflowArtifactListInput): Promise<import("../v2/client.js").WorkflowArtifactEventRecord[]>;
        evalSummary(runID: string, body?: HeadlessWorkflowRunEvalSummaryInput): Promise<{
            runID: string;
            sourceTemplateID?: string;
            decision: "promote" | "hold" | "rollback";
            reasons: Array<string>;
            metrics: {
                status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
                elapsedMs: number;
                totalTokens: number;
                inputTokens: number;
                outputTokens: number;
                toolCalls: number;
                childAgents: number;
                retries: number;
                estimatedCostUsd: number;
                costPerConfirmedFindingUsd: number | null;
                verifiedCompletionCount: number;
                costPerVerifiedCompletionUsd: number | null;
                confirmedFindings: number;
                likelyFindings: number;
                rejectedFindings: number;
                unverifiedFindings: number;
                falsePositiveFindings: number;
                artifactCount: number;
                exposedArtifactCount: number;
                verificationEnvelopeCount: number;
                interventionCount: number;
            };
            budgetStatus: "ok" | "warning" | "exceeded";
            budgetWarnings: Array<string>;
            budgetExceeded: Array<string>;
            verificationSatisfied: boolean;
            comparison?: {
                baselineLabel: string;
                confirmedFindingsDelta: number;
                falsePositiveFindingsDelta: number;
                totalTokensDelta?: number;
                elapsedMsDelta?: number;
                estimatedCostUsdDelta?: number;
                interventionCountDelta?: number;
            };
        }>;
        evalCase(runID: string, body?: HeadlessWorkflowEvalCaseRunInput): Promise<HeadlessWorkflowEvalCaseRunSummary>;
        saveTemplate(runID: string, body: HeadlessWorkflowRunSaveTemplateInput): Promise<{
            id: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            name: string;
            description: string;
            tags: Array<string>;
            revision: number;
            specHash: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            path?: string;
            time?: {
                created: number;
                updated: number;
            };
        }>;
        start(runID: string, body?: HeadlessWorkflowRunStartInput): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
        pause(runID: string): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
        resume(runID: string): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
        cancel(runID: string): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
        retry(runID: string, parameters?: HeadlessWorkflowRunRetryInput): Promise<{
            id: string;
            projectID: string;
            directory: string;
            parentSessionID?: string;
            sourceTemplateID?: string;
            sourceTaskID?: string;
            status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
            currentPhaseID?: string;
            spec: {
                schemaVersion: 1;
                id: string;
                name: string;
                description: string;
                tags?: Array<string>;
                trigger?: {
                    kind: "manual";
                    source?: "prompt" | "command" | "api";
                } | {
                    kind: "scheduled";
                    schedule: string;
                    timezone?: string;
                    enabled?: boolean;
                } | {
                    kind: "command";
                    command?: string;
                } | {
                    kind: "api";
                    route?: string;
                    enabled?: boolean;
                } | {
                    kind: "webhook";
                    event: string;
                    enabled?: false;
                    securityGate?: "required";
                };
                inputs?: Array<{
                    id: string;
                    label?: string;
                    description?: string;
                    type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                    required?: boolean;
                    sensitive?: boolean;
                    default?: unknown;
                }>;
                routine?: {
                    enabled?: boolean;
                    mode?: "manual" | "scheduled" | "api" | "webhook";
                    schedule?: string;
                    timezone?: string;
                    apiRoute?: string;
                    webhookEvent?: string;
                    securityGate?: "local-only" | "required";
                };
                budget?: {
                    maxTotalTokens?: number;
                    maxInputTokensPerChild?: number;
                    maxOutputTokensPerChild?: number;
                    maxWallTimeMs?: number;
                    maxConcurrentAgents?: number;
                    maxTotalAgents?: number;
                    maxToolCalls?: number;
                    maxRetries?: number;
                };
                pacing?: {
                    maxRequestsPerMinute?: number;
                    maxTokensPerMinute?: number;
                };
                modelPolicy?: {
                    defaultModel?: string;
                    cheapModel?: string;
                    strongModel?: string;
                    plannerModel?: string;
                    workerModel?: string;
                    verifierModel?: string;
                    synthesizerModel?: string;
                    effort?: "normal" | "deep" | "workflow" | "max-workflow";
                    allowedProviders?: Array<string>;
                    routing?: Array<{
                        phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        use: "planner" | "worker" | "verifier" | "synthesizer";
                    }>;
                };
                permissions?: {
                    writePolicy?: "read-only" | "serialized" | "worktree-required";
                    allowedTools?: Array<string>;
                    networkPolicy?: "inherit" | "disabled" | "allowed";
                    escalationPolicy?: "inherit" | "ask" | "deny";
                };
                artifacts?: Array<{
                    id: string;
                    kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                    retention?: "ephemeral" | "session" | "durable";
                    exposeToMainContext?: boolean;
                    redaction?: {
                        status?: "none" | "redacted" | "pending";
                        summary?: string;
                    };
                }>;
                verification?: {
                    mode?: "required" | "optional" | "deferred" | "skipped";
                    workflow?: "review" | "debug" | "qa";
                    commands?: Array<string>;
                    requiredArtifactIds?: Array<string>;
                    reason?: string;
                };
                synthesis?: {
                    agent?: string;
                    model?: string;
                    outputFormat?: "markdown" | "json" | "table" | "findings";
                    exposeToMainContext?: boolean;
                    requiredArtifactIds?: Array<string>;
                };
                phases: Array<{
                    id: string;
                    name: string;
                    kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                    prompt?: string;
                    agent?: string;
                    inputs?: Array<string>;
                    outputs?: Array<string>;
                    dependsOn?: Array<string>;
                    maxParallel?: number;
                    mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                }>;
            };
            inputValues?: {
                [key: string]: unknown;
            };
            budget: {
                [key: string]: unknown;
            };
            budgetUsage: {
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
            };
            verificationEnvelopeIDs: Array<string>;
            error?: string;
            time: {
                created: number;
                updated: number;
                started?: number;
                completed?: number;
            };
            phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
            children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
            artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
            budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
        }>;
    };
    workflowRoutine: {
        create(body: HeadlessWorkflowRoutineCreateInput): Promise<{
            route: string;
            templateID: string;
            templateName: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            enabled: boolean;
            mode: "manual" | "scheduled" | "api" | "webhook";
            schedule?: string;
            timezone?: string;
            webhookEvent?: string;
            scheduledTaskID?: string;
            scheduledTaskStatus?: "active" | "paused" | "disabled";
            nextRunAt?: number;
            lastWorkflowRunID?: string;
            securityGate: "local-only" | "required";
        }>;
        list(): Promise<{
            route: string;
            templateID: string;
            templateName: string;
            source: "builtin" | "user" | "project";
            trust: "candidate" | "trusted";
            enabled: boolean;
            mode: "manual" | "scheduled" | "api" | "webhook";
            schedule?: string;
            timezone?: string;
            webhookEvent?: string;
            scheduledTaskID?: string;
            scheduledTaskStatus?: "active" | "paused" | "disabled";
            nextRunAt?: number;
            lastWorkflowRunID?: string;
            securityGate: "local-only" | "required";
        }[]>;
        run(body: HeadlessWorkflowRoutineRunInput): Promise<{
            routine: {
                route: string;
                templateID: string;
                templateName: string;
                source: "builtin" | "user" | "project";
                trust: "candidate" | "trusted";
                enabled: boolean;
                mode: "manual" | "scheduled" | "api" | "webhook";
                schedule?: string;
                timezone?: string;
                webhookEvent?: string;
                scheduledTaskID?: string;
                scheduledTaskStatus?: "active" | "paused" | "disabled";
                nextRunAt?: number;
                lastWorkflowRunID?: string;
                securityGate: "local-only" | "required";
            };
            template: {
                id: string;
                source: "builtin" | "user" | "project";
                trust: "candidate" | "trusted";
                name: string;
                description: string;
                tags: Array<string>;
                revision: number;
                specHash: string;
                spec: {
                    schemaVersion: 1;
                    id: string;
                    name: string;
                    description: string;
                    tags?: Array<string>;
                    trigger?: {
                        kind: "manual";
                        source?: "prompt" | "command" | "api";
                    } | {
                        kind: "scheduled";
                        schedule: string;
                        timezone?: string;
                        enabled?: boolean;
                    } | {
                        kind: "command";
                        command?: string;
                    } | {
                        kind: "api";
                        route?: string;
                        enabled?: boolean;
                    } | {
                        kind: "webhook";
                        event: string;
                        enabled?: false;
                        securityGate?: "required";
                    };
                    inputs?: Array<{
                        id: string;
                        label?: string;
                        description?: string;
                        type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                        required?: boolean;
                        sensitive?: boolean;
                        default?: unknown;
                    }>;
                    routine?: {
                        enabled?: boolean;
                        mode?: "manual" | "scheduled" | "api" | "webhook";
                        schedule?: string;
                        timezone?: string;
                        apiRoute?: string;
                        webhookEvent?: string;
                        securityGate?: "local-only" | "required";
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    permissions?: {
                        writePolicy?: "read-only" | "serialized" | "worktree-required";
                        allowedTools?: Array<string>;
                        networkPolicy?: "inherit" | "disabled" | "allowed";
                        escalationPolicy?: "inherit" | "ask" | "deny";
                    };
                    artifacts?: Array<{
                        id: string;
                        kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                        retention?: "ephemeral" | "session" | "durable";
                        exposeToMainContext?: boolean;
                        redaction?: {
                            status?: "none" | "redacted" | "pending";
                            summary?: string;
                        };
                    }>;
                    verification?: {
                        mode?: "required" | "optional" | "deferred" | "skipped";
                        workflow?: "review" | "debug" | "qa";
                        commands?: Array<string>;
                        requiredArtifactIds?: Array<string>;
                        reason?: string;
                    };
                    synthesis?: {
                        agent?: string;
                        model?: string;
                        outputFormat?: "markdown" | "json" | "table" | "findings";
                        exposeToMainContext?: boolean;
                        requiredArtifactIds?: Array<string>;
                    };
                    phases: Array<{
                        id: string;
                        name: string;
                        kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        prompt?: string;
                        agent?: string;
                        inputs?: Array<string>;
                        outputs?: Array<string>;
                        dependsOn?: Array<string>;
                        maxParallel?: number;
                        mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                        modelPolicy?: {
                            defaultModel?: string;
                            cheapModel?: string;
                            strongModel?: string;
                            plannerModel?: string;
                            workerModel?: string;
                            verifierModel?: string;
                            synthesizerModel?: string;
                            effort?: "normal" | "deep" | "workflow" | "max-workflow";
                            allowedProviders?: Array<string>;
                            routing?: Array<{
                                phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                                use: "planner" | "worker" | "verifier" | "synthesizer";
                            }>;
                        };
                        budget?: {
                            maxTotalTokens?: number;
                            maxInputTokensPerChild?: number;
                            maxOutputTokensPerChild?: number;
                            maxWallTimeMs?: number;
                            maxConcurrentAgents?: number;
                            maxTotalAgents?: number;
                            maxToolCalls?: number;
                            maxRetries?: number;
                        };
                        pacing?: {
                            maxRequestsPerMinute?: number;
                            maxTokensPerMinute?: number;
                        };
                    }>;
                };
                path?: string;
                time?: {
                    created: number;
                    updated: number;
                };
            };
            run: {
                id: string;
                projectID: string;
                directory: string;
                parentSessionID?: string;
                sourceTemplateID?: string;
                sourceTaskID?: string;
                status: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
                currentPhaseID?: string;
                spec: {
                    schemaVersion: 1;
                    id: string;
                    name: string;
                    description: string;
                    tags?: Array<string>;
                    trigger?: {
                        kind: "manual";
                        source?: "prompt" | "command" | "api";
                    } | {
                        kind: "scheduled";
                        schedule: string;
                        timezone?: string;
                        enabled?: boolean;
                    } | {
                        kind: "command";
                        command?: string;
                    } | {
                        kind: "api";
                        route?: string;
                        enabled?: boolean;
                    } | {
                        kind: "webhook";
                        event: string;
                        enabled?: false;
                        securityGate?: "required";
                    };
                    inputs?: Array<{
                        id: string;
                        label?: string;
                        description?: string;
                        type?: "string" | "number" | "boolean" | "json" | "path" | "string-array";
                        required?: boolean;
                        sensitive?: boolean;
                        default?: unknown;
                    }>;
                    routine?: {
                        enabled?: boolean;
                        mode?: "manual" | "scheduled" | "api" | "webhook";
                        schedule?: string;
                        timezone?: string;
                        apiRoute?: string;
                        webhookEvent?: string;
                        securityGate?: "local-only" | "required";
                    };
                    budget?: {
                        maxTotalTokens?: number;
                        maxInputTokensPerChild?: number;
                        maxOutputTokensPerChild?: number;
                        maxWallTimeMs?: number;
                        maxConcurrentAgents?: number;
                        maxTotalAgents?: number;
                        maxToolCalls?: number;
                        maxRetries?: number;
                    };
                    pacing?: {
                        maxRequestsPerMinute?: number;
                        maxTokensPerMinute?: number;
                    };
                    modelPolicy?: {
                        defaultModel?: string;
                        cheapModel?: string;
                        strongModel?: string;
                        plannerModel?: string;
                        workerModel?: string;
                        verifierModel?: string;
                        synthesizerModel?: string;
                        effort?: "normal" | "deep" | "workflow" | "max-workflow";
                        allowedProviders?: Array<string>;
                        routing?: Array<{
                            phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                            use: "planner" | "worker" | "verifier" | "synthesizer";
                        }>;
                    };
                    permissions?: {
                        writePolicy?: "read-only" | "serialized" | "worktree-required";
                        allowedTools?: Array<string>;
                        networkPolicy?: "inherit" | "disabled" | "allowed";
                        escalationPolicy?: "inherit" | "ask" | "deny";
                    };
                    artifacts?: Array<{
                        id: string;
                        kind: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
                        retention?: "ephemeral" | "session" | "durable";
                        exposeToMainContext?: boolean;
                        redaction?: {
                            status?: "none" | "redacted" | "pending";
                            summary?: string;
                        };
                    }>;
                    verification?: {
                        mode?: "required" | "optional" | "deferred" | "skipped";
                        workflow?: "review" | "debug" | "qa";
                        commands?: Array<string>;
                        requiredArtifactIds?: Array<string>;
                        reason?: string;
                    };
                    synthesis?: {
                        agent?: string;
                        model?: string;
                        outputFormat?: "markdown" | "json" | "table" | "findings";
                        exposeToMainContext?: boolean;
                        requiredArtifactIds?: Array<string>;
                    };
                    phases: Array<{
                        id: string;
                        name: string;
                        kind: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                        prompt?: string;
                        agent?: string;
                        inputs?: Array<string>;
                        outputs?: Array<string>;
                        dependsOn?: Array<string>;
                        maxParallel?: number;
                        mergeStrategy?: "all" | "first-success" | "majority" | "vote-with-critic" | "critic-confirmation" | "custom-reducer";
                        modelPolicy?: {
                            defaultModel?: string;
                            cheapModel?: string;
                            strongModel?: string;
                            plannerModel?: string;
                            workerModel?: string;
                            verifierModel?: string;
                            synthesizerModel?: string;
                            effort?: "normal" | "deep" | "workflow" | "max-workflow";
                            allowedProviders?: Array<string>;
                            routing?: Array<{
                                phaseKind?: "fanout" | "sequential" | "synthesis" | "verification" | "noop";
                                use: "planner" | "worker" | "verifier" | "synthesizer";
                            }>;
                        };
                        budget?: {
                            maxTotalTokens?: number;
                            maxInputTokensPerChild?: number;
                            maxOutputTokensPerChild?: number;
                            maxWallTimeMs?: number;
                            maxConcurrentAgents?: number;
                            maxTotalAgents?: number;
                            maxToolCalls?: number;
                            maxRetries?: number;
                        };
                        pacing?: {
                            maxRequestsPerMinute?: number;
                            maxTokensPerMinute?: number;
                        };
                    }>;
                };
                inputValues?: {
                    [key: string]: unknown;
                };
                budget: {
                    [key: string]: unknown;
                };
                budgetUsage: {
                    totalTokens?: number;
                    inputTokens?: number;
                    outputTokens?: number;
                    toolCalls?: number;
                    childAgents?: number;
                    retries?: number;
                    estimatedCostUsd?: number;
                };
                verificationEnvelopeIDs: Array<string>;
                error?: string;
                time: {
                    created: number;
                    updated: number;
                    started?: number;
                    completed?: number;
                };
                phases: Array<import("../v2/client.js").WorkflowPhaseEventRecord>;
                children: Array<import("../v2/client.js").WorkflowChildEventRecord>;
                artifacts: Array<import("../v2/client.js").WorkflowArtifactEventRecord>;
                budgetLedger: Array<import("../v2/client.js").WorkflowBudgetLedgerEventEntry>;
            };
        }>;
    };
    taskQueue: {
        list(parameters?: HeadlessTaskQueueListInput): Promise<HeadlessTaskQueueItem[]>;
        enqueue(body: HeadlessTaskQueueEnqueueInput): Promise<HeadlessTaskQueueItem>;
        edit(id: string, body: HeadlessTaskQueueEditInput): Promise<HeadlessTaskQueueItem>;
        pause(id: string): Promise<HeadlessTaskQueueItem>;
        resume(id: string): Promise<HeadlessTaskQueueItem>;
        cancel(id: string): Promise<HeadlessTaskQueueItem>;
        retry(id: string): Promise<HeadlessTaskQueueItem>;
        sendNow(id: string): Promise<HeadlessTaskQueueItem>;
        reorder(id: string, position: number): Promise<HeadlessTaskQueueItem>;
        remove(id: string): Promise<boolean>;
    };
    scheduledTask: {
        list(parameters?: HeadlessScheduledTaskListInput): Promise<HeadlessScheduledTask[]>;
        create(body: HeadlessScheduledTaskCreateInput): Promise<HeadlessScheduledTask>;
        update(id: string, body: HeadlessScheduledTaskUpdateInput): Promise<HeadlessScheduledTask>;
        pause(id: string): Promise<HeadlessScheduledTask>;
        resume(id: string): Promise<HeadlessScheduledTask>;
        runNow(id: string): Promise<HeadlessScheduledTaskRunNowResult>;
        remove(id: string): Promise<boolean>;
    };
    subscribe(options?: HeadlessSubscribeOptions): AsyncGenerator<Event>;
};
export declare function parseHeadlessRuntimeResponseBody(text: string): unknown;
export declare function parseHeadlessRuntimeJsonBody(text: string): unknown;
