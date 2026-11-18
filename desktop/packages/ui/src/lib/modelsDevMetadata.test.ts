import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_ENDPOINTS } from "./http"
import { fetchModelsDevMetadata, parseModelsDevMetadata } from "./modelsDevMetadata"

const catalog = { provider: { models: { model: { name: "Model", limit: { context: 100_000 } } } } }

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("external model catalog boundary", () => {
  it("keeps model keys, normalizes provider lookup and excludes catalog pricing", () => {
    const metadata = parseModelsDevMetadata({
      alias: {
        id: "Provider",
        models: {
          model: {
            id: "upstream-id",
            name: "Model",
            reasoning: true,
            tool_call: false,
            modalities: { input: ["text", "image"], output: ["text"] },
            limit: { context: 100_000, output: 8_000 },
            cost: { input: 123 },
          },
        },
      },
    }).get("provider/model")
    expect(metadata).toMatchObject({
      id: "upstream-id",
      providerId: "Provider",
      name: "Model",
      reasoning: true,
      tool_call: false,
      modalities: { input: ["text", "image"], output: ["text"] },
      limit: { context: 100_000, output: 8_000 },
    })
    expect(metadata).not.toHaveProperty("cost")
  })

  it("rejects malformed entries without losing valid peers or propagating invalid limits", () => {
    const entries = parseModelsDevMetadata({
      nullProvider: null,
      arrayProvider: [],
      wrongModels: { models: [] },
      provider: {
        models: {
          nullModel: null,
          arrayModel: [],
          wrongModalities: { modalities: "text" },
          wrongInput: { modalities: { input: [123] } },
          valid: { name: "Valid", limit: { context: "100000", output: 42 } },
          invalidLimits: { limit: { context: Infinity, output: -1 } },
        },
      },
    })
    expect([...entries.keys()]).toEqual(["provider/valid", "provider/invalidLimits"])
    expect(entries.get("provider/valid")).toMatchObject({ name: "Valid", limit: { output: 42 } })
    expect(entries.get("provider/valid")?.limit?.context).toBeUndefined()
    expect(entries.get("provider/invalidLimits")?.limit).toBeUndefined()
  })

  it.each([null, [], "invalid"])("ignores non-object catalogs %j", (payload) => {
    expect(parseModelsDevMetadata(payload).size).toBe(0)
  })

  it("uses the same-origin proxy before the anonymous CORS fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(catalog))
    vi.stubGlobal("fetch", fetchMock)

    expect((await fetchModelsDevMetadata()).get("provider/model")?.name).toBe("Model")
    expect(fetchMock.mock.calls[0]).toEqual([
      API_ENDPOINTS.openchamber.modelsMetadata,
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    ])
    expect(fetchMock.mock.calls[1][0]).toBe("https://models.dev/api.json")
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ mode: "cors", cache: "no-store" })
    expect(fetchMock.mock.calls[1][1].credentials).toBeUndefined()
  })

  it("falls back when proxy JSON decoding fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError("Invalid JSON")) })
        .mockResolvedValueOnce(Response.json(catalog)),
    )
    expect((await fetchModelsDevMetadata()).size).toBe(1)
  })

  it("aborts a stalled source after eight seconds, then tries the fallback", async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = options.signal as AbortSignal
            requestSignal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), {
              once: true,
            })
          }),
      )
      .mockResolvedValueOnce(Response.json(catalog))
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchModelsDevMetadata()
    await vi.advanceTimersByTimeAsync(8_000)

    expect((await result).size).toBe(1)
    expect(requestSignal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops without fallback or retained timers when its owner cancels", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), {
            once: true,
          })
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = fetchModelsDevMetadata(controller.signal)
    controller.abort()

    expect((await result).size).toBe(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("returns an empty catalog if both sources fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Offline"))
    vi.stubGlobal("fetch", fetchMock)
    expect((await fetchModelsDevMetadata()).size).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
