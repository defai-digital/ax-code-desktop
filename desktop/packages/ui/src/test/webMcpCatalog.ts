import { createRequire } from "node:module"
import type { WebMcpToolDefinition } from "@/lib/webMcpCatalog"

const { catalogDigest, definitionDigest } = createRequire(import.meta.url)("../../../electron/src/native-webmcp.js") as {
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
  return { ...tool, digest: catalogDigest(definition), definitionDigest: definitionDigest(definition) }
}
