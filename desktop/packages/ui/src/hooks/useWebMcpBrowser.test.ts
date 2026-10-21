import React, { act } from "react"
import { render, cleanup } from "@/test/dom"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ensureSessionForProjectBrowser, useOpenProjectBrowser, webMcpCompatibility } from "./useWebMcpBrowser"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useDirectoryStore } from "@/stores/useDirectoryStore"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const sessionSnapshot = useSessionUIStore.getState()
const browserSnapshot = useWebMcpBrowserStore.getState()
const directorySnapshot = useDirectoryStore.getState()

afterEach(() => {
  cleanup()
  useWebMcpBrowserStore.setState(browserSnapshot, true)
  useSessionUIStore.setState(sessionSnapshot, true)
  useDirectoryStore.setState(directorySnapshot, true)
})

describe("ensureSessionForProjectBrowser", () => {
  test("keeps the current session when one is selected", async () => {
    const createSession = vi.fn()
    useSessionUIStore.setState({ currentSessionId: "ses_live", createSession })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(true)
    expect(createSession).not.toHaveBeenCalled()
  })

  test("starts a session in the draft's project when none is selected", async () => {
    const createSession = vi.fn(async () => ({ id: "ses_new" }))
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: "/Users/dev/app" },
      createSession: createSession as unknown as typeof sessionSnapshot.createSession,
    })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(true)
    expect(createSession).toHaveBeenCalledWith("Project browser", "/Users/dev/app")
  })

  test("falls back to the current directory and reports when nothing can be started", async () => {
    const createSession = vi.fn(async () => null)
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: null },
      createSession: createSession as unknown as typeof sessionSnapshot.createSession,
    })
    useDirectoryStore.setState({ currentDirectory: "/Users/dev/other" })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(false)
    expect(createSession).toHaveBeenCalledWith("Project browser", "/Users/dev/other")
  })
})

test("missing compatibility never becomes an instruction to update the runtime", () => {
  for (const result of [undefined, null, {}, { compatible: null }, { reachable: false, compatible: false }]) {
    expect(webMcpCompatibility(result)).toBeNull()
  }
  expect(webMcpCompatibility({ compatible: false })).toBe(false)
  expect(webMcpCompatibility({ compatible: true })).toBe(true)
})

test.each(["empty", "reject"])(
  "useOpenProjectBrowser consumes the request after a %s session failure",
  async (failure) => {
    const createSession = vi.fn(async () => {
      if (failure === "reject") throw new Error("start failed")
      return null
    })
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: "/repo" },
      createSession: createSession as unknown as typeof sessionSnapshot.createSession,
    })
    let open: ReturnType<typeof useOpenProjectBrowser>
    function Harness() {
      open = useOpenProjectBrowser()
      return null
    }
    render(React.createElement(Harness))
    await act(async () => {
      open({ enable: true })
    })
    expect(createSession).toHaveBeenCalledTimes(1)
    const state = useWebMcpBrowserStore.getState()
    expect(state.enableRequests).toBeGreaterThan(browserSnapshot.enableRequests)
    expect(state.enableConsumed).toBe(state.enableRequests)
  },
)
