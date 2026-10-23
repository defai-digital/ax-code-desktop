import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import {
  attentionSessionForProject,
  followUpReason,
  listFollowUpSessions,
  needsYouReason,
  rankFollowUpEntries,
  rankNeedsYouEntries,
  listNeedsYouSessions,
  orderSwitcherSessionIds,
  propagateAttentionToAncestors,
  selectNeedsYouSession,
  type NeedsYouSessionInput,
} from "./needsYou"
import type { SessionGoalSnapshot } from "./supervision/goal"

const goalSnapshot = (overrides: Partial<SessionGoalSnapshot> = {}): SessionGoalSnapshot => ({
  sessionId: "goal-session",
  objective: "Ship the migration",
  status: "blocked",
  tokensUsed: 10,
  timeUsedSeconds: 5,
  createdAt: 1000,
  ...overrides,
})

const session = (overrides: Partial<NeedsYouSessionInput> & Pick<NeedsYouSessionInput, "id">): NeedsYouSessionInput => ({
  projectId: "app",
  permissionCount: 0,
  questionCount: 0,
  hasError: false,
  finishedWithUncommitted: false,
  ...overrides,
})

describe("needs-you queue", () => {
  test("lists only sessions that wait on a decision and selecting one returns that id", () => {
    const sessions = [
      session({ id: "perm", permissionCount: 1, title: "Approve write" }),
      session({ id: "question", questionCount: 1, title: "Which file?" }),
      session({ id: "dirty", finishedWithUncommitted: true, title: "Land the patch" }),
      session({ id: "err", hasError: true, title: "Build failed" }),
      session({ id: "idle", title: "Quiet" }),
      session({ id: "running", title: "Still going" }),
    ]

    const queue = listNeedsYouSessions(sessions)
    expect(queue.map((entry) => entry.sessionId)).toEqual(["perm", "question"])
    expect(queue.map((entry) => entry.reason)).toEqual(["permission", "question"])
    expect(selectNeedsYouSession(queue[1]!.sessionId)).toBe("question")
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

  test("project attention ignores a failure or finished work, which hold no decision", () => {
    const sessions = [
      session({ id: "idle", projectId: "app", updatedAt: 1 }),
      session({ id: "err", projectId: "app", hasError: true, updatedAt: 9 }),
      session({ id: "dirty", projectId: "app", finishedWithUncommitted: true, updatedAt: 10 }),
    ]

    expect(attentionSessionForProject("app", sessions)).toBeNull()
  })

  test("project attention opens the decision even when a newer failure exists", () => {
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

  test("ranks blocked requests before a goal that needs a person, keeping order within a tier", () => {
    const entry = (sessionId: string, reason: "permission" | "question" | "goal") => ({
      sessionId,
      projectId: null,
      reason,
      directory: null,
      title: sessionId,
      goal: null,
    })
    const ranked = rankNeedsYouEntries([
      entry("a", "goal"),
      entry("b", "question"),
      entry("c", "goal"),
      entry("d", "permission"),
    ])
    expect(ranked.map((item) => item.sessionId)).toEqual(["b", "d", "a", "c"])
  })

  test("a goal that needs a person is a decision, and a pending request outranks it", () => {
    const base = { permissionCount: 0, questionCount: 0, goalNeedsPerson: true }
    expect(needsYouReason(base)).toBe("goal")
    expect(needsYouReason({ ...base, permissionCount: 1 })).toBe("permission")
    expect(needsYouReason({ ...base, questionCount: 1 })).toBe("question")
  })

  test("a busy or retry session does not need a person for its blocked goal", () => {
    const base = { permissionCount: 0, questionCount: 0, goalNeedsPerson: true }
    expect(needsYouReason({ ...base, statusType: "busy" })).toBeNull()
    expect(needsYouReason({ ...base, statusType: "retry" })).toBeNull()
    expect(needsYouReason({ ...base, statusType: "idle" })).toBe("goal")
    expect(
      listNeedsYouSessions([
        session({ id: "busy-goal", goalNeedsPerson: true, statusType: "busy", goal: goalSnapshot() }),
        session({ id: "idle-goal", goalNeedsPerson: true, statusType: "idle", goal: goalSnapshot() }),
      ]).map((entry) => entry.sessionId),
    ).toEqual(["idle-goal"])
  })

  test("callers that do not pass goalNeedsPerson see no goal decision", () => {
    expect(needsYouReason({ permissionCount: 0, questionCount: 0 })).toBeNull()
    expect(needsYouReason({ permissionCount: 0, questionCount: 0, goalNeedsPerson: false })).toBeNull()
  })

  test("a failure or uncommitted work is a follow-up, never a decision", () => {
    expect(followUpReason({ hasError: true, finishedWithUncommitted: true })).toBe("error")
    expect(followUpReason({ hasError: false, finishedWithUncommitted: true })).toBe("uncommitted")
    expect(followUpReason({ hasError: false, finishedWithUncommitted: false })).toBeNull()
    expect(needsYouReason({ permissionCount: 0, questionCount: 0 })).toBeNull()
  })

  test("a working session has no follow-up, because its unseen-error flag can be stale", () => {
    const base = { hasError: true, finishedWithUncommitted: true }
    expect(followUpReason({ ...base, statusType: "busy" })).toBeNull()
    expect(followUpReason({ ...base, statusType: "retry" })).toBeNull()
    expect(followUpReason({ ...base, statusType: "idle" })).toBe("error")
  })

  test("lists one follow-up row per session and none for a session that holds a decision", () => {
    const entries = listFollowUpSessions([
      session({ id: "dirty", finishedWithUncommitted: true, title: "Land the patch" }),
      session({ id: "err", hasError: true, title: "Build failed" }),
      session({ id: "both", hasError: true, finishedWithUncommitted: true }),
      session({ id: "perm-and-err", permissionCount: 1, hasError: true }),
      session({ id: "running-err", hasError: true, statusType: "busy" }),
      session({ id: "idle" }),
    ])
    expect(entries.map((entry) => [entry.sessionId, entry.reason])).toEqual([
      ["dirty", "uncommitted"],
      ["err", "error"],
      ["both", "error"],
    ])
  })

  test("ranks failures before finished work, keeping order within a tier", () => {
    const entry = (sessionId: string, reason: "error" | "uncommitted") => ({
      sessionId,
      projectId: null,
      reason,
      directory: null,
      title: sessionId,
    })
    const ranked = rankFollowUpEntries([
      entry("a", "uncommitted"),
      entry("b", "error"),
      entry("c", "uncommitted"),
      entry("d", "error"),
    ])
    expect(ranked.map((item) => item.sessionId)).toEqual(["b", "d", "a", "c"])
  })

  test("lists a goal session with its snapshot for the objective line", () => {
    const goal = goalSnapshot()
    const queue = listNeedsYouSessions([
      session({ id: "goal-session", goalNeedsPerson: true, goal, title: "Blocked goal" }),
      session({ id: "paused-session", goalNeedsPerson: false, goal: goalSnapshot({ status: "paused" }), title: "Paused" }),
    ])
    expect(queue).toHaveLength(1)
    expect(queue[0]?.reason).toBe("goal")
    expect(queue[0]?.goal).toEqual(goal)
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
