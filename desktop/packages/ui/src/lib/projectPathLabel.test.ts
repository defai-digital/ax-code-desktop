import { expect, test } from "vitest"
import { compactProjectContext, compactProjectPath } from "./projectPathLabel"

test("keeps a useful directory suffix and expands it when registered paths collide", () => {
  const peers = ["/work/alice/packages/web", "/work/bob/packages/web"]
  expect(compactProjectPath(peers[0], peers)).toBe("…/alice/packages/web")
  expect(compactProjectPath(peers[1], peers)).toBe("…/bob/packages/web")
  expect(compactProjectPath("/work/alice/project", peers)).toBe("…/alice/project")
})

test("a path that is another path's suffix retains its full identity", () => {
  const peers = ["/packages/web", "/work/packages/web"]
  expect(compactProjectPath(peers[0], peers)).toBe("/packages/web")
  expect(compactProjectPath(peers[1], peers)).toBe("/work/packages/web")
})

test("preserves names, short paths, home paths and Windows identity", () => {
  expect(compactProjectContext("Example · /work/alice/app", [])).toBe("Example · …/alice/app")
  expect(compactProjectContext("Example · ~/code/app", [])).toBe("Example · …/code/app")
  expect(compactProjectContext("My project", [])).toBe("My project")
  expect(compactProjectPath("/app", [])).toBe("/app")
  expect(compactProjectPath("C:\\work\\alice\\app", [])).toBe("…/alice/app")
})
