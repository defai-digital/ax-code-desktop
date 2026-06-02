/**
 * Testing utilities for @ax-code/sdk.
 *
 * Use `createMockAgent` in unit tests to verify your agent integration
 * without calling a real LLM provider. The mock agent satisfies the
 * full `Agent` interface but returns pre-configured replies.
 *
 * @example
 * ```ts
 * import { createMockAgent } from "@ax-code/sdk/testing"
 *
 * test("my bot scans for CVEs", async () => {
 *   const agent = createMockAgent({
 *     replies: ["Found 2 CVEs. Opening PR to bump versions."],
 *     toolCalls: [
 *       { tool: "grep", input: { pattern: "CVE-" }, output: "CVE-2025-1234" },
 *     ],
 *   })
 *   const result = await agent.run("scan for CVEs")
 *   expect(result.text).toContain("2 CVEs")
 *   expect(result.toolCalls).toHaveLength(1)
 * })
 * ```
 */
import type { Agent, RunResult, ToolCallInfo } from "../programmatic/types.js";
export interface MockAgentOptions {
    /** Pre-configured text replies. Each `run()` / `stream()` call pops
     *  the next reply. Wraps around if calls exceed the array length. */
    replies: string[];
    /** Optional pre-configured tool-call stubs. When the mock agent's
     *  `tool()` method is called with a matching name, it returns the
     *  configured output. Also included in `RunResult.toolCalls`. */
    toolCalls?: Array<{
        tool: string;
        input: unknown;
        output: string;
    }>;
}
/**
 * Create a mock agent for testing. The returned `Agent` implements the
 * full interface without any real initialization — no LLM calls, no
 * database, no file system access.
 */
export declare function createMockAgent(options: MockAgentOptions): Agent;
/**
 * Assert that a `RunResult` contains a successful call to a specific tool.
 */
export declare function assertToolSuccess(result: RunResult, toolName: string): ToolCallInfo;
/**
 * Assert that a `RunResult` contains a failed call to a specific tool.
 */
export declare function assertToolFailure(result: RunResult, toolName: string): ToolCallInfo;
