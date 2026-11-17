import type { ModelMetadata } from "@/types"
import type { ProviderModel } from "@/types/providerModels"

type LiveProviderModel = Record<string, unknown> & { id?: string; name?: string }

const getNumericLimit = (limit: unknown, key: "context" | "output") => {
  if (!limit || typeof limit !== "object") return undefined
  const value = (limit as Record<string, unknown>)[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export const mergeModelMetadataWithLiveModel = (
  providerId: string,
  model: LiveProviderModel,
  metadata?: ModelMetadata,
): ModelMetadata | undefined => {
  const liveContextLimit = getNumericLimit(model.limit, "context")
  const liveOutputLimit = getNumericLimit(model.limit, "output")
  const contextLimit = liveContextLimit ?? metadata?.limit?.context
  const outputLimit = liveOutputLimit ?? metadata?.limit?.output

  if (contextLimit === undefined && outputLimit === undefined) return metadata

  return {
    ...(metadata ?? {
      id: typeof model.id === "string" ? model.id : "",
      providerId,
      name: typeof model.name === "string" ? model.name : undefined,
    }),
    limit: {
      ...metadata?.limit,
      ...(contextLimit !== undefined ? { context: contextLimit } : {}),
      ...(outputLimit !== undefined ? { output: outputLimit } : {}),
    },
  }
}

export const buildModelMetadataKey = (providerId: string, modelId: string) => {
  const normalizedProvider = providerId?.toLowerCase?.() ?? ""
  if (!normalizedProvider || !modelId) {
    return ""
  }
  return `${normalizedProvider}/${modelId}`
}

const mapModalities = (
  cap: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean } | undefined,
): string[] => {
  if (!cap) return []
  const result: string[] = []
  if (cap.text) result.push("text")
  if (cap.audio) result.push("audio")
  if (cap.image) result.push("image")
  if (cap.video) result.push("video")
  if (cap.pdf) result.push("pdf")
  return result
}

export const deriveModelMetadata = (providerId: string, model: ProviderModel): ModelMetadata => ({
  id: model.id,
  providerId,
  name: model.name,
  tool_call: model.capabilities?.toolcall,
  reasoning: model.capabilities?.reasoning,
  temperature: model.capabilities?.temperature,
  attachment: model.capabilities?.attachment,
  modalities: model.capabilities
    ? {
        input: mapModalities(model.capabilities.input),
        output: mapModalities(model.capabilities.output),
      }
    : undefined,
  limit: model.limit,
  release_date: model.release_date,
})
