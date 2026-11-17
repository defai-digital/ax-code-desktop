import type { ModelMetadata } from "@/types"
import { API_ENDPOINTS } from "./http"
import { buildModelMetadataKey } from "./modelMetadata"
import { isPlainRecord } from "./record"

const MODELS_DEV_API_URL = "https://models.dev/api.json"
const REQUEST_TIMEOUT_MS = 8_000

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const numericLimit = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined

const parseLimits = (value: unknown): ModelMetadata["limit"] => {
  if (!isPlainRecord(value)) return undefined
  const context = numericLimit(value.context)
  const output = numericLimit(value.output)
  return context === undefined && output === undefined ? undefined : { context, output }
}

export function parseModelsDevMetadata(payload: unknown): Map<string, ModelMetadata> {
  const result = new Map<string, ModelMetadata>()
  if (!isPlainRecord(payload)) return result

  for (const [providerKey, provider] of Object.entries(payload)) {
    if (!isPlainRecord(provider) || !isPlainRecord(provider.models)) continue
    const providerId = typeof provider.id === "string" && provider.id.length > 0 ? provider.id : providerKey

    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isPlainRecord(model)) continue
      const modelId = modelKey || (typeof model.id === "string" ? model.id : "")
      const key = buildModelMetadataKey(providerId, modelId)
      if (!key) continue

      if (model.modalities != null && !isPlainRecord(model.modalities)) continue
      const modalities = isPlainRecord(model.modalities) ? model.modalities : undefined
      if (modalities?.input !== undefined && !isStringArray(modalities.input)) continue
      if (modalities?.output !== undefined && !isStringArray(modalities.output)) continue

      // Catalog pricing stays excluded, preserving the existing display policy.
      result.set(key, {
        id: typeof model.id === "string" && model.id.length > 0 ? model.id : modelId,
        providerId,
        name: typeof model.name === "string" ? model.name : undefined,
        tool_call: typeof model.tool_call === "boolean" ? model.tool_call : undefined,
        reasoning: typeof model.reasoning === "boolean" ? model.reasoning : undefined,
        temperature: typeof model.temperature === "boolean" ? model.temperature : undefined,
        attachment: typeof model.attachment === "boolean" ? model.attachment : undefined,
        modalities: modalities ? { input: modalities.input, output: modalities.output } : undefined,
        limit: parseLimits(model.limit),
        knowledge: typeof model.knowledge === "string" ? model.knowledge : undefined,
        release_date: typeof model.release_date === "string" ? model.release_date : undefined,
        last_updated: typeof model.last_updated === "string" ? model.last_updated : undefined,
      })
    }
  }
  return result
}

export async function fetchModelsDevMetadata(signal?: AbortSignal): Promise<Map<string, ModelMetadata>> {
  if (typeof fetch !== "function") return new Map()

  for (const source of [API_ENDPOINTS.openchamber.modelsMetadata, MODELS_DEV_API_URL]) {
    if (signal?.aborted) return new Map()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS)

    try {
      const request: RequestInit = {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
      if (/^https?:\/\//i.test(source)) request.mode = "cors"
      else request.credentials = "same-origin"

      const response = await fetch(source, request)
      if (!response.ok) throw new Error(`Metadata request to ${source} returned status ${response.status}`)
      return parseModelsDevMetadata(await response.json())
    } catch (error) {
      if (signal?.aborted) return new Map()
      console.warn(`Failed to fetch model metadata from ${source}:`, error)
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
  return new Map()
}
