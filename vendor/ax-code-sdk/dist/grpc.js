import { createHeadlessClient } from "./headless/client.js";
import { startHeadlessBackend } from "./headless/lifecycle.js";
export const AX_CODE_GRPC_SERVICE = "axcode.v1.AxCodeHeadless";
export const AX_CODE_GRPC_PROTO_PATH = "ax_code/v1/headless.proto";
export const AX_CODE_GRPC_PROTO_PACKAGE_PATH = `proto/${AX_CODE_GRPC_PROTO_PATH}`;
export const AX_CODE_GRPC_METHOD = {
    Health: `/${AX_CODE_GRPC_SERVICE}/Health`,
    CreateSession: `/${AX_CODE_GRPC_SERVICE}/CreateSession`,
    SendRuntimeCommand: `/${AX_CODE_GRPC_SERVICE}/SendRuntimeCommand`,
    LoadBootstrap: `/${AX_CODE_GRPC_SERVICE}/LoadBootstrap`,
    LoadSessionEvidence: `/${AX_CODE_GRPC_SERVICE}/LoadSessionEvidence`,
    ListSessions: `/${AX_CODE_GRPC_SERVICE}/ListSessions`,
    GetSessionStatus: `/${AX_CODE_GRPC_SERVICE}/GetSessionStatus`,
    GetSession: `/${AX_CODE_GRPC_SERVICE}/GetSession`,
    UpdateSession: `/${AX_CODE_GRPC_SERVICE}/UpdateSession`,
    DeleteSession: `/${AX_CODE_GRPC_SERVICE}/DeleteSession`,
    ListSessionMessages: `/${AX_CODE_GRPC_SERVICE}/ListSessionMessages`,
    GetSessionMessage: `/${AX_CODE_GRPC_SERVICE}/GetSessionMessage`,
    DeleteSessionMessage: `/${AX_CODE_GRPC_SERVICE}/DeleteSessionMessage`,
    ListSessionChildren: `/${AX_CODE_GRPC_SERVICE}/ListSessionChildren`,
    GetSessionGoal: `/${AX_CODE_GRPC_SERVICE}/GetSessionGoal`,
    GetSessionTodo: `/${AX_CODE_GRPC_SERVICE}/GetSessionTodo`,
    GetSessionDiff: `/${AX_CODE_GRPC_SERVICE}/GetSessionDiff`,
    ForkSession: `/${AX_CODE_GRPC_SERVICE}/ForkSession`,
    ShareSession: `/${AX_CODE_GRPC_SERVICE}/ShareSession`,
    UnshareSession: `/${AX_CODE_GRPC_SERVICE}/UnshareSession`,
    SummarizeSession: `/${AX_CODE_GRPC_SERVICE}/SummarizeSession`,
    ListAgents: `/${AX_CODE_GRPC_SERVICE}/ListAgents`,
    ListSkills: `/${AX_CODE_GRPC_SERVICE}/ListSkills`,
    WriteAppLog: `/${AX_CODE_GRPC_SERVICE}/WriteAppLog`,
    DisposeInstance: `/${AX_CODE_GRPC_SERVICE}/DisposeInstance`,
    RestartInstance: `/${AX_CODE_GRPC_SERVICE}/RestartInstance`,
    ListProjects: `/${AX_CODE_GRPC_SERVICE}/ListProjects`,
    GetCurrentProject: `/${AX_CODE_GRPC_SERVICE}/GetCurrentProject`,
    GetPath: `/${AX_CODE_GRPC_SERVICE}/GetPath`,
    GetVcs: `/${AX_CODE_GRPC_SERVICE}/GetVcs`,
    ListCommands: `/${AX_CODE_GRPC_SERVICE}/ListCommands`,
    GetProjectContext: `/${AX_CODE_GRPC_SERVICE}/GetProjectContext`,
    CreateProjectContextTemplate: `/${AX_CODE_GRPC_SERVICE}/CreateProjectContextTemplate`,
    WarmupProjectMemory: `/${AX_CODE_GRPC_SERVICE}/WarmupProjectMemory`,
    ClearProjectMemory: `/${AX_CODE_GRPC_SERVICE}/ClearProjectMemory`,
    GetDebugEnginePendingPlans: `/${AX_CODE_GRPC_SERVICE}/GetDebugEnginePendingPlans`,
    ListFiles: `/${AX_CODE_GRPC_SERVICE}/ListFiles`,
    ReadFile: `/${AX_CODE_GRPC_SERVICE}/ReadFile`,
    GetFileStatus: `/${AX_CODE_GRPC_SERVICE}/GetFileStatus`,
    FindText: `/${AX_CODE_GRPC_SERVICE}/FindText`,
    FindFiles: `/${AX_CODE_GRPC_SERVICE}/FindFiles`,
    FindSymbols: `/${AX_CODE_GRPC_SERVICE}/FindSymbols`,
    ListToolIDs: `/${AX_CODE_GRPC_SERVICE}/ListToolIDs`,
    ListTools: `/${AX_CODE_GRPC_SERVICE}/ListTools`,
    ListPermissions: `/${AX_CODE_GRPC_SERVICE}/ListPermissions`,
    ReplyPermission: `/${AX_CODE_GRPC_SERVICE}/ReplyPermission`,
    ListQuestions: `/${AX_CODE_GRPC_SERVICE}/ListQuestions`,
    ReplyQuestion: `/${AX_CODE_GRPC_SERVICE}/ReplyQuestion`,
    RejectQuestion: `/${AX_CODE_GRPC_SERVICE}/RejectQuestion`,
    GetConfig: `/${AX_CODE_GRPC_SERVICE}/GetConfig`,
    UpdateConfig: `/${AX_CODE_GRPC_SERVICE}/UpdateConfig`,
    ListConfigProviders: `/${AX_CODE_GRPC_SERVICE}/ListConfigProviders`,
    GetAutonomousMode: `/${AX_CODE_GRPC_SERVICE}/GetAutonomousMode`,
    SetAutonomousMode: `/${AX_CODE_GRPC_SERVICE}/SetAutonomousMode`,
    GetIsolationMode: `/${AX_CODE_GRPC_SERVICE}/GetIsolationMode`,
    SetIsolationMode: `/${AX_CODE_GRPC_SERVICE}/SetIsolationMode`,
    GetSmartLlmRouting: `/${AX_CODE_GRPC_SERVICE}/GetSmartLlmRouting`,
    SetSmartLlmRouting: `/${AX_CODE_GRPC_SERVICE}/SetSmartLlmRouting`,
    GetMcpStatus: `/${AX_CODE_GRPC_SERVICE}/GetMcpStatus`,
    ListMcpResources: `/${AX_CODE_GRPC_SERVICE}/ListMcpResources`,
    AddMcpServer: `/${AX_CODE_GRPC_SERVICE}/AddMcpServer`,
    StartMcpAuth: `/${AX_CODE_GRPC_SERVICE}/StartMcpAuth`,
    CompleteMcpAuth: `/${AX_CODE_GRPC_SERVICE}/CompleteMcpAuth`,
    AuthenticateMcp: `/${AX_CODE_GRPC_SERVICE}/AuthenticateMcp`,
    RemoveMcpAuth: `/${AX_CODE_GRPC_SERVICE}/RemoveMcpAuth`,
    ConnectMcp: `/${AX_CODE_GRPC_SERVICE}/ConnectMcp`,
    DisconnectMcp: `/${AX_CODE_GRPC_SERVICE}/DisconnectMcp`,
    ListProviders: `/${AX_CODE_GRPC_SERVICE}/ListProviders`,
    GetProviderAuth: `/${AX_CODE_GRPC_SERVICE}/GetProviderAuth`,
    SetAuth: `/${AX_CODE_GRPC_SERVICE}/SetAuth`,
    RemoveAuth: `/${AX_CODE_GRPC_SERVICE}/RemoveAuth`,
    ProviderOauthAuthorize: `/${AX_CODE_GRPC_SERVICE}/ProviderOauthAuthorize`,
    ProviderOauthCallback: `/${AX_CODE_GRPC_SERVICE}/ProviderOauthCallback`,
    GetLspStatus: `/${AX_CODE_GRPC_SERVICE}/GetLspStatus`,
    GetFormatterStatus: `/${AX_CODE_GRPC_SERVICE}/GetFormatterStatus`,
    ListPty: `/${AX_CODE_GRPC_SERVICE}/ListPty`,
    CreatePty: `/${AX_CODE_GRPC_SERVICE}/CreatePty`,
    GetPty: `/${AX_CODE_GRPC_SERVICE}/GetPty`,
    UpdatePty: `/${AX_CODE_GRPC_SERVICE}/UpdatePty`,
    RemovePty: `/${AX_CODE_GRPC_SERVICE}/RemovePty`,
    ConnectPty: `/${AX_CODE_GRPC_SERVICE}/ConnectPty`,
    ListTaskQueue: `/${AX_CODE_GRPC_SERVICE}/ListTaskQueue`,
    EnqueueTaskQueue: `/${AX_CODE_GRPC_SERVICE}/EnqueueTaskQueue`,
    EditTaskQueue: `/${AX_CODE_GRPC_SERVICE}/EditTaskQueue`,
    TaskQueueCommand: `/${AX_CODE_GRPC_SERVICE}/TaskQueueCommand`,
    ReorderTaskQueue: `/${AX_CODE_GRPC_SERVICE}/ReorderTaskQueue`,
    RemoveTaskQueue: `/${AX_CODE_GRPC_SERVICE}/RemoveTaskQueue`,
    ListScheduledTasks: `/${AX_CODE_GRPC_SERVICE}/ListScheduledTasks`,
    CreateScheduledTask: `/${AX_CODE_GRPC_SERVICE}/CreateScheduledTask`,
    UpdateScheduledTask: `/${AX_CODE_GRPC_SERVICE}/UpdateScheduledTask`,
    ScheduledTaskCommand: `/${AX_CODE_GRPC_SERVICE}/ScheduledTaskCommand`,
    RunScheduledTaskNow: `/${AX_CODE_GRPC_SERVICE}/RunScheduledTaskNow`,
    RemoveScheduledTask: `/${AX_CODE_GRPC_SERVICE}/RemoveScheduledTask`,
    ListWorkflowTemplates: `/${AX_CODE_GRPC_SERVICE}/ListWorkflowTemplates`,
    GetWorkflowTemplate: `/${AX_CODE_GRPC_SERVICE}/GetWorkflowTemplate`,
    SaveWorkflowTemplate: `/${AX_CODE_GRPC_SERVICE}/SaveWorkflowTemplate`,
    PromoteWorkflowTemplate: `/${AX_CODE_GRPC_SERVICE}/PromoteWorkflowTemplate`,
    ListWorkflowRuns: `/${AX_CODE_GRPC_SERVICE}/ListWorkflowRuns`,
    WorkflowRunDashboard: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunDashboard`,
    WorkflowRunEvalCases: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunEvalCases`,
    CreateWorkflowRun: `/${AX_CODE_GRPC_SERVICE}/CreateWorkflowRun`,
    GetWorkflowRun: `/${AX_CODE_GRPC_SERVICE}/GetWorkflowRun`,
    WorkflowRunArtifacts: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunArtifacts`,
    WorkflowRunEvalSummary: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunEvalSummary`,
    WorkflowRunEvalCase: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunEvalCase`,
    SaveWorkflowRunTemplate: `/${AX_CODE_GRPC_SERVICE}/SaveWorkflowRunTemplate`,
    WorkflowRunCommand: `/${AX_CODE_GRPC_SERVICE}/WorkflowRunCommand`,
    ListWorkflowRoutines: `/${AX_CODE_GRPC_SERVICE}/ListWorkflowRoutines`,
    RunWorkflowRoutine: `/${AX_CODE_GRPC_SERVICE}/RunWorkflowRoutine`,
    SubscribeEvents: `/${AX_CODE_GRPC_SERVICE}/SubscribeEvents`,
};
const AX_CODE_GRPC_PROTO_TYPES = {
    Health: { requestType: "HealthRequest", responseType: "HealthResponse" },
    CreateSession: { requestType: "CreateSessionRequest", responseType: "JsonResponse" },
    SendRuntimeCommand: { requestType: "SendRuntimeCommandRequest", responseType: "RuntimeCommandResponse" },
    LoadBootstrap: { requestType: "BootstrapRequest", responseType: "JsonResponse" },
    LoadSessionEvidence: { requestType: "LoadSessionEvidenceRequest", responseType: "JsonResponse" },
    ListSessions: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetSessionStatus: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetSession: { requestType: "SessionRequest", responseType: "JsonResponse" },
    UpdateSession: { requestType: "SessionJsonRequest", responseType: "JsonResponse" },
    DeleteSession: { requestType: "SessionRequest", responseType: "JsonResponse" },
    ListSessionMessages: { requestType: "SessionQueryRequest", responseType: "JsonResponse" },
    GetSessionMessage: { requestType: "SessionMessageRequest", responseType: "JsonResponse" },
    DeleteSessionMessage: { requestType: "SessionMessageRequest", responseType: "JsonResponse" },
    ListSessionChildren: { requestType: "SessionRequest", responseType: "JsonResponse" },
    GetSessionGoal: { requestType: "SessionRequest", responseType: "JsonResponse" },
    GetSessionTodo: { requestType: "SessionRequest", responseType: "JsonResponse" },
    GetSessionDiff: { requestType: "SessionQueryRequest", responseType: "JsonResponse" },
    ForkSession: { requestType: "SessionJsonRequest", responseType: "JsonResponse" },
    ShareSession: { requestType: "SessionRequest", responseType: "JsonResponse" },
    UnshareSession: { requestType: "SessionRequest", responseType: "JsonResponse" },
    SummarizeSession: { requestType: "SessionJsonRequest", responseType: "JsonResponse" },
    ListAgents: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListSkills: { requestType: "QueryRequest", responseType: "JsonResponse" },
    WriteAppLog: { requestType: "JsonRequest", responseType: "JsonResponse" },
    DisposeInstance: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    RestartInstance: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    ListProjects: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetCurrentProject: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetPath: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetVcs: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListCommands: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetProjectContext: { requestType: "QueryRequest", responseType: "JsonResponse" },
    CreateProjectContextTemplate: { requestType: "JsonRequest", responseType: "JsonResponse" },
    WarmupProjectMemory: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    ClearProjectMemory: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    GetDebugEnginePendingPlans: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListFiles: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ReadFile: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetFileStatus: { requestType: "QueryRequest", responseType: "JsonResponse" },
    FindText: { requestType: "QueryRequest", responseType: "JsonResponse" },
    FindFiles: { requestType: "QueryRequest", responseType: "JsonResponse" },
    FindSymbols: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListToolIDs: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListTools: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListPermissions: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ReplyPermission: { requestType: "RequestJsonRequest", responseType: "JsonResponse" },
    ListQuestions: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ReplyQuestion: { requestType: "RequestJsonRequest", responseType: "JsonResponse" },
    RejectQuestion: { requestType: "RequestRequest", responseType: "JsonResponse" },
    GetConfig: { requestType: "QueryRequest", responseType: "JsonResponse" },
    UpdateConfig: { requestType: "JsonRequest", responseType: "JsonResponse" },
    ListConfigProviders: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetAutonomousMode: { requestType: "QueryRequest", responseType: "JsonResponse" },
    SetAutonomousMode: { requestType: "JsonRequest", responseType: "JsonResponse" },
    GetIsolationMode: { requestType: "QueryRequest", responseType: "JsonResponse" },
    SetIsolationMode: { requestType: "JsonRequest", responseType: "JsonResponse" },
    GetSmartLlmRouting: { requestType: "QueryRequest", responseType: "JsonResponse" },
    SetSmartLlmRouting: { requestType: "JsonRequest", responseType: "JsonResponse" },
    GetMcpStatus: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListMcpResources: { requestType: "QueryRequest", responseType: "JsonResponse" },
    AddMcpServer: { requestType: "McpAddRequest", responseType: "JsonResponse" },
    StartMcpAuth: { requestType: "NamedRequest", responseType: "JsonResponse" },
    CompleteMcpAuth: { requestType: "McpAuthCallbackRequest", responseType: "JsonResponse" },
    AuthenticateMcp: { requestType: "NamedRequest", responseType: "JsonResponse" },
    RemoveMcpAuth: { requestType: "NamedRequest", responseType: "JsonResponse" },
    ConnectMcp: { requestType: "NamedRequest", responseType: "JsonResponse" },
    DisconnectMcp: { requestType: "NamedRequest", responseType: "JsonResponse" },
    ListProviders: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetProviderAuth: { requestType: "QueryRequest", responseType: "JsonResponse" },
    SetAuth: { requestType: "ProviderAuthRequest", responseType: "JsonResponse" },
    RemoveAuth: { requestType: "ProviderRequest", responseType: "JsonResponse" },
    ProviderOauthAuthorize: { requestType: "ProviderJsonRequest", responseType: "JsonResponse" },
    ProviderOauthCallback: { requestType: "ProviderJsonRequest", responseType: "JsonResponse" },
    GetLspStatus: { requestType: "QueryRequest", responseType: "JsonResponse" },
    GetFormatterStatus: { requestType: "QueryRequest", responseType: "JsonResponse" },
    ListPty: { requestType: "QueryRequest", responseType: "JsonResponse" },
    CreatePty: { requestType: "JsonRequest", responseType: "JsonResponse" },
    GetPty: { requestType: "IdRequest", responseType: "JsonResponse" },
    UpdatePty: { requestType: "IdJsonRequest", responseType: "JsonResponse" },
    RemovePty: { requestType: "IdRequest", responseType: "JsonResponse" },
    ConnectPty: { requestType: "PtyClientEvent", responseType: "PtyServerEvent" },
    ListTaskQueue: { requestType: "QueryRequest", responseType: "JsonResponse" },
    EnqueueTaskQueue: { requestType: "JsonRequest", responseType: "JsonResponse" },
    EditTaskQueue: { requestType: "IdJsonRequest", responseType: "JsonResponse" },
    TaskQueueCommand: { requestType: "CommandRequest", responseType: "JsonResponse" },
    ReorderTaskQueue: { requestType: "ReorderRequest", responseType: "JsonResponse" },
    RemoveTaskQueue: { requestType: "IdRequest", responseType: "JsonResponse" },
    ListScheduledTasks: { requestType: "QueryRequest", responseType: "JsonResponse" },
    CreateScheduledTask: { requestType: "JsonRequest", responseType: "JsonResponse" },
    UpdateScheduledTask: { requestType: "IdJsonRequest", responseType: "JsonResponse" },
    ScheduledTaskCommand: { requestType: "CommandRequest", responseType: "JsonResponse" },
    RunScheduledTaskNow: { requestType: "IdRequest", responseType: "JsonResponse" },
    RemoveScheduledTask: { requestType: "IdRequest", responseType: "JsonResponse" },
    ListWorkflowTemplates: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    GetWorkflowTemplate: { requestType: "TemplateRequest", responseType: "JsonResponse" },
    SaveWorkflowTemplate: { requestType: "JsonRequest", responseType: "JsonResponse" },
    PromoteWorkflowTemplate: { requestType: "TemplateRequest", responseType: "JsonResponse" },
    ListWorkflowRuns: { requestType: "QueryRequest", responseType: "JsonResponse" },
    WorkflowRunDashboard: { requestType: "QueryRequest", responseType: "JsonResponse" },
    WorkflowRunEvalCases: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    CreateWorkflowRun: { requestType: "JsonRequest", responseType: "JsonResponse" },
    GetWorkflowRun: { requestType: "RunRequest", responseType: "JsonResponse" },
    WorkflowRunArtifacts: { requestType: "RunQueryRequest", responseType: "JsonResponse" },
    WorkflowRunEvalSummary: { requestType: "RunJsonRequest", responseType: "JsonResponse" },
    WorkflowRunEvalCase: { requestType: "RunJsonRequest", responseType: "JsonResponse" },
    SaveWorkflowRunTemplate: { requestType: "RunJsonRequest", responseType: "JsonResponse" },
    WorkflowRunCommand: { requestType: "WorkflowRunCommandRequest", responseType: "JsonResponse" },
    ListWorkflowRoutines: { requestType: "EmptyRequest", responseType: "JsonResponse" },
    RunWorkflowRoutine: { requestType: "JsonRequest", responseType: "JsonResponse" },
    SubscribeEvents: { requestType: "SubscribeEventsRequest", responseType: "RuntimeEvent" },
};
export const AX_CODE_GRPC_METHOD_DESCRIPTORS = Object.freeze(Object.entries(AX_CODE_GRPC_METHOD).map(([name, method]) => {
    const protoTypes = AX_CODE_GRPC_PROTO_TYPES[name];
    return Object.freeze({
        name: name,
        method: method,
        kind: axCodeGrpcMethodKind(method),
        domain: axCodeGrpcMethodDomain(name),
        requestType: protoTypes.requestType,
        responseType: protoTypes.responseType,
        httpBridge: true,
        stability: "active",
    });
}));
const AX_CODE_GRPC_METHOD_DESCRIPTOR_BY_METHOD = new Map(AX_CODE_GRPC_METHOD_DESCRIPTORS.map((descriptor) => [descriptor.method, descriptor]));
export function listAxCodeGrpcMethods(filter = {}) {
    return AX_CODE_GRPC_METHOD_DESCRIPTORS.filter((descriptor) => {
        if (filter.kind && descriptor.kind !== filter.kind)
            return false;
        if (filter.domain && descriptor.domain !== filter.domain)
            return false;
        if (filter.httpBridge !== undefined && descriptor.httpBridge !== filter.httpBridge)
            return false;
        return true;
    });
}
export function getAxCodeGrpcMethodDescriptor(method) {
    return AX_CODE_GRPC_METHOD_DESCRIPTOR_BY_METHOD.get(method);
}
export function assertAxCodeGrpcMethodSupported(method, kind) {
    const descriptor = getAxCodeGrpcMethodDescriptor(method);
    if (!descriptor)
        throw new Error(`Unsupported AX Code gRPC method: ${method}`);
    if (kind && descriptor.kind !== kind) {
        throw new Error(`AX Code gRPC method ${method} is ${descriptor.kind}, not ${kind}`);
    }
    return descriptor;
}
function axCodeGrpcMethodKind(method) {
    if (method === AX_CODE_GRPC_METHOD.SubscribeEvents)
        return "serverStream";
    if (method === AX_CODE_GRPC_METHOD.ConnectPty)
        return "bidiStream";
    return "unary";
}
function axCodeGrpcMethodDomain(name) {
    switch (name) {
        case "Health":
            return "health";
        case "SendRuntimeCommand":
            return "runtime";
        case "LoadBootstrap":
            return "bootstrap";
        case "CreateSession":
        case "LoadSessionEvidence":
        case "ListSessions":
        case "GetSessionStatus":
        case "GetSession":
        case "UpdateSession":
        case "DeleteSession":
        case "ListSessionMessages":
        case "GetSessionMessage":
        case "DeleteSessionMessage":
        case "ListSessionChildren":
        case "GetSessionGoal":
        case "GetSessionTodo":
        case "GetSessionDiff":
        case "ForkSession":
        case "ShareSession":
        case "UnshareSession":
        case "SummarizeSession":
            return "session";
        case "ListAgents":
        case "ListSkills":
        case "WriteAppLog":
        case "DisposeInstance":
        case "RestartInstance":
            return "app";
        case "ListProjects":
        case "GetCurrentProject":
        case "GetProjectContext":
        case "CreateProjectContextTemplate":
        case "WarmupProjectMemory":
        case "ClearProjectMemory":
        case "GetDebugEnginePendingPlans":
            return "project";
        case "GetPath":
        case "GetVcs":
        case "ListCommands":
        case "ListFiles":
        case "ReadFile":
        case "GetFileStatus":
            return "workspace";
        case "FindText":
        case "FindFiles":
        case "FindSymbols":
            return "search";
        case "ListToolIDs":
        case "ListTools":
            return "tool";
        case "ListPermissions":
        case "ReplyPermission":
        case "ListQuestions":
        case "ReplyQuestion":
        case "RejectQuestion":
            return "supervision";
        case "GetConfig":
        case "UpdateConfig":
        case "ListConfigProviders":
        case "GetAutonomousMode":
        case "SetAutonomousMode":
        case "GetIsolationMode":
        case "SetIsolationMode":
        case "GetSmartLlmRouting":
        case "SetSmartLlmRouting":
            return "config";
        case "GetMcpStatus":
        case "ListMcpResources":
        case "AddMcpServer":
        case "StartMcpAuth":
        case "CompleteMcpAuth":
        case "AuthenticateMcp":
        case "RemoveMcpAuth":
        case "ConnectMcp":
        case "DisconnectMcp":
            return "mcp";
        case "ListProviders":
        case "GetProviderAuth":
        case "SetAuth":
        case "RemoveAuth":
        case "ProviderOauthAuthorize":
        case "ProviderOauthCallback":
            return "provider";
        case "GetLspStatus":
        case "GetFormatterStatus":
            return "diagnostics";
        case "ListPty":
        case "CreatePty":
        case "GetPty":
        case "UpdatePty":
        case "RemovePty":
        case "ConnectPty":
            return "pty";
        case "ListTaskQueue":
        case "EnqueueTaskQueue":
        case "EditTaskQueue":
        case "TaskQueueCommand":
        case "ReorderTaskQueue":
        case "RemoveTaskQueue":
            return "taskQueue";
        case "ListScheduledTasks":
        case "CreateScheduledTask":
        case "UpdateScheduledTask":
        case "ScheduledTaskCommand":
        case "RunScheduledTaskNow":
        case "RemoveScheduledTask":
            return "scheduledTask";
        case "ListWorkflowTemplates":
        case "GetWorkflowTemplate":
        case "SaveWorkflowTemplate":
        case "PromoteWorkflowTemplate":
        case "ListWorkflowRuns":
        case "WorkflowRunDashboard":
        case "WorkflowRunEvalCases":
        case "CreateWorkflowRun":
        case "GetWorkflowRun":
        case "WorkflowRunArtifacts":
        case "WorkflowRunEvalSummary":
        case "WorkflowRunEvalCase":
        case "SaveWorkflowRunTemplate":
        case "WorkflowRunCommand":
        case "ListWorkflowRoutines":
        case "RunWorkflowRoutine":
            return "workflow";
        case "SubscribeEvents":
            return "events";
    }
}
export function createAxCodeGrpcNativeBridgeTransport(bridge) {
    return {
        unary(method, request, options) {
            return bridge.unary({
                method,
                request,
                metadata: options?.metadata,
                signal: options?.signal,
                timeoutMs: options?.timeoutMs,
            });
        },
        serverStream(method, request, options) {
            if (!bridge.serverStream)
                throw new Error("AX Code native bridge does not support server streaming");
            return bridge.serverStream({
                method,
                request,
                metadata: options?.metadata,
                signal: options?.signal,
                timeoutMs: options?.timeoutMs,
            });
        },
        bidiStream(method, request, input, options) {
            if (!bridge.bidiStream)
                throw new Error("AX Code native bridge does not support bidirectional streaming");
            return bridge.bidiStream({
                method,
                request,
                input,
                metadata: options?.metadata,
                signal: options?.signal,
                timeoutMs: options?.timeoutMs,
            });
        },
    };
}
export function createAxCodeGrpcNativeIpcTransport(bridge) {
    return {
        unary(method, request, options) {
            assertAxCodeGrpcMethodSupported(method, "unary");
            return bridge.unary({
                method,
                request,
                metadata: options?.metadata,
                timeoutMs: options?.timeoutMs,
            });
        },
        serverStream(method, request, options) {
            assertAxCodeGrpcMethodSupported(method, "serverStream");
            if (!bridge.serverStream)
                throw new Error("AX Code native IPC bridge does not support server streaming");
            return bridge.serverStream({
                method,
                request,
                metadata: options?.metadata,
                timeoutMs: options?.timeoutMs,
            });
        },
        bidiStream(method, request, input, options) {
            assertAxCodeGrpcMethodSupported(method, "bidiStream");
            if (!bridge.bidiStream)
                throw new Error("AX Code native IPC bridge does not support bidirectional streaming");
            return bridge.bidiStream({
                method,
                request,
                metadata: options?.metadata,
                timeoutMs: options?.timeoutMs,
            }, input);
        },
    };
}
export function createAxCodeGrpcNativeIpcBridgeFromChannels(bridge) {
    return {
        unary: bridge.unary,
        serverStream(call) {
            if (!bridge.serverStream)
                throw new Error("AX Code native IPC channel bridge does not support server streaming");
            return createAxCodeGrpcNativeIpcStream((controller) => bridge.serverStream(call, controller));
        },
        bidiStream(call, input) {
            if (!bridge.bidiStream)
                throw new Error("AX Code native IPC channel bridge does not support bidirectional streaming");
            return createAxCodeGrpcNativeIpcStream((controller) => bridge.bidiStream(call, input, controller));
        },
    };
}
export function createAxCodeGrpcNativeIpcStream(subscribe) {
    return {
        [Symbol.asyncIterator]() {
            const queue = createAsyncQueue();
            let started = false;
            let cleaned = false;
            let cleanupPromise;
            const start = () => {
                if (started)
                    return;
                started = true;
                cleanupPromise = Promise.resolve()
                    .then(() => subscribe(queue))
                    .catch((error) => {
                    queue.fail(error);
                    return undefined;
                });
            };
            const iterator = queue.iterable[Symbol.asyncIterator]();
            const cleanup = async () => {
                if (cleaned)
                    return;
                cleaned = true;
                queue.close();
                const cleanupFn = await cleanupPromise;
                if (typeof cleanupFn === "function")
                    await cleanupFn();
            };
            return {
                async next() {
                    start();
                    try {
                        const result = await iterator.next();
                        if (result.done)
                            await cleanup();
                        return result;
                    }
                    catch (error) {
                        await cleanup();
                        throw error;
                    }
                },
                async return() {
                    await cleanup();
                    return { value: undefined, done: true };
                },
            };
        },
    };
}
export function createAxCodeGrpcNativeBridgeFromHandlers(handlers, options = {}) {
    assertRequiredAxCodeGrpcNativeHandlers(handlers, options.requireHandlers);
    return {
        async unary(call) {
            const handler = handlers.unary?.[call.method];
            if (!handler)
                throw missingNativeHandler("unary", call.method);
            return handler(call.request, nativeHandlerContext(call));
        },
        serverStream(call) {
            const handler = handlers.serverStream?.[call.method];
            if (!handler)
                throw missingNativeHandler("server stream", call.method);
            return handler(call.request, nativeHandlerContext(call));
        },
        bidiStream(call) {
            const handler = handlers.bidiStream?.[call.method];
            if (!handler)
                throw missingNativeHandler("bidirectional stream", call.method);
            return handler(call.request, call.input, nativeHandlerContext(call));
        },
    };
}
export function listMissingAxCodeGrpcNativeHandlers(handlers, filter = {}) {
    const methodSet = filter.methods ? new Set(filter.methods) : undefined;
    return listAxCodeGrpcMethods(filter)
        .filter((descriptor) => !methodSet || methodSet.has(descriptor.method))
        .filter((descriptor) => !hasAxCodeGrpcNativeHandler(handlers, descriptor));
}
export function assertAxCodeGrpcNativeHandlers(handlers, filter = {}) {
    const missing = listMissingAxCodeGrpcNativeHandlers(handlers, filter);
    if (missing.length === 0)
        return;
    const names = missing.map((descriptor) => `${descriptor.name}(${descriptor.kind})`).join(", ");
    throw new Error(`Missing AX Code gRPC native handlers: ${names}`);
}
function assertRequiredAxCodeGrpcNativeHandlers(handlers, requirement) {
    if (!requirement)
        return;
    assertAxCodeGrpcNativeHandlers(handlers, requirement === true ? {} : requirement);
}
export function createAxCodeGrpcClientFromNativeBridge(bridge) {
    return createAxCodeGrpcClient({ transport: createAxCodeGrpcNativeBridgeTransport(bridge) });
}
export function createAxCodeGrpcClientFromNativeIpc(bridge) {
    return createAxCodeGrpcClient({ transport: createAxCodeGrpcNativeIpcTransport(bridge) });
}
export function createAxCodeGrpcClientFromNativeHandlers(handlers, options = {}) {
    return createAxCodeGrpcClientFromNativeBridge(createAxCodeGrpcNativeBridgeFromHandlers(handlers, options));
}
export function createAxCodeGrpcClient(input) {
    const transport = input.transport;
    const unary = (method, request, options) => transport.unary(method, request, options);
    const send = (command, options) => unary(AX_CODE_GRPC_METHOD.SendRuntimeCommand, { command }, options);
    const value = async (method, request, options) => {
        const response = await unary(method, request, options);
        return response.value;
    };
    const taskQueueCommand = (id, command, options) => value(AX_CODE_GRPC_METHOD.TaskQueueCommand, { id, command }, options);
    const scheduledTaskCommand = (id, command, options) => value(AX_CODE_GRPC_METHOD.ScheduledTaskCommand, { id, command }, options);
    const workflowRunCommand = (runID, command, body, options) => value(AX_CODE_GRPC_METHOD.WorkflowRunCommand, { runID, command, body }, options);
    return {
        health(options) {
            return unary(AX_CODE_GRPC_METHOD.Health, {}, options);
        },
        createSession(session, options) {
            return value(AX_CODE_GRPC_METHOD.CreateSession, { session }, options);
        },
        send,
        sendPrompt(sessionID, body, options) {
            return send({ type: "session.prompt", mode: options?.mode ?? "async", sessionID, body }, options);
        },
        sendCommand(sessionID, body, options) {
            return send({ type: "session.command", mode: options?.mode ?? "async", sessionID, body }, options);
        },
        sendShell(sessionID, body, options) {
            return send({ type: "session.shell", mode: options?.mode ?? "async", sessionID, body }, options);
        },
        abort(sessionID, options) {
            return send({ type: "session.abort", sessionID }, options);
        },
        replyPermission(body, options) {
            return send({ type: "permission.reply", body }, options);
        },
        replyQuestion(body, options) {
            return send({ type: "question.reply", body }, options);
        },
        session: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListSessions, { parameters }, options);
            },
            create(session, options) {
                return value(AX_CODE_GRPC_METHOD.CreateSession, { session }, options);
            },
            status(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetSessionStatus, { parameters }, options);
            },
            get(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.GetSession, { sessionID }, options);
            },
            update(sessionID, body, options) {
                return value(AX_CODE_GRPC_METHOD.UpdateSession, { sessionID, body }, options);
            },
            delete(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.DeleteSession, { sessionID }, options);
            },
            messages(sessionID, parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListSessionMessages, { sessionID, parameters }, options);
            },
            message(sessionID, messageID, options) {
                return value(AX_CODE_GRPC_METHOD.GetSessionMessage, { sessionID, messageID }, options);
            },
            deleteMessage(sessionID, messageID, options) {
                return value(AX_CODE_GRPC_METHOD.DeleteSessionMessage, { sessionID, messageID }, options);
            },
            children(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.ListSessionChildren, { sessionID }, options);
            },
            goal(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.GetSessionGoal, { sessionID }, options);
            },
            todo(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.GetSessionTodo, { sessionID }, options);
            },
            diff(sessionID, parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetSessionDiff, { sessionID, parameters }, options);
            },
            fork(sessionID, body, options) {
                return value(AX_CODE_GRPC_METHOD.ForkSession, { sessionID, body }, options);
            },
            share(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.ShareSession, { sessionID }, options);
            },
            unshare(sessionID, options) {
                return value(AX_CODE_GRPC_METHOD.UnshareSession, { sessionID }, options);
            },
            summarize(sessionID, body, options) {
                return value(AX_CODE_GRPC_METHOD.SummarizeSession, { sessionID, body }, options);
            },
        },
        app: {
            agents(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListAgents, { parameters }, options);
            },
            skills(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListSkills, { parameters }, options);
            },
            log(body, options) {
                return value(AX_CODE_GRPC_METHOD.WriteAppLog, { body }, options);
            },
        },
        instance: {
            dispose(options) {
                return value(AX_CODE_GRPC_METHOD.DisposeInstance, {}, options);
            },
            restart(options) {
                return value(AX_CODE_GRPC_METHOD.RestartInstance, {}, options);
            },
        },
        project: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListProjects, { parameters }, options);
            },
            current(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetCurrentProject, { parameters }, options);
            },
        },
        path: {
            get(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetPath, { parameters }, options);
            },
        },
        vcs: {
            get(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetVcs, { parameters }, options);
            },
        },
        command: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListCommands, { parameters }, options);
            },
        },
        context: {
            get(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetProjectContext, { parameters }, options);
            },
            createTemplate(key, options) {
                return value(AX_CODE_GRPC_METHOD.CreateProjectContextTemplate, { body: { key } }, options);
            },
            memory: {
                warmup(options) {
                    return value(AX_CODE_GRPC_METHOD.WarmupProjectMemory, {}, options);
                },
                clear(options) {
                    return value(AX_CODE_GRPC_METHOD.ClearProjectMemory, {}, options);
                },
            },
        },
        debugEngine: {
            pendingPlans(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetDebugEnginePendingPlans, { parameters }, options);
            },
        },
        file: {
            list(path, options) {
                return value(AX_CODE_GRPC_METHOD.ListFiles, { parameters: { path } }, options);
            },
            read(path, options) {
                return value(AX_CODE_GRPC_METHOD.ReadFile, { parameters: { path } }, options);
            },
            status(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetFileStatus, { parameters }, options);
            },
        },
        find: {
            text(pattern, options) {
                return value(AX_CODE_GRPC_METHOD.FindText, { parameters: { pattern } }, options);
            },
            files(query, parameters, options) {
                return value(AX_CODE_GRPC_METHOD.FindFiles, { parameters: { query, ...parameters } }, options);
            },
            symbols(query, options) {
                return value(AX_CODE_GRPC_METHOD.FindSymbols, { parameters: { query } }, options);
            },
        },
        tool: {
            ids(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListToolIDs, { parameters }, options);
            },
            list(provider, model, options) {
                return value(AX_CODE_GRPC_METHOD.ListTools, { parameters: { provider, model } }, options);
            },
        },
        permission: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListPermissions, { parameters }, options);
            },
            reply(requestID, body, options) {
                return value(AX_CODE_GRPC_METHOD.ReplyPermission, { requestID, body }, options);
            },
        },
        question: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListQuestions, { parameters }, options);
            },
            reply(requestID, body, options) {
                return value(AX_CODE_GRPC_METHOD.ReplyQuestion, { requestID, body }, options);
            },
            reject(requestID, options) {
                return value(AX_CODE_GRPC_METHOD.RejectQuestion, { requestID }, options);
            },
        },
        config: {
            get(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetConfig, { parameters }, options);
            },
            update(config, options) {
                return value(AX_CODE_GRPC_METHOD.UpdateConfig, { body: { config } }, options);
            },
            providers(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListConfigProviders, { parameters }, options);
            },
        },
        runtime: {
            autonomous: {
                get(parameters, options) {
                    return value(AX_CODE_GRPC_METHOD.GetAutonomousMode, { parameters }, options);
                },
                set(enabled, options) {
                    return value(AX_CODE_GRPC_METHOD.SetAutonomousMode, { body: { enabled } }, options);
                },
            },
            isolation: {
                get(parameters, options) {
                    return value(AX_CODE_GRPC_METHOD.GetIsolationMode, { parameters }, options);
                },
                set(mode, options) {
                    return value(AX_CODE_GRPC_METHOD.SetIsolationMode, { body: { mode } }, options);
                },
            },
            smartLlm: {
                get(parameters, options) {
                    return value(AX_CODE_GRPC_METHOD.GetSmartLlmRouting, { parameters }, options);
                },
                set(enabled, options) {
                    return value(AX_CODE_GRPC_METHOD.SetSmartLlmRouting, { body: { enabled } }, options);
                },
            },
        },
        mcp: {
            status(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetMcpStatus, { parameters }, options);
            },
            resources(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListMcpResources, { parameters }, options);
            },
            add(name, config, options) {
                return value(AX_CODE_GRPC_METHOD.AddMcpServer, { name, config }, options);
            },
            connect(name, options) {
                return value(AX_CODE_GRPC_METHOD.ConnectMcp, { name }, options);
            },
            disconnect(name, options) {
                return value(AX_CODE_GRPC_METHOD.DisconnectMcp, { name }, options);
            },
            auth: {
                start(name, options) {
                    return value(AX_CODE_GRPC_METHOD.StartMcpAuth, { name }, options);
                },
                callback(name, code, options) {
                    return value(AX_CODE_GRPC_METHOD.CompleteMcpAuth, { name, code }, options);
                },
                authenticate(name, options) {
                    return value(AX_CODE_GRPC_METHOD.AuthenticateMcp, { name }, options);
                },
                remove(name, options) {
                    return value(AX_CODE_GRPC_METHOD.RemoveMcpAuth, { name }, options);
                },
            },
        },
        lsp: {
            status(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetLspStatus, { parameters }, options);
            },
        },
        formatter: {
            status(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetFormatterStatus, { parameters }, options);
            },
        },
        provider: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListProviders, { parameters }, options);
            },
            auth(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.GetProviderAuth, { parameters }, options);
            },
            oauth: {
                authorize(providerID, body, options) {
                    return value(AX_CODE_GRPC_METHOD.ProviderOauthAuthorize, { providerID, body }, options);
                },
                callback(providerID, body, options) {
                    return value(AX_CODE_GRPC_METHOD.ProviderOauthCallback, { providerID, body }, options);
                },
            },
        },
        auth: {
            set(providerID, auth, options) {
                return value(AX_CODE_GRPC_METHOD.SetAuth, { providerID, auth }, options);
            },
            remove(providerID, options) {
                return value(AX_CODE_GRPC_METHOD.RemoveAuth, { providerID }, options);
            },
        },
        bootstrap: {
            load(request = {}, options) {
                return value(AX_CODE_GRPC_METHOD.LoadBootstrap, request, options);
            },
        },
        pty: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListPty, { parameters }, options);
            },
            create(body, options) {
                return value(AX_CODE_GRPC_METHOD.CreatePty, { body }, options);
            },
            get(id, options) {
                return value(AX_CODE_GRPC_METHOD.GetPty, { id }, options);
            },
            update(id, body, options) {
                return value(AX_CODE_GRPC_METHOD.UpdatePty, { id, body }, options);
            },
            remove(id, options) {
                return value(AX_CODE_GRPC_METHOD.RemovePty, { id }, options);
            },
            connect(id, events = emptyAsyncIterable(), options) {
                if (!transport.bidiStream)
                    throw new Error("AX Code gRPC transport does not support PTY streaming");
                return transport.bidiStream(AX_CODE_GRPC_METHOD.ConnectPty, { id, cursor: options?.cursor }, events, options);
            },
        },
        sessionEvidence: {
            load(sessionID, parameters, options) {
                return value(AX_CODE_GRPC_METHOD.LoadSessionEvidence, { sessionID, parameters }, options);
            },
        },
        taskQueue: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListTaskQueue, { parameters }, options);
            },
            enqueue(body, options) {
                return value(AX_CODE_GRPC_METHOD.EnqueueTaskQueue, { body }, options);
            },
            edit(id, body, options) {
                return value(AX_CODE_GRPC_METHOD.EditTaskQueue, { id, body }, options);
            },
            command(id, command, options) {
                return taskQueueCommand(id, command, options);
            },
            pause(id, options) {
                return taskQueueCommand(id, "pause", options);
            },
            resume(id, options) {
                return taskQueueCommand(id, "resume", options);
            },
            cancel(id, options) {
                return taskQueueCommand(id, "cancel", options);
            },
            retry(id, options) {
                return taskQueueCommand(id, "retry", options);
            },
            sendNow(id, options) {
                return taskQueueCommand(id, "send-now", options);
            },
            reorder(id, position, options) {
                return value(AX_CODE_GRPC_METHOD.ReorderTaskQueue, { id, position }, options);
            },
            remove(id, options) {
                return value(AX_CODE_GRPC_METHOD.RemoveTaskQueue, { id }, options);
            },
        },
        scheduledTask: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListScheduledTasks, { parameters }, options);
            },
            create(body, options) {
                return value(AX_CODE_GRPC_METHOD.CreateScheduledTask, { body }, options);
            },
            update(id, body, options) {
                return value(AX_CODE_GRPC_METHOD.UpdateScheduledTask, { id, body }, options);
            },
            command(id, command, options) {
                return scheduledTaskCommand(id, command, options);
            },
            pause(id, options) {
                return scheduledTaskCommand(id, "pause", options);
            },
            resume(id, options) {
                return scheduledTaskCommand(id, "resume", options);
            },
            runNow(id, options) {
                return value(AX_CODE_GRPC_METHOD.RunScheduledTaskNow, { id }, options);
            },
            remove(id, options) {
                return value(AX_CODE_GRPC_METHOD.RemoveScheduledTask, { id }, options);
            },
        },
        workflowTemplate: {
            list(options) {
                return value(AX_CODE_GRPC_METHOD.ListWorkflowTemplates, {}, options);
            },
            get(templateID, options) {
                return value(AX_CODE_GRPC_METHOD.GetWorkflowTemplate, { templateID }, options);
            },
            save(body, options) {
                return value(AX_CODE_GRPC_METHOD.SaveWorkflowTemplate, { body }, options);
            },
            promote(templateID, options) {
                return value(AX_CODE_GRPC_METHOD.PromoteWorkflowTemplate, { templateID }, options);
            },
        },
        workflowRun: {
            list(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.ListWorkflowRuns, { parameters }, options);
            },
            dashboard(parameters, options) {
                return value(AX_CODE_GRPC_METHOD.WorkflowRunDashboard, { parameters }, options);
            },
            evalCases(options) {
                return value(AX_CODE_GRPC_METHOD.WorkflowRunEvalCases, {}, options);
            },
            create(body, options) {
                return value(AX_CODE_GRPC_METHOD.CreateWorkflowRun, { body }, options);
            },
            get(runID, options) {
                return value(AX_CODE_GRPC_METHOD.GetWorkflowRun, { runID }, options);
            },
            artifacts(runID, parameters, options) {
                return value(AX_CODE_GRPC_METHOD.WorkflowRunArtifacts, { runID, parameters }, options);
            },
            evalSummary(runID, body, options) {
                return value(AX_CODE_GRPC_METHOD.WorkflowRunEvalSummary, { runID, body }, options);
            },
            evalCase(runID, body, options) {
                return value(AX_CODE_GRPC_METHOD.WorkflowRunEvalCase, { runID, body }, options);
            },
            saveTemplate(runID, body, options) {
                return value(AX_CODE_GRPC_METHOD.SaveWorkflowRunTemplate, { runID, body }, options);
            },
            command(runID, command, body, options) {
                return workflowRunCommand(runID, command, body, options);
            },
            start(runID, body, options) {
                return workflowRunCommand(runID, "start", body, options);
            },
            pause(runID, options) {
                return workflowRunCommand(runID, "pause", undefined, options);
            },
            resume(runID, options) {
                return workflowRunCommand(runID, "resume", undefined, options);
            },
            cancel(runID, options) {
                return workflowRunCommand(runID, "cancel", undefined, options);
            },
            retry(runID, parametersOrOptions, options) {
                const retry = splitWorkflowRunRetryArgs(parametersOrOptions, options);
                return workflowRunCommand(runID, "retry", retry.parameters, retry.options);
            },
        },
        workflowRoutine: {
            list(options) {
                return value(AX_CODE_GRPC_METHOD.ListWorkflowRoutines, {}, options);
            },
            run(body, options) {
                return value(AX_CODE_GRPC_METHOD.RunWorkflowRoutine, { body }, options);
            },
        },
        subscribeEvents(requestOrOptions, maybeOptions) {
            const request = isCallOptions(requestOrOptions) ? {} : (requestOrOptions ?? {});
            const options = isCallOptions(requestOrOptions) ? requestOrOptions : maybeOptions;
            return input.transport.serverStream(AX_CODE_GRPC_METHOD.SubscribeEvents, request, options);
        },
    };
}
export function createAxCodeGrpcHttpBridge(input) {
    assertHttpBridgeBaseUrl(input);
    const clientFor = (options) => createHeadlessClient({
        ...input,
        headers: mergeHeaders(input.headers, options?.metadata),
    });
    return {
        unary(method, request, options) {
            return withCallOptions(handleHttpBridgeUnary(clientFor(options), method, request), options);
        },
        async *serverStream(method, request, options) {
            if (method !== AX_CODE_GRPC_METHOD.SubscribeEvents)
                throw new Error(`Unsupported AX Code gRPC stream: ${method}`);
            const client = clientFor(options);
            const filter = request;
            for await (const event of client.subscribe({ signal: options?.signal })) {
                if (!matchesEventSubscription(event, filter))
                    continue;
                yield event;
            }
        },
        bidiStream(method, request, stream, options) {
            if (method !== AX_CODE_GRPC_METHOD.ConnectPty)
                throw new Error(`Unsupported AX Code gRPC stream: ${method}`);
            const body = request;
            return connectPtyOverWebSocket(input, clientFor(options), body, stream, options);
        },
    };
}
export function createAxCodeGrpcClientFromHttp(input) {
    return createAxCodeGrpcClient({ transport: createAxCodeGrpcHttpBridge(input) });
}
export const createAxCodeGrpcHeadlessClient = createAxCodeGrpcClient;
export async function startAxCodeGrpcHeadlessBackend(options = {}) {
    const backend = await startHeadlessBackend(options);
    const client = createAxCodeGrpcClientFromHttp({
        baseUrl: backend.url,
        headers: backend.headers,
        directory: options.directory,
        fetch: options.fetch,
        webSocketFactory: options.webSocketFactory,
    });
    return {
        client,
        close: backend.close,
    };
}
export function resolveAxCodeGrpcProtoUrl(baseUrl = import.meta.url) {
    const moduleUrl = typeof baseUrl === "string" ? new URL(baseUrl) : baseUrl;
    const relativePath = moduleUrl.pathname.includes("/dist/")
        ? `./${AX_CODE_GRPC_PROTO_PACKAGE_PATH}`
        : `../../${AX_CODE_GRPC_PROTO_PACKAGE_PATH}`;
    return new URL(relativePath, moduleUrl);
}
async function handleHttpBridgeUnary(client, method, request) {
    const body = request;
    switch (method) {
        case AX_CODE_GRPC_METHOD.Health:
            return { status: "SERVING", transport: "http-bridge" };
        case AX_CODE_GRPC_METHOD.CreateSession:
            return wrap(await client.createSession(body.session));
        case AX_CODE_GRPC_METHOD.SendRuntimeCommand:
            return client.send(body.command);
        case AX_CODE_GRPC_METHOD.LoadBootstrap:
            return wrap(await loadBootstrap(client, body));
        case AX_CODE_GRPC_METHOD.LoadSessionEvidence:
            return wrap(await client.sessionEvidence.load(body.sessionID, body.parameters));
        case AX_CODE_GRPC_METHOD.ListSessions:
            return wrap(unwrapHttpSdkResponse(await client.client.session.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetSessionStatus:
            return wrap(unwrapHttpSdkResponse(await client.client.session.status(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.get({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.UpdateSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.update({ sessionID: body.sessionID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.DeleteSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.delete({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListSessionMessages:
            return wrap(unwrapHttpSdkResponse(await client.client.session.messages({ sessionID: body.sessionID, ...body.parameters })));
        case AX_CODE_GRPC_METHOD.GetSessionMessage:
            return wrap(unwrapHttpSdkResponse(await client.client.session.message({ sessionID: body.sessionID, messageID: body.messageID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.DeleteSessionMessage:
            return wrap(unwrapHttpSdkResponse(await client.client.session.deleteMessage({ sessionID: body.sessionID, messageID: body.messageID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListSessionChildren:
            return wrap(unwrapHttpSdkResponse(await client.client.session.children({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetSessionGoal:
            return wrap(unwrapHttpSdkResponse(await client.client.session.goal({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetSessionTodo:
            return wrap(unwrapHttpSdkResponse(await client.client.session.todo({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetSessionDiff:
            return wrap(unwrapHttpSdkResponse(await client.client.session.diff({ sessionID: body.sessionID, ...body.parameters })));
        case AX_CODE_GRPC_METHOD.ForkSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.fork({ sessionID: body.sessionID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ShareSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.share({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.UnshareSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.unshare({ sessionID: body.sessionID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.SummarizeSession:
            return wrap(unwrapHttpSdkResponse(await client.client.session.summarize({ sessionID: body.sessionID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListAgents:
            return wrap(unwrapHttpSdkResponse(await client.client.app.agents(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListSkills:
            return wrap(unwrapHttpSdkResponse(await client.client.app.skills(body.parameters)));
        case AX_CODE_GRPC_METHOD.WriteAppLog:
            return wrap(unwrapHttpSdkResponse(await client.client.app.log(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.DisposeInstance:
            return wrap(unwrapHttpSdkResponse(await client.client.instance.dispose(undefined, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.RestartInstance:
            return wrap(unwrapHttpSdkResponse(await client.client.instance.restart(undefined, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListProjects:
            return wrap(unwrapHttpSdkResponse(await client.client.project.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetCurrentProject:
            return wrap(unwrapHttpSdkResponse(await client.client.project.current(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetPath:
            return wrap(unwrapHttpSdkResponse(await client.client.path.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetVcs:
            return wrap(unwrapHttpSdkResponse(await client.client.vcs.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListCommands:
            return wrap(unwrapHttpSdkResponse(await client.client.command.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetProjectContext:
            return wrap(unwrapHttpSdkResponse(await client.client.app.context(body.parameters)));
        case AX_CODE_GRPC_METHOD.CreateProjectContextTemplate:
            return wrap(unwrapHttpSdkResponse(await client.client.app.contextTemplateCreate(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.WarmupProjectMemory:
            return wrap(unwrapHttpSdkResponse(await client.client.app.contextMemoryWarmup(undefined, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ClearProjectMemory:
            return wrap(unwrapHttpSdkResponse(await client.client.app.contextMemoryClear(undefined, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetDebugEnginePendingPlans:
            return wrap(unwrapHttpSdkResponse(await client.client.debugEngine.pendingPlans(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListFiles:
            return wrap(unwrapHttpSdkResponse(await client.client.file.list(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ReadFile:
            return wrap(unwrapHttpSdkResponse(await client.client.file.read(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetFileStatus:
            return wrap(unwrapHttpSdkResponse(await client.client.file.status(body.parameters)));
        case AX_CODE_GRPC_METHOD.FindText:
            return wrap(unwrapHttpSdkResponse(await client.client.find.text(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.FindFiles:
            return wrap(unwrapHttpSdkResponse(await client.client.find.files(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.FindSymbols:
            return wrap(unwrapHttpSdkResponse(await client.client.find.symbols(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListToolIDs:
            return wrap(unwrapHttpSdkResponse(await client.client.tool.ids(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListTools:
            return wrap(unwrapHttpSdkResponse(await client.client.tool.list(body.parameters, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListPermissions:
            return wrap(unwrapHttpSdkResponse(await client.client.permission.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.ReplyPermission:
            return wrap(unwrapHttpSdkResponse(await client.client.permission.reply({ requestID: body.requestID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListQuestions:
            return wrap(unwrapHttpSdkResponse(await client.client.question.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.ReplyQuestion:
            return wrap(unwrapHttpSdkResponse(await client.client.question.reply({ requestID: body.requestID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.RejectQuestion:
            return wrap(unwrapHttpSdkResponse(await client.client.question.reject({ requestID: body.requestID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetConfig:
            return wrap(unwrapHttpSdkResponse(await client.client.config.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.UpdateConfig:
            return wrap(unwrapHttpSdkResponse(await client.client.config.update(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListConfigProviders:
            return wrap(unwrapHttpSdkResponse(await client.client.config.providers(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetAutonomousMode:
            return wrap(unwrapHttpSdkResponse(await client.client.autonomous.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.SetAutonomousMode:
            return wrap(unwrapHttpSdkResponse(await client.client.autonomous.set(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetIsolationMode:
            return wrap(unwrapHttpSdkResponse(await client.client.isolation.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.SetIsolationMode:
            return wrap(unwrapHttpSdkResponse(await client.client.isolation.set(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetSmartLlmRouting:
            return wrap(unwrapHttpSdkResponse(await client.client.smartLlm.get(body.parameters)));
        case AX_CODE_GRPC_METHOD.SetSmartLlmRouting:
            return wrap(unwrapHttpSdkResponse(await client.client.smartLlm.set(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetMcpStatus:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.status(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListMcpResources:
            return wrap(unwrapHttpSdkResponse(await client.client.experimental.resource.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.AddMcpServer:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.add({ name: body.name, config: body.config }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.StartMcpAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.auth.start({ name: body.name }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.CompleteMcpAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.auth.callback({ name: body.name, code: body.code }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.AuthenticateMcp:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.auth.authenticate({ name: body.name }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.RemoveMcpAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.auth.remove({ name: body.name }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ConnectMcp:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.connect({ name: body.name }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.DisconnectMcp:
            return wrap(unwrapHttpSdkResponse(await client.client.mcp.disconnect({ name: body.name }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListProviders:
            return wrap(unwrapHttpSdkResponse(await client.client.provider.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetProviderAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.provider.auth(body.parameters)));
        case AX_CODE_GRPC_METHOD.SetAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.auth.set({ providerID: body.providerID, auth: body.auth }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.RemoveAuth:
            return wrap(unwrapHttpSdkResponse(await client.client.auth.remove({ providerID: body.providerID }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ProviderOauthAuthorize:
            return wrap(unwrapHttpSdkResponse(await client.client.provider.oauth.authorize({ providerID: body.providerID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ProviderOauthCallback:
            return wrap(unwrapHttpSdkResponse(await client.client.provider.oauth.callback({ providerID: body.providerID, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetLspStatus:
            return wrap(unwrapHttpSdkResponse(await client.client.lsp.status(body.parameters)));
        case AX_CODE_GRPC_METHOD.GetFormatterStatus:
            return wrap(unwrapHttpSdkResponse(await client.client.formatter.status(body.parameters)));
        case AX_CODE_GRPC_METHOD.ListPty:
            return wrap(unwrapHttpSdkResponse(await client.client.pty.list(body.parameters)));
        case AX_CODE_GRPC_METHOD.CreatePty:
            return wrap(unwrapHttpSdkResponse(await client.client.pty.create(body.body, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.GetPty:
            return wrap(unwrapHttpSdkResponse(await client.client.pty.get({ ptyID: body.id }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.UpdatePty:
            return wrap(unwrapHttpSdkResponse(await client.client.pty.update({ ptyID: body.id, ...body.body }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.RemovePty:
            return wrap(unwrapHttpSdkResponse(await client.client.pty.remove({ ptyID: body.id }, { throwOnError: true })));
        case AX_CODE_GRPC_METHOD.ListTaskQueue:
            return wrap(await client.taskQueue.list(body.parameters));
        case AX_CODE_GRPC_METHOD.EnqueueTaskQueue:
            return wrap(await client.taskQueue.enqueue(body.body));
        case AX_CODE_GRPC_METHOD.EditTaskQueue:
            return wrap(await client.taskQueue.edit(body.id, body.body));
        case AX_CODE_GRPC_METHOD.TaskQueueCommand:
            return wrap(await callTaskQueueCommand(client, body.id, body.command));
        case AX_CODE_GRPC_METHOD.ReorderTaskQueue:
            return wrap(await client.taskQueue.reorder(body.id, body.position));
        case AX_CODE_GRPC_METHOD.RemoveTaskQueue:
            return wrap(await client.taskQueue.remove(body.id));
        case AX_CODE_GRPC_METHOD.ListScheduledTasks:
            return wrap(await client.scheduledTask.list(body.parameters));
        case AX_CODE_GRPC_METHOD.CreateScheduledTask:
            return wrap(await client.scheduledTask.create(body.body));
        case AX_CODE_GRPC_METHOD.UpdateScheduledTask:
            return wrap(await client.scheduledTask.update(body.id, body.body));
        case AX_CODE_GRPC_METHOD.ScheduledTaskCommand:
            return wrap(await callScheduledTaskCommand(client, body.id, body.command));
        case AX_CODE_GRPC_METHOD.RunScheduledTaskNow:
            return wrap(await client.scheduledTask.runNow(body.id));
        case AX_CODE_GRPC_METHOD.RemoveScheduledTask:
            return wrap(await client.scheduledTask.remove(body.id));
        case AX_CODE_GRPC_METHOD.ListWorkflowTemplates:
            return wrap(await client.workflowTemplate.list());
        case AX_CODE_GRPC_METHOD.GetWorkflowTemplate:
            return wrap(await client.workflowTemplate.get(body.templateID));
        case AX_CODE_GRPC_METHOD.SaveWorkflowTemplate:
            return wrap(await client.workflowTemplate.save(body.body));
        case AX_CODE_GRPC_METHOD.PromoteWorkflowTemplate:
            return wrap(await client.workflowTemplate.promote(body.templateID));
        case AX_CODE_GRPC_METHOD.ListWorkflowRuns:
            return wrap(await client.workflowRun.list(body.parameters));
        case AX_CODE_GRPC_METHOD.WorkflowRunDashboard:
            return wrap(await client.workflowRun.dashboard(body.parameters));
        case AX_CODE_GRPC_METHOD.WorkflowRunEvalCases:
            return wrap(await client.workflowRun.evalCases());
        case AX_CODE_GRPC_METHOD.CreateWorkflowRun:
            return wrap(await client.workflowRun.create(body.body));
        case AX_CODE_GRPC_METHOD.GetWorkflowRun:
            return wrap(await client.workflowRun.get(body.runID));
        case AX_CODE_GRPC_METHOD.WorkflowRunArtifacts:
            return wrap(await client.workflowRun.artifacts(body.runID, body.parameters));
        case AX_CODE_GRPC_METHOD.WorkflowRunEvalSummary:
            return wrap(await client.workflowRun.evalSummary(body.runID, body.body));
        case AX_CODE_GRPC_METHOD.WorkflowRunEvalCase:
            return wrap(await client.workflowRun.evalCase(body.runID, body.body));
        case AX_CODE_GRPC_METHOD.SaveWorkflowRunTemplate:
            return wrap(await client.workflowRun.saveTemplate(body.runID, body.body));
        case AX_CODE_GRPC_METHOD.WorkflowRunCommand:
            return wrap(await callWorkflowRunCommand(client, body.runID, body.command, body.body));
        case AX_CODE_GRPC_METHOD.ListWorkflowRoutines:
            return wrap(await client.workflowRoutine.list());
        case AX_CODE_GRPC_METHOD.RunWorkflowRoutine:
            return wrap(await client.workflowRoutine.run(body.body));
    }
}
async function loadBootstrap(client, request = {}) {
    const out = { errors: [] };
    const api = client.client;
    const calls = [];
    const add = (field, run) => {
        if (request.include && request.include[field] !== true)
            return;
        calls.push(Promise.resolve()
            .then(run)
            .then((value) => {
            out[field] = unwrapHttpSdkResponse(value);
        })
            .catch((error) => {
            out.errors.push({ source: field, message: errorMessage(error) });
        }));
    };
    add("sessions", async () => {
        const response = await api.session.list({ start: request.sessionListStart });
        const sessions = unwrapHttpSdkResponse(response);
        if (!Array.isArray(sessions))
            return sessions;
        return [...sessions].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
    });
    add("providers", () => api.config.providers({}, { throwOnError: true }));
    add("providerList", () => api.provider.list({}, { throwOnError: true }));
    add("agents", () => api.app.agents({}, { throwOnError: true }));
    add("config", () => api.config.get({}, { throwOnError: true }));
    add("commands", () => api.command.list());
    add("permissions", () => api.permission.list());
    add("questions", () => api.question.list());
    add("sessionStatus", () => api.session.status());
    add("providerAuth", () => api.provider.auth());
    add("path", () => api.path.get());
    add("lsp", () => api.lsp.status());
    add("mcp", () => api.mcp.status());
    add("resources", () => api.experimental.resource.list());
    add("formatter", () => api.formatter.status());
    add("vcs", () => api.vcs.get());
    await Promise.all(calls);
    return out;
}
async function* emptyAsyncIterable() { }
function assertHttpBridgeBaseUrl(input) {
    if (input.allowRemoteHttpBridge)
        return;
    const url = new URL(input.baseUrl);
    if (!isLoopbackHttpUrl(url)) {
        throw new Error("AX Code gRPC HTTP bridge only accepts loopback HTTP base URLs by default. " +
            "Use a native bridge for desktop hosts, or set allowRemoteHttpBridge: true only for a trusted remote server.");
    }
}
function isLoopbackHttpUrl(url) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
        return false;
    return isLoopbackHostname(url.hostname);
}
function isLoopbackHostname(hostname) {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "::1" || isIpv4Loopback(normalized);
}
function isIpv4Loopback(hostname) {
    const parts = hostname.split(".");
    if (parts.length !== 4 || parts[0] !== "127")
        return false;
    return parts.every((part) => {
        if (!/^\d+$/.test(part))
            return false;
        const value = Number(part);
        return value >= 0 && value <= 255;
    });
}
function isCallOptions(input) {
    if (!input || typeof input !== "object")
        return false;
    return "metadata" in input || "signal" in input || "timeoutMs" in input;
}
function matchesEventSubscription(event, request = {}) {
    if (request.types?.length && !request.types.includes(event.type))
        return false;
    if (!request.sessionID)
        return true;
    if (event.type === "server.connected" ||
        event.type === "server.heartbeat" ||
        event.type === "server.instance.disposed") {
        return true;
    }
    return eventSessionID(event) === request.sessionID;
}
function eventSessionID(event) {
    const properties = event.properties;
    if (!properties || typeof properties !== "object")
        return undefined;
    if ("sessionID" in properties && typeof properties.sessionID === "string")
        return properties.sessionID;
    if ("info" in properties &&
        properties.info &&
        typeof properties.info === "object" &&
        "sessionID" in properties.info) {
        const sessionID = properties.info.sessionID;
        return typeof sessionID === "string" ? sessionID : undefined;
    }
    if ("info" in properties && properties.info && typeof properties.info === "object" && "id" in properties.info) {
        const id = properties.info.id;
        return typeof id === "string" ? id : undefined;
    }
    if ("item" in properties &&
        properties.item &&
        typeof properties.item === "object" &&
        "sessionID" in properties.item) {
        const sessionID = properties.item.sessionID;
        return typeof sessionID === "string" ? sessionID : undefined;
    }
    return undefined;
}
function nativeHandlerContext(call) {
    return {
        method: call.method,
        metadata: call.metadata,
        signal: call.signal,
        timeoutMs: call.timeoutMs,
    };
}
function missingNativeHandler(kind, method) {
    return new Error(`Unsupported AX Code gRPC ${kind} method: ${method}`);
}
function hasAxCodeGrpcNativeHandler(handlers, descriptor) {
    switch (descriptor.kind) {
        case "unary":
            return Boolean(handlers.unary?.[descriptor.method]);
        case "serverStream":
            return Boolean(handlers.serverStream?.[descriptor.method]);
        case "bidiStream":
            return Boolean(handlers.bidiStream?.[descriptor.method]);
    }
}
function connectPtyOverWebSocket(input, client, request, stream, options) {
    const queue = createAsyncQueue();
    const socket = createPtyWebSocket(input, request);
    socket.binaryType = "arraybuffer";
    let opened = false;
    let closed = false;
    const close = (code, reason) => {
        if (closed)
            return;
        closed = true;
        try {
            socket.close(code, reason);
        }
        catch { }
        queue.close();
    };
    const onAbort = () => close(1000, "aborted");
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    if (options?.signal?.aborted)
        onAbort();
    setSocketHandler(socket, "open", () => {
        opened = true;
        void pumpPtyClientEvents(client, request.id, socket, stream, options).catch((error) => {
            queue.fail(error);
            close(1011, "client stream failed");
        });
    });
    setSocketHandler(socket, "message", (event) => {
        const parsed = parsePtyServerEvent(event.data);
        if (parsed)
            queue.push(parsed);
    });
    setSocketHandler(socket, "error", () => {
        queue.fail(new Error("AX Code PTY WebSocket failed"));
        close(1011, "websocket failed");
    });
    setSocketHandler(socket, "close", (event) => {
        if (!opened)
            queue.fail(new Error("AX Code PTY WebSocket closed before opening"));
        queue.push({ type: "closed", code: event.code, reason: event.reason });
        options?.signal?.removeEventListener("abort", onAbort);
        queue.close();
    });
    return queue.iterable;
}
function createPtyWebSocket(input, request) {
    const url = new URL(`/pty/${encodeURIComponent(request.id)}/connect`, input.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (request.cursor !== undefined)
        url.searchParams.set("cursor", String(request.cursor));
    applyBasicAuthUserInfo(url, input.headers);
    const factory = input.webSocketFactory ?? defaultWebSocketFactory;
    return factory(url.toString());
}
async function pumpPtyClientEvents(client, ptyID, socket, stream, options) {
    for await (const event of stream) {
        if (options?.signal?.aborted)
            return;
        if (typeof event === "string") {
            socket.send(event);
            continue;
        }
        switch (event.type) {
            case "input":
                socket.send(event.data);
                break;
            case "resize":
                await client.client.pty.update({ ptyID, size: { cols: event.cols, rows: event.rows } }, { throwOnError: true });
                break;
            case "close":
                socket.close(event.code, event.reason);
                return;
        }
    }
}
function parsePtyServerEvent(data) {
    if (typeof data === "string")
        return { type: "output", data };
    const bytes = bytesFromPtyMessage(data);
    if (!bytes)
        return;
    if (bytes[0] === 0) {
        const json = new TextDecoder().decode(bytes.slice(1));
        return {
            type: "replay",
            ...JSON.parse(json),
        };
    }
    return { type: "output", data: new TextDecoder().decode(bytes) };
}
function bytesFromPtyMessage(data) {
    if (data instanceof Uint8Array)
        return data;
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (ArrayBuffer.isView(data))
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return undefined;
}
function setSocketHandler(socket, type, listener) {
    if (socket.addEventListener) {
        socket.addEventListener(type, listener);
        return;
    }
    switch (type) {
        case "open":
            socket.onopen = listener;
            break;
        case "message":
            socket.onmessage = listener;
            break;
        case "error":
            socket.onerror = listener;
            break;
        case "close":
            socket.onclose = listener;
            break;
    }
}
function defaultWebSocketFactory(url) {
    const ctor = globalThis.WebSocket;
    if (!ctor)
        throw new Error("AX Code PTY streaming requires a WebSocket implementation");
    return new ctor(url);
}
function applyBasicAuthUserInfo(url, headers) {
    const auth = headerValue(headers, "authorization");
    if (!auth?.toLowerCase().startsWith("basic "))
        return;
    const decoded = decodeBase64(auth.slice("basic ".length).trim());
    const split = decoded?.indexOf(":") ?? -1;
    if (!decoded || split < 0)
        return;
    url.username = decoded.slice(0, split);
    url.password = decoded.slice(split + 1);
}
function decodeBase64(value) {
    try {
        return atob(value);
    }
    catch {
        return undefined;
    }
}
function headerValue(headers, name) {
    if (!headers)
        return;
    const lower = name.toLowerCase();
    if (headers instanceof Headers)
        return headers.get(name) ?? undefined;
    if (Array.isArray(headers))
        return headers.find(([key]) => key.toLowerCase() === lower)?.[1];
    return Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1];
}
function createAsyncQueue() {
    const values = [];
    const waiters = [];
    let closed = false;
    let hasFailed = false;
    let failure;
    const next = () => {
        if (values.length)
            return Promise.resolve({ value: values.shift(), done: false });
        if (hasFailed)
            return Promise.reject(failure);
        if (closed)
            return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    };
    const flush = () => {
        while (waiters.length && values.length) {
            waiters.shift().resolve({ value: values.shift(), done: false });
        }
        if (hasFailed) {
            while (waiters.length)
                waiters.shift().reject(failure);
            return;
        }
        if (closed) {
            while (waiters.length)
                waiters.shift().resolve({ value: undefined, done: true });
        }
    };
    return {
        iterable: {
            [Symbol.asyncIterator]() {
                return { next };
            },
        },
        push(value) {
            if (closed || hasFailed)
                return;
            values.push(value);
            flush();
        },
        close() {
            closed = true;
            flush();
        },
        fail(error) {
            hasFailed = true;
            failure = error;
            flush();
        },
    };
}
function callTaskQueueCommand(client, id, command) {
    switch (command) {
        case "pause":
            return client.taskQueue.pause(id);
        case "resume":
            return client.taskQueue.resume(id);
        case "cancel":
            return client.taskQueue.cancel(id);
        case "retry":
            return client.taskQueue.retry(id);
        case "send-now":
            return client.taskQueue.sendNow(id);
    }
}
function callScheduledTaskCommand(client, id, command) {
    switch (command) {
        case "pause":
            return client.scheduledTask.pause(id);
        case "resume":
            return client.scheduledTask.resume(id);
    }
}
function callWorkflowRunCommand(client, runID, command, body) {
    switch (command) {
        case "start":
            return client.workflowRun.start(runID, body);
        case "pause":
            return client.workflowRun.pause(runID);
        case "resume":
            return client.workflowRun.resume(runID);
        case "cancel":
            return client.workflowRun.cancel(runID);
        case "retry":
            return client.workflowRun.retry(runID, body);
    }
}
function splitWorkflowRunRetryArgs(parametersOrOptions, options) {
    if (isAxCodeGrpcCallOptions(parametersOrOptions)) {
        return { parameters: undefined, options: parametersOrOptions };
    }
    return { parameters: parametersOrOptions, options };
}
function isAxCodeGrpcCallOptions(value) {
    if (!value || typeof value !== "object")
        return false;
    return "signal" in value || "timeoutMs" in value || "metadata" in value;
}
function wrap(value) {
    return { value };
}
function unwrapHttpSdkResponse(value) {
    if (value && typeof value === "object" && "data" in value)
        return value.data;
    return value;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function mergeHeaders(headers, metadata) {
    return {
        ...headersToRecord(headers),
        ...metadata,
    };
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
function withCallOptions(promise, options) {
    if (!options?.signal && !options?.timeoutMs)
        return promise;
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const cleanup = () => {
            if (timer)
                clearTimeout(timer);
            options?.signal?.removeEventListener("abort", onAbort);
        };
        const settle = (fn) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            fn();
        };
        const onAbort = () => {
            settle(() => reject(new Error("AX Code gRPC call aborted")));
        };
        if (options?.signal) {
            if (options.signal.aborted) {
                onAbort();
                return;
            }
            options.signal.addEventListener("abort", onAbort, { once: true });
        }
        if (options?.timeoutMs && options.timeoutMs > 0) {
            timer = setTimeout(() => {
                settle(() => reject(new Error(`AX Code gRPC call timed out after ${options.timeoutMs}ms`)));
            }, options.timeoutMs);
        }
        promise.then((value) => settle(() => resolve(value)), (error) => settle(() => reject(error)));
    });
}
