import { create } from "zustand"
import {
  captureBlockingRequest,
  type BlockingRequestDecision,
  type BlockingRequestIdentity,
} from "@/sync/session-actions"

export type RequestDecisionPhase = "idle" | "sending" | "checking" | "retry" | "uncertain" | "accepted" | "resolved"
type RecordEntry = { phase: RequestDecisionPhase; source?: ReturnType<typeof captureBlockingRequest> }

/** Ephemeral presentation state only. The runtime owns permission outcomes; this shares UI locks across cards. */
export const useRequestDecisionStore = create<{ records: ReadonlyMap<string, RecordEntry> }>(() => ({
  records: new Map(),
}))
const subscribers = new Map<string, number>()
export const requestDecisionKey = ({ kind, sessionId, requestId }: BlockingRequestIdentity) =>
  JSON.stringify([kind, sessionId, requestId])

export function retainRequestDecision(key: string) {
  subscribers.set(key, (subscribers.get(key) ?? 0) + 1)
  return () => {
    const count = (subscribers.get(key) ?? 1) - 1
    if (count) subscribers.set(key, count)
    else subscribers.delete(key)
    pruneResolvedDecisions()
  }
}

function pruneResolvedDecisions() {
  const records = new Map(useRequestDecisionStore.getState().records)
  let changed = false
  for (const [key, entry] of records) {
    if (
      !subscribers.has(key) &&
      entry.phase !== "sending" &&
      entry.phase !== "checking" &&
      entry.source?.isPendingLocally() === false
    ) {
      records.delete(key)
      changed = true
    }
  }
  if (changed) useRequestDecisionStore.setState({ records })
}

function update(key: string, entry: RecordEntry) {
  const records = new Map(useRequestDecisionStore.getState().records)
  records.set(key, entry)
  useRequestDecisionStore.setState({ records })
}

async function reconcile(identity: BlockingRequestIdentity, source?: ReturnType<typeof captureBlockingRequest>) {
  const key = requestDecisionKey(identity)
  update(key, { phase: "checking", source })
  try {
    source ??= captureBlockingRequest(identity)
    update(key, { phase: "checking", source })
    const result = await source.read()
    update(key, { phase: result === "pending" ? "retry" : "resolved", source })
  } catch {
    update(key, { phase: "uncertain", source })
  }
  pruneResolvedDecisions()
}

export async function checkRequestDecision(identity: BlockingRequestIdentity) {
  const entry = useRequestDecisionStore.getState().records.get(requestDecisionKey(identity))
  if (entry?.phase !== "uncertain") return
  await reconcile(identity, entry.source)
}

export async function submitRequestDecision(identity: BlockingRequestIdentity, decision: BlockingRequestDecision) {
  const key = requestDecisionKey(identity)
  const previous = useRequestDecisionStore.getState().records.get(key)
  if (previous && previous.phase !== "idle" && previous.phase !== "retry") return
  // Synchronous store update guards both same-tick activation and another mounted/remounted surface.
  let source = previous?.source
  update(key, { phase: "sending", source })
  try {
    source ??= captureBlockingRequest(identity)
    update(key, { phase: "sending", source })
    await source.respond(decision)
    update(key, { phase: "accepted", source })
  } catch {
    await reconcile(identity, source)
  }
  pruneResolvedDecisions()
}
