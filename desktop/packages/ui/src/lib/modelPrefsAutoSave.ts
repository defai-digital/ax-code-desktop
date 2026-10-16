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
  // The list the server is known to hold: seeded with the values the app started from, and
  // advanced only when a write succeeds. Marking a payload before the request instead, and
  // rolling that mark back on failure, lost a change whenever two flushes overlapped: the
  // second rollback restored the first one's payload, which the server had never received, and
  // every later flush then saw the store equal to it and sent nothing.
  let lastSent: { favoriteModels: ModelRef[]; recentModels: ModelRef[] } | null = {
    favoriteModels: initialPrefs.favoriteModels.slice(),
    recentModels: initialPrefs.recentModels.slice(),
  }
  // The payload currently on the wire, so a flush that lands while it is in flight does not
  // send the same list twice without pretending the write already succeeded.
  let inFlight: { favoriteModels: ModelRef[]; recentModels: ModelRef[] } | null = null

  const samePrefs = (
    a: { favoriteModels: ModelRef[]; recentModels: ModelRef[] } | null,
    b: { favoriteModels: ModelRef[]; recentModels: ModelRef[] },
  ): boolean =>
    Boolean(a && refsEqual(a.favoriteModels, b.favoriteModels) && refsEqual(a.recentModels, b.recentModels))

  const flush = () => {
    timer = null
    const state = useUIStore.getState()
    const payload = { favoriteModels: state.favoriteModels, recentModels: state.recentModels }

    if (samePrefs(lastSent, payload) || samePrefs(inFlight, payload)) {
      return
    }

    const sent = {
      favoriteModels: payload.favoriteModels.slice(),
      recentModels: payload.recentModels.slice(),
    }
    inFlight = sent

    void updateDesktopSettings(payload).then(
      () => {
        lastSent = sent
        if (inFlight === sent) {
          inFlight = null
        }
      },
      (error) => {
        // The write failed, so the server still holds `lastSent`. Releasing the mark lets a
        // later flush try again with the same list.
        if (inFlight === sent) {
          inFlight = null
        }
        console.warn("Failed to auto-save model preferences:", error)
        toast.error(formatMessage(useI18nStore.getState().dictionary, "settings.toast.saveFailed"), {
          id: "model-prefs-auto-save-failed",
        })
      },
    )
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
