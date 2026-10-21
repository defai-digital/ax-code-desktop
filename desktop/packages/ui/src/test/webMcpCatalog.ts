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
  return { ...tool, digest: catalogDigest(definition), definitionDigest: definitionDigest(definition), invocationID: definitionDigest(definition) }
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
