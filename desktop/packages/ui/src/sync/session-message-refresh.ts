import type { AxCodeClient } from "@defai-digital/ax-code-sdk/v2/client"
import type { StoreApi } from "zustand"
import type { DirectoryStore } from "./child-store"
import { materializeSessionSnapshots } from "./materialization"
import { stripMessageDiffSnapshots } from "./sanitize"

export const MESSAGE_REFETCH_LIMIT = 200
const MESSAGE_REFETCH_SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])

interface SessionMessageRefreshInput {
  sdk: AxCodeClient
  store: StoreApi<DirectoryStore>
  sessionId: string
  directory: string
  signal?: AbortSignal
  limit?: number
  shouldApply: () => boolean
}

export async function refetchSessionMessagesIfChanged(input: SessionMessageRefreshInput) {
  const before = input.store.getState()
  const result = await input.sdk.session.messages(
    {
      sessionID: input.sessionId,
      directory: input.directory,
      limit: input.limit ?? MESSAGE_REFETCH_LIMIT,
    },
    { signal: input.signal },
  )
  if (result.error) throw new Error("session.messages failed")
  const records = (result.data ?? []).filter((record) => !!record?.info?.id)
  if (input.signal?.aborted || !input.shouldApply() || records.length === 0) return records

  const materialized = materializeSessionSnapshots(
    input.store.getState(),
    input.sessionId,
    records.map((record) => ({ info: stripMessageDiffSnapshots(record.info), parts: record.parts ?? [] })),
    { before, skipPartTypes: MESSAGE_REFETCH_SKIP_PARTS },
  )
  // Materialization merges by id, retaining optimistic messages absent from this bounded page.
  if (materialized.messagesChanged || materialized.partsChanged) {
    input.store.setState({ message: materialized.message, part: materialized.part })
  }
  return records
}
