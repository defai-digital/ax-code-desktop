import { create, type StoreApi } from "zustand"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import type { DirState, State } from "./types"
import { INITIAL_STATE, MAX_DIR_STORES, DIR_IDLE_TTL_MS } from "./types"
import { pickDirectoriesToEvict, canDisposeDirectory, hasPendingBlockingRequests } from "./eviction"
import { getProtectedSessionCacheIds } from "./session-cache"
import { SessionRetention, SESSION_RETENTION_SWEEP_MS, type RetentionStats } from "./session-retention"
import { clearDirectorySessionLoadState, clearSessionLoadState, getPendingSessionLoadIds } from "./session-load-cache"
import { readDirCache, persistVcs, persistProjectMeta, persistIcon } from "./persist-cache"

export type DirectoryStore = State & {
  /** Apply a partial state update */
  patch: (partial: Partial<State>) => void
  /** Replace state wholesale (used during bootstrap) */
  replace: (next: State) => void
}

function createDirectoryStore(directory: string): StoreApi<DirectoryStore> {
  // Restore cached metadata from localStorage
  const cached = readDirCache(directory)

  const store = create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    vcs: cached.vcs ?? INITIAL_STATE.vcs,
    projectMeta: cached.projectMeta ?? INITIAL_STATE.projectMeta,
    icon: cached.icon ?? INITIAL_STATE.icon,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
  }))

  // Subscribe to persist metadata changes back to localStorage
  store.subscribe((state, prev) => {
    if (state.vcs !== prev.vcs) persistVcs(directory, state.vcs)
    if (state.projectMeta !== prev.projectMeta) persistProjectMeta(directory, state.projectMeta)
    if (state.icon !== prev.icon) persistIcon(directory, state.icon)
  })

  return store
}

export class ChildStoreManager {
  readonly children = new Map<string, StoreApi<DirectoryStore>>()
  private readonly lifecycle = new Map<string, DirState>()
  private readonly pins = new Map<string, number>()
  private readonly disposers = new Map<string, () => void>()
  private readonly registrySubscribers = new Set<() => void>()

  private readonly retention = new Map<string, SessionRetention>()
  private retentionTimer: ReturnType<typeof setTimeout> | undefined
  private sweeping = false
  private getViewedSessions?: (directory: string) => ReadonlySet<string>
  private onContentInvalidated?: (directory: string, sessions: string[]) => void

  private onBootstrap?: (directory: string) => void
  private onDispose?: (directory: string) => void
  private isBooting?: (directory: string) => boolean
  private isLoadingSessions?: (directory: string) => boolean

  private directoryKey(directory: string): string {
    if (this.children.has(directory)) return directory
    const identity = getProjectPathIdentityKey(directory)
    for (const key of this.children.keys()) {
      if (getProjectPathIdentityKey(key) === identity) return key
    }
    return directory
  }

  private notifyRegistrySubscribers() {
    for (const subscriber of this.registrySubscribers) {
      subscriber()
    }
  }

  configure(callbacks: {
    getViewedSessions?: (directory: string) => ReadonlySet<string>
    onContentInvalidated?: (directory: string, sessions: string[]) => void
    onBootstrap?: (directory: string) => void
    onDispose?: (directory: string) => void
    isBooting?: (directory: string) => boolean
    isLoadingSessions?: (directory: string) => boolean
  }) {
    this.getViewedSessions = callbacks.getViewedSessions
    this.onContentInvalidated = callbacks.onContentInvalidated
    this.onBootstrap = callbacks.onBootstrap
    this.onDispose = callbacks.onDispose
    this.isBooting = callbacks.isBooting
    this.isLoadingSessions = callbacks.isLoadingSessions
  }

  mark(directory: string) {
    if (!directory) return
    directory = this.directoryKey(directory)
    this.lifecycle.set(directory, { lastAccessAt: Date.now() })
    this.runEviction(directory)
  }

  pin(directory: string) {
    if (!directory) return
    directory = getProjectPathIdentityKey(directory) ?? directory
    this.pins.set(directory, (this.pins.get(directory) ?? 0) + 1)
    this.mark(directory)
  }

  unpin(directory: string) {
    if (!directory) return
    directory = getProjectPathIdentityKey(directory) ?? directory
    const next = (this.pins.get(directory) ?? 0) - 1
    if (next > 0) {
      this.pins.set(directory, next)
      return
    }
    this.pins.delete(directory)
    this.runEviction()
  }

  pinned(directory: string) {
    directory = getProjectPathIdentityKey(directory) ?? directory
    return (this.pins.get(directory) ?? 0) > 0
  }

  ensureChild(directory: string, options?: { bootstrap?: boolean }): StoreApi<DirectoryStore> {
    if (!directory) throw new Error("No directory provided to ensureChild")

    // Keep the first display spelling, but never fork Windows state by path casing.
    directory = this.directoryKey(directory)
    let store = this.children.get(directory)
    if (!store) {
      store = createDirectoryStore(directory)
      this.children.set(directory, store)
      this.retention.set(directory, new SessionRetention())
      this.disposers.set(directory, store.subscribe((state, previous) => {
        if (this.sweeping) return
        if (state.message !== previous.message || state.part !== previous.part ||
          state.session_status !== previous.session_status || state.session_diff !== previous.session_diff ||
          state.permission !== previous.permission || state.question !== previous.question || state.todo !== previous.todo) {
          this.scheduleRetention()
        }
      }))
      this.notifyRegistrySubscribers()
    }

    this.mark(directory)

    const shouldBootstrap = options?.bootstrap ?? true
    if (shouldBootstrap && store.getState().status === "loading") {
      this.onBootstrap?.(directory)
    }

    return store
  }

