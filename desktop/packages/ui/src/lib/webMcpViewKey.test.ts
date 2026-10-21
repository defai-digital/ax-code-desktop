import { expect, test } from "vitest"
import { viewKeyFor } from "./webMcpViewKey"
import { projectKeyFor } from "../../../../shared/webmcp-view-key.mjs"

test.each([
  ["/repo/child/../", "/repo"],
  ["/../../repo//./", "/repo"],
  ["c:\\Users\\DEV\\child\\..\\", "C:/users/dev"],
  ["C:/../../", "c:/"],
  ["\\\\SERVER\\Share\\child\\..\\..\\", "//server/share"],
])("normalizes the renderer and main identity for %s", (alias, canonical) => {
  expect(viewKeyFor(alias, "ses_one")).toBe(`${projectKeyFor(canonical)}\0ses_one`)
  expect(viewKeyFor(alias, null)).toBe(viewKeyFor(canonical, null))
})

test("retains POSIX case and distinguishes drive and project roots", () => {
  expect(viewKeyFor("/Repo", null)).not.toBe(viewKeyFor("/repo", null))
  expect(viewKeyFor("C:/", null)).not.toBe(viewKeyFor("D:/", null))
  expect(viewKeyFor("//server/share", null)).not.toBe(viewKeyFor("//server/other", null))
})
