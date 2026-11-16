import type { AxCodeClient, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { describe, expect, test, vi } from "vitest"
import { ChildStoreManager } from "./child-store"
import { refreshDirectorySessionList } from "./session-list-loader"
import { retry } from "./retry"

const session: Session = {
  id: "session",
  slug: "session",
  projectID: "project",
  directory: "/repo",
  title: "Session",
  version: "1",
  time: { created: 1, updated: 100 },
}

function setup() {
  const store = new ChildStoreManager().ensureChild("/repo", { bootstrap: false })
  store.setState({ session: [session], sessionTotal: 1, limit: 50 })
  const list = vi.fn(
    async (): Promise<{ data?: Session[]; error?: unknown; response?: { status: number } }> => ({
      data: [structuredClone(session)],
    }),
  )
  const sdk = { session: { list } } as unknown as AxCodeClient
  const refresh = () => refreshDirectorySessionList({ sdk, directory: "/repo", store })
  return { store, list, refresh }
}

describe("refreshDirectorySessionList", () => {
  test("does not publish unchanged list snapshots", async () => {
    const { store, refresh } = setup()
    const write = vi.spyOn(store, "setState")
    await refresh()
    expect(write).not.toHaveBeenCalled()
  })

  test("discovers CLI sessions and preserves known child sessions", async () => {
    const { store, list, refresh } = setup()
    const child = { ...session, id: "child", parentID: session.id }
    const external = { ...session, id: "external", time: { created: 1, updated: 200 } }
    store.setState({ session: [child, session] })
    list.mockResolvedValue({ data: [external, session] })
    await refresh()
    expect(store.getState().session).toEqual([child, external, session])
    expect(store.getState().sessionTotal).toBe(2)
  })

  test("preserves sessions on SDK errors and retains status for bootstrap retry", async () => {
    const { store, list, refresh } = setup()
    list.mockResolvedValue({ error: { message: "offline" }, response: { status: 503 } })
    const before = store.getState()
    await expect(refresh()).rejects.toMatchObject({ status: 503 })
    expect(store.getState()).toBe(before)
  })

  test("bootstrap retries transport failures that do not carry an HTTP status", async () => {
    const { list, refresh } = setup()
    list.mockResolvedValueOnce({ error: { message: "Failed to fetch" } })
    await retry(refresh, { delay: 0 })
    expect(list).toHaveBeenCalledTimes(2)
  })

  test("preserves the existing list when bootstrap HTTP returns an empty warmup snapshot", async () => {
    const { store, list, refresh } = setup()
    list.mockResolvedValue({ data: [] })
    const before = store.getState()
    await refresh()
    expect(store.getState()).toBe(before)
  })

  test("does not overwrite newer session metadata that arrives during the request", async () => {
    const { store, list, refresh } = setup()
    const newer = { ...session, title: "Renamed", time: { created: 1, updated: 200 } }
    list.mockImplementationOnce(async () => {
      store.setState({ session: [newer] })
      return { data: [session] }
    })
    await refresh()
    expect(store.getState().session[0]).toBe(newer)
  })

  test("does not overwrite newer metadata for a session discovered during the request", async () => {
    const { store, list, refresh } = setup()
    const current = { ...session, id: "created", title: "Event title", time: { created: 1, updated: 200 } }
    const stalePage = { ...current, title: "Page title", time: { created: 1, updated: 100 } }
    list.mockImplementationOnce(async () => {
      store.setState({ session: [current, session], sessionTotal: 2 })
      return { data: [session, stalePage] }
    })
    await refresh()
    expect(store.getState().session[0]).toBe(current)
  })

  test("counts a root session created while the request is in flight", async () => {
    const { store, list, refresh } = setup()
    const created = { ...session, id: "created", title: "Created" }
    list.mockImplementationOnce(async () => {
      store.setState({ session: [created, session], sessionTotal: 2 })
      return { data: [session] }
    })
    await refresh()
    expect(store.getState().session).toEqual([created, session])
    expect(store.getState().sessionTotal).toBe(2)
  })

  test("does not count a root session deleted while the request is in flight", async () => {
    const { store, list, refresh } = setup()
    list.mockImplementationOnce(async () => {
      store.setState({ session: [], sessionTotal: 0 })
      return { data: [session] }
    })
    await refresh()
    expect(store.getState().session).toEqual([])
    expect(store.getState().sessionTotal).toBe(0)
  })

  test("repairs a stale total without replacing an unchanged session snapshot", async () => {
    const { store, refresh } = setup()
    const sessions = store.getState().session
    store.setState({ sessionTotal: 0 })
    await refresh()
    expect(store.getState().session).toBe(sessions)
    expect(store.getState().sessionTotal).toBe(1)
  })
})
