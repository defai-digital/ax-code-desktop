import React from "react"

import { useConnectionStore } from "@/lib/event-stream/connection-state"
import { fetchSessionGoal } from "@/lib/ax-code/sessionGoalApi"
import { registerSessionGoalReadClaimDrop } from "@/lib/sessionRemovalCleanup"
import { normalizeSessionGoal, type SessionGoalSnapshot } from "@/lib/supervision/goal"
import { useSessionGoalStore } from "@/stores/useSessionGoalStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { subscribeSessionGoalRecovery, sessionGoalRecoveryEpoch } from "@/sync/session-goal-ingress"
import { useChildStoreManager } from "@/sync/sync-context"
import { useSessionUIStore } from "@/sync/session-ui-store"

/** At most this many `GET /session/{id}/goal` calls are in flight, including an older recovery until it settles. */
export const SESSION_GOAL_READ_CONCURRENCY = 4

/** The first read plus one retry. Further failures wait for the next recovery. */
export const SESSION_GOAL_READ_ATTEMPTS = 2

export type GoalReadTarget = {
  sessionId: string
  directory: string | null
}

export type GoalReadRow = {
  sessionId: string
  state: string
  directory: string | null
  updatedAt?: number
}

/** One route read that has not settled. `id` is the claim a completion must still find. */
export type GoalReadClaim = {
  id: number
  sessionId: string
  generation: number
}

export type GoalLoadState = {
  recovery: number
  attempts: Record<string, number>
  settled: Record<string, true>
  /**
   * Every read that has not settled. An older recovery stays here, still counting toward the
   * concurrency cap, until that read settles; its result is discarded.
   */
  inflight: readonly GoalReadClaim[]
}

export type GoalReadRuntime = {
  state: GoalLoadState
  targets: readonly GoalReadTarget[]
  fetchGoal: (target: GoalReadTarget) => Promise<unknown>
  beginRead: (sessionId: string) => number
  applyRead: (sessionId: string, goal: SessionGoalSnapshot | null, token: number) => boolean
}

let nextGoalReadClaimId = 1

export function createGoalLoadState(): GoalLoadState {
  return { recovery: 0, attempts: {}, settled: {}, inflight: [] }
}

/** A reconnect recovery is the stream coming back, not the first connect. */
export function isReconnectRecovery(previousPhase: string, nextPhase: string): boolean {
  return previousPhase === "reconnecting" && nextPhase === "connected"
}

/**
 * Every root row whose goal is not yet known, whatever its supervision state, once per recovery epoch.
 * When the concurrency cap binds, read the session on screen, then rows that are not idle in row order,
 * then the remaining rows by `updatedAt` descending. A known session is left to the event stream.
 */
export function selectGoalReadTargets(
  rows: readonly GoalReadRow[],
  displayedSessionId: string | null | undefined,
  known?: Readonly<Record<string, true>>,
): GoalReadTarget[] {
  const current: GoalReadTarget[] = []
  const active: GoalReadTarget[] = []
  const rest: { target: GoalReadTarget; updatedAt: number }[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.sessionId || seen.has(row.sessionId)) continue
    seen.add(row.sessionId)
    if (known?.[row.sessionId]) continue
    const target = { sessionId: row.sessionId, directory: row.directory }
    if (displayedSessionId != null && displayedSessionId === row.sessionId) {
      current.push(target)
      continue
    }
    if (row.state !== "idle") {
      active.push(target)
      continue
    }
    rest.push({ target, updatedAt: row.updatedAt ?? 0 })
  }
  rest.sort((left, right) => right.updatedAt - left.updatedAt)
  return [...current, ...active, ...rest.map((item) => item.target)]
}

const inflightCount = (state: GoalLoadState): number => state.inflight.length

