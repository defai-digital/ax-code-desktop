import type { AxCodeClient } from "@defai-digital/ax-code-sdk/v2/client"
import type { StoreApi } from "zustand"
import type { DirectoryStore } from "./child-store"
import { mergeSessionListPage } from "./session-list-merge"
import { haveEquivalentSyncSnapshots } from "./snapshot-equality"

interface SessionListLoaderInput {
  sdk: AxCodeClient
  directory: string
  store: StoreApi<DirectoryStore>
  signal?: AbortSignal
}

export async function refreshDirectorySessionList({ sdk, directory, store, signal }: SessionListLoaderInput) {
  const knownBeforeRequest = new Map(store.getState().session.map((session) => [session.id, session.time?.updated]))
  const result = await sdk.session.list({ directory, roots: true, limit: 50 }, { signal })
  if (signal?.aborted) return
  if (result.error) {
    const status = result.response?.status
    // Bootstrap retry also recognizes transport failures by message when no HTTP status exists.
    const rawError: unknown = result.error
    const message =
      typeof rawError === "object" && rawError !== null && "message" in rawError
        ? String(rawError.message)
        : String(rawError)
    const wrapped = new Error(`session.list failed${status ? ` (${status})` : ""}: ${message}`)
    if (status !== undefined) Object.assign(wrapped, { status })
    throw wrapped
  }
  const rootPage = (result.data ?? []).filter((session) => !!session?.id)
  const current = store.getState()
  // Preserve the bootstrap warmup guard: HTTP can be empty while events already populated the store.
  if (rootPage.length === 0 && current.session.length > 0) return
  const sessions = mergeSessionListPage(rootPage, current.session, knownBeforeRequest)
  const unchanged =
    sessions.length === current.session.length &&
    sessions.every((session, index) => haveEquivalentSyncSnapshots(session, current.session[index]))
  if (unchanged && current.sessionTotal === rootPage.length && current.limit === Math.max(rootPage.length, 50)) return
  store.setState({
    session: unchanged ? current.session : sessions,
    sessionTotal: rootPage.length,
    limit: Math.max(rootPage.length, 50),
  })
}
