import { importWithChunkRecovery } from "@/lib/chunkLoadRecovery"

// The Markdown renderer is a lazy chunk (MarkdownRenderer.tsx). On first use React.lazy
// suspends, and React 19 throttles revealing suspended content to 300 ms after the last
// fallback. The packaged renderer trace (markdown-trace-webmcp.mjs) measured the first
// assistant text after launch at about 330 ms to appear, against about 20 ms afterwards,
// even with the chunk already cached.
//
// Preloading at idle time and remembering the loaded module lets the lazy factory return a
// synchronously resolving thenable, which React.lazy accepts without suspending, so the first
// render skips both the load and the reveal throttle.

type MarkdownRendererModule = typeof import("./MarkdownRendererImpl")
type MarkdownRendererExport = "MarkdownRenderer" | "SimpleMarkdownRenderer"

let loadedModule: MarkdownRendererModule | null = null
let pendingModule: Promise<MarkdownRendererModule> | null = null

export function loadMarkdownRendererModule(): Promise<MarkdownRendererModule> {
  if (!pendingModule) {
    pendingModule = importWithChunkRecovery(() => import("./MarkdownRendererImpl")).then(
      (module) => {
        loadedModule = module
        return module
      },
      (error: unknown) => {
        // A failed load must not stick; the next render or warm-up retries.
        pendingModule = null
        throw error
      },
    )
  }
  return pendingModule
}

export function preloadMarkdownRenderer(): void {
  loadMarkdownRendererModule().catch(() => {
    // The render path reports load failures through chunk recovery.
  })
}

/** React.lazy factory for one renderer export; resolves synchronously once the module is loaded. */
export function markdownRendererFactory<K extends MarkdownRendererExport>(
  name: K,
): () => Promise<{ default: MarkdownRendererModule[K] }> {
  return () => {
    const module = loadedModule
    if (module) {
      const resolved = { default: module[name] }
      // React.lazy reads the result inside then(); calling back synchronously resolves the
      // lazy component in the same render instead of suspending.
      const thenable: PromiseLike<typeof resolved> = {
        then: (onFulfilled) => Promise.resolve(onFulfilled ? onFulfilled(resolved) : resolved) as never,
      }
      return thenable as Promise<typeof resolved>
    }
    return loadMarkdownRendererModule().then((loaded) => ({ default: loaded[name] }))
  }
}
