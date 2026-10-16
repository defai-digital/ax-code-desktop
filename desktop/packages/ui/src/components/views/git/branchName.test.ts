import { describe, expect, test } from "vitest"
import { sanitizeBranchNameInput } from "./branchName"

describe("sanitizeBranchNameInput", () => {
  test("keeps a branch name written in another script", () => {
    // Mapping everything outside ASCII to "-" emptied this name (the create button then stayed
    // disabled) and silently turned "feature/测试" into "feature" - a different branch.
    expect(sanitizeBranchNameInput("测试分支")).toBe("测试分支")
    expect(sanitizeBranchNameInput("feature/测试")).toBe("feature/测试")
    expect(sanitizeBranchNameInput("feat/naïve-résumé")).toBe("feat/naïve-résumé")
  })

  test("still removes what git forbids in a ref", () => {
    expect(sanitizeBranchNameInput("feature branch")).toBe("feature-branch")
    expect(sanitizeBranchNameInput("feat~1^2:3?4*5[6]7\\8")).toBe("feat-1-2-3-4-5-6]7-8")
    expect(sanitizeBranchNameInput("a..b")).toBe("a-b")
    expect(sanitizeBranchNameInput("a@{1}")).toBe("a-1}")
    expect(sanitizeBranchNameInput("wip.lock")).toBe("wip")
  })

  test("collapses separators and trims the ends", () => {
    expect(sanitizeBranchNameInput("  feat//x  ")).toBe("feat/x")
    expect(sanitizeBranchNameInput("/-feat/-x-/")).toBe("feat/x")
    expect(sanitizeBranchNameInput("feat---x")).toBe("feat-x")
  })

  test("removes a dot a component starts with, not only the first one", () => {
    // Git rejects any component that begins with a dot, so `feature/.hidden` was returned unchanged
    // and the create failed against git's own check.
    expect(sanitizeBranchNameInput("feature/.hidden")).toBe("feature/hidden")
    expect(sanitizeBranchNameInput(".hidden")).toBe("hidden")
    expect(sanitizeBranchNameInput("feat/.x/.y")).toBe("feat/x/y")
  })

  test("empties the one name git forbids on its own", () => {
    // `@` alone is not a ref; an empty value leaves the create button disabled instead.
    expect(sanitizeBranchNameInput("@")).toBe("")
    expect(sanitizeBranchNameInput("feat@1")).toBe("feat@1")
  })

  test("every result is a name git accepts", () => {
    const forbidden = [
      /(^|\/)\./,
      /\.\./,
      /@\{/,
      /[\s~^:?*[\\"]/,
      /\/\//,
      /^\/|\/$/,
      /\.lock(\/|$)/,
    ]

    for (const input of [
      "feature/.hidden",
      "@",
      "a..b",
      "feat~1",
      " feature ",
      "wip.lock",
      "///",
      "测试/.分支",
    ]) {
      const result = sanitizeBranchNameInput(input)
      if (!result) continue
      expect(result).not.toBe("@")
      for (const pattern of forbidden) {
        expect(result).not.toMatch(pattern)
      }
    }
  })
})
