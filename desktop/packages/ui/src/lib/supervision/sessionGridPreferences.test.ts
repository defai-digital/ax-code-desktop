import { expect, test } from "vitest"
import { ratiosForLayout, rememberLayoutRatios, SESSION_GRID_RATIOS_KEY } from "./sessionGridPreferences"

const memory = (): Storage => {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

test("each layout keeps its own split size", () => {
  const storage = memory()
  rememberLayoutRatios(2, { columns: 0.4, rows: 0.5 }, storage)
  rememberLayoutRatios(4, { columns: 0.7, rows: 0.3 }, storage)
  expect(ratiosForLayout(2, storage)).toEqual({ columns: 0.4, rows: 0.5 })
  expect(ratiosForLayout(4, storage)).toEqual({ columns: 0.7, rows: 0.3 })
  expect(ratiosForLayout(3, storage)).toBeNull()
  expect(storage.getItem(SESSION_GRID_RATIOS_KEY)).toContain("0.4")
})

test("corrupt and throwing stores stay empty", () => {
  const storage = memory()
  storage.setItem(SESSION_GRID_RATIOS_KEY, "{")
  expect(ratiosForLayout(2, storage)).toBeNull()
  storage.setItem(SESSION_GRID_RATIOS_KEY, JSON.stringify({ 2: { columns: 0.25, rows: "no" } }))
  expect(ratiosForLayout(2, storage)).toEqual({ columns: 0.25, rows: 0.5 })
  const throwing = {
    getItem() {
      throw new Error("blocked")
    },
    setItem() {
      throw new Error("blocked")
    },
    removeItem() {
      throw new Error("blocked")
    },
    clear() {
      throw new Error("blocked")
    },
    key() {
      return null
    },
    get length() {
      return 0
    },
  } as Storage
  expect(() => rememberLayoutRatios(2, { columns: 0.4, rows: 0.2 }, throwing)).not.toThrow()
  expect(ratiosForLayout(2, throwing)).toBeNull()
})
