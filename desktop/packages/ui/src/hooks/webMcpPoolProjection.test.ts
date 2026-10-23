import { expect, test } from "vitest"
import {
  nativeCatalogKey,
  samePoolCapacity,
  shouldApplyNativeView,
  type PoolProjectionCurrent,
  type PoolProjectionNative,
} from "./webMcpPoolProjection"

const current = (partial: Partial<PoolProjectionCurrent> = {}): PoolProjectionCurrent => ({
  phase: "ready",
  busy: false,
  browserId: "first",
  directory: "/repo",
  sessionID: "ses_first",
  nativeAvailable: true,
  runtimeCompatible: true,
  enabled: true,
  paused: false,
  visible: false,
  waiting: true,
  interrupted: false,
  unloaded: false,
  idle: false,
  origin: "https://first.test",
  page: "ready",
  tools: 1,
  generation: "gen-1",
  error: null,
  pausedBridgeServers: [],
  ...partial,
})

const native = (partial: Partial<PoolProjectionNative> = {}): PoolProjectionNative => ({
  id: "first",
  directory: "/repo",
  sessionID: "ses_first",
  nativeAvailable: true,
  enabled: true,
  interrupted: false,
  origin: "https://first.test",
  paused: false,
  visible: false,
  waiting: true,
  tools: 1,
  page: "ready",
  error: null,
  unloaded: false,
  idle: false,
  generation: "gen-1",
  catalog: [{ name: "echo", description: "Echo" }],
  catalogTotal: 1,
  catalogTruncation: null,
  catalogRejection: null,
  ...partial,
})

test("skips a native row whose scalars, generation and catalog payload already match", () => {
  const row = native()
  const key = nativeCatalogKey(row)
  expect(shouldApplyNativeView(current(), row, [], key, key)).toEqual({ apply: false, normalizeCatalog: false })
})

test("normalizes a new view, a generation change, and a same-generation catalog edit", () => {
  const row = native()
  const key = nativeCatalogKey(row)
  expect(shouldApplyNativeView(undefined, row, [], undefined, key)).toEqual({ apply: true, normalizeCatalog: true })
  expect(shouldApplyNativeView(current(), native({ generation: "gen-2" }), [], key, key)).toEqual({
    apply: true,
    normalizeCatalog: true,
  })
  const edited = native({ catalog: [{ name: "echo", description: "Changed" }] })
  expect(shouldApplyNativeView(current(), edited, [], key, nativeCatalogKey(edited))).toEqual({
    apply: true,
    normalizeCatalog: true,
  })
})

test("applies a scalar change without renormalizing an unchanged catalog", () => {
  const row = native({ enabled: false, paused: true })
  const key = nativeCatalogKey(row)
  expect(shouldApplyNativeView(current(), row, [], key, key)).toEqual({ apply: true, normalizeCatalog: false })
  expect(shouldApplyNativeView(current(), native(), ["webmcp"], key, key).apply).toBe(true)
  expect(shouldApplyNativeView(current({ error: "disconnected" }), native({ error: null }), [], key, key).apply).toBe(
    true,
  )
})

test("keeps an in-flight command failure and does not apply over a starting or busy view", () => {
  const row = native({ error: null })
  const key = nativeCatalogKey(row)
  expect(shouldApplyNativeView(current({ error: "operation-failed" }), row, [], key, key)).toEqual({
    apply: false,
    normalizeCatalog: false,
  })
  expect(
    shouldApplyNativeView(current({ phase: "starting", busy: true }), native({ enabled: false }), [], key, key),
  ).toEqual({
    apply: false,
    normalizeCatalog: false,
  })
  expect(shouldApplyNativeView(current({ busy: true }), native({ tools: 9 }), [], key, key).apply).toBe(false)
})

test("capacity changes only when the live counts or other windows change", () => {
  const capacity = { liveViews: 1, maxLiveViews: 4, otherWindows: [{ id: "foreign", pageCount: 2 }] }
  expect(samePoolCapacity(null, capacity)).toBe(false)
  expect(samePoolCapacity(capacity, { ...capacity, otherWindows: [{ id: "foreign", pageCount: 2 }] })).toBe(true)
  expect(samePoolCapacity(capacity, { ...capacity, liveViews: 2 })).toBe(false)
  expect(samePoolCapacity(capacity, { ...capacity, otherWindows: [{ id: "foreign", pageCount: 3 }] })).toBe(false)
  expect(samePoolCapacity({ liveViews: 1, maxLiveViews: 4 }, { liveViews: 1, maxLiveViews: 4 })).toBe(true)
})
