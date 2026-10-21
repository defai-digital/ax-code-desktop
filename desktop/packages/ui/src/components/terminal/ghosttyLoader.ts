import { Ghostty } from "ghostty-web"
// The library's default first tries an inline data: URL, which the renderer CSP's connect-src blocks. Loading the bundled
// file from the app's own origin avoids that blocked request and the guessed fallback paths.
import ghosttyWasmUrl from "ghostty-web/ghostty-vt.wasm?url"

let ghosttyPromise: Promise<Ghostty> | null = null

/**
 * The loaded Ghostty runtime, shared by every terminal viewport.
 *
 * A rejected load is deliberately not cached. The runtime is fetched from an asset URL once
 * per app run, and caching the rejection made every terminal opened after a single transient
 * fetch failure fail with that same error until the process restarted - "Hard Restart" only
 * reloads the view, so it could not recover either.
 */
export function getGhostty(): Promise<Ghostty> {
  if (!ghosttyPromise) {
    ghosttyPromise = Ghostty.load(ghosttyWasmUrl).catch((error) => {
      ghosttyPromise = null
      throw error
    })
  }
  return ghosttyPromise
}
