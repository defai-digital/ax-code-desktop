import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn(async () => null) }))

vi.mock("@/contexts/runtimeAPIRegistry", () => ({
  getRegisteredRuntimeAPIs: () => ({
    settings: {
      load: vi.fn(async () => null),
      save: saveMock,
    },
  }),
}))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/i18n/store", () => ({ useI18nStore: { getState: () => ({ dictionary: {} }) }, formatMessage: () => "" }))

// No mock of `@/lib/persistence` here: the point is the interaction between the two modules' unload listeners,
// which the unit test beside this one cannot see because it replaces persistence with a spy.
let useUIStore: typeof import("@/stores/useUIStore").useUIStore

describe("appearance autosave with the real persistence module", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    saveMock.mockClear()
    ;({ useUIStore } = await import("@/stores/useUIStore"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("a change made inside the debounce still reaches the settings API on pagehide", async () => {
    // persistence registers its unload flush while it loads, which `appearanceAutoSave` triggers by importing it:
    // its listener runs first, so the payload this module handed over afterwards sat behind a fresh timer that the
    // unload never reached — the change was lost, and only the real registration order shows it.
    await import("./persistence")
    const { startAppearanceAutoSave } = await import("./appearanceAutoSave")
    startAppearanceAutoSave()

    useUIStore.getState().setFontSize(160)
    expect(saveMock).not.toHaveBeenCalled()

    window.dispatchEvent(new Event("pagehide"))

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 160 }))
  })
})
