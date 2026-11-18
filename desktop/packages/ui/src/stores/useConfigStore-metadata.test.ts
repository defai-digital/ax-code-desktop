import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { axCodeClient } from "@/lib/ax-code/client"
import { useConfigStore } from "./useConfigStore"

// Directory discovery would share the fetch mock and consume a catalog response.
vi.mock("./useDirectoryStore", () => ({
  useDirectoryStore: {
    getState: () => ({ currentDirectory: "/metadata-test" }),
    subscribe: () => () => {},
  },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const catalog = (name: string) => ({ provider: { models: { model: { name } } } })
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  useConfigStore.getState().invalidateModelMetadataCache()
  vi.spyOn(axCodeClient, "getProviders").mockResolvedValue({ providers: [], default: {} })
})

afterEach(() => {
  useConfigStore.getState().invalidateModelMetadataCache()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("config model metadata request ownership", () => {
  it("refreshes invalidated metadata while reusing an unfinished provider load", async () => {
    const providers = deferred<Awaited<ReturnType<typeof axCodeClient.getProviders>>>()
    vi.mocked(axCodeClient.getProviders).mockReturnValueOnce(providers.promise)
    const old = deferred<Response>()
    const fresh = deferred<Response>()
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    vi.stubGlobal("fetch", fetchMock)
    const firstLoad = useConfigStore.getState().loadProviders({ directory: "/metadata-test" })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    useConfigStore.getState().invalidateModelMetadataCache()
    const joinedLoad = useConfigStore.getState().loadProviders({ directory: "/metadata-test" })
    await settle()
    const callsWhileProvidersPending = fetchMock.mock.calls.length

    providers.resolve({ providers: [], default: {} })
    await Promise.all([firstLoad, joinedLoad])
    old.resolve(Response.json({}))
    fresh.resolve(Response.json(catalog("Fresh")))
    await settle()

    expect(callsWhileProvidersPending).toBe(2)
    expect(axCodeClient.getProviders).toHaveBeenCalledOnce()
    expect(useConfigStore.getState().getModelMetadata("provider", "model")?.name).toBe("Fresh")
  })

  it("does not let an invalidated response replace the fresh catalog", async () => {
    const old = deferred<Response>()
    const fresh = deferred<Response>()
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise))
    await useConfigStore.getState().loadProviders({ directory: "/metadata-test" })
    useConfigStore.getState().invalidateModelMetadataCache()
    await useConfigStore.getState().loadProviders({ directory: "/metadata-test" })

    fresh.resolve(Response.json(catalog("Fresh")))
    await vi.waitFor(() => expect(useConfigStore.getState().getModelMetadata("provider", "model")?.name).toBe("Fresh"))
    old.resolve(Response.json(catalog("Obsolete")))
    await settle()

    expect(useConfigStore.getState().getModelMetadata("provider", "model")?.name).toBe("Fresh")
  })

  it("keeps the newer request coalesced after an obsolete empty response settles", async () => {
    const old = deferred<Response>()
    const fresh = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise)
      .mockResolvedValue(Response.json(catalog("Unexpected duplicate")))
    vi.stubGlobal("fetch", fetchMock)
    await useConfigStore.getState().loadProviders({ directory: "/metadata-test" })
    useConfigStore.getState().invalidateModelMetadataCache()
    await useConfigStore.getState().loadProviders({ directory: "/metadata-test" })

    old.resolve(Response.json({}))
    await settle()
    await useConfigStore.getState().loadProviders({ directory: "/metadata-test" })
    fresh.resolve(Response.json(catalog("Fresh")))
    await settle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useConfigStore.getState().getModelMetadata("provider", "model")?.name).toBe("Fresh")
  })
})
