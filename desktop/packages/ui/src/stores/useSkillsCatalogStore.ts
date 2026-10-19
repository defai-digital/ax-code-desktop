import { create } from "zustand"
import { devtools } from "zustand/middleware"

import type {
  SkillsCatalogResponse,
  SkillsCatalogSource,
  SkillsCatalogItem,
  SkillsRepoScanRequest,
  SkillsRepoScanResponse,
  SkillsInstallRequest,
  SkillsInstallResponse,
  SkillsInstallError,
  SkillsCatalogSourceResponse,
} from "@/lib/api/types"
import { API_ENDPOINTS } from "@/lib/http"

import { refreshSkillsAfterAxCodeRestart, useSkillsStore } from "@/stores/useSkillsStore"
import { getAxCodeCurrentDirectory } from "@/lib/ax-code/currentDirectory"
import { startConfigUpdate, finishConfigUpdate, updateConfigUpdateMessage } from "@/lib/configUpdate"
import { getDirectoryCacheKey } from "@/stores/utils/cacheKey"
import { createSingleFlight } from "@/lib/singleFlight"

export const FALLBACK_SOURCES: SkillsCatalogSource[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Anthropic's public skills repository",
    source: "anthropics/skills",
    defaultSubpath: "skills",
    sourceType: "github",
  },
  {
    id: "mattpocock",
    label: "Matt Pocock",
    description: "Practical engineering skills from Matt Pocock",
    source: "mattpocock/skills",
    sourceType: "github",
  },
  {
    id: "jeffallan",
    label: "Full-Stack Developer Skills",
    description: "Specialized full-stack engineering skills",
    source: "Jeffallan/claude-skills",
    sourceType: "github",
  },
  {
    id: "jezweb",
    label: "Jezweb Claude Skills",
    description: "Web development, Cloudflare, React, Tailwind, and AI integration skills",
    source: "jezweb/claude-skills",
    sourceType: "github",
  },
  {
    id: "engineering-workflows",
    label: "Engineering Workflow Skills",
    description: "Git, testing, review, and software engineering workflow skills",
    source: "mhattingpete/claude-skills-marketplace",
    sourceType: "github",
  },
  {
    id: "posit",
    label: "Posit",
    description: "Data science, documentation, and release workflow skills from Posit",
    source: "posit-dev/skills",
    sourceType: "github",
  },
  {
    id: "clawdhub",
    label: "ClawdHub",
    description: "Community skill registry with vector search",
    source: "clawdhub:registry",
    sourceType: "clawdhub",
  },
]

const SKILLS_CATALOG_LOAD_CACHE_TTL_MS = 5000
const skillsCatalogLastLoadedAt = new Map<string, number>()
const skillsCatalogLoadInFlight = createSingleFlight<boolean>()
// Latest loadSource call wins: an older in-flight response must not clear the
// loading flag (or raise an error) for a newer request.
let skillsCatalogLoadSourceSeq = 0
// Which project each source's items were fetched for. The cache used to be
// global, so project A's "installed" flags were shown in project B and the
// page skipped the load that would have corrected them.
const skillsCatalogSourceDirectories = new Map<string, string | null>()
// Latest loadCatalog call wins too: a forced refresh replaces the in-flight
// load instead of joining it, so without a sequence the displaced load could
// still write its stale snapshot (or restore its pre-refresh one) last.
let skillsCatalogLoadSeq = 0
// The load that currently owns the sequence id, per cache key. A cache hit for a
// directory whose own load is still the latest request must not advance the
// sequence: that load is this cache's refresh. A same-key load that another
// directory's newer load already superseded does not protect it.
const skillsCatalogLoadOwners = new Map<string, { token: symbol; requestId: number }>()

interface SkillsCatalogState {
  sources: SkillsCatalogSource[]
  itemsBySource: Record<string, SkillsCatalogItem[]>
  selectedSourceId: string | null
  pageInfoBySource: Record<string, { nextCursor?: string | null }>
  loadedSourceIds: Record<string, boolean>
  clawdhubHasMoreBySource: Record<string, boolean>

