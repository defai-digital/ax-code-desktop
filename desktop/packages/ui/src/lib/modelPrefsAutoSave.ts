import { useUIStore } from "@/stores/useUIStore"
import { updateDesktopSettings } from "@/lib/persistence"

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

    lastSent = {
      favoriteModels: payload.favoriteModels.slice(),
      recentModels: payload.recentModels.slice(),
    }

    void updateDesktopSettings(payload).catch(() => {})
  }

  const schedule = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(flush, 1200)
  }

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
    if (timer !== null) {
      window.clearTimeout(timer)
    }
  }
}
