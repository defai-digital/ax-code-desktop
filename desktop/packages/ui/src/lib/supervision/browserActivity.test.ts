import { describe, expect, test } from "vitest"
import type { SupervisionRow } from "./rows"
import { browserSessionUse, diffBrowserActivity } from "./browserActivity"

const row = (sessionId: string): SupervisionRow => ({
  sessionId,
  title: `Task ${sessionId}`,
  state: "running",
  treeSessionIds: [sessionId],
  projectId: "p",
  projectLabel: "Shop",
  directory: "/repo",
  updatedAt: 1,
  evidence: null,
  goal: null,
})

describe("browser activity", () => {
  test("a session uses the browser only when it is ready, bound to it and showing a page with an origin", () => {
    expect(browserSessionUse({ sessionID: "s1", origin: "https://shop.test", enabled: true, ready: true })).toEqual({
      sessionId: "s1",
      origin: "https://shop.test",
      enabled: true,
    })
    expect(browserSessionUse({ sessionID: "s1", origin: null, enabled: true, ready: true })).toBeNull()
    expect(browserSessionUse({ sessionID: null, origin: "https://shop.test", enabled: true, ready: true })).toBeNull()
    expect(browserSessionUse({ sessionID: "s1", origin: "https://shop.test", enabled: true, ready: false })).toBeNull()
  })

  test("records access turning on, moving origin and turning off; the first observation and page loads with access off are silent", () => {
    const rows = [row("s1")]
    const on = { sessionId: "s1", origin: "https://shop.test", enabled: true }
    expect(diffBrowserActivity(undefined, on, rows, 1)).toEqual([])
    expect(diffBrowserActivity(null, { ...on, enabled: false }, rows, 2)).toEqual([])
    const started = diffBrowserActivity({ ...on, enabled: false }, on, rows, 3)
    expect(started.map((event) => [event.sessionId, event.browser])).toEqual([["s1", { origin: "https://shop.test", enabled: true }]])
    expect(diffBrowserActivity(on, on, rows, 4)).toEqual([])
    const moved = diffBrowserActivity(on, { ...on, origin: "https://admin.test" }, rows, 5)
    expect(moved.map((event) => event.browser)).toEqual([
      { origin: "https://shop.test", enabled: false },
      { origin: "https://admin.test", enabled: true },
    ])
    expect(diffBrowserActivity(on, null, rows, 6).map((event) => event.browser?.enabled)).toEqual([false])
    // A session the board does not know produces nothing.
    expect(diffBrowserActivity(null, { ...on, sessionId: "unknown" }, rows, 7)).toEqual([])
  })
})
