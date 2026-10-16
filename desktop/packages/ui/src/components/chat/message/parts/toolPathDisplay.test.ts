import { describe, expect, test } from "vitest"

import { getToolRelativePath, normalizeToolDisplayPath, toAbsoluteToolPath } from "./toolPathDisplay"

describe("toolPathDisplay", () => {
  test("normalizes path separators and drive roots", () => {
    expect(normalizeToolDisplayPath("C:\\Users\\Alice\\Project\\")).toBe("C:/Users/Alice/Project")
    expect(normalizeToolDisplayPath("C:\\")).toBe("C:/")
  })

  test("returns Windows relative paths case-insensitively", () => {
    expect(getToolRelativePath("C:/Users/Alice/Project/src/app.ts", "c:/users/alice/project")).toBe("src/app.ts")
  })

  test("returns Windows relative paths under drive roots", () => {
    expect(getToolRelativePath("c:/Users/Alice/Project/src/app.ts", "C:/")).toBe("Users/Alice/Project/src/app.ts")
  })

  test("keeps POSIX path matching case-sensitive", () => {
    expect(getToolRelativePath("/Users/Alice/Project/src/app.ts", "/users/alice/project")).toBe(
      "/Users/Alice/Project/src/app.ts",
    )
  })

  test("returns dot for the current directory itself", () => {
    expect(getToolRelativePath("C:/Users/Alice/Project", "c:/users/alice/project")).toBe(".")
  })

  test("returns an empty display path for empty input", () => {
    expect(getToolRelativePath(" ", "/repo")).toBe("")
  })
})

describe("toAbsoluteToolPath", () => {
  test("hands an absolute path over as the tool wrote it", () => {
    // The helper normalized first, so a POSIX path whose filename contains a backslash — legal there — was
    // rewritten to a different path, and the caller passed that to the editor.
    expect(toAbsoluteToolPath("/repo", "/repo/dir/a\\b.ts")).toBe("/repo/dir/a\\b.ts")
    // A Windows drive path is normalized instead: a backslash is a separator there and the editor takes either.
    expect(toAbsoluteToolPath("/repo", "C:\\repo\\src\\app.ts")).toBe("C:/repo/src/app.ts")
  })

  test("leaves a path that already names a location alone", () => {
    expect(toAbsoluteToolPath("/repo", "/repo/src/app.ts")).toBe("/repo/src/app.ts")
    expect(toAbsoluteToolPath("/repo", "//server/share/src/app.ts")).toBe("//server/share/src/app.ts")
    // A drive path is absolute too: testing only for a leading `/` prefixed it with the directory and the click
    // asked the editor to open `C:/Users/Alice/Project/C:/Users/Alice/Project/src/app.ts`.
    expect(toAbsoluteToolPath("C:/Users/Alice/Project", "C:/Users/Alice/Project/src/app.ts")).toBe(
      "C:/Users/Alice/Project/src/app.ts",
    )
    expect(toAbsoluteToolPath("C:\\Users\\Alice\\Project", "C:\\Users\\Alice\\Project\\src\\app.ts")).toBe(
      "C:/Users/Alice/Project/src/app.ts",
    )
  })

  test("joins a relative path to the directory the tool ran in", () => {
    expect(toAbsoluteToolPath("/repo", "src/app.ts")).toBe("/repo/src/app.ts")
    expect(toAbsoluteToolPath("/repo/", "src/app.ts")).toBe("/repo/src/app.ts")
    expect(toAbsoluteToolPath("C:\\repo", "src\\app.ts")).toBe("C:/repo/src/app.ts")
  })

  test("returns an empty path for empty input", () => {
    expect(toAbsoluteToolPath("/repo", " ")).toBe("")
  })
})
