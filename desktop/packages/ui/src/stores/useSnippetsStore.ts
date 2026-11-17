import { create } from "zustand"
import { devtools } from "zustand/middleware"
import type { Snippet } from "@/types/snippet"
import { encodeDirectoryHeader } from "@/lib/directoryHeader"
import { API_ENDPOINTS } from "@/lib/http"
import { createSingleFlight } from "@/lib/singleFlight"
import { getActiveConfigDirectory } from "@/stores/utils/configDirectory"
import { retainedPayloadSize } from "@/lib/retainedPayloadSize"
import { getDirectoryCacheKey } from "@/stores/utils/cacheKey"
import { setConfigCacheEntry } from "./utils/configCache"

interface SnippetsStore {
  snippets: Snippet[]
  isLoading: boolean
  loadSnippets: () => Promise<boolean>
  expandText: (text: string) => Promise<string>
  getSnippetByName: (name: string) => Snippet | undefined
}

const SNIPPETS_LOAD_CACHE_TTL_MS = 5000
type SnippetsSnapshot = { snippets: Snippet[]; loadedAt: number; bytes: number }
const snippetsByCacheKey = new Map<string, SnippetsSnapshot>()
const SNIPPETS_CACHE_MAX_BYTES = 20 * 1024 * 1024
const snippetsLoadInFlight = createSingleFlight<boolean>()
const snippetsLoadOwners = new Map<string, object>()
let activeSnippetsCacheKey = getDirectoryCacheKey(null)

export const clearSnippetsDirectoryCache = (directory: string | null): void => {
  const cacheKey = getDirectoryCacheKey(directory)
  snippetsByCacheKey.delete(cacheKey)
  snippetsLoadInFlight.clear(cacheKey)
  snippetsLoadOwners.delete(cacheKey)
  if (activeSnippetsCacheKey === cacheKey) {
    useSnippetsStore.setState({ snippets: [], isLoading: false })
  }
}

const getRequestDirectory = (): string | null => getActiveConfigDirectory("SnippetsStore")

export const useSnippetsStore = create<SnippetsStore>()(
  devtools(
    (set, get) => ({
      snippets: [],
      isLoading: false,
      loadSnippets: async () => {
        const directory = getRequestDirectory()
        const cacheKey = getDirectoryCacheKey(directory)
        const cached = snippetsByCacheKey.get(cacheKey)
        const cachedSnippets = cached?.snippets
        activeSnippetsCacheKey = cacheKey

        const now = Date.now()
        const loadedAt = cached?.loadedAt ?? 0
        if (cachedSnippets && now - loadedAt < SNIPPETS_LOAD_CACHE_TTL_MS) {
          set({ snippets: cachedSnippets, isLoading: false })
          return true
        }

        // A project switch can join an older read; publish this project's list before
        // joining, because the single-flight callback only runs for its first caller.
        set({ isLoading: true, snippets: cachedSnippets ?? [] })
        return snippetsLoadInFlight.run(cacheKey, async () => {
          const owner = {}
          snippetsLoadOwners.set(cacheKey, owner)
          try {
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
            const response = await fetch(`${API_ENDPOINTS.config.snippets}${queryParams}`, {
              headers: {
                "Cache-Control": "no-cache",
                ...(directory ? { "x-ax-code-directory": encodeDirectoryHeader(directory) } : {}),
              },
            })
            if (!response.ok) throw new Error("Failed to load snippets")
            const snippets: Snippet[] = await response.json()
            if (snippetsLoadOwners.get(cacheKey) !== owner) {
              return false
            }
            const snapshot: SnippetsSnapshot = {
              snippets, loadedAt: Date.now(), bytes: retainedPayloadSize(snippets),
            }
            if (snapshot.bytes > SNIPPETS_CACHE_MAX_BYTES) {
              // This payload cannot be cached. Keep other projects' fresh snapshots
              // instead of flushing them before eventually evicting this one too.
              snippetsByCacheKey.delete(cacheKey)
            } else {
              setConfigCacheEntry(snippetsByCacheKey, cacheKey, snapshot)
              let bytes = [...snippetsByCacheKey.values()].reduce((sum, item) => sum + item.bytes, 0)
              for (const [key, cached] of snippetsByCacheKey) {
                if (bytes <= SNIPPETS_CACHE_MAX_BYTES) break
                snippetsByCacheKey.delete(key)
                bytes -= cached.bytes
              }
            }
            if (activeSnippetsCacheKey === cacheKey) {
              set({ snippets, isLoading: false })
            }
            return true
          } catch (error) {
            if (snippetsLoadOwners.get(cacheKey) !== owner) return false
            console.error("[SnippetsStore] Failed to load:", error)
            if (activeSnippetsCacheKey === cacheKey) {
              set({ snippets: cachedSnippets ?? [], isLoading: false })
            }
            return false
          } finally {
            if (snippetsLoadOwners.get(cacheKey) === owner) snippetsLoadOwners.delete(cacheKey)
          }
        })
      },

      expandText: async (text) => {
        if (!/#[a-z0-9_-]+/i.test(text)) return text
        const directory = getRequestDirectory()
        const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
        const response = await fetch(`${API_ENDPOINTS.config.snippetExpand}${queryParams}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(directory ? { "x-ax-code-directory": encodeDirectoryHeader(directory) } : {}),
          },
          body: JSON.stringify({ text }),
        })
        if (!response.ok)
          throw new Error((await response.json().catch(() => null))?.error || "Failed to expand snippets")
        return (await response.json()).text ?? text
      },

      getSnippetByName: (name) =>
        get().snippets.find((snippet) => snippet.name === name || snippet.aliases.includes(name)),
    }),
    { name: "snippets-store" },
  ),
)
