import { afterEach, describe, expect, it, vi } from "vitest"
import type { ModelMetadata } from "@/types"
import { createModelMetadataLoader } from "./modelMetadataLoader"

const metadata = new Map<string, ModelMetadata>([["provider/model", { id: "model", providerId: "provider" }]])

afterEach(() => vi.restoreAllMocks())

describe("model metadata load lifecycle", () => {
  it("coalesces concurrent callers and reuses a populated cache", async () => {
    const load = vi.fn(async () => metadata)
    const loader = createModelMetadataLoader(load)
    const publish = vi.fn()
    const first = loader.ensure(new Map(), publish)
    const second = loader.ensure(new Map(), publish)
    expect(first).toBe(second)
    await first
    await loader.ensure(metadata, publish)
    expect(load).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledExactlyOnceWith(metadata)
  })

  it("cancels the owned request and refuses publication even if loading ignores abort", async () => {
    let complete!: (value: Map<string, ModelMetadata>) => void
    let signal: AbortSignal | undefined
    const loader = createModelMetadataLoader((requestSignal) => {
      signal = requestSignal
      return new Promise((resolve) => {
        complete = resolve
      })
    })
    const publish = vi.fn()
    const request = loader.ensure(new Map(), publish)
    await Promise.resolve()
    loader.invalidate()
    complete(metadata)
    await request
    expect(signal?.aborted).toBe(true)
    expect(publish).not.toHaveBeenCalled()
  })

  it("allows retry after a reported failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const load = vi.fn().mockRejectedValueOnce(new Error("Failed")).mockResolvedValueOnce(metadata)
    const loader = createModelMetadataLoader(load)
    const publish = vi.fn()
    await loader.ensure(new Map(), publish)
    expect(publish).not.toHaveBeenCalled()
    await loader.ensure(new Map(), publish)
    expect(warn).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledExactlyOnceWith(metadata)
  })

  it("does not turn an empty catalog into a permanent cache hit", async () => {
    const load = vi.fn().mockResolvedValueOnce(new Map()).mockResolvedValueOnce(metadata)
    const loader = createModelMetadataLoader(load)
    const publish = vi.fn()
    await loader.ensure(new Map(), publish)
    await loader.ensure(new Map(), publish)
    expect(load).toHaveBeenCalledTimes(2)
    expect(publish).toHaveBeenCalledExactlyOnceWith(metadata)
  })
})
