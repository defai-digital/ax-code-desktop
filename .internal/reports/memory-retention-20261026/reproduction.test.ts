import { describe, expect, test, vi } from "vitest"
import type { Event } from "@defai-digital/ax-code-sdk/v2/client"
import { applyDirectoryEvent, prepareEventDraft } from "@/sync/event-reducer"
import { INITIAL_STATE, SESSION_CACHE_LIMIT, type State } from "@/sync/types"
import { getProtectedSessionCacheIds } from "@/sync/session-cache"

function fresh(): State {
  return { ...INITIAL_STATE, session: [], message: {}, session_status: {}, permission: {}, question: {} }
}
function apply(state: State, event: Event): State {
  const draft = prepareEventDraft(state, event)
  applyDirectoryEvent(draft, event)
  draft.part.seal()
  return draft
}

describe("memory retention audit (observed current behavior)", () => {
  test("completed background sessions retain content beyond the session cache limit", () => {
    let state = fresh()
    for (let i = 0; i < 200; i++) {
      const id = String(i).padStart(5, "0")
      const sessionID = `ses_${id}`
      state = apply(state, { type: "session.created", properties: { info: {
        id: sessionID, title: id, version: "1", time: { created: i, updated: i },
      } } } as Event)
      state = apply(state, { type: "message.updated", properties: { info: {
        id: `msg_${id}`, sessionID, role: "assistant", time: { created: i, completed: i + 1 },
      } } } as Event)
      state = apply(state, { type: "message.part.updated", properties: { part: {
        id: `prt_${id}`, messageID: `msg_${id}`, sessionID, type: "text", text: "x".repeat(8192),
      } } } as Event)
      state = apply(state, { type: "session.status", properties: { sessionID, status: { type: "idle" } } } as Event)
    }
    expect(state.session.length).toBe(state.limit)
    expect(getProtectedSessionCacheIds(state).size).toBe(0)
    expect(Object.keys(state.message).length).toBe(200)
    expect(state.part.size).toBe(200)
    expect(Object.keys(state.message).length).toBeGreaterThan(SESSION_CACHE_LIMIT)
    console.log(JSON.stringify({ audit: "background-sessions", listed: state.session.length,
      cachedSessions: Object.keys(state.message).length, partMessages: state.part.size,
      protected: getProtectedSessionCacheIds(state).size, textCharacters: 200 * 8192 }))
  })
  test("a single completed session retains every live message", () => {
    let state = fresh()
    for (let i = 0; i < 1000; i++) {
      state = apply(state, { type: "message.updated", properties: { info: {
        id: `msg_${String(i).padStart(6, "0")}`, sessionID: "ses_long", role: "assistant",
        time: { created: i, completed: i + 1 },
      } } } as Event)
    }
    expect(state.message.ses_long.length).toBe(1000)
  })
  test("Git directory state is retained across 100 project switches", async () => {
    const { useGitStore } = await import("@/stores/useGitStore")
    useGitStore.setState({ directories: new Map(), activeDirectory: null })
    for (let i = 0; i < 100; i++) useGitStore.getState().setActiveDirectory(`/audit/project-${i}`)
    expect(useGitStore.getState().directories.size).toBe(100)
    useGitStore.setState({ directories: new Map(), activeDirectory: null })
  })
  test("expired snippets from 50 visited projects remain available before refetch", async () => {
    let directory = "/audit/snippets-0"
    vi.doMock("@/stores/utils/configDirectory", () => ({ getActiveConfigDirectory: () => directory }))
    const { useSnippetsStore } = await import("@/stores/useSnippetsStore")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      { name: directory, content: `payload:${directory}`, aliases: [], source: "project" },
    ]), { headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    let now = 100000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    try {
      for (let i = 0; i < 50; i++) {
        directory = `/audit/snippets-${i}`
        await useSnippetsStore.getState().loadSnippets()
      }
      now += 60000
      fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
      for (let i = 0; i < 50; i++) {
        directory = `/audit/snippets-${i}`
        void useSnippetsStore.getState().loadSnippets()
        expect(useSnippetsStore.getState().snippets[0]?.content).toBe(`payload:${directory}`)
      }
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    }
  })
})
