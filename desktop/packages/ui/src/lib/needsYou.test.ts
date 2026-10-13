import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import {
  attentionSessionForProject,
  listNeedsYouSessions,
  orderSwitcherSessionIds,
  selectNeedsYouSession,
  type NeedsYouSessionInput,
} from "./needsYou"

const session = (overrides: Partial<NeedsYouSessionInput> & Pick<NeedsYouSessionInput, "id">): NeedsYouSessionInput => ({
  projectId: "app",
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  ...overrides,
})

describe("needs-you queue", () => {
  test("lists only sessions that need a human and selecting one returns that id", () => {
    const sessions = [
      session({ id: "perm", permissionCount: 1, title: "Approve write" }),
      session({ id: "question", questionCount: 1, title: "Which file?" }),
      session({ id: "dirty", finishedWithUncommitted: true, title: "Land the patch" }),
      session({ id: "err", hasError: true, title: "Build failed" }),
      session({ id: "idle", title: "Quiet" }),
      session({ id: "running", title: "Still going" }),
    ]

    const queue = listNeedsYouSessions(sessions)
    expect(queue.map((entry) => entry.sessionId)).toEqual(["perm", "question", "dirty", "err"])
    expect(queue.map((entry) => entry.reason)).toEqual(["permission", "question", "uncommitted", "error"])
    expect(selectNeedsYouSession(queue[1]!.sessionId)).toBe("question")
    expect(selectNeedsYouSession(queue[3]!.sessionId)).toBe("err")
  })

  test("project attention opens a waiting session in that project", () => {
    const sessions = [
      session({ id: "other-wait", projectId: "other", permissionCount: 1, updatedAt: 1 }),
      session({ id: "idle", projectId: "app", updatedAt: 2 }),
      session({ id: "newer", projectId: "app", questionCount: 1, updatedAt: 20 }),
      session({ id: "older", projectId: "app", permissionCount: 1, updatedAt: 5 }),
    ]

    expect(attentionSessionForProject("app", sessions)).toBe("older")
    expect(attentionSessionForProject("missing", sessions)).toBeNull()
  })

  test("the switcher places waiting and error sessions before idle ones", () => {
    const ordered = orderSwitcherSessionIds(
      ["idle-a", "waiting", "idle-b", "error"],
      new Set(["waiting", "error"]),
    )
    expect(ordered).toEqual(["waiting", "error", "idle-a", "idle-b"])
    expect(ordered.indexOf("waiting")).toBeLessThan(ordered.indexOf("idle-a"))
    expect(ordered.indexOf("error")).toBeLessThan(ordered.indexOf("idle-b"))
  })

  test("projects home and the switcher call the shipped ordering", () => {
    const home = readFileSync(sourcePath("../components/projects/ProjectsHome.tsx"), "utf8")
    const switcher = readFileSync(sourcePath("../components/session/sidebar/hooks/useSwitcherItems.ts"), "utf8")
    expect(home).toContain("listNeedsYouSessions")
    expect(home).toContain("selectNeedsYouSession")
    expect(home).toContain("attentionSessionForProject")
    expect(switcher).toContain("orderSwitcherSessionIds")
  })
})
