/**
 * @ax-code/sdk — AI coding agent SDK
 *
 * The default export is the in-process agent. No HTTP server is
 * spawned — the agent runs directly in your Node.js process with
 * 10-40x faster startup than the server-based path.
 *
 * For GUI or app shell integrations, use:
 *   import { startHeadlessBackend } from "@ax-code/sdk/headless"
 *   import { createAxCodeGrpcClient } from "@ax-code/sdk/grpc"
 *
 * @example
 * ```ts
 * import { createAgent } from "@ax-code/sdk"
 *
 * const agent = await createAgent({ directory: "." })
 * for await (const event of agent.stream("What does src/index.ts do?")) {
 *   if (event.type === "text") process.stdout.write(event.text)
 * }
 * await agent.dispose()
 * ```
 */
export { createAgent } from "./programmatic/agent.js";
export { tool } from "./programmatic/tool.js";
export type { Agent, AgentOptions, AgentHooks, AuthConfig, RunOptions, RunResult, StreamEvent, StreamHandle, SessionHandle, SdkMessage, SdkMessagePart, ToolCallInfo, PermissionRequest, SdkTool, } from "./programmatic/types.js";
export { AxCodeError, ProviderError, TimeoutError, ToolError, PermissionError, AgentNotFoundError, DisposedError, } from "./programmatic/types.js";
export { SDK_VERSION, isSDKVersionCompatible } from "./version.js";
export type * from "./gen/types.gen.js";
