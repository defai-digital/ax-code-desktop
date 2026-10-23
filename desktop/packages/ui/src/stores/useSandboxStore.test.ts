import { afterEach, describe, expect, test, vi } from "vitest"

const importStore = async () => {
  vi.resetModules()

  // The directory argument is recorded by vi.fn for assertions; the mocks ignore it.
  const getIsolationMock = vi.fn(async (directory?: string | null) => {
    void directory
    return { mode: "workspace-write" }
  })
  const setIsolationMock = vi.fn(async (mode: string, directory?: string | null) => {
    void directory
    return { mode }
  })
  const toastErrorMock = vi.fn()

  // A stalled directory-scoped request elsewhere holds withDirectory's queue; the sandbox calls
  // must never wait on it.
  const withDirectoryMock = vi.fn(async (_directory: string | null, run: () => Promise<unknown>) => run())

  vi.doMock("@/lib/ax-code/client", () => ({
    axCodeClient: {
      withDirectory: withDirectoryMock,
      getIsolation: getIsolationMock,
      setIsolation: setIsolationMock,
    },
  }))

  vi.doMock("@/components/ui", () => ({
    toast: {
      error: toastErrorMock,
    },
  }))

  const storeModule = await import("./useSandboxStore")

  return {
    ...storeModule,
    getIsolationMock,
    setIsolationMock,
    toastErrorMock,
    withDirectoryMock,
  }
}

describe("useSandboxStore", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/ax-code/client")
    vi.doUnmock("@/components/ui")
    vi.resetModules()
  })

  test("clears pending state when sandbox loading fails", async () => {
    const { getIsolationMock, useSandboxStore } = await importStore()
    getIsolationMock.mockRejectedValueOnce(new Error("server unavailable"))

    await useSandboxStore.getState().loadSandbox("/repo")

    expect(useSandboxStore.getState().isPending("/repo")).toBe(false)
    expect(useSandboxStore.getState().isSandbox("/repo")).toBeUndefined()
  })

  test("reverts optimistic sandbox toggle when isolation update fails", async () => {
    const { getIsolationMock, setIsolationMock, toastErrorMock, useSandboxStore } = await importStore()
    useSandboxStore.setState({
      sandboxByDirectory: { "/repo": false },
      pendingByDirectory: {},
    })
    setIsolationMock.mockRejectedValueOnce(new Error("server unavailable"))
    // The write failed, so the server still reports the previous mode; the reload the
    // timeout path now does reads it and keeps the toggle on the unchanged value.
    getIsolationMock.mockResolvedValue({ mode: "full-access" })

    await useSandboxStore.getState().setSandbox("/repo", true)

    expect(useSandboxStore.getState().isPending("/repo")).toBe(false)
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)
    expect(toastErrorMock).toHaveBeenCalledTimes(1)
  })

  test("restores read-only instead of upgrading to workspace-write on re-enable", async () => {
    const { getIsolationMock, setIsolationMock, useSandboxStore } = await importStore()
    getIsolationMock.mockResolvedValueOnce({ mode: "read-only" })

    await useSandboxStore.getState().loadSandbox("/repo")
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(true)

    await useSandboxStore.getState().setSandbox("/repo", false)
    expect(setIsolationMock).toHaveBeenLastCalledWith("full-access", "/repo")

    await useSandboxStore.getState().setSandbox("/repo", true)
    expect(setIsolationMock).toHaveBeenLastCalledWith("read-only", "/repo")
  })

  test("re-fetches on every load so out-of-band changes propagate", async () => {
    const { getIsolationMock, useSandboxStore } = await importStore()

    await useSandboxStore.getState().loadSandbox("/repo")
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(true)

    // Setting changed externally (e.g. via the CLI) — a later load must pick
    // it up instead of serving the cached value forever.
    getIsolationMock.mockResolvedValueOnce({ mode: "full-access" })
    await useSandboxStore.getState().loadSandbox("/repo")

    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)
  })

  test("normalizes directory keys across Windows path variants", async () => {
    const { useSandboxStore } = await importStore()

    useSandboxStore.setState({
      sandboxByDirectory: { "C:/Repo": true },
      pendingByDirectory: {},
    })

    expect(useSandboxStore.getState().isSandbox("c:\\Repo\\")).toBe(true)
  })
})

