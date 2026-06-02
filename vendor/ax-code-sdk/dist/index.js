/**
 * @ax-code/sdk — AI coding agent SDK
 *
 * The default export is the in-process agent. No HTTP server is
 * spawned — the agent runs directly in your Node.js process with
 * 10-40x faster startup than the server-based path.
 *
 * For the HTTP-server-based client (the default in 1.4.0), use:
 *   import { createAxCode } from "@ax-code/sdk/http"
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
// ── Core ─────────────────────────────────────────────────────────────
export { createAgent } from "./programmatic/agent.js";
export { tool } from "./programmatic/tool.js";
// ── Errors ───────────────────────────────────────────────────────────
export { AxCodeError, ProviderError, TimeoutError, ToolError, PermissionError, AgentNotFoundError, DisposedError, } from "./programmatic/types.js";
// ── Version ──────────────────────────────────────────────────────────
export { SDK_VERSION, isSDKVersionCompatible } from "./version.js";