export function claimGoalReads(
  state: GoalLoadState,
  targets: readonly GoalReadTarget[],
): { state: GoalLoadState; claimed: GoalReadTarget[] } {
  const room = SESSION_GOAL_READ_CONCURRENCY - inflightCount(state)
  if (room <= 0) return { state, claimed: [] }
  const claimed: GoalReadTarget[] = []
  let attempts = state.attempts
  const inflight: GoalReadClaim[] = state.inflight.slice()
  for (const target of targets) {
    if (claimed.length >= room) break
    const sessionId = target.sessionId
    if (state.settled[sessionId]) continue
    if (inflight.some((claim) => claim.sessionId === sessionId && claim.generation === state.recovery)) continue
    if ((attempts[sessionId] ?? 0) >= SESSION_GOAL_READ_ATTEMPTS) continue
    if (attempts === state.attempts) attempts = { ...attempts }
    attempts[sessionId] = (attempts[sessionId] ?? 0) + 1
    inflight.push({ id: nextGoalReadClaimId, sessionId, generation: state.recovery })
    nextGoalReadClaimId += 1
    claimed.push(target)
  }
  if (claimed.length === 0) return { state, claimed }
  return { state: { ...state, attempts, inflight }, claimed }
}

export function completeGoalRead(
  state: GoalLoadState,
  sessionId: string,
  startedRecovery: number,
  ok: boolean,
  claimId?: number,
): { state: GoalLoadState; apply: boolean } {
  const index = state.inflight.findIndex((claim) =>
    claimId === undefined
      ? claim.sessionId === sessionId && claim.generation === startedRecovery
      : claim.id === claimId,
  )
  // A deleted session drops the claim. A completion with no live entry must not apply, or a read
  // that began at eventSeq 0 would repopulate the store after remove().
  if (index < 0) return { state, apply: false }
  const claim = state.inflight[index]
  if (!claim || claim.sessionId !== sessionId || claim.generation !== startedRecovery) return { state, apply: false }
  const inflight = state.inflight.slice()
  inflight.splice(index, 1)
  // applyRead does not bump eventSeq, so a read from before this recovery can land after the
  // fresh read and overwrite it. The old request still occupied a slot until this point.
  if (startedRecovery !== state.recovery) return { state: { ...state, inflight }, apply: false }
  if (!ok || state.settled[sessionId]) return { state: { ...state, inflight }, apply: false }
  return { state: { ...state, inflight, settled: { ...state.settled, [sessionId]: true } }, apply: true }
}

export function recoverGoalReads(
  state: GoalLoadState,
  sessionIds: readonly string[],
): { state: GoalLoadState; clearKnown: string[] } {
  const retry = new Set(sessionIds)
  for (const claim of state.inflight) retry.add(claim.sessionId)
  const attempts = { ...state.attempts }
  const settled = { ...state.settled }
  for (const sessionId of retry) {
    delete attempts[sessionId]
    delete settled[sessionId]
  }
  // Leave inflight in place. Those promises are still running and keep their cap slots; the
  // generation check discards whatever they return.
  return {
    state: { recovery: state.recovery + 1, attempts, settled, inflight: state.inflight },
    clearKnown: [...sessionIds],
  }
}

export function forgetLedgerSession(state: GoalLoadState, sessionId: string): GoalLoadState {
  const inflight = state.inflight.filter((claim) => claim.sessionId !== sessionId)
  const droppedInflight = inflight.length !== state.inflight.length
  if (!(sessionId in state.attempts) && !(sessionId in state.settled) && !droppedInflight) return state
  const attempts = { ...state.attempts }
  const settled = { ...state.settled }
  delete attempts[sessionId]
  delete settled[sessionId]
  return { ...state, attempts, settled, inflight: droppedInflight ? inflight : state.inflight }
}

/**
 * Which rows to read on this pass. A recovery clears `known` for every root row before selection,
 * so a session that already had a goal is read again; within an epoch, known sessions are not.
 */
