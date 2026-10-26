import { afterEach, expect, test } from "vitest"
import {
  clearDirectorySessionLoadState,
  clearSessionLoadState,
  getPendingSessionLoadIds,
  retainSessionLoad,
  metaByKey,
  sessionLoadKey,
} from "./session-load-cache"
import { getSessionPrefetch, setSessionPrefetch } from "./session-prefetch-cache"

const directory = "C:/Users/Runner/Project"
const alias = "c:\\users\\runner\\project"
afterEach(() => clearDirectorySessionLoadState(directory))

test("Windows aliases share load protection, prefetch and invalidation", () => {
  const lease = retainSessionLoad(alias, "session")
  expect(getPendingSessionLoadIds(directory)).toEqual(new Set(["session"]))
  setSessionPrefetch({ directory: alias, sessionID: "session", limit: 150, complete: true })
  expect(getSessionPrefetch(directory, "session")?.limit).toBe(150)
  metaByKey.set(sessionLoadKey(alias, "session"), {
    limit: 150,
    cursor: undefined,
    complete: true,
    loading: false,
    fetched: true,
  })
  clearSessionLoadState(directory, ["session"])
  expect(lease.isCurrent()).toBe(false)
  expect(metaByKey.has(sessionLoadKey(alias, "session"))).toBe(false)
  expect(getSessionPrefetch(alias, "session")).toBeUndefined()
})

test("an old lease cannot release or authorize a replacement read", () => {
  const old = retainSessionLoad(directory, "session")
  clearDirectorySessionLoadState(alias)
  const current = retainSessionLoad(directory, "session")
  old.release()
  expect(old.isCurrent()).toBe(false)
  expect(current.isCurrent()).toBe(true)
  expect(getPendingSessionLoadIds(alias)).toEqual(new Set(["session"]))
  current.release()
  expect(getPendingSessionLoadIds(alias).size).toBe(0)
})
