import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"

const risk = vi.hoisted(() => vi.fn())
const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const store = {
    getState: () => ({ todo: {}, message: {}, part: { get: () => undefined } }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    sessions: [] as Array<Record<string, unknown>>,
    statuses: {} as Record<string, { type: string }>,
    inputs: [] as Array<Record<string, unknown>>,
    manager: {
      children: new Map([["/repo", store]]),
      subscribeAll: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      subscribeRegistry: () => () => {},
    },
  }
})

vi.mock("@/lib/ax-code/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ax-code/client")>()
  return {
    ...original,
    axCodeClient: new Proxy(original.axCodeClient, {
      get(target, key) {
        return key === "getScopedSdkClient" ? () => ({ session: { risk } }) : Reflect.get(target, key)
      },
    }),
  }
})
vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => mocks.sessions,
  useAllSessionStatuses: () => mocks.statuses,
  useChildStoreManager: () => mocks.manager,
}))
vi.mock("@/hooks/useNeedsYouSessions", () => ({
  useNeedsYouSessionInputs: () => mocks.inputs,
  useEnsureDirectoriesGitStatus: () => undefined,
}))

import type { SupervisionRow } from "@/lib/supervision/rows"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSupervisionRows, useSupervisionRowsPublisher } from "./useSupervisionRows"
import { useSupervisionVerificationDemand } from "./useSupervisionVerification"

const input = (id: string, directory: string | null = "/repo") => ({
  id,
  projectId: null,
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  updatedAt: 2000,
  directory,
  title: `Session ${id}`,
})

describe("supervision verification demand", () => {
  let latest: SupervisionRow[] = []

  function Harness({ demand }: { demand: boolean }) {
    useSupervisionRowsPublisher()
    const rows = useSupervisionRows()
    latest = rows
    useSupervisionVerificationDemand(demand ? rows : [])
    return null
  }

  beforeEach(() => {
    risk.mockReset()
    mocks.sessions = []
    mocks.statuses = {}
    mocks.inputs = []
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
    useProjectsStore.setState({ projects: [] })
  })

  afterEach(() => {
    cleanup()
    useSessionGoalStore.getState().clear()
    useSupervisionStore.setState({ rows: [] })
  })

  test("reads risk envelopes only for demanded sessions and copies the failed count onto the row", async () => {
    let resolveRisk: (value: { data: unknown }) => void = () => undefined
    risk.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRisk = resolve
        }),
    )
    mocks.sessions = [
      { id: "root", title: "Root", time: { created: 1, updated: 2000 } },
      { id: "closed", title: "Closed", time: { created: 1, updated: 2000 } },
    ]
    mocks.inputs = [input("root"), input("closed", null)]
    const view = render(<Harness demand={false} />)
    expect(risk).not.toHaveBeenCalled()
    expect(latest.find((row) => row.sessionId === "root")?.checks).toBeNull()

    view.rerender(<Harness demand={true} />)
    expect(risk).toHaveBeenCalledTimes(1)
    expect(risk).toHaveBeenCalledWith(
      { sessionID: "root", directory: "/repo", envelopes: true },
      { signal: expect.any(AbortSignal) },
    )
    await act(async () => {
      resolveRisk({
        data: {
          envelopes: [
            { schemaVersion: 1, workflow: "review", result: { passed: false, status: "failed", output: "do not keep" } },
            { schemaVersion: 1, workflow: "review", result: { passed: true, status: "passed" } },
          ],
        },
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(latest.find((row) => row.sessionId === "root")?.checks).toEqual({
      state: "failed",
      passed: 1,
      failed: 1,
      total: 2,
    })
    expect(latest.find((row) => row.sessionId === "closed")?.checks).toBeNull()
    expect(JSON.stringify(latest)).not.toContain("do not keep")
  })
})
