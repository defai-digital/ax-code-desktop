import { Ghostty } from "ghostty-web"

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
    ghosttyPromise = Ghostty.load().catch((error) => {
      ghosttyPromise = null
      throw error
    })
  }
  return ghosttyPromise
}
