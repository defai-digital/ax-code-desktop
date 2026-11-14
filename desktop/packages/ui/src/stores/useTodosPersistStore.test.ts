import type { Todo } from "@defai-digital/ax-code-sdk/v2/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useTodosPersistStore } from "./useTodosPersistStore"
import { getSafeStorage } from "./utils/safeStorage"

const STORAGE_KEY = "openchamber-session-todos"
const initial = useTodosPersistStore.getInitialState()
const todo: Todo = { content: "Restore this task", status: "pending", priority: "medium" }

beforeEach(() => {
  useTodosPersistStore.setState({ ...initial, sessions: {} }, true)
  useTodosPersistStore.persist.clearStorage()
})

afterEach(() => {
  useTodosPersistStore.setState({ ...initial, sessions: {} }, true)
  useTodosPersistStore.persist.clearStorage()
})

async function restore(state: unknown) {
  getSafeStorage().setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
  await useTodosPersistStore.persist.rehydrate()
  return useTodosPersistStore.getState()
}

describe("persisted session todos", () => {
  it("restores cached tasks without replacing callable actions with saved fields", async () => {
    const state = await restore({
      sessions: { first: { todos: [todo], touchedAt: 12 } },
      setSessionTodos: null,
      getSessionTodos: "stale action",
      unexpected: "not persistent state",
    })
    expect(state.setSessionTodos).toBe(initial.setSessionTodos)
    expect(state.getSessionTodos).toBe(initial.getSessionTodos)
    expect(state).not.toHaveProperty("unexpected")
    expect(state.getSessionTodos("first")).toEqual([todo])
    state.setSessionTodos("second", [todo])
    expect(useTodosPersistStore.getState().getSessionTodos("second")).toEqual([todo])
    state.setSessionTodos("first", [])
    expect(useTodosPersistStore.getState().getSessionTodos("first")).toBeUndefined()
  })

  it.each([{ sessions: null }, { sessions: [] }, { sessions: "invalid" }])(
    "ignores an invalid saved session collection $sessions",
    async ({ sessions }) => {
      const state = await restore({ sessions })
      expect(state.sessions).toEqual({})
      expect(state.getSessionTodos("first")).toBeUndefined()
      state.setSessionTodos("first", [todo])
      expect(useTodosPersistStore.getState().getSessionTodos("first")).toEqual([todo])
    },
  )

  it("keeps valid task entries and drops malformed records before rendering", async () => {
    const state = await restore({
      sessions: {
        first: {
          todos: [
            null,
            "invalid",
            { ...todo, status: 42 },
            { ...todo, status: "unknown" },
            { ...todo, priority: "unknown" },
            todo,
          ],
          touchedAt: "invalid",
        },
        second: null,
        third: { todos: "invalid", touchedAt: 3 },
        fourth: { todos: [null], touchedAt: 4 },
        "": { todos: [todo], touchedAt: 5 },
      },
    })
    expect(state.sessions).toEqual({ first: { todos: [todo], touchedAt: 0 } })
    expect(state.getSessionTodos("first")?.filter((entry) => entry.status !== "cancelled")).toEqual([todo])
  })

  it("bounds restored sessions using their recency before accepting live updates", async () => {
    const sessions = Object.fromEntries(
      Array.from({ length: 55 }, (_, index) => [`session-${index}`, { todos: [todo], touchedAt: index }]),
    )
    const state = await restore({ sessions })
    expect(Object.keys(state.sessions)).toHaveLength(50)
    expect(state.getSessionTodos("session-0")).toBeUndefined()
    expect(state.getSessionTodos("session-54")).toEqual([todo])
    state.setSessionTodos("newest", [todo])
    expect(Object.keys(useTodosPersistStore.getState().sessions)).toHaveLength(50)
    expect(useTodosPersistStore.getState().getSessionTodos("newest")).toEqual([todo])
  })

  it("keeps current valid state when the saved payload has no session data", async () => {
    useTodosPersistStore.getState().setSessionTodos("live", [todo])
    const state = await restore({ getSessionTodos: null })
    expect(state.getSessionTodos("live")).toEqual([todo])
  })
})
