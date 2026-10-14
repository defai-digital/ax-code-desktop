// @vitest-environment node
// Installs a window whose storage getters throw; relies on there being no
// ambient jsdom window/localStorage.
import { describe, expect, test, vi } from "vitest"

const importSafeStorage = async () => {
  // Force a fresh module instance so safeStorage re-reads the stubbed window.
  vi.resetModules()
  return (await import("./safeStorage")) as typeof import("./safeStorage")
}

describe("safeStorage", () => {
  test("falls back to memory when storage getters throw", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    const throwingWindow = {}

    Object.defineProperties(throwingWindow, {
      localStorage: {
        get() {
          throw new Error("localStorage blocked")
        },
      },
      sessionStorage: {
        get() {
          throw new Error("sessionStorage blocked")
        },
      },
    })

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: throwingWindow,
    })

    try {
      const { getSafeSessionStorage, getSafeStorage } = await importSafeStorage()
      const storage = getSafeStorage()
      const sessionStorage = getSafeSessionStorage()

      storage.setItem("local-key", "local-value")
      sessionStorage.setItem("session-key", "session-value")

      expect(storage.getItem("local-key")).toBe("local-value")
      expect(sessionStorage.getItem("session-key")).toBe("session-value")
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  })

  test("keeps the last good stored value when a write fails, while reads see the new one", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
    const backing = new Map<string, string>([["quota-key", "old-value"]])
    const quotaWindow = {}

    Object.defineProperties(quotaWindow, {
      localStorage: {
        get() {
          return {
            getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
            setItem: (key: string, value: string) => {
              if (key === "quota-key") throw new Error("quota exceeded")
              backing.set(key, value)
            },
            removeItem: (key: string) => {
              backing.delete(key)
            },
          }
        },
      },
      sessionStorage: {
        get() {
          throw new Error("sessionStorage blocked")
        },
      },
    })

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: quotaWindow,
    })

    try {
      const { getSafeStorage } = await importSafeStorage()
      const storage = getSafeStorage()

      storage.setItem("quota-key", "new-value")

      // The failed write must not destroy the last good snapshot…
      expect(backing.get("quota-key")).toBe("old-value")
      // …while this session's reads still see the value just written.
      expect(storage.getItem("quota-key")).toBe("new-value")
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  })
})