  getChild(directory: string): StoreApi<DirectoryStore> | undefined {
    return this.children.get(this.directoryKey(directory))
  }

  disposeDirectory(directory: string): boolean {
    directory = this.directoryKey(directory)
    if (
      !canDisposeDirectory({
        directory,
        hasStore: this.children.has(directory),
        pinned: this.pinned(directory),
        booting: this.isBooting?.(directory) ?? false,
        loadingSessions: (this.isLoadingSessions?.(directory) ?? false) || getPendingSessionLoadIds(directory).size > 0,
        hasPendingBlockingRequests: this.hasProtectedContentForDirectory(directory),
      })
    ) {
      return false
    }

    clearDirectorySessionLoadState(directory)
    this.retention.delete(directory)
    this.lifecycle.delete(directory)
    this.children.delete(directory)
    this.notifyRegistrySubscribers()
    const dispose = this.disposers.get(directory)
    if (dispose) {
      dispose()
      this.disposers.delete(directory)
    }
    this.onDispose?.(directory)
    if (this.children.size === 0 && this.retentionTimer !== undefined) {
      clearTimeout(this.retentionTimer)
      this.retentionTimer = undefined
    }
    return true
  }

  private scheduleRetention() {
    if (this.retentionTimer !== undefined) return
    this.retentionTimer = setTimeout(() => {
      this.retentionTimer = undefined
      this.sweepRetention()
    }, SESSION_RETENTION_SWEEP_MS)
  }

  touchSession(directory: string, sessionID: string) {
    this.retention.get(this.directoryKey(directory))?.touch(sessionID)
    this.scheduleRetention()
  }

  sweepRetention(now = Date.now()) {
    this.sweeping = true
    try {
      for (const [directory, store] of this.children) {
        const keep = getPendingSessionLoadIds(directory)
        for (const id of this.getViewedSessions?.(directory) ?? []) keep.add(id)
        const result = this.retention.get(directory)?.sweep(store.getState(), keep, now)
        if (!result?.patch) continue
        clearSessionLoadState(directory, result.invalidated)
        store.setState(result.patch)
        this.onContentInvalidated?.(directory, result.invalidated)
      }
    } finally {
      this.sweeping = false
    }
  }

  getRetentionStats(): RetentionStats {
    const total: RetentionStats = {
      sessions: 0, messages: 0, partMessages: 0, estimatedBytes: 0, protectedSessions: 0,
      evictedSessions: 0, trimmedMessages: 0,
    }
    for (const retention of this.retention.values()) {
      for (const key of Object.keys(total) as Array<keyof RetentionStats>) total[key] += retention.stats[key]
    }
    return total
  }

  runEviction(skip?: string) {
    const stores = [...this.children.keys()]
    if (stores.length === 0) return
    const list = pickDirectoriesToEvict({
      stores,
      state: this.lifecycle,
      pins: new Set(stores.filter((d) => this.pinned(d))),
      max: MAX_DIR_STORES,
      ttl: DIR_IDLE_TTL_MS,
      now: Date.now(),
      hasPendingBlockingRequests: (dir) => this.hasProtectedContentForDirectory(dir),
    }).filter((d) => d !== skip)
    for (const directory of list) {
      this.disposeDirectory(directory)
    }
  }

  private hasProtectedContentForDirectory(directory: string): boolean {
    const state = this.getState(directory)
    return (state !== undefined && getProtectedSessionCacheIds(state).size > 0) || getPendingSessionLoadIds(directory).size > 0
  }

  hasPendingBlockingRequestsForDirectory(directory: string): boolean {
    return hasPendingBlockingRequests(this.getChild(directory)?.getState())
  }

  /** Apply a state mutation to a directory's store */
  update(directory: string, fn: (state: State) => Partial<State>) {
    const store = this.getChild(directory)
    if (!store) return
    const current = store.getState()
    const patch = fn(current)
    store.setState(patch)
  }

  /** Get current state of a directory store (snapshot) */
  getState(directory: string): State | undefined {
    return this.getChild(directory)?.getState()
  }

  disposeAll() {
    if (this.retentionTimer !== undefined) clearTimeout(this.retentionTimer)
    this.retentionTimer = undefined
    for (const dispose of this.disposers.values()) dispose()
    for (const directory of this.children.keys()) {
      clearDirectorySessionLoadState(directory)
      this.onDispose?.(directory)
    }
    this.retention.clear()
    for (const directory of [...this.children.keys()]) {
      this.children.delete(directory)
    }
    this.notifyRegistrySubscribers()
    this.lifecycle.clear()
    this.pins.clear()
    this.disposers.clear()
  }

  subscribeRegistry(listener: () => void): () => void {
    this.registrySubscribers.add(listener)
    return () => {
      this.registrySubscribers.delete(listener)
    }
  }

  subscribeAll(listener: () => void): () => void {
    const storeUnsubscribers = new Map<string, () => void>()

    const syncStoreSubscriptions = () => {
      const activeDirectories = new Set(this.children.keys())

      for (const [directory, unsubscribe] of storeUnsubscribers.entries()) {
        if (activeDirectories.has(directory)) {
          continue
        }
        unsubscribe()
        storeUnsubscribers.delete(directory)
      }

      for (const [directory, store] of this.children.entries()) {
        if (storeUnsubscribers.has(directory)) {
          continue
        }
        storeUnsubscribers.set(directory, store.subscribe(listener))
      }
    }

    syncStoreSubscriptions()
    const unsubscribeRegistry = this.subscribeRegistry(() => {
      syncStoreSubscriptions()
      listener()
    })

    return () => {
      unsubscribeRegistry()
      for (const unsubscribe of storeUnsubscribers.values()) {
        unsubscribe()
      }
      storeUnsubscribers.clear()
    }
  }
}
