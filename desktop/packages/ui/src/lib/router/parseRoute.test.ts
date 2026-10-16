import { describe, expect, test } from "vitest"

import { parseRoute, withRouteDefaults } from "./parseRoute"

describe("parseRoute tab handling", () => {
  test("accepts every tab the app can be on, not only the first five", () => {
    // The serializer writes any non-default tab, so a shorter list here read the URL's own output back as
    // invalid: `?tab=wiki`, `?tab=plan` and `?tab=context` opened on the default tab instead, and the
    // route was rewritten without the parameter.
    for (const tab of ["chat", "plan", "git", "diff", "terminal", "files", "context", "wiki"]) {
      expect(parseRoute(new URLSearchParams(`tab=${tab}`)).tab, tab).toBe(tab)
    }
  })

  test("still refuses a tab that is not one of them", () => {
    expect(parseRoute(new URLSearchParams("tab=settings")).tab).toBeNull()
  })
})

describe("withRouteDefaults", () => {
  test("fills in the tab a serialized route omits", () => {
    // Serialization leaves out whatever matches the default, so `?session=abc` says nothing about the
    // tab — and the popstate path, which must represent the whole route, kept the tab the user was on.
    const route = parseRoute(new URLSearchParams("session=abc"))

    expect(withRouteDefaults(route)).toMatchObject({ sessionId: "abc", tab: "chat" })
  })

  test("leaves the tab absent when the route names a file", () => {
    // `/?file=src/a.ts` is the documented diff deep link: applyRoute reads an absent tab as "the file
    // decides", so filling in the chat default dropped the file and stayed on chat.
    const route = parseRoute(new URLSearchParams("file=src/a.ts"))

    expect(withRouteDefaults(route)).toMatchObject({ tab: null, diffFile: "src/a.ts" })
  })

  test("keeps the tab the route names", () => {
    const route = parseRoute(new URLSearchParams("session=abc&tab=git"))

    expect(withRouteDefaults(route).tab).toBe("git")
  })
})
