import { describe, expect, test, vi } from "vitest"
import { create, type StoreApi } from "zustand"
import type { Session } from "@defai-digital/ax-code-sdk/v2/client"

// The reconnect pass reads the SDK through the module-level client and the project-level status fetch.
const sessionsById: Record<string, Session> = {}

vi.doMock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/repo",
    setDirectory: () => undefined,
    getSessionStatusForDirectory: vi.fn(async () => ({})),
    listPendingQuestions: vi.fn(async () => []),
    listPendingPermissions: vi.fn(async () => []),
    getScopedSdkClient: () => ({
      session: {
        get: vi.fn(async ({ sessionID }: { sessionID: string }) => ({ data: sessionsById[sessionID] ?? null })),
        messages: vi.fn(async () => ({ data: [] })),
      },
    }),
  },
}))

vi.doMock("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: () => ({ isSessionAutoAccepting: () => false }),
  },
}))

vi.doMock("@/stores/useConfigStore", () => ({
  useConfigStore: {
    getState: () => ({}),
    setState: () => undefined,
  },
}))

vi.doMock("@/stores/useTodosPersistStore", () => ({
  useTodosPersistStore: { getState: () => ({}) },
}))

vi.doMock("@/components/ui", () => ({
  toast: { info: () => undefined, error: () => undefined, success: () => undefined },
}))

import type { State } from "../types"
import type { DirectoryStore } from "../child-store"

const { INITIAL_STATE } = await import("../types")
const { recoverSessionSnapshotsAfterGap } = await import("../sync-context")

const makeSession = (id: string, overrides: Partial<Session> = {}): Session =>
  ({
    id,
    slug: id,
    projectID: "proj_1",
    directory: "/repo",
    title: id,
    version: "1",
    time: { created: 1, updated: 1 },
    ...overrides,
  }) as Session

function createDirectoryStore(initial: Partial<State>): StoreApi<DirectoryStore> {
  return create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    ...initial,
    session: initial.session ?? [],
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))
}

const settle = async () => {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("reconnect session snapshot", () => {
  test("does not put an archived parent back in the live list", async () => {
    // The reconnect candidates include the parent of every listed session, and an archived session is not
    // part of this list — the `session.updated` reducer removes it. The answer was inserted anyway, so
    // the sidebar's active list showed the archived session again until the next event.
    const child = makeSession("ses_child", { parentID: "ses_parent" })
    sessionsById.ses_parent = makeSession("ses_parent", {
      time: { created: 1, updated: 2, archived: 3 },
    })
    sessionsById.ses_child = child

    const store = createDirectoryStore({ session: [child] })
    const childStores = {
      children: new Map([["/repo", store]]),
      getChild: (directory: string) => (directory === "/repo" ? store : undefined),
    }

    recoverSessionSnapshotsAfterGap(
      childStores as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[0],
      {} as unknown as Parameters<typeof recoverSessionSnapshotsAfterGap>[1],
    )
    await settle()

    expect(store.getState().session.map((session) => session.id)).toEqual(["ses_child"])
  })
})
