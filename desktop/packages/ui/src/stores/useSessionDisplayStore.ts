import { create } from "zustand"
import { persist } from "zustand/middleware"

type SessionDisplayMode = "default" | "minimal"

type SessionDisplayStore = {
  displayMode: SessionDisplayMode
  showRecentSection: boolean
  /** The docked "Scheduled" section is shown (and its tasks loaded). */
  showScheduledSection: boolean
  /** The "Scheduled" section shows only its header row. */
  scheduledSectionCollapsed: boolean
  /** Bumped by `revealScheduledSection` so the section can move focus to itself. Not persisted. */
  scheduledRevealRequest: number
  setDisplayMode: (mode: SessionDisplayMode) => void
  setShowRecentSection: (show: boolean) => void
  toggleRecentSection: () => void
  toggleScheduledSection: () => void
  setScheduledSectionCollapsed: (collapsed: boolean) => void
  /** Show the "Scheduled" section expanded (the sidebar's calendar button). */
  revealScheduledSection: () => void
}

export const useSessionDisplayStore = create<SessionDisplayStore>()(
  persist(
    (set) => ({
      displayMode: "default",
      showRecentSection: true,
      showScheduledSection: true,
      scheduledSectionCollapsed: false,
      scheduledRevealRequest: 0,
      setDisplayMode: (mode) => set({ displayMode: mode }),
      setShowRecentSection: (show) => set({ showRecentSection: show }),
      toggleRecentSection: () => set((state) => ({ showRecentSection: !state.showRecentSection })),
      toggleScheduledSection: () => set((state) => ({ showScheduledSection: !state.showScheduledSection })),
      setScheduledSectionCollapsed: (collapsed) => set({ scheduledSectionCollapsed: collapsed }),
      revealScheduledSection: () =>
        set((state) => ({
          showScheduledSection: true,
          scheduledSectionCollapsed: false,
          scheduledRevealRequest: state.scheduledRevealRequest + 1,
        })),
    }),
    {
      name: "session-display-mode",
      partialize: (state) => ({
        displayMode: state.displayMode,
        showRecentSection: state.showRecentSection,
        showScheduledSection: state.showScheduledSection,
        scheduledSectionCollapsed: state.scheduledSectionCollapsed,
      }),
    },
  ),
)
