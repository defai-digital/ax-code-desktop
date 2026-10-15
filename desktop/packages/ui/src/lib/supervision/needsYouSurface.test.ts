import { describe, expect, test } from "vitest"

import type { PendingRequestEntry } from "@/sync/sync-context"
import type { PermissionRequest } from "@/types/permission"
import type { QuestionRequest } from "@/types/question"

import {
  formatSupervisionEvidenceLine,
  groupRequestsBySupervisionRoot,
  supervisionRequestContext,
  supervisionStatusRows,
} from "./needsYouSurface"

const permission = (id: string, sessionId: string): PendingRequestEntry => ({
  kind: "permission",
  sessionId,
  request: { id } as PermissionRequest,
})

const question = (id: string, sessionId: string): PendingRequestEntry => ({
  kind: "question",
  sessionId,
  request: { id } as QuestionRequest,
})

describe("groupRequestsBySupervisionRoot", () => {
  const rows = [
    { sessionId: "root-a", treeSessionIds: ["root-a", "child-a"], state: "permission" as const },
    { sessionId: "root-b", treeSessionIds: ["root-b"], state: "question" as const },
    { sessionId: "root-c", treeSessionIds: ["root-c"], state: "error" as const },
  ]

  test("maps a subagent request onto its root and keeps row order", () => {
    const { groups, unmatched } = groupRequestsBySupervisionRoot(rows, [
      permission("p-child", "child-a"),
      question("q-b", "root-b"),
      permission("p-a", "root-a"),
    ])

    expect(groups.map((group) => group.row.sessionId)).toEqual(["root-a", "root-b"])
    expect(groups[0]?.requests.map((entry) => entry.request.id)).toEqual(["p-child", "p-a"])
    expect(groups[1]?.requests.map((entry) => entry.request.id)).toEqual(["q-b"])
    expect(unmatched).toEqual([])
  })

  test("keeps requests that belong to no loaded root", () => {
    const { groups, unmatched } = groupRequestsBySupervisionRoot(rows, [question("q-orphan", "missing")])
    expect(groups).toEqual([])
    expect(unmatched.map((entry) => entry.request.id)).toEqual(["q-orphan"])
  })

  test("the first root wins when two trees list the same session", () => {
    const overlapping = [
      { sessionId: "first", treeSessionIds: ["shared"] },
      { sessionId: "second", treeSessionIds: ["shared"] },
    ]
    const { groups } = groupRequestsBySupervisionRoot(overlapping, [permission("p", "shared")])
    expect(groups.map((group) => group.row.sessionId)).toEqual(["first"])
  })
})

describe("supervisionStatusRows", () => {
  test("keeps error and review rows that have no request, in order", () => {
    const rows = [
      { sessionId: "perm", state: "permission" as const },
      { sessionId: "err", state: "error" as const },
      { sessionId: "run", state: "running" as const },
      { sessionId: "review", state: "review" as const },
      { sessionId: "claimed", state: "error" as const },
    ]
    expect(supervisionStatusRows(rows, new Set(["claimed"])).map((row) => row.sessionId)).toEqual(["err", "review"])
  })
})

describe("supervision request presentation", () => {
  test("joins the session title and the project label", () => {
    expect(supervisionRequestContext("Fix the dock", "AX Code")).toBe("Fix the dock · AX Code")
    expect(supervisionRequestContext("Fix the dock", "  ")).toBe("Fix the dock")
    expect(supervisionRequestContext("  ", "AX Code")).toBe("AX Code")
  })

  test("formats the diff and the file count with a minus sign", () => {
    expect(formatSupervisionEvidenceLine({ additions: 12, deletions: 3, files: 4 }, "4 files")).toBe("+12 −3 · 4 files")
    expect(formatSupervisionEvidenceLine({ additions: 2, deletions: 0, files: 0 }, "")).toBe("+2 −0")
    expect(formatSupervisionEvidenceLine({ additions: 0, deletions: 0, files: 1 }, "1 file")).toBe("1 file")
    expect(formatSupervisionEvidenceLine(null, "1 file")).toBeNull()
    expect(formatSupervisionEvidenceLine({ additions: 0, deletions: 0, files: 0 }, "")).toBeNull()
  })
})
