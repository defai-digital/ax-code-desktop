import type { ModelMetadata } from "@/types"

type LoadMetadata = (signal: AbortSignal) => Promise<Map<string, ModelMetadata>>
type PublishMetadata = (metadata: Map<string, ModelMetadata>) => void

export interface ModelMetadataLoader {
  ensure: (current: ReadonlyMap<string, ModelMetadata>, publish: PublishMetadata) => Promise<void>
  invalidate: () => void
}

export function createModelMetadataLoader(load: LoadMetadata): ModelMetadataLoader {
  let inFlight: Promise<void> | null = null
  let controller: AbortController | null = null
  let generation = 0

  const ensure = (current: ReadonlyMap<string, ModelMetadata>, publish: PublishMetadata): Promise<void> => {
    if (current.size > 0) return Promise.resolve()
    if (inFlight) return inFlight

    const requestController = new AbortController()
    controller = requestController
    const requestGeneration = generation
    const request = Promise.resolve()
      .then(() => load(requestController.signal))
      .then((metadata) => {
        if (requestController.signal.aborted || requestGeneration !== generation || metadata.size === 0) return
        publish(metadata)
      })
      .catch((error: unknown) => {
        if (!requestController.signal.aborted) console.warn("Failed to load model metadata:", error)
      })
      .finally(() => {
        // A superseded request can settle after its replacement has already started.
        if (inFlight === request) {
          inFlight = null
          controller = null
        }
      })
    inFlight = request
    return request
  }

  const invalidate = () => {
    generation += 1
    controller?.abort()
    controller = null
    inFlight = null
  }

  return { ensure, invalidate }
}
