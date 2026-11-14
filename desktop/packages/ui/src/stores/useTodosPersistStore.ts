import { create } from "zustand"
import { createJSONStorage, devtools, persist } from "zustand/middleware"
import type { Todo } from "@defai-digital/ax-code-sdk/v2/client"
import { getSafeStorage } from "./utils/safeStorage"

const MAX_SESSIONS = 50
const TODO_STATUSES = new Set<Todo["status"]>(["pending", "in_progress", "completed", "cancelled"])
const TODO_PRIORITIES = new Set<Todo["priority"]>(["high", "medium", "low"])

interface SessionTodosRecord {
  todos: Todo[]
  touchedAt: number
}

interface TodosPersistState {
  sessions: Record<string, SessionTodosRecord>
  setSessionTodos: (sessionId: string, todos: Todo[] | undefined) => void
  getSessionTodos: (sessionId: string) => Todo[] | undefined
}

const evictOldest = (sessions: Record<string, SessionTodosRecord>): Record<string, SessionTodosRecord> => {
  const ids = Object.keys(sessions)
  if (ids.length <= MAX_SESSIONS) return sessions

  const sorted = ids.map((id) => [id, sessions[id].touchedAt] as const).sort((a, b) => a[1] - b[1])
  const drop = sorted.slice(0, ids.length - MAX_SESSIONS).map(([id]) => id)
  const next = { ...sessions }
  for (const id of drop) delete next[id]
  return next
}

const isPersistedTodo = (value: unknown): value is Todo => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const todo = value as Partial<Todo>
  return (
    typeof todo.content === "string" &&
    typeof todo.status === "string" &&
    TODO_STATUSES.has(todo.status) &&
    typeof todo.priority === "string" &&
    TODO_PRIORITIES.has(todo.priority)
  )
}

const restoreSessions = (
  value: unknown,
  fallback: Record<string, SessionTodosRecord>,
): Record<string, SessionTodosRecord> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
  const entries: [string, SessionTodosRecord][] = []
  for (const [sessionId, raw] of Object.entries(value)) {
    if (!sessionId) continue
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    if (!Array.isArray(record.todos)) continue
    const todos = record.todos.filter(isPersistedTodo)
    if (todos.length === 0) continue
    const touchedAt =
      typeof record.touchedAt === "number" && Number.isFinite(record.touchedAt) && record.touchedAt >= 0
        ? record.touchedAt
        : 0
    entries.push([sessionId, { todos, touchedAt }])
  }
  return evictOldest(Object.fromEntries(entries))
}

export const useTodosPersistStore = create<TodosPersistState>()(
  devtools(
    persist(
      (set, get) => ({
        sessions: {},
        setSessionTodos: (sessionId, todos) => {
          if (!sessionId) return
          set((state) => {
            const next = { ...state.sessions }
            if (!todos || todos.length === 0) {
              if (!(sessionId in next)) return state
              delete next[sessionId]
              return { sessions: next }
            }
            next[sessionId] = { todos, touchedAt: Date.now() }
            return { sessions: evictOldest(next) }
          })
        },
        getSessionTodos: (sessionId) => {
          if (!sessionId) return undefined
          return get().sessions[sessionId]?.todos
        },
      }),
      {
        name: "openchamber-session-todos",
        version: 1,
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({ sessions: state.sessions }),
        // partialize limits writes, but the default hydration merge still accepts arbitrary saved keys.
        // Restore only validated data so stale JSON cannot replace actions or crash StatusRow's task rendering.
        merge: (persistedState, currentState) => {
          if (!persistedState || typeof persistedState !== "object" || Array.isArray(persistedState)) {
            return currentState
          }
          const saved = persistedState as Record<string, unknown>
          return { ...currentState, sessions: restoreSessions(saved.sessions, currentState.sessions) }
        },
      },
    ),
    { name: "TodosPersistStore" },
  ),
)