  isLoadingCatalog: boolean
  isLoadingSource: boolean
  isLoadingMore: boolean
  isScanning: boolean
  isInstalling: boolean

  lastCatalogError: SkillsCatalogResponse["error"] | null
  lastScanError: SkillsRepoScanResponse["error"] | null
  lastInstallError: SkillsInstallError | null

  scanResults: SkillsCatalogItem[] | null

  setSelectedSource: (id: string | null) => void

  /** Reports a catalog operation that failed outside a load, e.g. removing one from settings. */
  reportCatalogError: (message: string) => void

  loadCatalog: (options?: { refresh?: boolean }) => Promise<boolean>
  loadSource: (sourceId: string, options?: { refresh?: boolean }) => Promise<boolean>
  loadMoreClawdHub: () => Promise<boolean>
  scanRepo: (request: SkillsRepoScanRequest) => Promise<SkillsRepoScanResponse>
  installSkills: (
    request: SkillsInstallRequest,
    options?: { directory?: string | null },
  ) => Promise<SkillsInstallResponse>
}

export const useSkillsCatalogStore = create<SkillsCatalogState>()(
  devtools(
    (set, get) => ({
      sources: FALLBACK_SOURCES,
      itemsBySource: {},
      selectedSourceId: FALLBACK_SOURCES[0]?.id ?? null,
      pageInfoBySource: {},
      loadedSourceIds: {},
      clawdhubHasMoreBySource: {},

      isLoadingCatalog: false,
      isLoadingSource: false,
      isLoadingMore: false,
      isScanning: false,
      isInstalling: false,

      lastCatalogError: null,
      lastScanError: null,
      lastInstallError: null,

      scanResults: null,

      setSelectedSource: (id) => set({ selectedSourceId: id }),

      reportCatalogError: (message) =>
        set({ lastCatalogError: { kind: "unknown", message: message || "Catalog operation failed" } }),

      loadCatalog: async (options) => {
        const currentDirectory = getAxCodeCurrentDirectory()
        const cacheKey = getDirectoryCacheKey(currentDirectory)
        const now = Date.now()
        const loadedAt = skillsCatalogLastLoadedAt.get(cacheKey) ?? 0
        const hasCachedCatalog = get().sources.length > 0
        if (!options?.refresh && hasCachedCatalog && now - loadedAt < SKILLS_CATALOG_LOAD_CACHE_TTL_MS) {
          // A cache hit is the newest word for the store, but not for a directory
          // whose own load is still the latest request: refreshing this cache key
          // is the load that produces its next word, and clearing the flag or
          // moving the sequence here would discard its response. Loads for other
          // directories — even a same-key load already displaced by one — are
          // superseded by this hit.
          const owner = skillsCatalogLoadOwners.get(cacheKey)
          if (!owner || owner.requestId !== skillsCatalogLoadSeq) {
            skillsCatalogLoadSeq += 1
            set({ isLoadingCatalog: false })
          }
          return true
        }

        // A forced refresh replaces any in-flight load instead of joining it.
        if (options?.refresh) {
          skillsCatalogLoadInFlight.clear(cacheKey)
        }

        return skillsCatalogLoadInFlight.run(cacheKey, async () => {
          // The request id belongs to the call that owns the single-flight slot:
          // a duplicate call joins this promise without running this callback, so
          // it can no longer invalidate the load it is waiting on.
          const requestId = ++skillsCatalogLoadSeq
          const isCurrentLoad = () => skillsCatalogLoadSeq === requestId
          // Ownership is per cache key and only the callback that started the work
          // installs it, so a displaced load settling late cannot clear the owner of
          // the newer load that replaced it.
          const ownerToken = Symbol(cacheKey)
          skillsCatalogLoadOwners.set(cacheKey, { token: ownerToken, requestId })
          set({ isLoadingCatalog: true, lastCatalogError: null })

          const previous = {
            sources: get().sources,
            itemsBySource: get().itemsBySource,
            pageInfoBySource: get().pageInfoBySource,
            loadedSourceIds: get().loadedSourceIds,
            clawdhubHasMoreBySource: get().clawdhubHasMoreBySource,
          }

          let lastError: SkillsCatalogResponse["error"] | null = null

          try {
            const refresh = options?.refresh ? "?refresh=true" : ""
            const controller = new AbortController()
            const timeoutId = window.setTimeout(() => controller.abort(), 3000)

            try {
              const response = await fetch(`${API_ENDPOINTS.config.skillsCatalog}${refresh}`, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal: controller.signal,
              })

              const payload = (await response.json().catch(() => null)) as SkillsCatalogResponse | null
              if (!response.ok || !payload?.ok) {
                lastError = payload?.error || {
                  kind: "unknown",
                  message: `Failed to load catalog (${response.status})`,
                }
                throw new Error(lastError.message)
              }

              const sources = payload.sources && payload.sources.length > 0 ? payload.sources : previous.sources
              // A refresh drops the cache only for sources that disappeared: the
              // page does not re-run loadSource when the selected source id is
              // unchanged, so clearing it would show "0 skills found" until the
              // user switched sources.
              const sourceIds = new Set(sources.map((source) => source.id))
              const pruneRemovedSources = <T>(record: Record<string, T>): Record<string, T> =>
                options?.refresh
                  ? Object.fromEntries(Object.entries(record).filter(([sourceId]) => sourceIds.has(sourceId)))
                  : record
              const itemsBySource = pruneRemovedSources(get().itemsBySource || {})
              const pageInfoBySource = pruneRemovedSources(get().pageInfoBySource || {})
              const loadedSourceIds = pruneRemovedSources(get().loadedSourceIds || {})
              const clawdhubHasMoreBySource = pruneRemovedSources(get().clawdhubHasMoreBySource || {})
              const currentSelected = get().selectedSourceId
              const selectedSourceId =
                currentSelected && sources.some((s) => s.id === currentSelected)
                  ? currentSelected
                  : (sources[0]?.id ?? null)

              // A superseded load (a forced refresh replaced it) must not write
              // its stale snapshot last.
              if (!isCurrentLoad()) {
                return false
              }
              set({
                sources,
                itemsBySource,
                pageInfoBySource,
                loadedSourceIds,
                clawdhubHasMoreBySource,
                selectedSourceId,
              })

              skillsCatalogLastLoadedAt.set(cacheKey, Date.now())
              return true
            } finally {
              window.clearTimeout(timeoutId)
            }
          } catch (error) {
            lastError = lastError || {
              kind: "unknown",
              message: error instanceof Error ? error.message : String(error),
            }

            if (isCurrentLoad()) {
              set({
                sources: previous.sources,
                itemsBySource: previous.itemsBySource,
                pageInfoBySource: previous.pageInfoBySource,
                loadedSourceIds: previous.loadedSourceIds,
                clawdhubHasMoreBySource: previous.clawdhubHasMoreBySource,
                lastCatalogError: lastError || { kind: "unknown", message: "Failed to load catalog" },
              })
            }

            return false
          } finally {
            if (skillsCatalogLoadOwners.get(cacheKey)?.token === ownerToken) {
              skillsCatalogLoadOwners.delete(cacheKey)
            }
            if (isCurrentLoad()) {
              set({ isLoadingCatalog: false })
            }
          }
        })
      },

      loadSource: async (sourceId, options) => {
        if (!sourceId) {
          return false
        }

        const directoryForRequest = getAxCodeCurrentDirectory() ?? null
        const alreadyLoadedForDirectory =
          get().loadedSourceIds[sourceId] === true &&
          skillsCatalogSourceDirectories.get(sourceId) === directoryForRequest
        if (!options?.refresh && alreadyLoadedForDirectory) {
          return true
        }

        const requestId = ++skillsCatalogLoadSourceSeq
        const isCurrentRequest = () => skillsCatalogLoadSourceSeq === requestId
        set({ isLoadingSource: true, lastCatalogError: null })

        try {
          const currentDirectory = getAxCodeCurrentDirectory()
          const refresh = options?.refresh ? "&refresh=true" : ""
          const queryParams = currentDirectory
            ? `?directory=${encodeURIComponent(currentDirectory)}&sourceId=${encodeURIComponent(sourceId)}${refresh}`
            : `?sourceId=${encodeURIComponent(sourceId)}${refresh}`

          const response = await fetch(`${API_ENDPOINTS.config.skillsCatalogSource}${queryParams}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          })

          const payload = (await response.json().catch(() => null)) as SkillsCatalogSourceResponse | null
          const hasItems = Array.isArray((payload as SkillsCatalogSourceResponse | null)?.items)
          if (!response.ok || (!payload?.ok && !hasItems)) {
            const fallback = await fetch(`${API_ENDPOINTS.config.skillsCatalog}${queryParams}`, {
              method: "GET",
              headers: { Accept: "application/json" },
            })
            const fallbackPayload = (await fallback.json().catch(() => null)) as SkillsCatalogResponse | null
            const fallbackItems = fallbackPayload?.itemsBySource?.[sourceId]
            if (fallback.ok && fallbackPayload?.ok && Array.isArray(fallbackItems)) {
              if (!isCurrentRequest()) {
                return false
              }
              set((state) => ({
                itemsBySource: { ...state.itemsBySource, [sourceId]: fallbackItems },
                pageInfoBySource: { ...state.pageInfoBySource, [sourceId]: { nextCursor: null } },
                loadedSourceIds: { ...state.loadedSourceIds, [sourceId]: true },
                clawdhubHasMoreBySource: { ...state.clawdhubHasMoreBySource, [sourceId]: false },
              }))
              skillsCatalogSourceDirectories.set(sourceId, directoryForRequest)
              return true
            }

            // A superseded request must not raise the global error banner for a
            // source the user has already moved away from.
            if (!isCurrentRequest()) {
              return false
            }
            set({
              lastCatalogError: payload?.error || {
                kind: "unknown",
                message: `Failed to load source (${response.status})`,
              },
            })
            return false
          }

          const items = payload?.items || []
          const nextCursor = payload?.nextCursor ?? null

          // Latest call wins for the page too, not only for the error and the loading flag: two
          // overlapping loads for one source let the older answer land last and replace it.
          if (!isCurrentRequest()) {
            return false
          }

          set((state) => ({
            itemsBySource: { ...state.itemsBySource, [sourceId]: items },
            pageInfoBySource: { ...state.pageInfoBySource, [sourceId]: { nextCursor } },
            loadedSourceIds: { ...state.loadedSourceIds, [sourceId]: true },
            clawdhubHasMoreBySource: {
              ...state.clawdhubHasMoreBySource,
              [sourceId]: Boolean(nextCursor),
            },
          }))
          skillsCatalogSourceDirectories.set(sourceId, directoryForRequest)

          return true
        } catch (error) {
          if (isCurrentRequest()) {
            set({
              lastCatalogError: { kind: "unknown", message: error instanceof Error ? error.message : String(error) },
            })
          }
          return false
        } finally {
          if (isCurrentRequest()) {
            set({ isLoadingSource: false })
          }
        }
      },

      loadMoreClawdHub: async () => {
        const selectedSourceId = get().selectedSourceId
        if (!selectedSourceId) {
          return false
        }

        const pageInfo = get().pageInfoBySource[selectedSourceId]
        const cursor = pageInfo?.nextCursor || null

        set({ isLoadingMore: true })
        try {
          const currentDirectory = getAxCodeCurrentDirectory()
          const parts = [`sourceId=${encodeURIComponent(selectedSourceId)}`]
          if (currentDirectory) {
            parts.push(`directory=${encodeURIComponent(currentDirectory)}`)
          }
          if (cursor) {
            parts.push(`cursor=${encodeURIComponent(cursor)}`)
          }
          const queryParams = `?${parts.join("&")}`

          const response = await fetch(`${API_ENDPOINTS.config.skillsCatalogSource}${queryParams}`, {
            method: "GET",
            headers: { Accept: "application/json" },
          })

          const payload = (await response.json().catch(() => null)) as SkillsCatalogSourceResponse | null
          if (!response.ok || !payload?.ok) {
            return false
          }

          const nextCursor = payload.nextCursor ?? null
          const currentItems = get().itemsBySource[selectedSourceId] || []
          const items = payload.items || []
          const merged = new Map(currentItems.map((item) => [`${item.sourceId}:${item.skillDir}`, item]))

          for (const item of items) {
            const key = `${item.sourceId}:${item.skillDir}`
            merged.set(key, item)
          }

          const noMore = !nextCursor

          set((state) => ({
            itemsBySource: {
              ...state.itemsBySource,
              [selectedSourceId]: Array.from(merged.values()),
            },
            pageInfoBySource: {
              ...state.pageInfoBySource,
              [selectedSourceId]: { nextCursor },
            },
            clawdhubHasMoreBySource: {
              ...state.clawdhubHasMoreBySource,
              [selectedSourceId]: !noMore,
            },
          }))

          return true
        } catch {
          return false
        } finally {
          set({ isLoadingMore: false })
        }
      },

      scanRepo: async (request) => {
        set({ isScanning: true, lastScanError: null, scanResults: null })
        try {
          const currentDirectory = getAxCodeCurrentDirectory()
          const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : ""

          const response = await fetch(`${API_ENDPOINTS.config.skillsCatalogScan}${queryParams}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(request),
          })

          const payload = (await response.json().catch(() => null)) as SkillsRepoScanResponse | null
          if (!response.ok || !payload) {
            const error = payload?.error || { kind: "unknown", message: "Failed to scan repository" }
            set({ lastScanError: error })
            return { ok: false, error }
          }

          if (!payload.ok) {
            set({ lastScanError: payload.error || { kind: "unknown", message: "Failed to scan repository" } })
            return payload
          }

          set({ scanResults: payload.items || [] })
          return payload
        } finally {
          set({ isScanning: false })
        }
      },

      installSkills: async (request, options) => {
        startConfigUpdate("Installing skills…")
        set({ isInstalling: true, lastInstallError: null })
        let requiresReload = false
        try {
          const directoryOverride =
            typeof options?.directory === "string" && options.directory.trim().length > 0
              ? options.directory.trim()
              : null
          const currentDirectory = directoryOverride ?? getAxCodeCurrentDirectory()
          const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : ""

          const response = await fetch(`${API_ENDPOINTS.config.skillsCatalogInstall}${queryParams}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(request),
          })

          const payload = (await response.json().catch(() => null)) as SkillsInstallResponse | null
          if (!payload) {
            const error = { kind: "unknown", message: "Failed to install skills" } as SkillsInstallError
            set({ lastInstallError: error })
            updateConfigUpdateMessage("Failed to install skills. Please retry.")
            return { ok: false, error }
          }

          if (!response.ok || !payload.ok) {
            const error =
              payload.error || ({ kind: "unknown", message: "Failed to install skills" } as SkillsInstallError)
            set({ lastInstallError: error })
            updateConfigUpdateMessage(error.message || "Failed to install skills. Please retry.")
            return { ok: false, error }
          }

          if (payload.requiresReload) {
            requiresReload = true
            await refreshSkillsAfterAxCodeRestart({
              message: payload.message,
              delayMs: payload.reloadDelayMs,
            })
          } else {
            updateConfigUpdateMessage(payload.message || "Refreshing skills…")
            void useSkillsStore.getState().loadSkills()
          }

          return payload
        } catch (error) {
          const err = {
            kind: "unknown",
            message: error instanceof Error ? error.message : String(error),
          } as SkillsInstallError
          set({ lastInstallError: err })
          updateConfigUpdateMessage("Failed to install skills. Please retry.")
          return { ok: false, error: err }
        } finally {
          set({ isInstalling: false })
          if (!requiresReload) {
            finishConfigUpdate()
          }
        }
      },
    }),
    { name: "skills-catalog-store" },
  ),
)