test("a timed-out write reloads the real server state instead of staying reverted", async () => {
  const { useSandboxStore, getIsolationMock, setIsolationMock } = await importStore()
  useSandboxStore.setState({
    sandboxByDirectory: { "/repo": true },
    pendingByDirectory: {},
    restrictedModeByDirectory: {},
  })

  // The write is accepted by the server but its response never arrives.
  setIsolationMock.mockImplementationOnce(() => new Promise(() => {}))
  // The follow-up reload reads the server's actual mode (the write did land).
  getIsolationMock.mockResolvedValue({ mode: "full-access" })

  vi.useFakeTimers()
  try {
    const write = useSandboxStore.getState().setSandbox("/repo", false)
    await vi.advanceTimersByTimeAsync(12_500)
    await write

    // Without the reload the toggle would sit on the pre-write value while the
    // server holds the other: the desync is invisible until a reload.
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

describe("useSandboxStore independence from the directory-context queue", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/ax-code/client")
    vi.doUnmock("@/components/ui")
    vi.resetModules()
  })

  test("a toggle is written even while another directory-scoped call holds the queue", async () => {
    const { useSandboxStore, setIsolationMock, getIsolationMock, withDirectoryMock, toastErrorMock } =
      await importStore()
    withDirectoryMock.mockImplementation(() => new Promise(() => {}))
    getIsolationMock.mockResolvedValue({ mode: "full-access" })

    await useSandboxStore.getState().loadSandbox("/repo")
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)

    await useSandboxStore.getState().setSandbox("/repo", true)

    expect(setIsolationMock).toHaveBeenCalledWith("workspace-write", "/repo")
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(true)
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(withDirectoryMock).not.toHaveBeenCalled()
  })

  test("each directory is addressed explicitly so concurrent projects cannot cross", async () => {
    const { useSandboxStore, setIsolationMock, getIsolationMock } = await importStore()
    getIsolationMock.mockResolvedValue({ mode: "full-access" })
    await Promise.all([useSandboxStore.getState().loadSandbox("/a"), useSandboxStore.getState().loadSandbox("/b")])

    await Promise.all([
      useSandboxStore.getState().setSandbox("/a", true),
      useSandboxStore.getState().setSandbox("/b", true),
    ])

    expect(setIsolationMock).toHaveBeenCalledWith("workspace-write", "/a")
    expect(setIsolationMock).toHaveBeenCalledWith("workspace-write", "/b")
  })
})

test("a late write completion refreshes state after the deadline reload", async () => {
  const { useSandboxStore, getIsolationMock, setIsolationMock } = await importStore()
  useSandboxStore.setState({ sandboxByDirectory: { "/repo": true } })
  let release: (result: { mode: string }) => void = () => {}
  setIsolationMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
  getIsolationMock.mockResolvedValue({ mode: "workspace-write" })
  vi.useFakeTimers()
  try {
    const write = useSandboxStore.getState().setSandbox("/repo", false)
    await vi.advanceTimersByTimeAsync(12_500)
    await write
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(true)
    getIsolationMock.mockResolvedValue({ mode: "full-access" })
    release({ mode: "full-access" })
    await vi.advanceTimersByTimeAsync(0)
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})

test("late completion queues a fresh read when the deadline reload is still pending", async () => {
  const { useSandboxStore, getIsolationMock, setIsolationMock } = await importStore()
  useSandboxStore.setState({ sandboxByDirectory: { "/repo": true } })
  let releaseWrite: (value: { mode: string }) => void = () => {}
  let releaseRead: (value: { mode: string }) => void = () => {}
  setIsolationMock.mockImplementationOnce(() => new Promise((resolve) => { releaseWrite = resolve }))
  getIsolationMock.mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve }))
  getIsolationMock.mockResolvedValue({ mode: "full-access" })
  vi.useFakeTimers()
  try {
    const write = useSandboxStore.getState().setSandbox("/repo", false)
    await vi.advanceTimersByTimeAsync(12_500)
    releaseWrite({ mode: "full-access" })
    await vi.advanceTimersByTimeAsync(0)
    releaseRead({ mode: "workspace-write" })
    await vi.advanceTimersByTimeAsync(0)
    await write
    expect(getIsolationMock).toHaveBeenCalledTimes(2)
    expect(useSandboxStore.getState().isSandbox("/repo")).toBe(false)
    expect(useSandboxStore.getState().isPending("/repo")).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})
