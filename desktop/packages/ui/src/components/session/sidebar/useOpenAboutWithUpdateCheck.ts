import React from "react"

import { useUpdateStore } from "@/stores/useUpdateStore"

/**
 * Opening About from the sidebar brand button also refreshes the update state in the background,
 * so a user who goes looking at the version sees the sidebar Update button without a menu round trip.
 */
export function useOpenAboutWithUpdateCheck(openAbout: () => void): () => void {
  return React.useCallback(() => {
    openAbout()
    // Best effort: a failed refresh must never get in the way of opening About.
    void useUpdateStore
      .getState()
      .checkForUpdatesIfStale()
      .catch(() => {})
  }, [openAbout])
}
