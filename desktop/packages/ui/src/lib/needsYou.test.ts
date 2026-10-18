import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import {
  attentionSessionForProject,
  rankNeedsYouEntries,
  listNeedsYouSessions,
  orderSwitcherSessionIds,
  propagateAttentionToAncestors,
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

  test("project attention opens an error-only session in that project", () => {
    const sessions = [
      session({ id: "idle", projectId: "app", updatedAt: 1 }),
      session({ id: "err", projectId: "app", hasError: true, updatedAt: 9 }),
    ]

    expect(attentionSessionForProject("app", sessions)).toBe("err")
  })

  test("project attention prefers a permission over an older error", () => {
    const sessions = [
      session({ id: "old-err", projectId: "app", hasError: true, updatedAt: 1 }),
      session({ id: "perm", projectId: "app", permissionCount: 1, updatedAt: 20 }),
    ]

    expect(attentionSessionForProject("app", sessions)).toBe("perm")
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
    const queue = readFileSync(sourcePath("../components/projects/NeedsYouQueue.tsx"), "utf8")
    const switcher = readFileSync(sourcePath("../components/session/sidebar/hooks/useSwitcherItems.ts"), "utf8")
    expect(home).toContain("<NeedsYouQueue")
    expect(queue).toContain("listNeedsYouSessions")
    expect(queue).toContain("rankNeedsYouEntries")
    expect(queue).toContain("selectNeedsYouSession")
    expect(home).toContain("attentionSessionForProject")
    expect(switcher).toContain("orderSwitcherSessionIds")
  })

  test("ranks blocked sessions before errors before uncommitted work, keeping order within a tier", () => {
    const entry = (sessionId: string, reason: "permission" | "question" | "uncommitted" | "error") => ({
      sessionId,
      projectId: null,
      reason,
      directory: null,
      title: sessionId,
    })
    const ranked = rankNeedsYouEntries([
      entry("a", "uncommitted"),
      entry("b", "error"),
      entry("c", "question"),
      entry("d", "uncommitted"),
      entry("e", "permission"),
    ])
    expect(ranked.map((item) => item.sessionId)).toEqual(["c", "e", "b", "a", "d"])
  })

  test("marks every ancestor of a blocked subagent, whatever order the sessions are in", () => {
    // A single ordered pass promoted a parent only when its child was already marked as
    // the loop reached it, so the top session lost its attention mark whenever the session
    // in the middle came before the grandchild.
    const ids = propagateAttentionToAncestors(new Set(["grandchild"]), [
      { id: "middle", parentID: "top" },
      { id: "grandchild", parentID: "middle" },
      { id: "top", parentID: null },
      { id: "unrelated", parentID: "top" },
    ])

    expect([...ids].sort()).toEqual(["grandchild", "middle", "top"])
  })

  test("walks a deep chain and ignores a missing parent", () => {
    const ids = propagateAttentionToAncestors(new Set(["d"]), [
      { id: "a" },
      { id: "b", parentID: "a" },
      { id: "c", parentID: "b" },
      { id: "d", parentID: "c" },
    ])

    expect([...ids].sort()).toEqual(["a", "b", "c", "d"])
  })
})
