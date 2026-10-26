import { create } from "zustand"
import { devtools } from "zustand/middleware"
import type { Snippet } from "@/types/snippet"
import { API_ENDPOINTS } from "@/lib/http"
import { createSingleFlight } from "@/lib/singleFlight"
import { getActiveConfigDirectory } from "@/stores/utils/configDirectory"
import { retainedPayloadSize } from "@/lib/retainedPayloadSize"
import { getDirectoryCacheKey } from "@/stores/utils/cacheKey"
import { setConfigCacheEntry } from "./utils/configCache"

export type SnippetScope = "global" | "project"

interface SnippetDraft {
  name: string
  scope: SnippetScope
  content?: string
  aliases?: string[]
  description?: string
}

interface SnippetsStore {
  snippets: Snippet[]
  isLoading: boolean
  selectedSnippetName: string | null
  snippetDraft: SnippetDraft | null

  setSelectedSnippet: (name: string | null) => void
  setSnippetDraft: (draft: SnippetDraft | null) => void
  loadSnippets: () => Promise<boolean>
  createSnippet: (
    name: string,
    content: string,
    options?: { aliases?: string[]; description?: string; scope?: SnippetScope },
  ) => Promise<boolean>
  updateSnippet: (
    name: string,
    updates: { content?: string; aliases?: string[]; description?: string },
  ) => Promise<boolean>
  deleteSnippet: (name: string) => Promise<boolean>
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
      selectedSnippetName: null,
      snippetDraft: null,

      setSelectedSnippet: (name) => set({ selectedSnippetName: name }),
      setSnippetDraft: (draft) => set({ snippetDraft: draft }),

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
              headers: { "Cache-Control": "no-cache", ...(directory ? { "x-ax-code-directory": directory } : {}) },
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

      createSnippet: async (name, content, options = {}) => {
        try {
          const directory = getRequestDirectory()
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
          const response = await fetch(
            `${API_ENDPOINTS.config.snippet.replace(":name", encodeURIComponent(name))}${queryParams}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(directory ? { "x-ax-code-directory": directory } : {}),
              },
              body: JSON.stringify({
                content,
                aliases: options.aliases,
                description: options.description,
                scope: options.scope,
              }),
            },
          )
          if (!response.ok) {
            const payload = await response.json().catch(() => null)
            if (response.status === 409) {
              return await get().updateSnippet(name, {
                content,
                aliases: options.aliases,
                description: options.description,
              })
            }
            throw new Error(payload?.error || "Failed to create snippet")
          }
          clearSnippetsDirectoryCache(directory)
          await get().loadSnippets()
          return true
        } catch (error) {
          console.error("[SnippetsStore] Failed to create:", error)
          return false
        }
      },

      updateSnippet: async (name, updates) => {
        try {
          const directory = getRequestDirectory()
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
          const response = await fetch(
            `${API_ENDPOINTS.config.snippet.replace(":name", encodeURIComponent(name))}${queryParams}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(directory ? { "x-ax-code-directory": directory } : {}),
              },
              body: JSON.stringify(updates),
            },
          )
          if (!response.ok)
            throw new Error((await response.json().catch(() => null))?.error || "Failed to update snippet")
          clearSnippetsDirectoryCache(directory)
          await get().loadSnippets()
          return true
        } catch (error) {
          console.error("[SnippetsStore] Failed to update:", error)
          return false
        }
      },

      deleteSnippet: async (name) => {
        try {
          const directory = getRequestDirectory()
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
          const response = await fetch(
            `${API_ENDPOINTS.config.snippet.replace(":name", encodeURIComponent(name))}${queryParams}`,
            {
              method: "DELETE",
              headers: directory ? { "x-ax-code-directory": directory } : undefined,
            },
          )
          if (!response.ok)
            throw new Error((await response.json().catch(() => null))?.error || "Failed to delete snippet")
          if (get().selectedSnippetName === name) set({ selectedSnippetName: null })
          clearSnippetsDirectoryCache(directory)
          await get().loadSnippets()
          return true
        } catch (error) {
          console.error("[SnippetsStore] Failed to delete:", error)
          return false
        }
      },

      expandText: async (text) => {
        if (!/#[a-z0-9_-]+/i.test(text)) return text
        const directory = getRequestDirectory()
        const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""
        const response = await fetch(`${API_ENDPOINTS.config.snippetExpand}${queryParams}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(directory ? { "x-ax-code-directory": directory } : {}) },
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
