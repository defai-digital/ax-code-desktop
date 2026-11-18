import { expect, test } from "vitest"
import { shallowRecordEqual } from "./shallowRecordEqual"

test("record equality compares own key identity even for undefined values", () => {
  expect(shallowRecordEqual({ old: undefined }, { next: undefined })).toBe(false)
  expect(shallowRecordEqual({ old: undefined }, { old: undefined })).toBe(true)
  expect(shallowRecordEqual({ old: undefined }, {})).toBe(false)
  const inherited = Object.create({ old: undefined }) as Record<string, unknown>
  inherited.next = undefined
  expect(shallowRecordEqual({ old: undefined }, inherited)).toBe(false)
})

test("record equality retains Object.is and shallow nested reference semantics", () => {
  const nested = { value: 1 }
  expect(shallowRecordEqual({ nan: NaN, nested }, { nested, nan: NaN })).toBe(true)
  expect(shallowRecordEqual({ zero: 0 }, { zero: -0 })).toBe(false)
  expect(shallowRecordEqual({ nested }, { nested: { value: 1 } })).toBe(false)
  expect(shallowRecordEqual(undefined, undefined)).toBe(true)
  expect(shallowRecordEqual(undefined, {})).toBe(false)
})
