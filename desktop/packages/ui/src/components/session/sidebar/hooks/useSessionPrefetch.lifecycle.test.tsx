import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useSessionPrefetch } from "./useSessionPrefetch"

const state = vi.hoisted(() => ({ currentSessionId: "a1" }))
vi.mock("@/sync/session-ui-store", () => ({ useSessionUIStore: { getState: () => state } }))
vi.mock("@/sync/sync-refs", () => ({ getSyncSessionMaterializationStatus: () => ({ renderable: false }) }))

type Args = Parameters<typeof useSessionPrefetch>[0]
const sessions = ["a", "b"].flatMap((project) =>
  [0, 1, 2].map((index) => ({ id: `${project}${index}`, directory: `/${project}` }) as Session),
)
let root: Root
function Probe(props: Args): React.ReactNode {
  useSessionPrefetch(props)
  return null
}
const render = (directory: string, ensureSessionRenderable: Args["ensureSessionRenderable"]) => {
  state.currentSessionId = `${directory.slice(1)}1`
  act(() =>
    root.render(
      <Probe
        directory={directory}
        currentSessionId={state.currentSessionId}
        sortedSessions={sessions}
        ensureSessionRenderable={ensureSessionRenderable}
      />,
    ),
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  root = createRoot(document.createElement("div"))
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

test("drops hover timers from the previous directory", async () => {
  const first = vi.fn().mockResolvedValue(null)
  const second = vi.fn().mockResolvedValue(null)
  render("/a", first)
  await act(async () => vi.advanceTimersByTimeAsync(600))
  render("/b", second)
  await act(async () => vi.advanceTimersByTimeAsync(180))
  expect(first).not.toHaveBeenCalled()
  expect(second).not.toHaveBeenCalled()
})

test.each([false, true])("drains the current directory after an old prefetch settles (failure=%s)", async (fails) => {
  let finish: (() => void) | undefined
  const first = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        finish = () => (fails ? reject(new Error("unavailable")) : resolve(null))
      }),
  )
  const second = vi.fn().mockResolvedValue(null)
  render("/a", first)
  await act(async () => vi.advanceTimersByTimeAsync(780))
  expect(first).toHaveBeenCalledExactlyOnceWith("a0")
  render("/b", second)
  await act(async () => vi.advanceTimersByTimeAsync(780))
  expect(second).not.toHaveBeenCalled()
  await act(async () => finish?.())
  expect(first).toHaveBeenCalledTimes(1)
  expect(second.mock.calls.map(([id]) => id)).toEqual(["b0", "b2"])
})
