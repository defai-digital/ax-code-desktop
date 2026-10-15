import { describe, expect, test } from "vitest"

import { planWikiFileOpen } from "./openPath"

const base = {
  path: " src/client.ts ",
  directory: "/work/app",
  isMobile: false,
  activeMainTab: "chat",
  splitPaneEnabled: true,
  splitPaneRightTab: "wiki",
}

describe("planWikiFileOpen", () => {
  test("copies the path while wiki is the current view", () => {
    expect(planWikiFileOpen(base)).toEqual({ action: "copy", path: "src/client.ts" })
    expect(planWikiFileOpen({ ...base, isMobile: true, activeMainTab: "wiki", splitPaneRightTab: "files" })).toEqual({
      action: "copy",
      path: "src/client.ts",
    })
  })

  test("opens the files view when wiki is not showing", () => {
    expect(planWikiFileOpen({ ...base, splitPaneRightTab: "git" })).toEqual({
      action: "open-files",
      directory: "/work/app",
      path: "src/client.ts",
    })
    expect(planWikiFileOpen({ ...base, isMobile: true, activeMainTab: "files" })).toEqual({
      action: "open-files",
      directory: "/work/app",
      path: "src/client.ts",
    })
  })

  test("copies when there is no directory and ignores a blank path", () => {
    expect(planWikiFileOpen({ ...base, splitPaneEnabled: false, directory: "  " })).toEqual({
      action: "copy",
      path: "src/client.ts",
    })
    expect(planWikiFileOpen({ ...base, path: "   " })).toEqual({ action: "none" })
  })
})
