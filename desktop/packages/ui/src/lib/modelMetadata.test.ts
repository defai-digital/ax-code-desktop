import { describe, expect, it } from "vitest"
import type { ProviderModel } from "@/types/providerModels"
import { buildModelMetadataKey, deriveModelMetadata, mergeModelMetadataWithLiveModel } from "./modelMetadata"

describe("model metadata", () => {
  it("normalizes provider lookup without altering case-sensitive model IDs", () => {
    expect(buildModelMetadataKey("Provider", "Model/ID")).toBe("provider/Model/ID")
    expect(buildModelMetadataKey("", "model")).toBe("")
  })

  it("derives custom model metadata and keeps live limits authoritative", () => {
    const model = {
      id: "model",
      name: "Custom Model",
      limit: { context: 100_000, input: 80_000, output: 8_000 },
      capabilities: {
        toolcall: true,
        reasoning: false,
        temperature: true,
        attachment: true,
        input: { text: true, image: true, pdf: false, audio: false, video: false },
        output: { text: true, image: false, pdf: false, audio: false, video: false },
      },
    } as ProviderModel
    const derived = deriveModelMetadata("provider", model)
    expect(derived).toMatchObject({
      id: "model",
      name: "Custom Model",
      reasoning: false,
      tool_call: true,
      limit: { context: 100_000, input: 80_000, output: 8_000 },
      modalities: { input: ["text", "image"], output: ["text"] },
    })
    expect(
      mergeModelMetadataWithLiveModel("provider", model, {
        id: "model",
        providerId: "provider",
        limit: { context: 200_000, output: 16_000 },
      })?.limit,
    ).toEqual({ context: 100_000, output: 8_000 })
  })
})
