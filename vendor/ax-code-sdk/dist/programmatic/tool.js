/**
 * Define a custom tool that the agent can invoke during its loop.
 *
 * The `parameters` field accepts a Zod schema. The `execute` function
 * receives a typed argument matching that schema and returns any
 * JSON-serializable value — the runtime stringifies it for the LLM.
 *
 * @example
 * ```ts
 * import { createAgent, tool } from "@ax-code/sdk"
 * import { z } from "zod"
 *
 * const deploy = tool({
 *   name: "deploy_staging",
 *   description: "Deploy the current branch to staging",
 *   parameters: z.object({
 *     service: z.enum(["api", "web", "worker"]),
 *     skipTests: z.boolean().default(false),
 *   }),
 *   execute: async ({ service, skipTests }) => {
 *     // your code runs here
 *     return { url: `https://staging.example.com/${service}` }
 *   },
 * })
 *
 * const agent = await createAgent({
 *   directory: "/repo",
 *   tools: [deploy],
 * })
 * ```
 */
export function tool(definition) {
    if (!/^[a-z0-9_]+$/.test(definition.name)) {
        throw new Error(`Tool name "${definition.name}" is invalid. Must contain only lowercase letters, digits, and underscores (a-z, 0-9, _).`);
    }
    return {
        __brand: "SdkTool",
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        execute: definition.execute,
    };
}
