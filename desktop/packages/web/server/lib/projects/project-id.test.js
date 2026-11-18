import { expect, test } from "vitest"
import { createProjectIdFromPath } from "./project-id.js"

test.each([
  ["/workspace/repo", "/workspace/repo"],
  ["/workspace/repo ", "/workspace/repo "],
  ["/workspace/a\\b", "/workspace/a\\b"],
  ["c:\\Repo\\", "C:/Repo"],
  ["c:\\", "C:/"],
  ["\\\\server\\share\\repo ", "//server/share/repo "],
  ["/", "/"],
])("host ids use the same literal canonical values as the renderer: %j", (input, canonical) => {
  expect(createProjectIdFromPath(input)).toBe(`path_${Buffer.from(canonical, "utf8").toString("base64url")}`)
})

test("blank project paths cannot create an identity", () => {
  expect(createProjectIdFromPath("  ")).toBe("")
  expect(createProjectIdFromPath(undefined)).toBe("")
})