export function planGoalReads(input: {
  rows: readonly GoalReadRow[]
  displayedSessionId: string | null | undefined
  known: Readonly<Record<string, true>>
  state: GoalLoadState
  recovered: boolean
}): { state: GoalLoadState; targets: GoalReadTarget[]; clearKnown: string[] } {
  const sessionIds: string[] = []
  const seen = new Set<string>()
  for (const row of input.rows) {
    if (!row.sessionId || seen.has(row.sessionId)) continue
    seen.add(row.sessionId)
    sessionIds.push(row.sessionId)
  }
  let state = input.state
  let clearKnown: string[] = []
  let known = input.known
  if (input.recovered) {
    const next = recoverGoalReads(state, sessionIds)
    state = next.state
    clearKnown = next.clearKnown
    if (clearKnown.length > 0) {
      const dropped = new Set(clearKnown)
      const remaining: Record<string, true> = {}
      for (const sessionId of Object.keys(known)) {
        if (!dropped.has(sessionId)) remaining[sessionId] = true
      }
      known = remaining
    }
  }
  return {
    state,
    clearKnown,
    targets: selectGoalReadTargets(input.rows, input.displayedSessionId, known),
  }
}

/** Drop `known` for sessions a recovery will re-read. The last goal stays until the read or an event replaces it. */
export function clearKnownSessionGoals(sessionIds: readonly string[]): void {
  if (sessionIds.length === 0) return
  useSessionGoalStore.setState((state) => {
    let changed = false
    const known = { ...state.known }
    for (const sessionId of sessionIds) {
      if (!Object.hasOwn(known, sessionId)) continue
      delete known[sessionId]
      changed = true
    }
    return changed ? { known } : state
  })
}

export function collectDirectorySessionIndex(
  entries: readonly (readonly [string, readonly { id?: string }[]])[],
): Map<string, ReadonlySet<string>> {
  const index = new Map<string, ReadonlySet<string>>()
  for (const [directory, sessions] of entries) {
    const ids = new Set<string>()
    for (const session of sessions) {
      if (typeof session?.id === "string" && session.id.length > 0) ids.add(session.id)
    }
    index.set(directory, ids)
  }
  return index
}

/** Sessions that were in a directory store and are now in none (deleted, archived, or the store was removed). */
export function sessionIdsLeavingDirectoryStores(
  previous: ReadonlyMap<string, ReadonlySet<string>>,
  next: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const still = new Set<string>()
  for (const ids of next.values()) {
    for (const id of ids) still.add(id)
  }
  const leaving: string[] = []
  const seen = new Set<string>()
  for (const ids of previous.values()) {
    for (const id of ids) {
      if (seen.has(id) || still.has(id)) continue
      seen.add(id)
      leaving.push(id)
    }
  }
  return leaving
}

function finishGoalRead(
  runtime: { current: GoalReadRuntime },
  sessionId: string,
  startedRecovery: number,
  claimId: number,
  ok: boolean,
  value: unknown,
  token: number,
): void {
  const result = completeGoalRead(runtime.current.state, sessionId, startedRecovery, ok, claimId)
  runtime.current.state = result.state
  if (result.apply) runtime.current.applyRead(sessionId, normalizeSessionGoal(value), token)
  continueGoalReads(runtime)
}

/** Start as many reads as the cap allows, then keep going as each one settles. */
export function continueGoalReads(runtime: { current: GoalReadRuntime }): void {
  const claimed = claimGoalReads(runtime.current.state, runtime.current.targets)
  runtime.current.state = claimed.state
  const startedRecovery = runtime.current.state.recovery
  for (const target of claimed.claimed) {
    const claimId = runtime.current.state.inflight.find(
      (claim) => claim.sessionId === target.sessionId && claim.generation === startedRecovery,
    )?.id
    if (claimId === undefined) continue
    const token = runtime.current.beginRead(target.sessionId)
    Promise.resolve()
      .then(() => runtime.current.fetchGoal(target))
      .then(
        (value) => finishGoalRead(runtime, target.sessionId, startedRecovery, claimId, true, value, token),
        () => finishGoalRead(runtime, target.sessionId, startedRecovery, claimId, false, null, token),
      )
  }
}

