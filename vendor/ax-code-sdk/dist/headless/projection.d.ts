import type { PermissionRequest, QuestionRequest } from "../v2/index.js";
import type { HeadlessRuntimeEvent, HeadlessRuntimeProbeKey, HeadlessRuntimeStatusEvent } from "./event.js";
export interface HeadlessProjectionState<TSession extends {
    id: string;
}, TTodo, TDiff, TStatus, TMessage extends {
    id: string;
    sessionID: string;
}, TPart extends {
    id: string;
    messageID: string;
}, TRisk = unknown, TGoal = unknown, TTaskQueueItem extends {
    id: string;
} = {
    id: string;
}> {
    stream_health: HeadlessStreamHealth;
    permission: Record<string, PermissionRequest[]>;
    question: Record<string, QuestionRequest[]>;
    todo: Record<string, TTodo[]>;
    session_diff: Record<string, TDiff[]>;
    session_status: Record<string, TStatus>;
    session_error: Record<string, unknown>;
    session_risk: Record<string, TRisk>;
    session_goal: Record<string, TGoal | null>;
    task_queue: TTaskQueueItem[];
    session: TSession[];
    message: Record<string, TMessage[]>;
    part: Record<string, TPart[]>;
    vcs: {
        branch: string;
    } | undefined;
}
export type HeadlessStreamHealth = "fixture" | "connecting" | "connected" | "unavailable" | "error";
export type HeadlessProjectionEffect = {
    type: "permission.auto_reply";
    requestID: string;
} | {
    type: "question.auto_reply";
    requestID: string;
    questions: QuestionRequest["questions"];
} | {
    type: "runtime.probe";
    key: HeadlessRuntimeProbeKey;
} | {
    type: "bootstrap.reload";
};
export type HeadlessProjectionApplyResult = {
    handled: boolean;
    effects: HeadlessProjectionEffect[];
};
export declare function createHeadlessProjectionState<TSession extends {
    id: string;
}, TTodo, TDiff, TStatus, TMessage extends {
    id: string;
    sessionID: string;
}, TPart extends {
    id: string;
    messageID: string;
}, TRisk = unknown, TGoal = unknown, TTaskQueueItem extends {
    id: string;
} = {
    id: string;
}>(input?: {
    streamHealth?: HeadlessStreamHealth;
}): HeadlessProjectionState<TSession, TTodo, TDiff, TStatus, TMessage, TPart, TRisk, TGoal, TTaskQueueItem>;
export declare function applyHeadlessProjectionEvent<TSession extends {
    id: string;
}, TTodo, TDiff, TStatus, TMessage extends {
    id: string;
    sessionID: string;
}, TPart extends {
    id: string;
    messageID: string;
}, TRisk = unknown, TGoal = unknown, TTaskQueueItem extends {
    id: string;
} = {
    id: string;
}>(state: HeadlessProjectionState<TSession, TTodo, TDiff, TStatus, TMessage, TPart, TRisk, TGoal, TTaskQueueItem>, event: HeadlessRuntimeEvent<TSession, TTodo, TDiff, TStatus, TMessage, TPart, TGoal, TTaskQueueItem>, options?: {
    autonomous?: boolean;
    maxSessionMessages?: number;
}): HeadlessProjectionApplyResult;
export declare function runtimeProbeKeysForEvent(event: HeadlessRuntimeStatusEvent): HeadlessRuntimeProbeKey[];
