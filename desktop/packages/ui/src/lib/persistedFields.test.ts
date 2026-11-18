import { describe, expect, test } from "vitest"
import {
  createPersistedFields,
  persistedBoolean,
  persistedEnum,
  persistedNullableString,
  persistedNumber,
  persistedRecord,
} from "./persistedFields"

interface Preferences {
  enabled: boolean
  width: number
  selected: string | null
  mode: "one" | "two"
  values: Record<string, string>
  pending: number
  reset: () => void
}
const fields = createPersistedFields<Preferences>({
  enabled: persistedBoolean,
  width: persistedNumber,
  selected: persistedNullableString,
  mode: persistedEnum(["one", "two"]),
  values: persistedRecord((value) => (typeof value === "string" ? value : undefined), 2),
})
const state = (): Preferences => ({
  enabled: true,
  width: 300,
  selected: null,
  mode: "one",
  values: {},
  pending: 4,
  reset: () => {},
})
describe("declared persisted fields", () => {
  test("the same contract selects write fields and restores data while preserving live methods/transients", () => {
    const current = state()
    const saved = { enabled: false, width: 640, selected: "opaque id ", mode: "two", values: { a: "A" } }
    const restored = fields.merge({ ...saved, pending: 42, reset: "old JSON", other: 1 }, current)
    expect(restored).toEqual({ ...current, ...saved })
    expect(fields.partialize(restored)).toEqual(saved)
    expect(restored.reset).toBe(current.reset)
    expect(restored.pending).toBe(4)
  })
  test.each([null, [], 42, "bad"])("a missing/non-object snapshot preserves live state: %j", (value) => {
    const current = state()
    expect(fields.merge(value, current)).toBe(current)
  })
  test("malformed declared fields preserve current values without coercion", () => {
    const current = state()
    expect(
      fields.merge({ enabled: "false", width: Infinity, selected: {}, mode: "future", values: [] }, current),
    ).toEqual(current)
  })
  test("record restoration is bounded and treats special keys as data", () => {
    const restored = fields.merge(
      { values: JSON.parse('{"old":"old","__proto__":"kept","constructor":"also kept"}') },
      state(),
    )
    expect(Object.keys(restored.values)).toEqual(["__proto__", "constructor"])
    expect(restored.values.__proto__).toBe("kept")
    expect(Object.getPrototypeOf(restored.values)).toBe(Object.prototype)
  })
  test("even an accidentally declared action is never serialized or replaced", () => {
    const unsafe = createPersistedFields<Preferences>({ reset: () => () => {} })
    const current = state()
    expect(unsafe.partialize(current)).toEqual({})
    expect(unsafe.merge({ reset: "old JSON" }, current).reset).toBe(current.reset)
  })
})
