import { type Client, type Options as Options2, type TDataShape } from "./client/index.js";
import type { AgentPartInput, AppAgentsResponses, AppContextMemoryClearResponses, AppContextMemoryWarmupResponses, AppContextResponses, AppContextTemplateCreateResponses, AppLogErrors, AppLogResponses, AppSkillsResponses, AuditExportAllResponses, AuditExportResponses, AuditReplayResponses, Auth as Auth3, AuthRemoveErrors, AuthRemoveResponses, AuthSetErrors, AuthSetResponses, AutonomousGetResponses, AutonomousSetResponses, CommandListResponses, Config as Config3, ConfigGetResponses, ConfigProvidersResponses, ConfigUpdateErrors, ConfigUpdateResponses, DebugEnginePendingPlansResponses, EventSubscribeResponses, EventTuiCommandExecute, EventTuiPromptAppend, EventTuiSessionSelect, EventTuiToastShow, ExperimentalResourceListResponses, ExperimentalSessionListResponses, FileListResponses, FilePartInput, FileReadResponses, FileStatusResponses, FindFilesResponses, FindSymbolsResponses, FindTextResponses, FormatterStatusResponses, GetDreGraphSessionSessionIdFingerprintResponses, GetDreGraphSessionSessionIdResponses, GlobalConfigGetResponses, GlobalConfigUpdateErrors, GlobalConfigUpdateResponses, GlobalDisposeResponses, GlobalEventResponses, GlobalHealthResponses, GlobalUpgradeErrors, GlobalUpgradeResponses, GraphGetErrors, GraphGetResponses, GraphTopologyErrors, GraphTopologyResponses, InstanceDisposeResponses, InstanceRestartResponses, IsolationGetResponses, IsolationSetResponses, LspStatusResponses, McpAddErrors, McpAddResponses, McpAuthAuthenticateErrors, McpAuthAuthenticateResponses, McpAuthCallbackErrors, McpAuthCallbackResponses, McpAuthRemoveErrors, McpAuthRemoveResponses, McpAuthStartErrors, McpAuthStartResponses, McpConnectResponses, McpDisconnectResponses, McpLocalConfig, McpRemoteConfig, McpStatusResponses, OutputFormat, Part as Part2, PartDeleteErrors, PartDeleteResponses, PartUpdateErrors, PartUpdateResponses, PathGetResponses, PermissionListResponses, PermissionReplyErrors, PermissionReplyResponses, PermissionRespondErrors, PermissionRespondResponses, PermissionRuleset, ProjectCurrentResponses, ProjectInitGitResponses, ProjectListResponses, ProjectUpdateErrors, ProjectUpdateResponses, PromptHistoryAppendErrors, PromptHistoryAppendResponses, PromptHistoryListErrors, PromptHistoryListResponses, ProviderAuthResponses, ProviderListResponses, ProviderOauthAuthorizeErrors, ProviderOauthAuthorizeResponses, ProviderOauthCallbackErrors, ProviderOauthCallbackResponses, PtyConnectErrors, PtyConnectResponses, PtyCreateErrors, PtyCreateResponses, PtyGetErrors, PtyGetResponses, PtyListResponses, PtyRemoveErrors, PtyRemoveResponses, PtyUpdateErrors, PtyUpdateResponses, QuestionAnswer, QuestionListResponses, QuestionRejectErrors, QuestionRejectResponses, QuestionReplyErrors, QuestionReplyResponses, ScheduledTaskCreateErrors, ScheduledTaskCreateResponses, ScheduledTaskDeleteErrors, ScheduledTaskDeleteResponses, ScheduledTaskGetErrors, ScheduledTaskGetResponses, ScheduledTaskListErrors, ScheduledTaskListResponses, ScheduledTaskPauseErrors, ScheduledTaskPauseResponses, ScheduledTaskResumeErrors, ScheduledTaskResumeResponses, ScheduledTaskRunDueErrors, ScheduledTaskRunDueResponses, ScheduledTaskRunNowErrors, ScheduledTaskRunNowResponses, ScheduledTaskUpdateErrors, ScheduledTaskUpdateResponses, SessionAbortErrors, SessionAbortResponses, SessionBranchRankErrors, SessionBranchRankResponses, SessionChildrenErrors, SessionChildrenResponses, SessionCommandAsyncErrors, SessionCommandAsyncResponses, SessionCommandErrors, SessionCommandResponses, SessionCompareErrors, SessionCompareResponses, SessionCreateErrors, SessionCreateResponses, SessionDeleteErrors, SessionDeleteMessageErrors, SessionDeleteMessageResponses, SessionDeleteResponses, SessionDiffResponses, SessionDreErrors, SessionDreResponses, SessionForkResponses, SessionGetErrors, SessionGetResponses, SessionGoalErrors, SessionGoalResponses, SessionGraphErrors, SessionGraphResponses, SessionInitErrors, SessionInitResponses, SessionListResponses, SessionMessageErrors, SessionMessageResponses, SessionMessagesErrors, SessionMessagesResponses, SessionPromptAsyncErrors, SessionPromptAsyncResponses, SessionPromptErrors, SessionPromptResponses, SessionRevertErrors, SessionRevertResponses, SessionRiskErrors, SessionRiskResponses, SessionRollbackPointsErrors, SessionRollbackPointsResponses, SessionSemanticDiffErrors, SessionSemanticDiffResponses, SessionShareErrors, SessionShareResponses, SessionShellAsyncErrors, SessionShellAsyncResponses, SessionShellErrors, SessionShellResponses, SessionStatusErrors, SessionStatusResponses, SessionSummarizeErrors, SessionSummarizeResponses, SessionTodoErrors, SessionTodoResponses, SessionUnrevertErrors, SessionUnrevertResponses, SessionUnshareErrors, SessionUnshareResponses, SessionUpdateErrors, SessionUpdateResponses, SmartLlmGetResponses, SmartLlmSetResponses, SubtaskPartInput, SuperLongGetResponses, SuperLongSetResponses, TaskQueueCancelErrors, TaskQueueCancelResponses, TaskQueueDeleteErrors, TaskQueueDeleteResponses, TaskQueueEditErrors, TaskQueueEditResponses, TaskQueueEnqueueErrors, TaskQueueEnqueueResponses, TaskQueueGetErrors, TaskQueueGetResponses, TaskQueueListErrors, TaskQueueListResponses, TaskQueuePauseErrors, TaskQueuePauseResponses, TaskQueueReorderErrors, TaskQueueReorderResponses, TaskQueueResumeErrors, TaskQueueResumeResponses, TaskQueueRetryErrors, TaskQueueRetryResponses, TaskQueueSendNowErrors, TaskQueueSendNowResponses, TaskQueueStatusErrors, TaskQueueStatusResponses, TextPartInput, ToolIdsErrors, ToolIdsResponses, ToolListErrors, ToolListResponses, TuiAppendPromptErrors, TuiAppendPromptResponses, TuiClearPromptResponses, TuiExecuteCommandErrors, TuiExecuteCommandResponses, TuiOpenHelpResponses, TuiOpenModelsResponses, TuiOpenSessionsResponses, TuiOpenThemesResponses, TuiPublishErrors, TuiPublishResponses, TuiSelectSessionErrors, TuiSelectSessionResponses, TuiShowToastResponses, TuiSubmitPromptResponses, VcsGetResponses, WorkflowRoutineCreateErrors, WorkflowRoutineCreateResponses, WorkflowRoutineListErrors, WorkflowRoutineListResponses, WorkflowRoutineRunErrors, WorkflowRoutineRunResponses, WorkflowRunArtifactsErrors, WorkflowRunArtifactsResponses, WorkflowRunCancelErrors, WorkflowRunCancelResponses, WorkflowRunCreateErrors, WorkflowRunCreateResponses, WorkflowRunDashboardErrors, WorkflowRunDashboardResponses, WorkflowRunEvalCaseErrors, WorkflowRunEvalCaseResponses, WorkflowRunEvalCasesErrors, WorkflowRunEvalCasesResponses, WorkflowRunEvalSummaryErrors, WorkflowRunEvalSummaryResponses, WorkflowRunGetErrors, WorkflowRunGetResponses, WorkflowRunListErrors, WorkflowRunListResponses, WorkflowRunPauseErrors, WorkflowRunPauseResponses, WorkflowRunResumeErrors, WorkflowRunResumeResponses, WorkflowRunRetryErrors, WorkflowRunRetryResponses, WorkflowRunSaveTemplateErrors, WorkflowRunSaveTemplateResponses, WorkflowRunStartErrors, WorkflowRunStartResponses, WorkflowTemplateGetErrors, WorkflowTemplateGetResponses, WorkflowTemplateListErrors, WorkflowTemplateListResponses, WorkflowTemplatePromoteErrors, WorkflowTemplatePromoteResponses, WorkflowTemplateSaveErrors, WorkflowTemplateSaveResponses, WorktreeCreateErrors, WorktreeCreateInput, WorktreeCreateResponses, WorktreeListResponses, WorktreeRemoveErrors, WorktreeRemoveInput, WorktreeRemoveResponses, WorktreeResetErrors, WorktreeResetInput, WorktreeResetResponses } from "./types.gen.js";
export type Options<TData extends TDataShape = TDataShape, ThrowOnError extends boolean = boolean> = Options2<TData, ThrowOnError> & {
    /**
     * You can provide a client instance returned by `createClient()` instead of
     * individual options. This might be also useful if you want to implement a
     * custom client.
     */
    client?: Client;
    /**
     * You can pass arbitrary values through the `meta` object. This can be
     * used to access values that aren't defined as part of the SDK function.
     */
    meta?: Record<string, unknown>;
};
declare class HeyApiClient {
    protected client: Client;
    constructor(args?: {
        client?: Client;
    });
}
declare class HeyApiRegistry<T> {
    private readonly defaultKey;
    private readonly instances;
    get(key?: string): T;
    set(value: T, key?: string): void;
}
export declare class Config extends HeyApiClient {
    /**
     * Get global configuration
     *
     * Retrieve the current global ax-code configuration settings and preferences.
     */
    get<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalConfigGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Update global configuration
     *
     * Update global ax-code configuration settings and preferences.
     */
    update<ThrowOnError extends boolean = false>(parameters?: {
        config?: Config3;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalConfigUpdateResponses, GlobalConfigUpdateErrors, ThrowOnError, "fields">;
}
export declare class Global extends HeyApiClient {
    /**
     * Get health
     *
     * Get health information about the ax-code server.
     */
    health<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalHealthResponses, unknown, ThrowOnError, "fields">;
    /**
     * Get global events
     *
     * Subscribe to global events from the ax-code system using server-sent events.
     */
    event<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): Promise<import("./core/serverSentEvents.gen.js").ServerSentEventsResult<GlobalEventResponses, unknown>>;
    /**
     * Dispose instance
     *
     * Clean up and dispose all ax-code instances, releasing all resources.
     */
    dispose<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalDisposeResponses, unknown, ThrowOnError, "fields">;
    /**
     * Upgrade ax-code
     *
     * Upgrade ax-code to the specified version or latest if not specified.
     */
    upgrade<ThrowOnError extends boolean = false>(parameters?: {
        target?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalUpgradeResponses, GlobalUpgradeErrors, ThrowOnError, "fields">;
    private _config?;
    get config(): Config;
}
export declare class Auth extends HeyApiClient {
    /**
     * Remove auth credentials
     *
     * Remove authentication credentials
     */
    remove<ThrowOnError extends boolean = false>(parameters: {
        providerID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AuthRemoveResponses, AuthRemoveErrors, ThrowOnError, "fields">;
    /**
     * Set auth credentials
     *
     * Set authentication credentials
     */
    set<ThrowOnError extends boolean = false>(parameters: {
        providerID: string;
        auth?: Auth3;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AuthSetResponses, AuthSetErrors, ThrowOnError, "fields">;
}
export declare class Project extends HeyApiClient {
    /**
     * List all projects
     *
     * Get a list of projects that have been opened with ax-code.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Get current project
     *
     * Retrieve the currently active project that ax-code is working with.
     */
    current<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectCurrentResponses, unknown, ThrowOnError, "fields">;
    /**
     * Initialize git repository
     *
     * Create a git repository for the current project and return the refreshed project info.
     */
    initGit<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectInitGitResponses, unknown, ThrowOnError, "fields">;
    /**
     * Update project
     *
     * Update project properties such as name, icon, and commands.
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        directory?: string;
        name?: string;
        icon?: {
            url?: string;
            override?: string;
            color?: string;
        };
        commands?: {
            /**
             * Startup script to run when creating a new workspace (worktree)
             */
            start?: string;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectUpdateResponses, ProjectUpdateErrors, ThrowOnError, "fields">;
}
export declare class Pty extends HeyApiClient {
    /**
     * List PTY sessions
     *
     * Get a list of all active pseudo-terminal (PTY) sessions managed by ax-code.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Create PTY session
     *
     * Create a new pseudo-terminal (PTY) session for running shell commands and processes.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        command?: string;
        args?: Array<string>;
        cwd?: string;
        title?: string;
        env?: {
            [key: string]: string;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyCreateResponses, PtyCreateErrors, ThrowOnError, "fields">;
    /**
     * Remove PTY session
     *
     * Remove and terminate a specific pseudo-terminal (PTY) session.
     */
    remove<ThrowOnError extends boolean = false>(parameters: {
        ptyID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyRemoveResponses, PtyRemoveErrors, ThrowOnError, "fields">;
    /**
     * Get PTY session
     *
     * Retrieve detailed information about a specific pseudo-terminal (PTY) session.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        ptyID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyGetResponses, PtyGetErrors, ThrowOnError, "fields">;
    /**
     * Update PTY session
     *
     * Update properties of an existing pseudo-terminal (PTY) session.
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        ptyID: string;
        directory?: string;
        title?: string;
        size?: {
            rows: number;
            cols: number;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyUpdateResponses, PtyUpdateErrors, ThrowOnError, "fields">;
    /**
     * Connect to PTY session
     *
     * Establish a WebSocket connection to interact with a pseudo-terminal (PTY) session in real-time.
     */
    connect<ThrowOnError extends boolean = false>(parameters: {
        ptyID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PtyConnectResponses, PtyConnectErrors, ThrowOnError, "fields">;
}
export declare class Config2 extends HeyApiClient {
    /**
     * Get configuration
     *
     * Retrieve the current ax-code configuration settings and preferences.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ConfigGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Update configuration
     *
     * Update ax-code configuration settings and preferences.
     */
    update<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        config?: Config3;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ConfigUpdateResponses, ConfigUpdateErrors, ThrowOnError, "fields">;
    /**
     * List config providers
     *
     * Get a list of all configured AI providers and their default models.
     */
    providers<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ConfigProvidersResponses, unknown, ThrowOnError, "fields">;
}
export declare class Isolation extends HeyApiClient {
    /**
     * Get resolved isolation state
     *
     * Returns the effective isolation mode after resolving CLI flags, environment variables, and config file settings.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<IsolationGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Set isolation mode
     *
     * Update the runtime isolation mode. Sets the environment variable so it takes effect immediately.
     */
    set<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        mode?: "read-only" | "workspace-write" | "full-access";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<IsolationSetResponses, unknown, ThrowOnError, "fields">;
}
export declare class Autonomous extends HeyApiClient {
    /**
     * Get autonomous mode state
     *
     * Returns whether autonomous mode is enabled.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AutonomousGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Set autonomous mode
     *
     * Toggle autonomous mode on or off. Persists to ax-code.json.
     */
    set<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        enabled?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AutonomousSetResponses, unknown, ThrowOnError, "fields">;
}
export declare class SmartLlm extends HeyApiClient {
    /**
     * Get smart LLM routing state
     *
     * Returns whether LLM-based agent routing is enabled.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SmartLlmGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Set smart LLM routing
     *
     * Toggle LLM-based agent routing on or off. Persists to ax-code.json.
     */
    set<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        enabled?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SmartLlmSetResponses, unknown, ThrowOnError, "fields">;
}
export declare class SuperLong extends HeyApiClient {
    /**
     * Get Super-Long mode state
     *
     * Returns whether Super-Long mode is enabled.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SuperLongGetResponses, unknown, ThrowOnError, "fields">;
    /**
     * Set Super-Long mode
     *
     * Toggle Super-Long mode on or off for the current runtime session.
     */
    set<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        enabled?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SuperLongSetResponses, unknown, ThrowOnError, "fields">;
}
export declare class PromptHistory extends HeyApiClient {
    /**
     * List prompt history
     *
     * Return prompt recall history scoped to the current project.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PromptHistoryListResponses, PromptHistoryListErrors, ThrowOnError, "fields">;
    /**
     * Append prompt history
     *
     * Append one prompt recall entry to the current project history.
     */
    append<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        input?: string;
        mode?: "normal" | "shell";
        parts?: Array<{
            [key: string]: unknown;
        } & {
            type: string;
        }>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PromptHistoryAppendResponses, PromptHistoryAppendErrors, ThrowOnError, "fields">;
}
export declare class TaskQueue extends HeyApiClient {
    /**
     * List task queue items
     *
     * Return server-owned task queue items scoped to the current project.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        sessionID?: string;
        status?: "queued" | "waiting_for_idle" | "running" | "blocked_permission" | "blocked_question" | "paused" | "failed" | "completed" | "cancelled";
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueListResponses, TaskQueueListErrors, ThrowOnError, "fields">;
    /**
     * Enqueue task
     *
     * Add a durable server-owned task queue item for the current project.
     */
    enqueue<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        sessionID?: string;
        kind?: "prompt" | "command" | "shell" | "followup" | "subagent" | "review" | "automation";
        title?: string;
        worktree?: string;
        agent?: string;
        model?: unknown;
        sourceMessageID?: string;
        sourceTaskID?: string;
        payload?: {
            [key: string]: unknown;
        };
        priority?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueEnqueueResponses, TaskQueueEnqueueErrors, ThrowOnError, "fields">;
    /**
     * Remove task queue item
     *
     * Delete a task queue item from the current project queue.
     */
    delete<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueDeleteResponses, TaskQueueDeleteErrors, ThrowOnError, "fields">;
    /**
     * Get task queue item
     *
     * Return a single task queue item scoped to the current project.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueGetResponses, TaskQueueGetErrors, ThrowOnError, "fields">;
    /**
     * Update task queue status
     *
     * Internal lifecycle hook for server-owned queue execution. App clients should use action routes instead.
     */
    status<ThrowOnError extends boolean = false>(parameters: {
        "x-ax-code-internal-task-queue-lifecycle": "1";
        taskID: string;
        directory?: string;
        status?: "queued" | "waiting_for_idle" | "running" | "blocked_permission" | "blocked_question" | "paused" | "failed" | "completed" | "cancelled";
        error?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueStatusResponses, TaskQueueStatusErrors, ThrowOnError, "fields">;
    /**
     * Edit queued task
     *
     * Edit mutable task queue fields before the task is actively running or completed.
     */
    edit<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
        title?: string;
        worktree?: string | null;
        agent?: string | null;
        model?: unknown;
        payload?: {
            [key: string]: unknown;
        };
        priority?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueEditResponses, TaskQueueEditErrors, ThrowOnError, "fields">;
    /**
     * Pause queued task
     *
     * Mark a task queue item as paused.
     */
    pause<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueuePauseResponses, TaskQueuePauseErrors, ThrowOnError, "fields">;
    /**
     * Resume paused task
     *
     * Return a paused task queue item to queued state.
     */
    resume<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueResumeResponses, TaskQueueResumeErrors, ThrowOnError, "fields">;
    /**
     * Cancel task
     *
     * Mark a task queue item as cancelled.
     */
    cancel<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueCancelResponses, TaskQueueCancelErrors, ThrowOnError, "fields">;
    /**
     * Retry task
     *
     * Return a failed or cancelled task queue item to queued state.
     */
    retry<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueRetryResponses, TaskQueueRetryErrors, ThrowOnError, "fields">;
    /**
     * Send task now
     *
     * Move a task queue item to the front of the queue. Executable prompt, command, shell, or workflow subagent items start immediately when the target session is idle; non-executable items remain queued.
     */
    sendNow<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueSendNowResponses, TaskQueueSendNowErrors, ThrowOnError, "fields">;
    /**
     * Reorder task
     *
     * Set the queue position for a task queue item.
     */
    reorder<ThrowOnError extends boolean = false>(parameters: {
        taskID: string;
        directory?: string;
        position?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TaskQueueReorderResponses, TaskQueueReorderErrors, ThrowOnError, "fields">;
}
export declare class ScheduledTask extends HeyApiClient {
    /**
     * List scheduled tasks
     *
     * Return project-scoped scheduled automation tasks.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        status?: "active" | "paused" | "disabled";
        dueBefore?: number;
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskListResponses, ScheduledTaskListErrors, ThrowOnError, "fields">;
    /**
     * Create scheduled task
     *
     * Create a project-scoped scheduled automation task.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        title?: string;
        prompt?: string;
        schedule?: {
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
        agent?: string;
        model?: unknown;
        workflowTemplateID?: string;
        workflowStartOptions?: {
            allowScaleBeyondDefaults?: boolean;
            allowWriteWorkflows?: boolean;
            durableChildren?: boolean;
            enqueueChildren?: boolean;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskCreateResponses, ScheduledTaskCreateErrors, ThrowOnError, "fields">;
    /**
     * Delete scheduled task
     *
     * Delete a scheduled automation task.
     */
    delete<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskDeleteResponses, ScheduledTaskDeleteErrors, ThrowOnError, "fields">;
    /**
     * Get scheduled task
     *
     * Return one scheduled automation task.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskGetResponses, ScheduledTaskGetErrors, ThrowOnError, "fields">;
    /**
     * Update scheduled task
     *
     * Update a scheduled automation task.
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
        title?: string;
        prompt?: string;
        schedule?: {
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
        status?: "active" | "paused" | "disabled";
        agent?: string;
        model?: unknown;
        workflowTemplateID?: string;
        workflowStartOptions?: {
            allowScaleBeyondDefaults?: boolean;
            allowWriteWorkflows?: boolean;
            durableChildren?: boolean;
            enqueueChildren?: boolean;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskUpdateResponses, ScheduledTaskUpdateErrors, ThrowOnError, "fields">;
    /**
     * Pause scheduled task
     *
     * Pause a scheduled automation task.
     */
    pause<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskPauseResponses, ScheduledTaskPauseErrors, ThrowOnError, "fields">;
    /**
     * Resume scheduled task
     *
     * Resume a scheduled automation task.
     */
    resume<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskResumeResponses, ScheduledTaskResumeErrors, ThrowOnError, "fields">;
    /**
     * Run scheduled task now
     *
     * Run a scheduled task immediately. Prompt tasks create a server-owned automation queue item; workflow tasks create and start a workflow run.
     */
    runNow<ThrowOnError extends boolean = false>(parameters: {
        scheduledTaskID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskRunNowResponses, ScheduledTaskRunNowErrors, ThrowOnError, "fields">;
    /**
     * Run due scheduled tasks
     *
     * Run due active scheduled tasks, creating automation queue items or workflow runs as configured.
     */
    runDue<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        now?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ScheduledTaskRunDueResponses, ScheduledTaskRunDueErrors, ThrowOnError, "fields">;
}
export declare class WorkflowRun extends HeyApiClient {
    /**
     * List workflow runs
     *
     * Return durable workflow runs scoped to the current project.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        parentSessionID?: string;
        status?: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunListResponses, WorkflowRunListErrors, ThrowOnError, "fields">;
    /**
     * Create workflow run
     *
     * Create a workflow run from a spec snapshot or a built-in workflow template.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        parentSessionID?: string;
        sourceTemplateID?: string;
        sourceTaskID?: string;
        templateID?: string;
        spec?: {
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
        inputValues?: {
            [key: string]: unknown;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunCreateResponses, WorkflowRunCreateErrors, ThrowOnError, "fields">;
    /**
     * List workflow dashboard summaries
     *
     * Return compact workflow run projections for TUI and desktop supervision surfaces.
     */
    dashboard<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        parentSessionID?: string;
        status?: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
        limit?: number;
        now?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunDashboardResponses, WorkflowRunDashboardErrors, ThrowOnError, "fields">;
    /**
     * List workflow evaluation cases
     *
     * Return built-in local workflow evaluation cases used for preview promotion gates.
     */
    evalCases<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunEvalCasesResponses, WorkflowRunEvalCasesErrors, ThrowOnError, "fields">;
    /**
     * Get workflow run detail
     *
     * Return a workflow run with phase, child, artifact, and budget state.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunGetResponses, WorkflowRunGetErrors, ThrowOnError, "fields">;
    /**
     * List workflow run artifacts
     *
     * Return workflow artifacts for a run, with optional phase, child, kind, and compact filters.
     */
    artifacts<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        artifactID?: string;
        phaseID?: string;
        childID?: string;
        kind?: "summary" | "finding" | "patch" | "verification" | "metric" | "log";
        includePayload?: "true" | "false";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunArtifactsResponses, WorkflowRunArtifactsErrors, ThrowOnError, "fields">;
    /**
     * Evaluate workflow run
     *
     * Compare a workflow run against optional baseline metrics and return its preview promotion gate.
     */
    evalSummary<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        baseline?: {
            label?: string;
            metrics: {
                status?: "queued" | "running" | "blocked" | "paused" | "failed" | "completed" | "cancelled";
                elapsedMs?: number;
                totalTokens?: number;
                inputTokens?: number;
                outputTokens?: number;
                toolCalls?: number;
                childAgents?: number;
                retries?: number;
                estimatedCostUsd?: number;
                costPerConfirmedFindingUsd?: number | null;
                verifiedCompletionCount?: number;
                costPerVerifiedCompletionUsd?: number | null;
                confirmedFindings?: number;
                likelyFindings?: number;
                rejectedFindings?: number;
                unverifiedFindings?: number;
                falsePositiveFindings?: number;
                artifactCount?: number;
                exposedArtifactCount?: number;
                verificationEnvelopeCount?: number;
                interventionCount?: number;
            };
        };
        now?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunEvalSummaryResponses, WorkflowRunEvalSummaryErrors, ThrowOnError, "fields">;
    /**
     * Evaluate workflow run against a local case
     *
     * Compare a workflow run against a seeded local eval case and single-agent baseline.
     */
    evalCase<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        caseID?: "verified-bug-sweep-seeded";
        now?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunEvalCaseResponses, WorkflowRunEvalCaseErrors, ThrowOnError, "fields">;
    /**
     * Save workflow run as template
     *
     * Save a workflow run spec snapshot as a candidate user-local or project-local template.
     */
    saveTemplate<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        scope?: "user" | "project";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunSaveTemplateResponses, WorkflowRunSaveTemplateErrors, ThrowOnError, "fields">;
    /**
     * Start workflow run
     *
     * Start or advance a workflow run through the scheduler.
     */
    start<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        allowScaleBeyondDefaults?: boolean;
        allowWriteWorkflows?: boolean;
        durableChildren?: boolean;
        enqueueChildren?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunStartResponses, WorkflowRunStartErrors, ThrowOnError, "fields">;
    /**
     * Pause workflow run
     *
     * Pause queued workflow children where the queue supports pausing.
     */
    pause<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunPauseResponses, WorkflowRunPauseErrors, ThrowOnError, "fields">;
    /**
     * Resume workflow run
     *
     * Resume paused workflow queue children.
     */
    resume<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunResumeResponses, WorkflowRunResumeErrors, ThrowOnError, "fields">;
    /**
     * Cancel workflow run
     *
     * Cancel queued workflow children and mark the workflow cancelled.
     */
    cancel<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunCancelResponses, WorkflowRunCancelErrors, ThrowOnError, "fields">;
    /**
     * Retry workflow run
     *
     * Retry failed or cancelled workflow queue children.
     */
    retry<ThrowOnError extends boolean = false>(parameters: {
        runID: string;
        directory?: string;
        phaseID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRunRetryResponses, WorkflowRunRetryErrors, ThrowOnError, "fields">;
}
export declare class WorkflowTemplate extends HeyApiClient {
    /**
     * List workflow templates
     *
     * Return built-in workflow templates available for the current runtime.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowTemplateListResponses, WorkflowTemplateListErrors, ThrowOnError, "fields">;
    /**
     * Save workflow template
     *
     * Save a user-local or project-local workflow template candidate. Promote after review to trust it.
     */
    save<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        scope?: "user" | "project";
        spec?: {
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
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowTemplateSaveResponses, WorkflowTemplateSaveErrors, ThrowOnError, "fields">;
    /**
     * Get workflow template
     *
     * Return one workflow template by id.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        templateID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowTemplateGetResponses, WorkflowTemplateGetErrors, ThrowOnError, "fields">;
    /**
     * Promote workflow template
     *
     * Promote a saved user-local or project-local workflow template candidate to trusted.
     */
    promote<ThrowOnError extends boolean = false>(parameters: {
        templateID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowTemplatePromoteResponses, WorkflowTemplatePromoteErrors, ThrowOnError, "fields">;
}
export declare class WorkflowRoutine extends HeyApiClient {
    /**
     * List workflow routines
     *
     * Return workflow templates that declare local routine trigger metadata.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRoutineListResponses, WorkflowRoutineListErrors, ThrowOnError, "fields">;
    /**
     * Create workflow routine
     *
     * Create a user-local or project-local routine trigger from an existing workflow template. API routines can be run directly; scheduled routines are listed as reusable trigger metadata.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        templateID?: string;
        scope?: "user" | "project";
        trust?: "candidate" | "trusted";
        mode?: "api" | "scheduled" | "webhook";
        route?: string;
        schedule?: string;
        timezone?: string;
        webhookEvent?: string;
        enabled?: boolean;
        securityGate?: "local-only" | "required";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRoutineCreateResponses, WorkflowRoutineCreateErrors, ThrowOnError, "fields">;
    /**
     * Run workflow routine
     *
     * Run a trusted enabled local API workflow routine by route.
     */
    run<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        route?: string;
        parentSessionID?: string;
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
        inputValues?: {
            [key: string]: unknown;
        };
        startOptions?: {
            allowScaleBeyondDefaults?: boolean;
            allowWriteWorkflows?: boolean;
            durableChildren?: boolean;
            enqueueChildren?: boolean;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorkflowRoutineRunResponses, WorkflowRoutineRunErrors, ThrowOnError, "fields">;
}
export declare class Tool extends HeyApiClient {
    /**
     * List tool IDs
     *
     * Get a list of all available tool IDs, including both built-in tools and dynamically registered tools.
     */
    ids<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ToolIdsResponses, ToolIdsErrors, ThrowOnError, "fields">;
    /**
     * List tools
     *
     * Get a list of available tools with their JSON schema parameters for a specific provider and model combination.
     */
    list<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        provider: string;
        model: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ToolListResponses, ToolListErrors, ThrowOnError, "fields">;
}
export declare class Worktree extends HeyApiClient {
    /**
     * Remove worktree
     *
     * Remove a git worktree and delete its branch.
     */
    remove<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        worktreeRemoveInput?: WorktreeRemoveInput;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorktreeRemoveResponses, WorktreeRemoveErrors, ThrowOnError, "fields">;
    /**
     * List worktrees
     *
     * List all sandbox worktrees for the current project, including git branch metadata when available.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorktreeListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Create worktree
     *
     * Create a new git worktree for the current project and run any configured startup scripts.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        worktreeCreateInput?: WorktreeCreateInput;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorktreeCreateResponses, WorktreeCreateErrors, ThrowOnError, "fields">;
    /**
     * Reset worktree
     *
     * Reset a worktree branch to the primary default branch.
     */
    reset<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        worktreeResetInput?: WorktreeResetInput;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<WorktreeResetResponses, WorktreeResetErrors, ThrowOnError, "fields">;
}
export declare class Session extends HeyApiClient {
    /**
     * List sessions
     *
     * Get a list of all ax-code sessions across projects, sorted by most recently updated. Archived sessions are excluded by default.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        roots?: boolean;
        start?: number;
        cursor?: number;
        search?: string;
        limit?: number;
        archived?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ExperimentalSessionListResponses, unknown, ThrowOnError, "fields">;
}
export declare class Resource extends HeyApiClient {
    /**
     * Get MCP resources
     *
     * Get all available MCP resources from connected servers. Optionally filter by name.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ExperimentalResourceListResponses, unknown, ThrowOnError, "fields">;
}
export declare class Experimental extends HeyApiClient {
    private _session?;
    get session(): Session;
    private _resource?;
    get resource(): Resource;
}
export declare class Session2 extends HeyApiClient {
    /**
     * List sessions
     *
     * Get a list of all ax-code sessions, sorted by most recently updated.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        roots?: boolean;
        start?: number;
        search?: string;
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Create session
     *
     * Create a new ax-code session for interacting with AI assistants and managing conversations.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        id?: string;
        parentID?: string;
        title?: string;
        permission?: PermissionRuleset;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionCreateResponses, SessionCreateErrors, ThrowOnError, "fields">;
    /**
     * Get session status
     *
     * Retrieve the current status of all sessions, including active, idle, and completed states.
     */
    status<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionStatusResponses, SessionStatusErrors, ThrowOnError, "fields">;
    /**
     * Delete session
     *
     * Delete a session and permanently remove all associated data, including messages and history.
     */
    delete<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionDeleteResponses, SessionDeleteErrors, ThrowOnError, "fields">;
    /**
     * Get session
     *
     * Retrieve detailed information about a specific ax-code session.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionGetResponses, SessionGetErrors, ThrowOnError, "fields">;
    /**
     * Update session
     *
     * Update properties of an existing session, such as title or other metadata.
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        title?: string;
        time?: {
            archived?: number;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionUpdateResponses, SessionUpdateErrors, ThrowOnError, "fields">;
    /**
     * Get session goal
     *
     * Retrieve the durable goal state associated with a specific ax-code session.
     */
    goal<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionGoalResponses, SessionGoalErrors, ThrowOnError, "fields">;
    /**
     * Get session children
     *
     * Retrieve all child sessions that were forked from the specified parent session.
     */
    children<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionChildrenResponses, SessionChildrenErrors, ThrowOnError, "fields">;
    /**
     * Rank session branches
     *
     * Compare the root session and its forks, then recommend the strongest branch based on risk and decision signals.
     */
    branchRank<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        deep?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionBranchRankResponses, SessionBranchRankErrors, ThrowOnError, "fields">;
    /**
     * Get session DRE detail
     *
     * Return the session decision summary, explainable risk detail, and execution timeline for DRE-aware clients.
     */
    dre<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionDreResponses, SessionDreErrors, ThrowOnError, "fields">;
    /**
     * Get session graph snapshot
     *
     * Return the execution graph and structured topology view for a session.
     */
    graph<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionGraphResponses, SessionGraphErrors, ThrowOnError, "fields">;
    /**
     * Get session risk detail
     *
     * Return the explainable risk assessment, breakdown, and semantic change summary for a session. Optionally include replay readiness and structured assurance artifacts for review/debug/qa workflows.
     */
    risk<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        quality?: boolean;
        findings?: boolean;
        envelopes?: boolean;
        reviewResults?: boolean;
        debug?: boolean;
        hints?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionRiskResponses, SessionRiskErrors, ThrowOnError, "fields">;
    /**
     * Get semantic diff summary
     *
     * Return a semantic classification of the recorded file changes for a session.
     */
    semanticDiff<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionSemanticDiffResponses, SessionSemanticDiffErrors, ThrowOnError, "fields">;
    /**
     * Compare session executions
     *
     * Compare two sessions by risk, decision score, event flow, and optional replay divergence signals.
     */
    compare<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        otherSessionID: string;
        directory?: string;
        deep?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionCompareResponses, SessionCompareErrors, ThrowOnError, "fields">;
    /**
     * List rollback points
     *
     * Return the step-level rollback points available for a session, including tool and token context.
     */
    rollbackPoints<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        tool?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionRollbackPointsResponses, SessionRollbackPointsErrors, ThrowOnError, "fields">;
    /**
     * Get session todos
     *
     * Retrieve the todo list associated with a specific session, showing tasks and action items.
     */
    todo<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionTodoResponses, SessionTodoErrors, ThrowOnError, "fields">;
    /**
     * Initialize session
     *
     * Analyze the current application and create an AGENTS.md file with project-specific agent configurations.
     */
    init<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        modelID?: string;
        providerID?: string;
        messageID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionInitResponses, SessionInitErrors, ThrowOnError, "fields">;
    /**
     * Fork session
     *
     * Create a new session by forking an existing session at a specific message point.
     */
    fork<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionForkResponses, unknown, ThrowOnError, "fields">;
    /**
     * Abort session
     *
     * Abort an active session and stop any ongoing AI processing or command execution.
     */
    abort<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionAbortResponses, SessionAbortErrors, ThrowOnError, "fields">;
    /**
     * Unshare session
     *
     * Remove the shareable link for a session, making it private again.
     */
    unshare<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionUnshareResponses, SessionUnshareErrors, ThrowOnError, "fields">;
    /**
     * Share session
     *
     * Create a shareable link for a session, allowing others to view the conversation.
     */
    share<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionShareResponses, SessionShareErrors, ThrowOnError, "fields">;
    /**
     * Get message diff
     *
     * Get the file changes (diff) that resulted from a specific user message in the session.
     */
    diff<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionDiffResponses, unknown, ThrowOnError, "fields">;
    /**
     * Summarize session
     *
     * Generate a concise summary of the session using AI compaction to preserve key information.
     */
    summarize<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        providerID?: string;
        modelID?: string;
        auto?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionSummarizeResponses, SessionSummarizeErrors, ThrowOnError, "fields">;
    /**
     * Get session messages
     *
     * Retrieve all messages in a session, including user prompts and AI responses.
     */
    messages<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        limit?: number;
        before?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionMessagesResponses, SessionMessagesErrors, ThrowOnError, "fields">;
    /**
     * Send message
     *
     * Create and send a new message to a session, returning the final assistant response.
     */
    prompt<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
        model?: {
            providerID: string;
            modelID: string;
        };
        agent?: string;
        userSelectedAgent?: boolean;
        agentRouting?: "auto" | "preserve";
        noReply?: boolean;
        tools?: {
            [key: string]: boolean;
        };
        toolsScope?: "session" | "turn";
        isolation?: {
            mode?: "read-only" | "workspace-write" | "full-access";
            network?: boolean;
        };
        format?: OutputFormat;
        system?: string;
        variant?: string;
        parts?: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionPromptResponses, SessionPromptErrors, ThrowOnError, "fields">;
    /**
     * Delete message
     *
     * Permanently delete a specific message (and all of its parts) from a session. This does not revert any file changes that may have been made while processing the message.
     */
    deleteMessage<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        messageID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionDeleteMessageResponses, SessionDeleteMessageErrors, ThrowOnError, "fields">;
    /**
     * Get message
     *
     * Retrieve a specific message from a session by its message ID.
     */
    message<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        messageID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionMessageResponses, SessionMessageErrors, ThrowOnError, "fields">;
    /**
     * Send async message
     *
     * Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.
     */
    promptAsync<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
        model?: {
            providerID: string;
            modelID: string;
        };
        agent?: string;
        userSelectedAgent?: boolean;
        agentRouting?: "auto" | "preserve";
        noReply?: boolean;
        tools?: {
            [key: string]: boolean;
        };
        toolsScope?: "session" | "turn";
        isolation?: {
            mode?: "read-only" | "workspace-write" | "full-access";
            network?: boolean;
        };
        format?: OutputFormat;
        system?: string;
        variant?: string;
        parts?: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionPromptAsyncResponses, SessionPromptAsyncErrors, ThrowOnError, "fields">;
    /**
     * Send async command
     *
     * Queue a command for a session and return immediately after it is accepted.
     */
    commandAsync<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
        agent?: string;
        model?: string;
        arguments?: string;
        command?: string;
        variant?: string;
        parts?: Array<FilePartInput>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionCommandAsyncResponses, SessionCommandAsyncErrors, ThrowOnError, "fields">;
    /**
     * Send command
     *
     * Send a new command to a session for execution by the AI assistant.
     */
    command<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
        agent?: string;
        model?: string;
        arguments?: string;
        command?: string;
        variant?: string;
        parts?: Array<FilePartInput>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionCommandResponses, SessionCommandErrors, ThrowOnError, "fields">;
    /**
     * Run async shell command
     *
     * Queue a shell command for a session and return immediately after it is accepted.
     */
    shellAsync<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        agent?: string;
        model?: {
            providerID: string;
            modelID: string;
        };
        command?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionShellAsyncResponses, SessionShellAsyncErrors, ThrowOnError, "fields">;
    /**
     * Run shell command
     *
     * Execute a shell command within the session context and return the AI's response.
     */
    shell<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        agent?: string;
        model?: {
            providerID: string;
            modelID: string;
        };
        command?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionShellResponses, SessionShellErrors, ThrowOnError, "fields">;
    /**
     * Revert message
     *
     * Revert a specific message in a session, undoing its effects and restoring the previous state.
     */
    revert<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        messageID?: string;
        partID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionRevertResponses, SessionRevertErrors, ThrowOnError, "fields">;
    /**
     * Restore reverted messages
     *
     * Restore all previously reverted messages in a session.
     */
    unrevert<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<SessionUnrevertResponses, SessionUnrevertErrors, ThrowOnError, "fields">;
}
export declare class Part extends HeyApiClient {
    /**
     * Delete a part from a message
     */
    delete<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        messageID: string;
        partID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PartDeleteResponses, PartDeleteErrors, ThrowOnError, "fields">;
    /**
     * Update a part in a message
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        messageID: string;
        partID: string;
        directory?: string;
        part?: Part2;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PartUpdateResponses, PartUpdateErrors, ThrowOnError, "fields">;
}
export declare class Permission extends HeyApiClient {
    /**
     * Respond to permission
     *
     * Approve or deny a permission request from the AI assistant.
     *
     * @deprecated
     */
    respond<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        permissionID: string;
        directory?: string;
        response?: "once" | "always" | "reject";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PermissionRespondResponses, PermissionRespondErrors, ThrowOnError, "fields">;
    /**
     * Respond to permission request
     *
     * Approve or deny a permission request from the AI assistant.
     */
    reply<ThrowOnError extends boolean = false>(parameters: {
        requestID: string;
        directory?: string;
        reply?: "once" | "always" | "reject";
        message?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PermissionReplyResponses, PermissionReplyErrors, ThrowOnError, "fields">;
    /**
     * List pending permissions
     *
     * Get all pending permission requests across all sessions.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PermissionListResponses, unknown, ThrowOnError, "fields">;
}
export declare class Audit extends HeyApiClient {
    /**
     * Export audit events
     *
     * Export all audit events for a session as JSON Lines.
     */
    export<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AuditExportResponses, unknown, ThrowOnError, "fields">;
    /**
     * Export all audit events
     *
     * Export all audit events, optionally filtered by date.
     */
    exportAll<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        limit?: number;
        since?: number;
        risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        type?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AuditExportAllResponses, unknown, ThrowOnError, "fields">;
    /**
     * Reconstruct replay
     *
     * Reconstruct session replay steps from recorded events.
     */
    replay<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        fromStep?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AuditReplayResponses, unknown, ThrowOnError, "fields">;
}
export declare class Graph extends HeyApiClient {
    /**
     * Get execution graph topology
     *
     * Return the structured topology view for a session execution graph.
     */
    topology<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GraphTopologyResponses, GraphTopologyErrors, ThrowOnError, "fields">;
    /**
     * Get execution graph
     *
     * Build and return the execution graph for a session.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        format?: "ascii" | "json" | "mermaid" | "gantt" | "svggantt" | "markdown" | "timeline" | "topology";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GraphGetResponses, GraphGetErrors, ThrowOnError, "fields">;
}
export declare class Question extends HeyApiClient {
    /**
     * List pending questions
     *
     * Get all pending question requests across all sessions.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Reply to question request
     *
     * Provide answers to a question request from the AI assistant.
     */
    reply<ThrowOnError extends boolean = false>(parameters: {
        requestID: string;
        directory?: string;
        answers?: Array<QuestionAnswer>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionReplyResponses, QuestionReplyErrors, ThrowOnError, "fields">;
    /**
     * Reject question request
     *
     * Reject a question request from the AI assistant.
     */
    reject<ThrowOnError extends boolean = false>(parameters: {
        requestID: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionRejectResponses, QuestionRejectErrors, ThrowOnError, "fields">;
}
export declare class Oauth extends HeyApiClient {
    /**
     * OAuth authorize
     *
     * Initiate OAuth authorization for a specific AI provider to get an authorization URL.
     */
    authorize<ThrowOnError extends boolean = false>(parameters: {
        providerID: string;
        directory?: string;
        method?: number;
        inputs?: {
            [key: string]: string;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProviderOauthAuthorizeResponses, ProviderOauthAuthorizeErrors, ThrowOnError, "fields">;
    /**
     * OAuth callback
     *
     * Handle the OAuth callback from a provider after user authorization.
     */
    callback<ThrowOnError extends boolean = false>(parameters: {
        providerID: string;
        directory?: string;
        method?: number;
        code?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProviderOauthCallbackResponses, ProviderOauthCallbackErrors, ThrowOnError, "fields">;
}
export declare class Provider extends HeyApiClient {
    /**
     * List providers
     *
     * Get a list of all available AI providers, including both available and connected ones.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProviderListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Get provider auth methods
     *
     * Retrieve available authentication methods for all AI providers.
     */
    auth<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProviderAuthResponses, unknown, ThrowOnError, "fields">;
    private _oauth?;
    get oauth(): Oauth;
}
export declare class Find extends HeyApiClient {
    /**
     * Find text
     *
     * Search for text patterns across files in the project using ripgrep.
     */
    text<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        pattern: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FindTextResponses, unknown, ThrowOnError, "fields">;
    /**
     * Find files
     *
     * Search for files or directories by name or pattern in the project directory.
     */
    files<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        query: string;
        dirs?: "true" | "false";
        type?: "file" | "directory";
        limit?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FindFilesResponses, unknown, ThrowOnError, "fields">;
    /**
     * Find symbols
     *
     * Search for workspace symbols like functions, classes, and variables using LSP.
     */
    symbols<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        query: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FindSymbolsResponses, unknown, ThrowOnError, "fields">;
}
export declare class File extends HeyApiClient {
    /**
     * List files
     *
     * List files and directories in a specified path.
     */
    list<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        path: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FileListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Read file
     *
     * Read the content of a specified file.
     */
    read<ThrowOnError extends boolean = false>(parameters: {
        directory?: string;
        path: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FileReadResponses, unknown, ThrowOnError, "fields">;
    /**
     * Get file status
     *
     * Get the git status of all files in the project.
     */
    status<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FileStatusResponses, unknown, ThrowOnError, "fields">;
}
export declare class Event extends HeyApiClient {
    /**
     * Subscribe to events
     *
     * Get events
     */
    subscribe<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): Promise<import("./core/serverSentEvents.gen.js").ServerSentEventsResult<EventSubscribeResponses, unknown>>;
}
export declare class Auth2 extends HeyApiClient {
    /**
     * Remove MCP OAuth
     *
     * Remove OAuth credentials for an MCP server
     */
    remove<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpAuthRemoveResponses, McpAuthRemoveErrors, ThrowOnError, "fields">;
    /**
     * Start MCP OAuth
     *
     * Start OAuth authentication flow for a Model Context Protocol (MCP) server.
     */
    start<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpAuthStartResponses, McpAuthStartErrors, ThrowOnError, "fields">;
    /**
     * Complete MCP OAuth
     *
     * Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code.
     */
    callback<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
        code?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpAuthCallbackResponses, McpAuthCallbackErrors, ThrowOnError, "fields">;
    /**
     * Authenticate MCP OAuth
     *
     * Start OAuth flow and wait for callback (opens browser)
     */
    authenticate<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpAuthAuthenticateResponses, McpAuthAuthenticateErrors, ThrowOnError, "fields">;
}
export declare class Mcp extends HeyApiClient {
    /**
     * Get MCP status
     *
     * Get the status of all Model Context Protocol (MCP) servers.
     */
    status<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpStatusResponses, unknown, ThrowOnError, "fields">;
    /**
     * Add MCP server
     *
     * Dynamically add a new Model Context Protocol (MCP) server to the system.
     */
    add<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        name?: string;
        config?: McpLocalConfig | McpRemoteConfig;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpAddResponses, McpAddErrors, ThrowOnError, "fields">;
    /**
     * Connect an MCP server
     */
    connect<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpConnectResponses, unknown, ThrowOnError, "fields">;
    /**
     * Disconnect an MCP server
     */
    disconnect<ThrowOnError extends boolean = false>(parameters: {
        name: string;
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<McpDisconnectResponses, unknown, ThrowOnError, "fields">;
    private _auth?;
    get auth(): Auth2;
}
export declare class Tui extends HeyApiClient {
    /**
     * Append TUI prompt
     *
     * Append prompt to the TUI
     */
    appendPrompt<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        text?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiAppendPromptResponses, TuiAppendPromptErrors, ThrowOnError, "fields">;
    /**
     * Open help dialog
     *
     * Open the help dialog in the TUI to display user assistance information.
     */
    openHelp<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiOpenHelpResponses, unknown, ThrowOnError, "fields">;
    /**
     * Open sessions dialog
     *
     * Open the session dialog
     */
    openSessions<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiOpenSessionsResponses, unknown, ThrowOnError, "fields">;
    /**
     * Open themes dialog
     *
     * Open the theme dialog
     */
    openThemes<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiOpenThemesResponses, unknown, ThrowOnError, "fields">;
    /**
     * Open models dialog
     *
     * Open the model dialog
     */
    openModels<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiOpenModelsResponses, unknown, ThrowOnError, "fields">;
    /**
     * Submit TUI prompt
     *
     * Submit the prompt
     */
    submitPrompt<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiSubmitPromptResponses, unknown, ThrowOnError, "fields">;
    /**
     * Clear TUI prompt
     *
     * Clear the prompt
     */
    clearPrompt<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiClearPromptResponses, unknown, ThrowOnError, "fields">;
    /**
     * Execute TUI command
     *
     * Execute a TUI command (e.g. agent_cycle)
     */
    executeCommand<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        command?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiExecuteCommandResponses, TuiExecuteCommandErrors, ThrowOnError, "fields">;
    /**
     * Show TUI toast
     *
     * Show a toast notification in the TUI
     */
    showToast<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        title?: string;
        message?: string;
        variant?: "info" | "success" | "warning" | "error";
        duration?: number;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiShowToastResponses, unknown, ThrowOnError, "fields">;
    /**
     * Publish TUI event
     *
     * Publish a TUI event
     */
    publish<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        body?: EventTuiPromptAppend | EventTuiCommandExecute | EventTuiToastShow | EventTuiSessionSelect;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiPublishResponses, TuiPublishErrors, ThrowOnError, "fields">;
    /**
     * Select session
     *
     * Navigate the TUI to display the specified session.
     */
    selectSession<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        sessionID?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TuiSelectSessionResponses, TuiSelectSessionErrors, ThrowOnError, "fields">;
}
export declare class Instance extends HeyApiClient {
    /**
     * Dispose instance
     *
     * Clean up and dispose the current ax-code instance, releasing all resources.
     */
    dispose<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<InstanceDisposeResponses, unknown, ThrowOnError, "fields">;
    /**
     * Restart instance
     *
     * Dispose and reinitialize the ax-code instance, reloading all configuration and provider data.
     */
    restart<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<InstanceRestartResponses, unknown, ThrowOnError, "fields">;
}
export declare class Path extends HeyApiClient {
    /**
     * Get paths
     *
     * Retrieve the current working directory and related path information for the ax-code instance.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<PathGetResponses, unknown, ThrowOnError, "fields">;
}
export declare class Vcs extends HeyApiClient {
    /**
     * Get VCS info
     *
     * Retrieve version control system (VCS) information for the current project, such as git branch.
     */
    get<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<VcsGetResponses, unknown, ThrowOnError, "fields">;
}
export declare class Command extends HeyApiClient {
    /**
     * List commands
     *
     * Get a list of all available commands in the ax-code system.
     */
    list<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<CommandListResponses, unknown, ThrowOnError, "fields">;
}
export declare class App extends HeyApiClient {
    /**
     * Write log
     *
     * Write a log entry to the server logs with specified level and metadata.
     */
    log<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        service?: string;
        level?: "debug" | "info" | "error" | "warn";
        message?: string;
        extra?: {
            [key: string]: unknown;
        };
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppLogResponses, AppLogErrors, ThrowOnError, "fields">;
    /**
     * Get project context
     *
     * Get instruction-file and cached-memory metadata for the current project context.
     */
    context<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppContextResponses, unknown, ThrowOnError, "fields">;
    /**
     * Create project context template
     *
     * Create a recommended rules or checklist file for the current project context.
     */
    contextTemplateCreate<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
        key?: "repo-rules" | "dir-rules" | "review-checklist" | "frontend-style-guide" | "release-checklist";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppContextTemplateCreateResponses, unknown, ThrowOnError, "fields">;
    /**
     * Refresh project memory
     *
     * Generate and cache fresh project memory for the current context.
     */
    contextMemoryWarmup<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppContextMemoryWarmupResponses, unknown, ThrowOnError, "fields">;
    /**
     * Clear project memory
     *
     * Delete cached project memory for the current context.
     */
    contextMemoryClear<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppContextMemoryClearResponses, unknown, ThrowOnError, "fields">;
    /**
     * List agents
     *
     * Get a list of all available AI agents in the ax-code system.
     */
    agents<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppAgentsResponses, unknown, ThrowOnError, "fields">;
    /**
     * List skills
     *
     * Get a list of all available skills in the ax-code system.
     */
    skills<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<AppSkillsResponses, unknown, ThrowOnError, "fields">;
}
export declare class Lsp extends HeyApiClient {
    /**
     * Get LSP status
     *
     * Get LSP server status
     */
    status<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<LspStatusResponses, unknown, ThrowOnError, "fields">;
}
export declare class DebugEngine extends HeyApiClient {
    /**
     * DRE status and pending refactor plans
     *
     * Return the current project's pending refactor plans plus DRE health information (graph node count, last-indexed timestamp, registered tool count). The TUI footer uses the plans count for its chip; the TUI sidebar uses the graph and tool fields to render the DRE section empty state so users can tell at a glance whether DRE is ready to use. Fields default to zero / null when the experimental DRE flag is off, so callers can poll unconditionally. The `graph` and `toolCount` fields were added in v2.3.6 — older clients ignore unknown fields and continue to work against the original `{ count, plans }` shape.
     */
    pendingPlans<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<DebugEnginePendingPlansResponses, unknown, ThrowOnError, "fields">;
}
export declare class Formatter extends HeyApiClient {
    /**
     * Get formatter status
     *
     * Get formatter status
     */
    status<ThrowOnError extends boolean = false>(parameters?: {
        directory?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<FormatterStatusResponses, unknown, ThrowOnError, "fields">;
}
export declare class OpencodeClient extends HeyApiClient {
    static readonly __registry: HeyApiRegistry<OpencodeClient>;
    constructor(args?: {
        client?: Client;
        key?: string;
    });
    getDreGraphSessionSessionId<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        quality?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GetDreGraphSessionSessionIdResponses, unknown, ThrowOnError, "fields">;
    getDreGraphSessionSessionIdFingerprint<ThrowOnError extends boolean = false>(parameters: {
        sessionID: string;
        directory?: string;
        quality?: boolean;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GetDreGraphSessionSessionIdFingerprintResponses, unknown, ThrowOnError, "fields">;
    private _global?;
    get global(): Global;
    private _auth?;
    get auth(): Auth;
    private _project?;
    get project(): Project;
    private _pty?;
    get pty(): Pty;
    private _config?;
    get config(): Config2;
    private _isolation?;
    get isolation(): Isolation;
    private _autonomous?;
    get autonomous(): Autonomous;
    private _smartLlm?;
    get smartLlm(): SmartLlm;
    private _superLong?;
    get superLong(): SuperLong;
    private _promptHistory?;
    get promptHistory(): PromptHistory;
    private _taskQueue?;
    get taskQueue(): TaskQueue;
    private _scheduledTask?;
    get scheduledTask(): ScheduledTask;
    private _workflowRun?;
    get workflowRun(): WorkflowRun;
    private _workflowTemplate?;
    get workflowTemplate(): WorkflowTemplate;
    private _workflowRoutine?;
    get workflowRoutine(): WorkflowRoutine;
    private _tool?;
    get tool(): Tool;
    private _worktree?;
    get worktree(): Worktree;
    private _experimental?;
    get experimental(): Experimental;
    private _session?;
    get session(): Session2;
    private _part?;
    get part(): Part;
    private _permission?;
    get permission(): Permission;
    private _audit?;
    get audit(): Audit;
    private _graph?;
    get graph(): Graph;
    private _question?;
    get question(): Question;
    private _provider?;
    get provider(): Provider;
    private _find?;
    get find(): Find;
    private _file?;
    get file(): File;
    private _event?;
    get event(): Event;
    private _mcp?;
    get mcp(): Mcp;
    private _tui?;
    get tui(): Tui;
    private _instance?;
    get instance(): Instance;
    private _path?;
    get path(): Path;
    private _vcs?;
    get vcs(): Vcs;
    private _command?;
    get command(): Command;
    private _app?;
    get app(): App;
    private _lsp?;
    get lsp(): Lsp;
    private _debugEngine?;
    get debugEngine(): DebugEngine;
    private _formatter?;
    get formatter(): Formatter;
}
export {};
