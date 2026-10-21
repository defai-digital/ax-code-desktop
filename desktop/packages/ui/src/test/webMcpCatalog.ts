import { webMcpDisplayText, webMcpDisplayDescription, webMcpDisplaySchema } from "../../../../shared/webmcp-redaction.mjs"
import { createRequire } from "node:module"
import type { WebMcpToolDefinition } from "@/lib/webMcpCatalog"

const { catalogDigest, definitionDigest } = createRequire(import.meta.url)("../../../../shared/webmcp-digests.cjs") as {
  catalogDigest: (tool: unknown) => string
  definitionDigest: (tool: unknown) => string
}

/** Use the native bridge's two identities, including a real frame field in the invocation definition. */
export function nativeWebMcpTool(tool: WebMcpToolDefinition, frameId = "top"): WebMcpToolDefinition {
  const { name, description, inputSchema, annotations } = tool
  const definition = {
    name,
    description,
    frameId,
    ...(inputSchema === undefined ? {} : { inputSchema }),
    ...(annotations === undefined ? {} : { annotations }),
  }
  return { ...tool, digest: catalogDigest(definition), definitionDigest: definitionDigest(definition), invocationID: definitionDigest({ name }) }
}

/** Renderer fixture with the same shared display filters and native identities as the main-process projection. */
export function projectedWebMcpTool(tool: WebMcpToolDefinition): WebMcpToolDefinition {
  return {
    ...nativeWebMcpTool(tool),
    name: webMcpDisplayText(tool.name),
    description: webMcpDisplayDescription(tool.description),
    inputSchema: webMcpDisplaySchema(tool.inputSchema),
    executionSchema: structuredClone(tool.inputSchema),
  }
}

export const { projectToolCatalog } = createRequire(import.meta.url)("../../../../shared/webmcp-catalog-projection.cjs") as {
  projectToolCatalog: (tools: unknown[], kinds: Map<string, string>, identities: Map<string, unknown>, origin: string) => { catalog: WebMcpToolDefinition[] }
}

/** Exercise the actual main projection, including view-local opaque IDs and redacted label ordinals. */
export function credentialToolFixture() {
  const names = ["ghp_abcdefghijklmnop", "ghp_qrstuvwxyzabcdef"]
  const identities = new Map<string, unknown>()
  const project = (changed = false, reverse = false) => {
    const tools = names.map((name, index) => ({
      name, frameId: "top", description: `Tool ${index + 1}`,
      inputSchema: { type: "object", properties: { value: { type: index === 0 ? "string" : changed ? "boolean" : "number" } },
        ...(index === 1 && changed ? { required: ["value"] } : {}) },
    }))
    return projectToolCatalog(reverse ? tools.reverse() : tools, new Map(), identities, "https://tools.test").catalog
  }
  return { names, project }
}
