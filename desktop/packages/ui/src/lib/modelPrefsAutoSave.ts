import { useUIStore } from "@/stores/useUIStore"
import { updateDesktopSettings } from "@/lib/persistence"
import { toast } from "@/components/ui"
import { useI18nStore, formatMessage } from "@/lib/i18n/store"

type ModelRef = { providerID: string; modelID: string }

const refsEqual = (a: ModelRef[], b: ModelRef[]): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.providerID !== b[i]?.providerID) return false
    if (a[i]?.modelID !== b[i]?.modelID) return false
  }
  return true
}

export const startModelPrefsAutoSave = () => {
  if (typeof window === "undefined") {
    return () => {}
  }

  let timer: number | null = null
  // Seeded with the values the app starts from, so only real changes are written.
  // Skipping the first *change* instead (the previous behaviour) also swallowed the
  // user's first favourite: hydration that leaves the store untouched (its values
  // already match) produces no change, so the user's first click became that first,
  // skipped change and never reached the server.
  const initialPrefs = useUIStore.getState()
  let lastSent: { favoriteModels: ModelRef[]; recentModels: ModelRef[] } | null = {
    favoriteModels: initialPrefs.favoriteModels.slice(),
    recentModels: initialPrefs.recentModels.slice(),
  }

  const flush = () => {
    timer = null
    const state = useUIStore.getState()
    const payload = { favoriteModels: state.favoriteModels, recentModels: state.recentModels }

    if (
      lastSent &&
      refsEqual(lastSent.favoriteModels, payload.favoriteModels) &&
      refsEqual(lastSent.recentModels, payload.recentModels)
    ) {
      return
    }

    const previousSent = lastSent
    const sent = {
      favoriteModels: payload.favoriteModels.slice(),
      recentModels: payload.recentModels.slice(),
    }
    // Marked before the request so a flush that runs while it is in flight does not
    // send the same list twice.
    lastSent = sent

    void updateDesktopSettings(payload).catch((error) => {
      // The write failed, so the server still holds `previousSent`. Recording `sent`
      // would make every later flush skip the value and lose the preference for good.
      if (lastSent === sent) {
        lastSent = previousSent
      }
      console.warn("Failed to auto-save model preferences:", error)
      toast.error(formatMessage(useI18nStore.getState().dictionary, "settings.toast.saveFailed"), {
        id: "model-prefs-auto-save-failed",
      })
    })
  }

  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(flush, 1200)
  }

  // A change made inside the debounce must still land when the window goes away.
  // persistence.ts flushes the changes it already holds on these same events, but a
  // payload still pending here never reached it.
  const flushPendingNow = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    flush()
  }
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushPendingNow()
    }
  }
  if (typeof document !== "undefined") {
    // "hidden" typically precedes termination, pagehide covers real unloads.
    document.addEventListener("visibilitychange", handleVisibilityChange)
  }
  window.addEventListener("pagehide", flushPendingNow)

  const unsubscribe = useUIStore.subscribe((state, prevState) => {
    const next = { favoriteModels: state.favoriteModels, recentModels: state.recentModels }
    const prev = { favoriteModels: prevState.favoriteModels, recentModels: prevState.recentModels }
    if (refsEqual(next.favoriteModels, prev.favoriteModels) && refsEqual(next.recentModels, prev.recentModels)) {
      return
    }
    schedule()
  })

  return () => {
    unsubscribe()
    window.removeEventListener("pagehide", flushPendingNow)
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
    if (timer !== null) {
      window.clearTimeout(timer)
    }
  }
}
