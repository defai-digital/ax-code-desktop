import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { axCodeClient } from "@/lib/ax-code/client"
import { isDirectoryProviderLoadPending, useConfigStore } from "./useConfigStore"

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

describe("loading another directory's providers", () => {
  it("reads them for that directory without moving the shared directory or the composer", async () => {
    const previous = useConfigStore.getState()
    useConfigStore.setState({
      activeDirectoryKey: "/active",
      currentProviderId: "live",
      currentModelId: "live-model",
      directoryScoped: {},
    } as never)
    const withDirectory = vi.spyOn(axCodeClient, "withDirectory")
    vi.mocked(axCodeClient.getProviders).mockResolvedValue({
      providers: [{ id: "cold", name: "Cold", models: { model: { id: "model", name: "model" } } }] as never,
      default: {},
    })
    try {
      await useConfigStore.getState().loadProviders({ directory: "/cold" })

      expect(axCodeClient.getProviders).toHaveBeenCalledWith("/cold")
      // A background read must not retarget unscoped calls made while it is in flight.
      expect(withDirectory).not.toHaveBeenCalled()
      expect(useConfigStore.getState().directoryScoped["/cold"]?.providers.map((p) => p.id)).toEqual(["cold"])
      expect(useConfigStore.getState()).toMatchObject({
        activeDirectoryKey: "/active",
        currentProviderId: "live",
        currentModelId: "live-model",
      })
    } finally {
      useConfigStore.setState({
        activeDirectoryKey: previous.activeDirectoryKey,
        currentProviderId: previous.currentProviderId,
        currentModelId: previous.currentModelId,
        directoryScoped: previous.directoryScoped,
      })
    }
  })
})

describe("provider load pending state", () => {
  it("reports a directory's provider load as pending only while it runs", async () => {
    // Quick Dispatch reads an empty catalog during a pending load as "not known yet" rather than "no model".
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})))
    const providers = deferred<Awaited<ReturnType<typeof axCodeClient.getProviders>>>()
    vi.mocked(axCodeClient.getProviders).mockReturnValueOnce(providers.promise)

    expect(isDirectoryProviderLoadPending("/pending-test")).toBe(false)
    const load = useConfigStore.getState().loadProviders({ directory: "/pending-test" })
    expect(isDirectoryProviderLoadPending("/pending-test")).toBe(true)
    expect(isDirectoryProviderLoadPending("/another-directory")).toBe(false)

    providers.resolve({ providers: [], default: {} })
    await load

    expect(isDirectoryProviderLoadPending("/pending-test")).toBe(false)
  })

  it("stays pending while a startup re-poll is scheduled after the load gave up", async () => {
    // loadProviders returns at once while this re-poll waits, so the catalog stays empty without being "no model".
    vi.useFakeTimers()
    try {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({})))
      vi.mocked(axCodeClient.getProviders).mockRejectedValue(new Error("503 restarting"))
      const load = useConfigStore.getState().loadProviders({ directory: "/repoll-test" })
      // Twelve attempts back off 250 ms more each (19.5 s in all); the re-poll is then due 2 s later, so at 20.5 s the
      // load has given up and only the re-poll timer is left.
      await vi.advanceTimersByTimeAsync(20_500)
      await load

      // The load itself is over; only the scheduled re-poll keeps the directory pending.
      expect(isDirectoryProviderLoadPending("/repoll-test")).toBe(true)

      useConfigStore.getState().invalidateAllProviderCaches()
      expect(isDirectoryProviderLoadPending("/repoll-test")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