/** Run the read rules to idle. Tests use this with a fake client; the hook uses continueGoalReads. */
export function drainGoalReads(input: GoalReadRuntime): Promise<GoalLoadState> {
  const runtime = { current: input }
  continueGoalReads(runtime)
  return new Promise((resolve) => {
    const look = () => {
      if (inflightCount(runtime.current.state) > 0) {
        setTimeout(look, 0)
        return
      }
      resolve(runtime.current.state)
    }
    setTimeout(look, 0)
  })
}

/** Point session-removal cleanup at this loader's ledger so a delete drops an in-flight claim. */
export function attachSessionGoalReadClaims(runtime: { current: GoalReadRuntime } | null): void {
  registerSessionGoalReadClaimDrop(
    runtime
      ? (ids) => {
          let next = runtime.current.state
          for (const sessionId of ids) next = forgetLedgerSession(next, sessionId)
          runtime.current.state = next
        }
      : null,
  )
}

/**
 * Reads runtime goals for supervision rows. Mounted once, beside the rows publisher.
 * Every root row whose goal is not yet known is read once per recovery epoch, including idle rows.
 * Events own the value once they arrive; a route read applies only through beginRead/applyRead.
 */
export function useSessionGoalsLoader(): void {
  const rows = useSupervisionStore((state) => state.rows)
  const displayedSessionId = useSessionUIStore((state) => state.currentSessionId)
  const phase = useConnectionStore((state) => state.phase)
  const resyncEpoch = React.useSyncExternalStore(
    subscribeSessionGoalRecovery,
    sessionGoalRecoveryEpoch,
    sessionGoalRecoveryEpoch,
  )
  const childStores = useChildStoreManager()
  const runtimeRef = React.useRef<GoalReadRuntime>({
    state: createGoalLoadState(),
    targets: [],
    fetchGoal: (target) => fetchSessionGoal(target.sessionId, target.directory),
    beginRead: (sessionId) => useSessionGoalStore.getState().beginRead(sessionId),
    applyRead: (sessionId, goal, token) => useSessionGoalStore.getState().applyRead(sessionId, goal, token),
  })
  const phaseRef = React.useRef(phase)
  const resyncRef = React.useRef(resyncEpoch)
  // Registered on render, not in an effect: a delete in the same turn has to see this ledger.
  // Left in place after unmount so an in-flight read still loses its claim.
  attachSessionGoalReadClaims(runtimeRef)

  React.useEffect(() => {
    const runtime = runtimeRef.current
    const recovered = isReconnectRecovery(phaseRef.current, phase) || resyncEpoch !== resyncRef.current
    phaseRef.current = phase
    resyncRef.current = resyncEpoch
    const planned = planGoalReads({
      rows,
      displayedSessionId,
      known: useSessionGoalStore.getState().known,
      state: runtime.state,
      recovered,
    })
    runtime.state = planned.state
    runtime.targets = planned.targets
    clearKnownSessionGoals(planned.clearKnown)
    continueGoalReads(runtimeRef)
  }, [displayedSessionId, phase, resyncEpoch, rows])

  React.useEffect(() => {
    let previous = new Map<string, ReadonlySet<string>>()
    let ready = false
    const lists = new Map<string, readonly { id: string }[]>()
    const sync = () => {
      let changed = lists.size !== childStores.children.size
      for (const [directory, store] of childStores.children) {
        if (lists.get(directory) !== store.getState().session) changed = true
      }
      if (ready && !changed) return
      const next = collectDirectorySessionIndex(
        [...childStores.children.entries()].map(([directory, store]) => [directory, store.getState().session] as const),
      )
      lists.clear()
      for (const [directory, store] of childStores.children) lists.set(directory, store.getState().session)
      if (!ready) {
        previous = next
        ready = true
        return
      }
      const leaving = sessionIdsLeavingDirectoryStores(previous, next)
      previous = next
      for (const sessionId of leaving) {
        useSessionGoalStore.getState().remove(sessionId)
        runtimeRef.current.state = forgetLedgerSession(runtimeRef.current.state, sessionId)
      }
    }
    sync()
    return childStores.subscribeAll(sync)
  }, [childStores])
}
