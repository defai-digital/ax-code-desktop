import { createHeadlessClient } from "./headless/client.js";
import type { HeadlessClientOptions, HeadlessCreateSessionInput, HeadlessSessionEvidenceInput } from "./headless/client.js";
import type { HeadlessBackendOptions } from "./headless/lifecycle.js";
import type { HeadlessCommandBody, HeadlessPermissionReplyBody, HeadlessPromptBody, HeadlessQuestionReplyBody, HeadlessRuntimeCommand, HeadlessRuntimeCommandResult, HeadlessShellBody } from "./headless/command.js";
export declare const AX_CODE_GRPC_SERVICE = "axcode.v1.AxCodeHeadless";
export declare const AX_CODE_GRPC_PROTO_PATH = "ax_code/v1/headless.proto";
export declare const AX_CODE_GRPC_PROTO_PACKAGE_PATH = "proto/ax_code/v1/headless.proto";
export declare const AX_CODE_GRPC_METHOD: {
    readonly Health: "/axcode.v1.AxCodeHeadless/Health";
    readonly CreateSession: "/axcode.v1.AxCodeHeadless/CreateSession";
    readonly SendRuntimeCommand: "/axcode.v1.AxCodeHeadless/SendRuntimeCommand";
    readonly LoadBootstrap: "/axcode.v1.AxCodeHeadless/LoadBootstrap";
    readonly LoadSessionEvidence: "/axcode.v1.AxCodeHeadless/LoadSessionEvidence";
    readonly ListSessions: "/axcode.v1.AxCodeHeadless/ListSessions";
    readonly GetSessionStatus: "/axcode.v1.AxCodeHeadless/GetSessionStatus";
    readonly GetSession: "/axcode.v1.AxCodeHeadless/GetSession";
    readonly UpdateSession: "/axcode.v1.AxCodeHeadless/UpdateSession";
    readonly DeleteSession: "/axcode.v1.AxCodeHeadless/DeleteSession";
    readonly ListSessionMessages: "/axcode.v1.AxCodeHeadless/ListSessionMessages";
    readonly GetSessionMessage: "/axcode.v1.AxCodeHeadless/GetSessionMessage";
    readonly DeleteSessionMessage: "/axcode.v1.AxCodeHeadless/DeleteSessionMessage";
    readonly ListSessionChildren: "/axcode.v1.AxCodeHeadless/ListSessionChildren";
    readonly GetSessionGoal: "/axcode.v1.AxCodeHeadless/GetSessionGoal";
    readonly GetSessionTodo: "/axcode.v1.AxCodeHeadless/GetSessionTodo";
    readonly GetSessionDiff: "/axcode.v1.AxCodeHeadless/GetSessionDiff";
    readonly ForkSession: "/axcode.v1.AxCodeHeadless/ForkSession";
    readonly ShareSession: "/axcode.v1.AxCodeHeadless/ShareSession";
    readonly UnshareSession: "/axcode.v1.AxCodeHeadless/UnshareSession";
    readonly SummarizeSession: "/axcode.v1.AxCodeHeadless/SummarizeSession";
    readonly ListAgents: "/axcode.v1.AxCodeHeadless/ListAgents";
    readonly ListSkills: "/axcode.v1.AxCodeHeadless/ListSkills";
    readonly WriteAppLog: "/axcode.v1.AxCodeHeadless/WriteAppLog";
    readonly DisposeInstance: "/axcode.v1.AxCodeHeadless/DisposeInstance";
    readonly RestartInstance: "/axcode.v1.AxCodeHeadless/RestartInstance";
    readonly ListProjects: "/axcode.v1.AxCodeHeadless/ListProjects";
    readonly GetCurrentProject: "/axcode.v1.AxCodeHeadless/GetCurrentProject";
    readonly GetPath: "/axcode.v1.AxCodeHeadless/GetPath";
    readonly GetVcs: "/axcode.v1.AxCodeHeadless/GetVcs";
    readonly ListCommands: "/axcode.v1.AxCodeHeadless/ListCommands";
    readonly GetProjectContext: "/axcode.v1.AxCodeHeadless/GetProjectContext";
    readonly CreateProjectContextTemplate: "/axcode.v1.AxCodeHeadless/CreateProjectContextTemplate";
    readonly WarmupProjectMemory: "/axcode.v1.AxCodeHeadless/WarmupProjectMemory";
    readonly ClearProjectMemory: "/axcode.v1.AxCodeHeadless/ClearProjectMemory";
    readonly GetDebugEnginePendingPlans: "/axcode.v1.AxCodeHeadless/GetDebugEnginePendingPlans";
    readonly ListFiles: "/axcode.v1.AxCodeHeadless/ListFiles";
    readonly ReadFile: "/axcode.v1.AxCodeHeadless/ReadFile";
    readonly GetFileStatus: "/axcode.v1.AxCodeHeadless/GetFileStatus";
    readonly FindText: "/axcode.v1.AxCodeHeadless/FindText";
    readonly FindFiles: "/axcode.v1.AxCodeHeadless/FindFiles";
    readonly FindSymbols: "/axcode.v1.AxCodeHeadless/FindSymbols";
    readonly ListToolIDs: "/axcode.v1.AxCodeHeadless/ListToolIDs";
    readonly ListTools: "/axcode.v1.AxCodeHeadless/ListTools";
    readonly ListPermissions: "/axcode.v1.AxCodeHeadless/ListPermissions";
    readonly ReplyPermission: "/axcode.v1.AxCodeHeadless/ReplyPermission";
    readonly ListQuestions: "/axcode.v1.AxCodeHeadless/ListQuestions";
    readonly ReplyQuestion: "/axcode.v1.AxCodeHeadless/ReplyQuestion";
    readonly RejectQuestion: "/axcode.v1.AxCodeHeadless/RejectQuestion";
    readonly GetConfig: "/axcode.v1.AxCodeHeadless/GetConfig";
    readonly UpdateConfig: "/axcode.v1.AxCodeHeadless/UpdateConfig";
    readonly ListConfigProviders: "/axcode.v1.AxCodeHeadless/ListConfigProviders";
    readonly GetAutonomousMode: "/axcode.v1.AxCodeHeadless/GetAutonomousMode";
    readonly SetAutonomousMode: "/axcode.v1.AxCodeHeadless/SetAutonomousMode";
    readonly GetIsolationMode: "/axcode.v1.AxCodeHeadless/GetIsolationMode";
    readonly SetIsolationMode: "/axcode.v1.AxCodeHeadless/SetIsolationMode";
    readonly GetSmartLlmRouting: "/axcode.v1.AxCodeHeadless/GetSmartLlmRouting";
    readonly SetSmartLlmRouting: "/axcode.v1.AxCodeHeadless/SetSmartLlmRouting";
    readonly GetMcpStatus: "/axcode.v1.AxCodeHeadless/GetMcpStatus";
    readonly ListMcpResources: "/axcode.v1.AxCodeHeadless/ListMcpResources";
    readonly AddMcpServer: "/axcode.v1.AxCodeHeadless/AddMcpServer";
    readonly StartMcpAuth: "/axcode.v1.AxCodeHeadless/StartMcpAuth";
    readonly CompleteMcpAuth: "/axcode.v1.AxCodeHeadless/CompleteMcpAuth";
    readonly AuthenticateMcp: "/axcode.v1.AxCodeHeadless/AuthenticateMcp";
    readonly RemoveMcpAuth: "/axcode.v1.AxCodeHeadless/RemoveMcpAuth";
    readonly ConnectMcp: "/axcode.v1.AxCodeHeadless/ConnectMcp";
    readonly DisconnectMcp: "/axcode.v1.AxCodeHeadless/DisconnectMcp";
    readonly ListProviders: "/axcode.v1.AxCodeHeadless/ListProviders";
    readonly GetProviderAuth: "/axcode.v1.AxCodeHeadless/GetProviderAuth";
    readonly SetAuth: "/axcode.v1.AxCodeHeadless/SetAuth";
    readonly RemoveAuth: "/axcode.v1.AxCodeHeadless/RemoveAuth";
    readonly ProviderOauthAuthorize: "/axcode.v1.AxCodeHeadless/ProviderOauthAuthorize";
    readonly ProviderOauthCallback: "/axcode.v1.AxCodeHeadless/ProviderOauthCallback";
    readonly GetLspStatus: "/axcode.v1.AxCodeHeadless/GetLspStatus";
    readonly GetFormatterStatus: "/axcode.v1.AxCodeHeadless/GetFormatterStatus";
    readonly ListPty: "/axcode.v1.AxCodeHeadless/ListPty";
    readonly CreatePty: "/axcode.v1.AxCodeHeadless/CreatePty";
    readonly GetPty: "/axcode.v1.AxCodeHeadless/GetPty";
    readonly UpdatePty: "/axcode.v1.AxCodeHeadless/UpdatePty";
    readonly RemovePty: "/axcode.v1.AxCodeHeadless/RemovePty";
    readonly ConnectPty: "/axcode.v1.AxCodeHeadless/ConnectPty";
    readonly ListTaskQueue: "/axcode.v1.AxCodeHeadless/ListTaskQueue";
    readonly EnqueueTaskQueue: "/axcode.v1.AxCodeHeadless/EnqueueTaskQueue";
    readonly EditTaskQueue: "/axcode.v1.AxCodeHeadless/EditTaskQueue";
    readonly TaskQueueCommand: "/axcode.v1.AxCodeHeadless/TaskQueueCommand";
    readonly ReorderTaskQueue: "/axcode.v1.AxCodeHeadless/ReorderTaskQueue";
    readonly RemoveTaskQueue: "/axcode.v1.AxCodeHeadless/RemoveTaskQueue";
    readonly ListScheduledTasks: "/axcode.v1.AxCodeHeadless/ListScheduledTasks";
    readonly CreateScheduledTask: "/axcode.v1.AxCodeHeadless/CreateScheduledTask";
    readonly UpdateScheduledTask: "/axcode.v1.AxCodeHeadless/UpdateScheduledTask";
    readonly ScheduledTaskCommand: "/axcode.v1.AxCodeHeadless/ScheduledTaskCommand";
    readonly RunScheduledTaskNow: "/axcode.v1.AxCodeHeadless/RunScheduledTaskNow";
    readonly RemoveScheduledTask: "/axcode.v1.AxCodeHeadless/RemoveScheduledTask";
    readonly ListWorkflowTemplates: "/axcode.v1.AxCodeHeadless/ListWorkflowTemplates";
    readonly GetWorkflowTemplate: "/axcode.v1.AxCodeHeadless/GetWorkflowTemplate";
    readonly SaveWorkflowTemplate: "/axcode.v1.AxCodeHeadless/SaveWorkflowTemplate";
    readonly PromoteWorkflowTemplate: "/axcode.v1.AxCodeHeadless/PromoteWorkflowTemplate";
    readonly ListWorkflowRuns: "/axcode.v1.AxCodeHeadless/ListWorkflowRuns";
    readonly WorkflowRunDashboard: "/axcode.v1.AxCodeHeadless/WorkflowRunDashboard";
    readonly WorkflowRunEvalCases: "/axcode.v1.AxCodeHeadless/WorkflowRunEvalCases";
    readonly CreateWorkflowRun: "/axcode.v1.AxCodeHeadless/CreateWorkflowRun";
    readonly GetWorkflowRun: "/axcode.v1.AxCodeHeadless/GetWorkflowRun";
    readonly WorkflowRunArtifacts: "/axcode.v1.AxCodeHeadless/WorkflowRunArtifacts";
    readonly WorkflowRunEvalSummary: "/axcode.v1.AxCodeHeadless/WorkflowRunEvalSummary";
    readonly WorkflowRunEvalCase: "/axcode.v1.AxCodeHeadless/WorkflowRunEvalCase";
    readonly SaveWorkflowRunTemplate: "/axcode.v1.AxCodeHeadless/SaveWorkflowRunTemplate";
    readonly WorkflowRunCommand: "/axcode.v1.AxCodeHeadless/WorkflowRunCommand";
    readonly ListWorkflowRoutines: "/axcode.v1.AxCodeHeadless/ListWorkflowRoutines";
    readonly RunWorkflowRoutine: "/axcode.v1.AxCodeHeadless/RunWorkflowRoutine";
    readonly SubscribeEvents: "/axcode.v1.AxCodeHeadless/SubscribeEvents";
};
type HeadlessHttpClient = ReturnType<typeof createHeadlessClient>;
type GrpcMethodMap = typeof AX_CODE_GRPC_METHOD;
export type AxCodeGrpcMethodName = keyof GrpcMethodMap;
export type AxCodeGrpcMethod = GrpcMethodMap[keyof GrpcMethodMap];
export type AxCodeGrpcUnaryMethod = Exclude<AxCodeGrpcMethod, typeof AX_CODE_GRPC_METHOD.SubscribeEvents | typeof AX_CODE_GRPC_METHOD.ConnectPty>;
export type AxCodeGrpcStreamingMethod = typeof AX_CODE_GRPC_METHOD.SubscribeEvents;
export type AxCodeGrpcBidirectionalStreamingMethod = typeof AX_CODE_GRPC_METHOD.ConnectPty;
export type AxCodeGrpcMethodKind = "unary" | "serverStream" | "bidiStream";
export type AxCodeGrpcMethodDomain = "health" | "runtime" | "bootstrap" | "session" | "app" | "project" | "workspace" | "search" | "tool" | "supervision" | "config" | "mcp" | "provider" | "diagnostics" | "pty" | "taskQueue" | "scheduledTask" | "workflow" | "events";
export type AxCodeGrpcMethodDescriptor = {
    readonly name: AxCodeGrpcMethodName;
    readonly method: AxCodeGrpcMethod;
    readonly kind: AxCodeGrpcMethodKind;
    readonly domain: AxCodeGrpcMethodDomain;
    readonly requestType: string;
    readonly responseType: string;
    readonly httpBridge: boolean;
    readonly stability: "active";
};
export type AxCodeGrpcMethodDescriptorFilter = {
    kind?: AxCodeGrpcMethodKind;
    domain?: AxCodeGrpcMethodDomain;
    httpBridge?: boolean;
};
export type AxCodeGrpcMetadata = Record<string, string>;
export type AxCodeGrpcJsonResponse<T = unknown> = {
    value: T;
};
export type AxCodeGrpcRuntimeEvent = {
    type: string;
    properties?: unknown;
};
export declare const AX_CODE_GRPC_METHOD_DESCRIPTORS: readonly AxCodeGrpcMethodDescriptor[];
export declare function listAxCodeGrpcMethods(filter?: AxCodeGrpcMethodDescriptorFilter): AxCodeGrpcMethodDescriptor[];
export declare function getAxCodeGrpcMethodDescriptor(method: AxCodeGrpcMethod): AxCodeGrpcMethodDescriptor | undefined;
export declare function assertAxCodeGrpcMethodSupported(method: AxCodeGrpcMethod, kind?: AxCodeGrpcMethodKind): AxCodeGrpcMethodDescriptor;
export type AxCodeGrpcCallOptions = {
    signal?: AbortSignal;
    timeoutMs?: number;
    metadata?: AxCodeGrpcMetadata;
};
export type AxCodeGrpcSubscribeEventsRequest = {
    types?: string[];
    sessionID?: string;
};
export type AxCodeGrpcTransport = {
    unary<TRequest, TResponse>(method: AxCodeGrpcUnaryMethod, request: TRequest, options?: AxCodeGrpcCallOptions): Promise<TResponse>;
    serverStream<TRequest, TResponse>(method: AxCodeGrpcStreamingMethod, request: TRequest, options?: AxCodeGrpcCallOptions): AsyncIterable<TResponse>;
    bidiStream?<TRequest, TInput, TResponse>(method: AxCodeGrpcBidirectionalStreamingMethod, request: TRequest, input: AsyncIterable<TInput>, options?: AxCodeGrpcCallOptions): AsyncIterable<TResponse>;
};
export type AxCodeGrpcNativeUnaryCall<TRequest = unknown> = {
    method: AxCodeGrpcUnaryMethod;
    request: TRequest;
    metadata?: AxCodeGrpcMetadata;
    signal?: AbortSignal;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeServerStreamCall<TRequest = unknown> = {
    method: AxCodeGrpcStreamingMethod;
    request: TRequest;
    metadata?: AxCodeGrpcMetadata;
    signal?: AbortSignal;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeBidiStreamCall<TRequest = unknown, TInput = unknown> = {
    method: AxCodeGrpcBidirectionalStreamingMethod;
    request: TRequest;
    input: AsyncIterable<TInput>;
    metadata?: AxCodeGrpcMetadata;
    signal?: AbortSignal;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeBridge = {
    unary<TRequest, TResponse>(call: AxCodeGrpcNativeUnaryCall<TRequest>): Promise<TResponse>;
    serverStream?<TRequest, TResponse>(call: AxCodeGrpcNativeServerStreamCall<TRequest>): AsyncIterable<TResponse>;
    bidiStream?<TRequest, TInput, TResponse>(call: AxCodeGrpcNativeBidiStreamCall<TRequest, TInput>): AsyncIterable<TResponse>;
};
export type AxCodeGrpcNativeIpcUnaryCall<TRequest = unknown> = {
    method: AxCodeGrpcUnaryMethod;
    request: TRequest;
    metadata?: AxCodeGrpcMetadata;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeIpcServerStreamCall<TRequest = unknown> = {
    method: AxCodeGrpcStreamingMethod;
    request: TRequest;
    metadata?: AxCodeGrpcMetadata;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeIpcBidiStreamCall<TRequest = unknown> = {
    method: AxCodeGrpcBidirectionalStreamingMethod;
    request: TRequest;
    metadata?: AxCodeGrpcMetadata;
    timeoutMs?: number;
};
export type AxCodeGrpcNativeIpcBridge = {
    unary<TRequest, TResponse>(call: AxCodeGrpcNativeIpcUnaryCall<TRequest>): Promise<TResponse>;
    serverStream?<TRequest, TResponse>(call: AxCodeGrpcNativeIpcServerStreamCall<TRequest>): AsyncIterable<TResponse>;
    bidiStream?<TRequest, TInput, TResponse>(call: AxCodeGrpcNativeIpcBidiStreamCall<TRequest>, input: AsyncIterable<TInput>): AsyncIterable<TResponse>;
};
export type AxCodeGrpcNativeIpcStreamController<T> = {
    push(value: T): void;
    close(): void;
    fail(error: unknown): void;
};
export type AxCodeGrpcNativeIpcStreamCleanup = void | (() => void | Promise<void>);
export type AxCodeGrpcNativeIpcChannelBridge = {
    unary<TRequest, TResponse>(call: AxCodeGrpcNativeIpcUnaryCall<TRequest>): Promise<TResponse>;
    serverStream?<TRequest, TResponse>(call: AxCodeGrpcNativeIpcServerStreamCall<TRequest>, controller: AxCodeGrpcNativeIpcStreamController<TResponse>): AxCodeGrpcNativeIpcStreamCleanup | Promise<AxCodeGrpcNativeIpcStreamCleanup>;
    bidiStream?<TRequest, TInput, TResponse>(call: AxCodeGrpcNativeIpcBidiStreamCall<TRequest>, input: AsyncIterable<TInput>, controller: AxCodeGrpcNativeIpcStreamController<TResponse>): AxCodeGrpcNativeIpcStreamCleanup | Promise<AxCodeGrpcNativeIpcStreamCleanup>;
};
export type AxCodeGrpcNativeHandlerContext<TMethod extends AxCodeGrpcMethod = AxCodeGrpcMethod> = AxCodeGrpcCallOptions & {
    method: TMethod;
};
export type AxCodeGrpcNativeUnaryHandler<TRequest = unknown, TResponse = unknown> = (request: TRequest, context: AxCodeGrpcNativeHandlerContext<AxCodeGrpcUnaryMethod>) => TResponse | Promise<TResponse>;
export type AxCodeGrpcNativeServerStreamHandler<TRequest = unknown, TResponse = unknown> = (request: TRequest, context: AxCodeGrpcNativeHandlerContext<AxCodeGrpcStreamingMethod>) => AsyncIterable<TResponse>;
export type AxCodeGrpcNativeBidiStreamHandler<TRequest = unknown, TInput = unknown, TResponse = unknown> = (request: TRequest, input: AsyncIterable<TInput>, context: AxCodeGrpcNativeHandlerContext<AxCodeGrpcBidirectionalStreamingMethod>) => AsyncIterable<TResponse>;
export type AxCodeGrpcNativeHandlerMap = {
    unary?: Partial<Record<AxCodeGrpcUnaryMethod, AxCodeGrpcNativeUnaryHandler>>;
    serverStream?: Partial<Record<AxCodeGrpcStreamingMethod, AxCodeGrpcNativeServerStreamHandler>>;
    bidiStream?: Partial<Record<AxCodeGrpcBidirectionalStreamingMethod, AxCodeGrpcNativeBidiStreamHandler>>;
};
export type AxCodeGrpcNativeHandlerCoverageFilter = AxCodeGrpcMethodDescriptorFilter & {
    methods?: readonly AxCodeGrpcMethod[];
};
export type AxCodeGrpcNativeHandlerCoverageRequirement = true | AxCodeGrpcNativeHandlerCoverageFilter;
export type AxCodeGrpcNativeBridgeFromHandlersOptions = {
    requireHandlers?: AxCodeGrpcNativeHandlerCoverageRequirement;
};
export type AxCodeGrpcHealthResponse = {
    status: "SERVING";
    transport?: "http-bridge" | "grpc";
};
export type AxCodeGrpcCreateSessionRequest = {
    session?: HeadlessCreateSessionInput;
};
export type AxCodeGrpcLoadSessionEvidenceRequest = {
    sessionID: string;
    parameters?: HeadlessSessionEvidenceInput;
};
export type AxCodeGrpcSessionRequest<TParameters = unknown> = {
    sessionID: string;
    parameters?: TParameters;
};
export type AxCodeGrpcSessionBodyRequest<TBody = unknown> = {
    sessionID: string;
    body?: TBody;
};
export type AxCodeGrpcSessionMessageRequest = {
    sessionID: string;
    messageID: string;
};
export type AxCodeGrpcRequestIDRequest = {
    requestID: string;
};
export type AxCodeGrpcRequestBodyRequest<TBody = unknown> = {
    requestID: string;
    body?: TBody;
};
export type AxCodeGrpcBootstrapField = "sessions" | "providers" | "providerList" | "agents" | "config" | "commands" | "permissions" | "questions" | "sessionStatus" | "providerAuth" | "path" | "lsp" | "mcp" | "resources" | "formatter" | "vcs";
export type AxCodeGrpcBootstrapRequest = {
    include?: Partial<Record<AxCodeGrpcBootstrapField, boolean>>;
    sessionListStart?: number;
};
export type AxCodeGrpcBootstrapResponse = Partial<Record<AxCodeGrpcBootstrapField, unknown>> & {
    errors: Array<{
        source: AxCodeGrpcBootstrapField;
        message: string;
    }>;
};
export type AxCodeGrpcPtyConnectRequest = {
    id: string;
    cursor?: number;
};
export type AxCodeGrpcPtyClientEvent = string | {
    type: "input";
    data: string;
} | {
    type: "resize";
    cols: number;
    rows: number;
} | {
    type: "close";
    code?: number;
    reason?: string;
};
export type AxCodeGrpcPtyServerEvent = {
    type: "output";
    data: string;
} | {
    type: "replay";
    cursor: number;
    from?: number;
    gap?: {
        requested: number;
        available: number;
    };
} | {
    type: "closed";
    code?: number;
    reason?: string;
};
export type AxCodeGrpcTaskQueueCommandRequest = {
    id: string;
    command: "pause" | "resume" | "cancel" | "retry" | "send-now";
};
export type AxCodeGrpcScheduledTaskCommandRequest = {
    id: string;
    command: "pause" | "resume";
};
export type AxCodeGrpcNamedRequest = {
    name: string;
};
export type AxCodeGrpcMcpAddRequest = {
    name: string;
    config?: NonNullable<Parameters<HeadlessHttpClient["client"]["mcp"]["add"]>[0]>["config"];
};
export type AxCodeGrpcMcpAuthCallbackRequest = AxCodeGrpcNamedRequest & {
    code?: string;
};
type AxCodeGrpcWorkflowRunStartInput = Parameters<HeadlessHttpClient["workflowRun"]["start"]>[1];
type AxCodeGrpcWorkflowRunRetryInput = Parameters<HeadlessHttpClient["workflowRun"]["retry"]>[1];
export type AxCodeGrpcWorkflowRunCommandRequest = {
    runID: string;
    command: "start" | "pause" | "resume" | "cancel" | "retry";
    body?: AxCodeGrpcWorkflowRunStartInput | AxCodeGrpcWorkflowRunRetryInput;
};
export type AxCodeGrpcClientOptions = {
    transport: AxCodeGrpcTransport;
};
export type AxCodeGrpcHeadlessBackendOptions = HeadlessBackendOptions & {
    webSocketFactory?: (url: string) => AxCodeGrpcWebSocketLike;
};
export type AxCodeGrpcHeadlessBackendHandle = {
    client: ReturnType<typeof createAxCodeGrpcClient>;
    close(): Promise<void>;
};
export type AxCodeGrpcWebSocketLike = {
    readyState: number;
    binaryType?: BinaryType;
    send(data: string | Uint8Array | ArrayBuffer): void;
    close(code?: number, reason?: string): void;
    addEventListener?: (type: string, listener: (event: any) => void, options?: boolean | AddEventListenerOptions) => void;
    removeEventListener?: (type: string, listener: (event: any) => void, options?: boolean | EventListenerOptions) => void;
    onopen?: ((event: unknown) => void) | null;
    onmessage?: ((event: {
        data: unknown;
    }) => void) | null;
    onerror?: ((event: unknown) => void) | null;
    onclose?: ((event: {
        code?: number;
        reason?: string;
    }) => void) | null;
};
export type AxCodeGrpcHttpBridgeOptions = HeadlessClientOptions & {
    webSocketFactory?: (url: string) => AxCodeGrpcWebSocketLike;
    /**
     * The HTTP bridge is a desktop compatibility fallback, not the preferred privileged GUI boundary.
     * Keep it loopback-only unless the caller explicitly owns and secures the remote server.
     */
    allowRemoteHttpBridge?: boolean;
};
export declare function createAxCodeGrpcNativeBridgeTransport(bridge: AxCodeGrpcNativeBridge): AxCodeGrpcTransport;
export declare function createAxCodeGrpcNativeIpcTransport(bridge: AxCodeGrpcNativeIpcBridge): AxCodeGrpcTransport;
export declare function createAxCodeGrpcNativeIpcBridgeFromChannels(bridge: AxCodeGrpcNativeIpcChannelBridge): AxCodeGrpcNativeIpcBridge;
export declare function createAxCodeGrpcNativeIpcStream<T>(subscribe: (controller: AxCodeGrpcNativeIpcStreamController<T>) => AxCodeGrpcNativeIpcStreamCleanup | Promise<AxCodeGrpcNativeIpcStreamCleanup>): AsyncIterable<T>;
export declare function createAxCodeGrpcNativeBridgeFromHandlers(handlers: AxCodeGrpcNativeHandlerMap, options?: AxCodeGrpcNativeBridgeFromHandlersOptions): AxCodeGrpcNativeBridge;
export declare function listMissingAxCodeGrpcNativeHandlers(handlers: AxCodeGrpcNativeHandlerMap, filter?: AxCodeGrpcNativeHandlerCoverageFilter): AxCodeGrpcMethodDescriptor[];
export declare function assertAxCodeGrpcNativeHandlers(handlers: AxCodeGrpcNativeHandlerMap, filter?: AxCodeGrpcNativeHandlerCoverageFilter): void;
export declare function createAxCodeGrpcClientFromNativeBridge(bridge: AxCodeGrpcNativeBridge): {
    health(options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcHealthResponse>;
    createSession(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    send: (command: HeadlessRuntimeCommand, options?: AxCodeGrpcCallOptions) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    session: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(sessionID: string, body: Omit<Parameters<HeadlessHttpClient["client"]["session"]["update"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        delete(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        messages(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["messages"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        message(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        deleteMessage(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        children(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        goal(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        todo(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        diff(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["diff"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        fork(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["fork"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        share(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        unshare(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        summarize(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["summarize"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    app: {
        agents(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["agents"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        skills(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["skills"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        log(body: Omit<NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["log"]>[0]>, "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    instance: {
        dispose(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        restart(options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    project: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        current(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["current"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    path: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["path"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    vcs: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["vcs"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    command: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["command"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    context: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["context"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        createTemplate(key: NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["contextTemplateCreate"]>[0]>["key"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        memory: {
            warmup(options?: AxCodeGrpcCallOptions): Promise<unknown>;
            clear(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    debugEngine: {
        pendingPlans(parameters?: Parameters<HeadlessHttpClient["client"]["debugEngine"]["pendingPlans"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    file: {
        list(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        read(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["file"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    find: {
        text(pattern: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        files(query: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["find"]["files"]>[0], "query" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        symbols(query: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    tool: {
        ids(parameters?: Parameters<HeadlessHttpClient["client"]["tool"]["ids"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        list(provider: string, model: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    permission: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["permission"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body?: Omit<HeadlessPermissionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    question: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["question"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body: Omit<HeadlessQuestionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reject(requestID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    config: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(config: NonNullable<Parameters<HeadlessHttpClient["client"]["config"]["update"]>[0]>["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        providers(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["providers"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    runtime: {
        autonomous: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["autonomous"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        isolation: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["isolation"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(mode: NonNullable<Parameters<HeadlessHttpClient["client"]["isolation"]["set"]>[0]>["mode"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        smartLlm: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["smartLlm"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    mcp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["mcp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resources(parameters?: Parameters<HeadlessHttpClient["client"]["experimental"]["resource"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        add(name: string, config: AxCodeGrpcMcpAddRequest["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        disconnect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth: {
            start(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(name: string, code?: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            authenticate(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            remove(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    lsp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["lsp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    formatter: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["formatter"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    provider: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["auth"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        oauth: {
            authorize(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["authorize"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["callback"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    auth: {
        set(providerID: string, auth: NonNullable<Parameters<HeadlessHttpClient["client"]["auth"]["set"]>[0]>["auth"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(providerID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    bootstrap: {
        load(request?: AxCodeGrpcBootstrapRequest, options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcBootstrapResponse>;
    };
    pty: {
        list(parameters?: {
            directory?: string;
        }, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body?: Parameters<HeadlessHttpClient["client"]["pty"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Omit<Parameters<HeadlessHttpClient["client"]["pty"]["update"]>[0], "ptyID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(id: string, events?: AsyncIterable<AxCodeGrpcPtyClientEvent>, options?: AxCodeGrpcCallOptions & {
            cursor?: number;
        }): AsyncIterable<AxCodeGrpcPtyServerEvent>;
    };
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    taskQueue: {
        list(parameters?: Parameters<HeadlessHttpClient["taskQueue"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        enqueue(body: Parameters<HeadlessHttpClient["taskQueue"]["enqueue"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        edit(id: string, body: Parameters<HeadlessHttpClient["taskQueue"]["edit"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcTaskQueueCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        sendNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reorder(id: string, position: number, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    scheduledTask: {
        list(parameters?: Parameters<HeadlessHttpClient["scheduledTask"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["scheduledTask"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Parameters<HeadlessHttpClient["scheduledTask"]["update"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcScheduledTaskCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        runNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowTemplate: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        save(body: Parameters<HeadlessHttpClient["workflowTemplate"]["save"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        promote(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRun: {
        list(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        dashboard(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["dashboard"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCases(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["workflowRun"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        artifacts(runID: string, parameters?: Parameters<HeadlessHttpClient["workflowRun"]["artifacts"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalSummary(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalSummary"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCase(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalCase"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        saveTemplate(runID: string, body: Parameters<HeadlessHttpClient["workflowRun"]["saveTemplate"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(runID: string, command: AxCodeGrpcWorkflowRunCommandRequest["command"], body?: AxCodeGrpcWorkflowRunCommandRequest["body"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        start(runID: string, body?: AxCodeGrpcWorkflowRunStartInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(runID: string, parametersOrOptions?: AxCodeGrpcWorkflowRunRetryInput | AxCodeGrpcCallOptions, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRoutine: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        run(body: Parameters<HeadlessHttpClient["workflowRoutine"]["run"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    subscribeEvents(requestOrOptions?: AxCodeGrpcSubscribeEventsRequest | AxCodeGrpcCallOptions, maybeOptions?: AxCodeGrpcCallOptions): AsyncIterable<AxCodeGrpcRuntimeEvent>;
};
export declare function createAxCodeGrpcClientFromNativeIpc(bridge: AxCodeGrpcNativeIpcBridge): {
    health(options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcHealthResponse>;
    createSession(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    send: (command: HeadlessRuntimeCommand, options?: AxCodeGrpcCallOptions) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    session: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(sessionID: string, body: Omit<Parameters<HeadlessHttpClient["client"]["session"]["update"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        delete(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        messages(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["messages"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        message(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        deleteMessage(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        children(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        goal(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        todo(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        diff(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["diff"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        fork(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["fork"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        share(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        unshare(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        summarize(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["summarize"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    app: {
        agents(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["agents"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        skills(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["skills"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        log(body: Omit<NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["log"]>[0]>, "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    instance: {
        dispose(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        restart(options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    project: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        current(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["current"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    path: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["path"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    vcs: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["vcs"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    command: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["command"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    context: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["context"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        createTemplate(key: NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["contextTemplateCreate"]>[0]>["key"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        memory: {
            warmup(options?: AxCodeGrpcCallOptions): Promise<unknown>;
            clear(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    debugEngine: {
        pendingPlans(parameters?: Parameters<HeadlessHttpClient["client"]["debugEngine"]["pendingPlans"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    file: {
        list(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        read(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["file"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    find: {
        text(pattern: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        files(query: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["find"]["files"]>[0], "query" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        symbols(query: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    tool: {
        ids(parameters?: Parameters<HeadlessHttpClient["client"]["tool"]["ids"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        list(provider: string, model: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    permission: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["permission"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body?: Omit<HeadlessPermissionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    question: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["question"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body: Omit<HeadlessQuestionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reject(requestID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    config: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(config: NonNullable<Parameters<HeadlessHttpClient["client"]["config"]["update"]>[0]>["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        providers(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["providers"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    runtime: {
        autonomous: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["autonomous"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        isolation: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["isolation"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(mode: NonNullable<Parameters<HeadlessHttpClient["client"]["isolation"]["set"]>[0]>["mode"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        smartLlm: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["smartLlm"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    mcp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["mcp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resources(parameters?: Parameters<HeadlessHttpClient["client"]["experimental"]["resource"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        add(name: string, config: AxCodeGrpcMcpAddRequest["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        disconnect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth: {
            start(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(name: string, code?: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            authenticate(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            remove(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    lsp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["lsp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    formatter: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["formatter"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    provider: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["auth"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        oauth: {
            authorize(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["authorize"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["callback"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    auth: {
        set(providerID: string, auth: NonNullable<Parameters<HeadlessHttpClient["client"]["auth"]["set"]>[0]>["auth"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(providerID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    bootstrap: {
        load(request?: AxCodeGrpcBootstrapRequest, options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcBootstrapResponse>;
    };
    pty: {
        list(parameters?: {
            directory?: string;
        }, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body?: Parameters<HeadlessHttpClient["client"]["pty"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Omit<Parameters<HeadlessHttpClient["client"]["pty"]["update"]>[0], "ptyID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(id: string, events?: AsyncIterable<AxCodeGrpcPtyClientEvent>, options?: AxCodeGrpcCallOptions & {
            cursor?: number;
        }): AsyncIterable<AxCodeGrpcPtyServerEvent>;
    };
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    taskQueue: {
        list(parameters?: Parameters<HeadlessHttpClient["taskQueue"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        enqueue(body: Parameters<HeadlessHttpClient["taskQueue"]["enqueue"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        edit(id: string, body: Parameters<HeadlessHttpClient["taskQueue"]["edit"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcTaskQueueCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        sendNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reorder(id: string, position: number, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    scheduledTask: {
        list(parameters?: Parameters<HeadlessHttpClient["scheduledTask"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["scheduledTask"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Parameters<HeadlessHttpClient["scheduledTask"]["update"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcScheduledTaskCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        runNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowTemplate: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        save(body: Parameters<HeadlessHttpClient["workflowTemplate"]["save"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        promote(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRun: {
        list(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        dashboard(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["dashboard"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCases(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["workflowRun"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        artifacts(runID: string, parameters?: Parameters<HeadlessHttpClient["workflowRun"]["artifacts"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalSummary(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalSummary"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCase(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalCase"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        saveTemplate(runID: string, body: Parameters<HeadlessHttpClient["workflowRun"]["saveTemplate"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(runID: string, command: AxCodeGrpcWorkflowRunCommandRequest["command"], body?: AxCodeGrpcWorkflowRunCommandRequest["body"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        start(runID: string, body?: AxCodeGrpcWorkflowRunStartInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(runID: string, parametersOrOptions?: AxCodeGrpcWorkflowRunRetryInput | AxCodeGrpcCallOptions, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRoutine: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        run(body: Parameters<HeadlessHttpClient["workflowRoutine"]["run"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    subscribeEvents(requestOrOptions?: AxCodeGrpcSubscribeEventsRequest | AxCodeGrpcCallOptions, maybeOptions?: AxCodeGrpcCallOptions): AsyncIterable<AxCodeGrpcRuntimeEvent>;
};
export declare function createAxCodeGrpcClientFromNativeHandlers(handlers: AxCodeGrpcNativeHandlerMap, options?: AxCodeGrpcNativeBridgeFromHandlersOptions): {
    health(options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcHealthResponse>;
    createSession(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    send: (command: HeadlessRuntimeCommand, options?: AxCodeGrpcCallOptions) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    session: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(sessionID: string, body: Omit<Parameters<HeadlessHttpClient["client"]["session"]["update"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        delete(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        messages(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["messages"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        message(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        deleteMessage(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        children(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        goal(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        todo(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        diff(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["diff"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        fork(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["fork"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        share(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        unshare(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        summarize(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["summarize"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    app: {
        agents(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["agents"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        skills(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["skills"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        log(body: Omit<NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["log"]>[0]>, "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    instance: {
        dispose(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        restart(options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    project: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        current(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["current"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    path: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["path"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    vcs: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["vcs"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    command: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["command"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    context: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["context"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        createTemplate(key: NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["contextTemplateCreate"]>[0]>["key"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        memory: {
            warmup(options?: AxCodeGrpcCallOptions): Promise<unknown>;
            clear(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    debugEngine: {
        pendingPlans(parameters?: Parameters<HeadlessHttpClient["client"]["debugEngine"]["pendingPlans"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    file: {
        list(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        read(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["file"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    find: {
        text(pattern: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        files(query: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["find"]["files"]>[0], "query" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        symbols(query: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    tool: {
        ids(parameters?: Parameters<HeadlessHttpClient["client"]["tool"]["ids"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        list(provider: string, model: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    permission: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["permission"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body?: Omit<HeadlessPermissionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    question: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["question"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body: Omit<HeadlessQuestionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reject(requestID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    config: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(config: NonNullable<Parameters<HeadlessHttpClient["client"]["config"]["update"]>[0]>["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        providers(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["providers"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    runtime: {
        autonomous: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["autonomous"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        isolation: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["isolation"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(mode: NonNullable<Parameters<HeadlessHttpClient["client"]["isolation"]["set"]>[0]>["mode"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        smartLlm: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["smartLlm"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    mcp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["mcp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resources(parameters?: Parameters<HeadlessHttpClient["client"]["experimental"]["resource"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        add(name: string, config: AxCodeGrpcMcpAddRequest["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        disconnect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth: {
            start(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(name: string, code?: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            authenticate(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            remove(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    lsp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["lsp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    formatter: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["formatter"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    provider: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["auth"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        oauth: {
            authorize(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["authorize"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["callback"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    auth: {
        set(providerID: string, auth: NonNullable<Parameters<HeadlessHttpClient["client"]["auth"]["set"]>[0]>["auth"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(providerID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    bootstrap: {
        load(request?: AxCodeGrpcBootstrapRequest, options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcBootstrapResponse>;
    };
    pty: {
        list(parameters?: {
            directory?: string;
        }, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body?: Parameters<HeadlessHttpClient["client"]["pty"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Omit<Parameters<HeadlessHttpClient["client"]["pty"]["update"]>[0], "ptyID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(id: string, events?: AsyncIterable<AxCodeGrpcPtyClientEvent>, options?: AxCodeGrpcCallOptions & {
            cursor?: number;
        }): AsyncIterable<AxCodeGrpcPtyServerEvent>;
    };
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    taskQueue: {
        list(parameters?: Parameters<HeadlessHttpClient["taskQueue"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        enqueue(body: Parameters<HeadlessHttpClient["taskQueue"]["enqueue"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        edit(id: string, body: Parameters<HeadlessHttpClient["taskQueue"]["edit"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcTaskQueueCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        sendNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reorder(id: string, position: number, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    scheduledTask: {
        list(parameters?: Parameters<HeadlessHttpClient["scheduledTask"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["scheduledTask"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Parameters<HeadlessHttpClient["scheduledTask"]["update"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcScheduledTaskCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        runNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowTemplate: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        save(body: Parameters<HeadlessHttpClient["workflowTemplate"]["save"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        promote(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRun: {
        list(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        dashboard(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["dashboard"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCases(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["workflowRun"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        artifacts(runID: string, parameters?: Parameters<HeadlessHttpClient["workflowRun"]["artifacts"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalSummary(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalSummary"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCase(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalCase"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        saveTemplate(runID: string, body: Parameters<HeadlessHttpClient["workflowRun"]["saveTemplate"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(runID: string, command: AxCodeGrpcWorkflowRunCommandRequest["command"], body?: AxCodeGrpcWorkflowRunCommandRequest["body"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        start(runID: string, body?: AxCodeGrpcWorkflowRunStartInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(runID: string, parametersOrOptions?: AxCodeGrpcWorkflowRunRetryInput | AxCodeGrpcCallOptions, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRoutine: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        run(body: Parameters<HeadlessHttpClient["workflowRoutine"]["run"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    subscribeEvents(requestOrOptions?: AxCodeGrpcSubscribeEventsRequest | AxCodeGrpcCallOptions, maybeOptions?: AxCodeGrpcCallOptions): AsyncIterable<AxCodeGrpcRuntimeEvent>;
};
export declare function createAxCodeGrpcClient(input: AxCodeGrpcClientOptions): {
    health(options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcHealthResponse>;
    createSession(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    send: (command: HeadlessRuntimeCommand, options?: AxCodeGrpcCallOptions) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    session: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(sessionID: string, body: Omit<Parameters<HeadlessHttpClient["client"]["session"]["update"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        delete(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        messages(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["messages"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        message(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        deleteMessage(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        children(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        goal(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        todo(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        diff(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["diff"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        fork(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["fork"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        share(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        unshare(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        summarize(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["summarize"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    app: {
        agents(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["agents"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        skills(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["skills"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        log(body: Omit<NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["log"]>[0]>, "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    instance: {
        dispose(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        restart(options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    project: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        current(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["current"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    path: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["path"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    vcs: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["vcs"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    command: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["command"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    context: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["context"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        createTemplate(key: NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["contextTemplateCreate"]>[0]>["key"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        memory: {
            warmup(options?: AxCodeGrpcCallOptions): Promise<unknown>;
            clear(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    debugEngine: {
        pendingPlans(parameters?: Parameters<HeadlessHttpClient["client"]["debugEngine"]["pendingPlans"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    file: {
        list(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        read(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["file"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    find: {
        text(pattern: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        files(query: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["find"]["files"]>[0], "query" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        symbols(query: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    tool: {
        ids(parameters?: Parameters<HeadlessHttpClient["client"]["tool"]["ids"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        list(provider: string, model: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    permission: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["permission"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body?: Omit<HeadlessPermissionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    question: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["question"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body: Omit<HeadlessQuestionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reject(requestID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    config: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(config: NonNullable<Parameters<HeadlessHttpClient["client"]["config"]["update"]>[0]>["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        providers(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["providers"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    runtime: {
        autonomous: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["autonomous"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        isolation: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["isolation"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(mode: NonNullable<Parameters<HeadlessHttpClient["client"]["isolation"]["set"]>[0]>["mode"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        smartLlm: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["smartLlm"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    mcp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["mcp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resources(parameters?: Parameters<HeadlessHttpClient["client"]["experimental"]["resource"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        add(name: string, config: AxCodeGrpcMcpAddRequest["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        disconnect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth: {
            start(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(name: string, code?: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            authenticate(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            remove(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    lsp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["lsp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    formatter: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["formatter"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    provider: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["auth"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        oauth: {
            authorize(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["authorize"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["callback"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    auth: {
        set(providerID: string, auth: NonNullable<Parameters<HeadlessHttpClient["client"]["auth"]["set"]>[0]>["auth"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(providerID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    bootstrap: {
        load(request?: AxCodeGrpcBootstrapRequest, options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcBootstrapResponse>;
    };
    pty: {
        list(parameters?: {
            directory?: string;
        }, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body?: Parameters<HeadlessHttpClient["client"]["pty"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Omit<Parameters<HeadlessHttpClient["client"]["pty"]["update"]>[0], "ptyID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(id: string, events?: AsyncIterable<AxCodeGrpcPtyClientEvent>, options?: AxCodeGrpcCallOptions & {
            cursor?: number;
        }): AsyncIterable<AxCodeGrpcPtyServerEvent>;
    };
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    taskQueue: {
        list(parameters?: Parameters<HeadlessHttpClient["taskQueue"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        enqueue(body: Parameters<HeadlessHttpClient["taskQueue"]["enqueue"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        edit(id: string, body: Parameters<HeadlessHttpClient["taskQueue"]["edit"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcTaskQueueCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        sendNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reorder(id: string, position: number, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    scheduledTask: {
        list(parameters?: Parameters<HeadlessHttpClient["scheduledTask"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["scheduledTask"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Parameters<HeadlessHttpClient["scheduledTask"]["update"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcScheduledTaskCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        runNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowTemplate: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        save(body: Parameters<HeadlessHttpClient["workflowTemplate"]["save"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        promote(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRun: {
        list(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        dashboard(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["dashboard"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCases(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["workflowRun"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        artifacts(runID: string, parameters?: Parameters<HeadlessHttpClient["workflowRun"]["artifacts"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalSummary(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalSummary"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCase(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalCase"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        saveTemplate(runID: string, body: Parameters<HeadlessHttpClient["workflowRun"]["saveTemplate"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(runID: string, command: AxCodeGrpcWorkflowRunCommandRequest["command"], body?: AxCodeGrpcWorkflowRunCommandRequest["body"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        start(runID: string, body?: AxCodeGrpcWorkflowRunStartInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(runID: string, parametersOrOptions?: AxCodeGrpcWorkflowRunRetryInput | AxCodeGrpcCallOptions, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRoutine: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        run(body: Parameters<HeadlessHttpClient["workflowRoutine"]["run"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    subscribeEvents(requestOrOptions?: AxCodeGrpcSubscribeEventsRequest | AxCodeGrpcCallOptions, maybeOptions?: AxCodeGrpcCallOptions): AsyncIterable<AxCodeGrpcRuntimeEvent>;
};
export declare function createAxCodeGrpcHttpBridge(input: AxCodeGrpcHttpBridgeOptions): AxCodeGrpcTransport;
export declare function createAxCodeGrpcClientFromHttp(input: AxCodeGrpcHttpBridgeOptions): {
    health(options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcHealthResponse>;
    createSession(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    send: (command: HeadlessRuntimeCommand, options?: AxCodeGrpcCallOptions) => Promise<HeadlessRuntimeCommandResult>;
    sendPrompt(sessionID: string, body: HeadlessPromptBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendCommand(sessionID: string, body: HeadlessCommandBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    sendShell(sessionID: string, body: HeadlessShellBody, options?: AxCodeGrpcCallOptions & {
        mode?: "sync" | "async";
    }): Promise<HeadlessRuntimeCommandResult>;
    abort(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyPermission(body: HeadlessPermissionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    replyQuestion(body: HeadlessQuestionReplyBody, options?: AxCodeGrpcCallOptions): Promise<HeadlessRuntimeCommandResult>;
    session: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(session?: HeadlessCreateSessionInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["session"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(sessionID: string, body: Omit<Parameters<HeadlessHttpClient["client"]["session"]["update"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        delete(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        messages(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["messages"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        message(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        deleteMessage(sessionID: string, messageID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        children(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        goal(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        todo(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        diff(sessionID: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["diff"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        fork(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["fork"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        share(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        unshare(sessionID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        summarize(sessionID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["session"]["summarize"]>[0], "sessionID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    app: {
        agents(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["agents"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        skills(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["skills"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        log(body: Omit<NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["log"]>[0]>, "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    instance: {
        dispose(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        restart(options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    project: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        current(parameters?: Parameters<HeadlessHttpClient["client"]["project"]["current"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    path: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["path"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    vcs: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["vcs"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    command: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["command"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    context: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["app"]["context"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        createTemplate(key: NonNullable<Parameters<HeadlessHttpClient["client"]["app"]["contextTemplateCreate"]>[0]>["key"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        memory: {
            warmup(options?: AxCodeGrpcCallOptions): Promise<unknown>;
            clear(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    debugEngine: {
        pendingPlans(parameters?: Parameters<HeadlessHttpClient["client"]["debugEngine"]["pendingPlans"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    file: {
        list(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        read(path: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        status(parameters?: Parameters<HeadlessHttpClient["client"]["file"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    find: {
        text(pattern: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        files(query: string, parameters?: Omit<Parameters<HeadlessHttpClient["client"]["find"]["files"]>[0], "query" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        symbols(query: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    tool: {
        ids(parameters?: Parameters<HeadlessHttpClient["client"]["tool"]["ids"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        list(provider: string, model: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    permission: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["permission"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body?: Omit<HeadlessPermissionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    question: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["question"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reply(requestID: string, body: Omit<HeadlessQuestionReplyBody, "requestID">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reject(requestID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    config: {
        get(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(config: NonNullable<Parameters<HeadlessHttpClient["client"]["config"]["update"]>[0]>["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        providers(parameters?: Parameters<HeadlessHttpClient["client"]["config"]["providers"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    runtime: {
        autonomous: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["autonomous"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        isolation: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["isolation"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(mode: NonNullable<Parameters<HeadlessHttpClient["client"]["isolation"]["set"]>[0]>["mode"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
        smartLlm: {
            get(parameters?: Parameters<HeadlessHttpClient["client"]["smartLlm"]["get"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
            set(enabled: boolean, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    mcp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["mcp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resources(parameters?: Parameters<HeadlessHttpClient["client"]["experimental"]["resource"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        add(name: string, config: AxCodeGrpcMcpAddRequest["config"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        disconnect(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth: {
            start(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(name: string, code?: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            authenticate(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            remove(name: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    lsp: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["lsp"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    formatter: {
        status(parameters?: Parameters<HeadlessHttpClient["client"]["formatter"]["status"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    provider: {
        list(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        auth(parameters?: Parameters<HeadlessHttpClient["client"]["provider"]["auth"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        oauth: {
            authorize(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["authorize"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
            callback(providerID: string, body?: Omit<Parameters<HeadlessHttpClient["client"]["provider"]["oauth"]["callback"]>[0], "providerID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        };
    };
    auth: {
        set(providerID: string, auth: NonNullable<Parameters<HeadlessHttpClient["client"]["auth"]["set"]>[0]>["auth"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(providerID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    bootstrap: {
        load(request?: AxCodeGrpcBootstrapRequest, options?: AxCodeGrpcCallOptions): Promise<AxCodeGrpcBootstrapResponse>;
    };
    pty: {
        list(parameters?: {
            directory?: string;
        }, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body?: Parameters<HeadlessHttpClient["client"]["pty"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Omit<Parameters<HeadlessHttpClient["client"]["pty"]["update"]>[0], "ptyID" | "directory">, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        connect(id: string, events?: AsyncIterable<AxCodeGrpcPtyClientEvent>, options?: AxCodeGrpcCallOptions & {
            cursor?: number;
        }): AsyncIterable<AxCodeGrpcPtyServerEvent>;
    };
    sessionEvidence: {
        load(sessionID: string, parameters?: HeadlessSessionEvidenceInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    taskQueue: {
        list(parameters?: Parameters<HeadlessHttpClient["taskQueue"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        enqueue(body: Parameters<HeadlessHttpClient["taskQueue"]["enqueue"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        edit(id: string, body: Parameters<HeadlessHttpClient["taskQueue"]["edit"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcTaskQueueCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        sendNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        reorder(id: string, position: number, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    scheduledTask: {
        list(parameters?: Parameters<HeadlessHttpClient["scheduledTask"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["scheduledTask"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        update(id: string, body: Parameters<HeadlessHttpClient["scheduledTask"]["update"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(id: string, command: AxCodeGrpcScheduledTaskCommandRequest["command"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        runNow(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        remove(id: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowTemplate: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        save(body: Parameters<HeadlessHttpClient["workflowTemplate"]["save"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        promote(templateID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRun: {
        list(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["list"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        dashboard(parameters?: Parameters<HeadlessHttpClient["workflowRun"]["dashboard"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCases(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        create(body: Parameters<HeadlessHttpClient["workflowRun"]["create"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        get(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        artifacts(runID: string, parameters?: Parameters<HeadlessHttpClient["workflowRun"]["artifacts"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalSummary(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalSummary"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        evalCase(runID: string, body?: Parameters<HeadlessHttpClient["workflowRun"]["evalCase"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        saveTemplate(runID: string, body: Parameters<HeadlessHttpClient["workflowRun"]["saveTemplate"]>[1], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        command(runID: string, command: AxCodeGrpcWorkflowRunCommandRequest["command"], body?: AxCodeGrpcWorkflowRunCommandRequest["body"], options?: AxCodeGrpcCallOptions): Promise<unknown>;
        start(runID: string, body?: AxCodeGrpcWorkflowRunStartInput, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        pause(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        resume(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        cancel(runID: string, options?: AxCodeGrpcCallOptions): Promise<unknown>;
        retry(runID: string, parametersOrOptions?: AxCodeGrpcWorkflowRunRetryInput | AxCodeGrpcCallOptions, options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    workflowRoutine: {
        list(options?: AxCodeGrpcCallOptions): Promise<unknown>;
        run(body: Parameters<HeadlessHttpClient["workflowRoutine"]["run"]>[0], options?: AxCodeGrpcCallOptions): Promise<unknown>;
    };
    subscribeEvents(requestOrOptions?: AxCodeGrpcSubscribeEventsRequest | AxCodeGrpcCallOptions, maybeOptions?: AxCodeGrpcCallOptions): AsyncIterable<AxCodeGrpcRuntimeEvent>;
};
export declare const createAxCodeGrpcHeadlessClient: typeof createAxCodeGrpcClient;
export declare function startAxCodeGrpcHeadlessBackend(options?: AxCodeGrpcHeadlessBackendOptions): Promise<AxCodeGrpcHeadlessBackendHandle>;
export declare function resolveAxCodeGrpcProtoUrl(baseUrl?: string | URL): URL;
export {};
