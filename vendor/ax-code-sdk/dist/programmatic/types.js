/**
 * Types for the ax-code Programmatic SDK
 */
// ============================================================
// Error Classes
// ============================================================
/** Base error class for all ax-code SDK errors */
export class AxCodeError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.name = "AxCodeError";
        this.code = code;
    }
}
/** Provider API call failed (rate limit, auth, server error) */
export class ProviderError extends AxCodeError {
    status;
    provider;
    constructor(message, options) {
        super(message, "PROVIDER_ERROR");
        this.name = "ProviderError";
        this.status = options?.status;
        this.provider = options?.provider;
    }
    get isRetryable() {
        return this.status === 429 || (this.status !== undefined && this.status >= 500);
    }
}
/** Operation timed out */
export class TimeoutError extends AxCodeError {
    timeout;
    constructor(ms, operation) {
        super(`${operation ?? "Operation"} timed out after ${ms}ms`, "TIMEOUT");
        this.name = "TimeoutError";
        this.timeout = ms;
    }
}
/** Tool execution failed */
export class ToolError extends AxCodeError {
    tool;
    constructor(tool, message) {
        super(`Tool "${tool}" failed: ${message}`, "TOOL_ERROR");
        this.name = "ToolError";
        this.tool = tool;
    }
}
/** Permission was denied */
export class PermissionError extends AxCodeError {
    permission;
    patterns;
    constructor(permission, patterns = []) {
        super(`Permission denied: ${permission} (${patterns.join(", ")})`, "PERMISSION_DENIED");
        this.name = "PermissionError";
        this.permission = permission;
        this.patterns = patterns;
    }
}
/** Agent not found */
export class AgentNotFoundError extends AxCodeError {
    agent;
    available;
    constructor(agent, available = []) {
        super(`Agent "${agent}" not found. Available: ${available.join(", ")}`, "AGENT_NOT_FOUND");
        this.name = "AgentNotFoundError";
        this.agent = agent;
        this.available = available;
    }
}
/** Agent has been disposed */
export class DisposedError extends AxCodeError {
    constructor() {
        super("Agent has been disposed. Create a new agent with createAgent().", "DISPOSED");
        this.name = "DisposedError";
    }
}
