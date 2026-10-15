import { describe, expect, test } from "vitest"
import { isChildHintDismissed, useRepositoryHintStore } from "./useRepositoryHintStore"

describe("repository hint dismissals", () => {
  test("a dismissed hint stays hidden until a new repository appears", () => {
    useRepositoryHintStore.getState().dismissChildren("/Users/dev/code", ["app", "lib"])
    const { dismissedChildren } = useRepositoryHintStore.getState()
    expect(isChildHintDismissed(dismissedChildren, "/Users/dev/code", ["app", "lib"])).toBe(true)
    expect(isChildHintDismissed(dismissedChildren, "/Users/dev/code", ["app"])).toBe(true)
    expect(isChildHintDismissed(dismissedChildren, "/Users/dev/code", ["app", "lib", "new-repo"])).toBe(false)
    expect(isChildHintDismissed(dismissedChildren, "/Users/dev/other", ["app"])).toBe(false)
  })

  test("the parent-repository hint is remembered per folder and repository root", () => {
    useRepositoryHintStore.getState().dismissParent("/Users/dev/code/app/web", "/Users/dev/code/app")
    expect(useRepositoryHintStore.getState().dismissedParent["/Users/dev/code/app/web"]).toBe("/Users/dev/code/app")
  })
})
