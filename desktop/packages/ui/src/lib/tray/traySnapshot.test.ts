import { describe, expect, test } from "vitest"

import { buildTraySnapshot } from "./traySnapshot"

const baseInput = {
  sessions: [
    { id: "root-1", title: "Fix the queue", directory: "/repo/app", updatedAt: 20 },
    { id: "child-1", title: "Subagent", parentID: "root-1", directory: "/repo/app", updatedAt: 30 },
    { id: "root-2", title: "Archived", directory: "/repo/other", updatedAt: 10, archived: 15 },
    { id: "root-3", title: "", directory: "/repo/app", updatedAt: 5 },
  ],
  statusBySession: { "root-1": "busy", "root-3": "retry" },
  unseenCountBySession: { "root-1": 2, "root-3": 1 },
  errorBySession: { "root-3": true },
  approvals: [
    { kind: "permission" as const, id: "perm-1", sessionId: "root-1", title: "Bash", resource: "rm -rf build" },
    { kind: "question" as const, id: "q-1", sessionId: "root-3", title: "Which branch?" },
  ],
}

describe("buildTraySnapshot", () => {
  test("lists root sessions newest first and skips children and archived ones", () => {
    const snapshot = buildTraySnapshot(baseInput)

    expect(snapshot.sessions.map((session) => session.id)).toEqual(["root-1", "root-3"])
    expect(snapshot.sessions[0]).toMatchObject({
      title: "Fix the queue",
      status: "busy",
      unseen: 2,
      hasError: false,
      subtitle: "app",
    })
    // The unnamed session still gets a usable title.
    expect(snapshot.sessions[1].title).toBe("Untitled Session")
    expect(snapshot.sessions[1].status).toBe("retry")
    expect(snapshot.sessions[1].hasError).toBe(true)
  })

  test("carries the branch into the subtitle when it is known", () => {
    const snapshot = buildTraySnapshot({
      ...baseInput,
      branchByDirectory: new Map([["/repo/app", "feat/queue"]]),
    })

    expect(snapshot.sessions[0].subtitle).toBe("app · feat/queue")
  })

  test("names the session a child's approval belongs to instead of its id", () => {
    // The menu rows are root sessions only, but an approval can belong to a child — a subagent asking for a
    // tool — and the title map was built from the rows, so the tray showed the raw session id.
    const snapshot = buildTraySnapshot({
      ...baseInput,
      approvals: [{ kind: "permission" as const, id: "perm-2", sessionId: "child-1", title: "Bash" }],
    })

    expect(snapshot.approvals[0].sessionTitle).toBe("Subagent")
  })

  test("marks only permissions with save patterns as rememberable", () => {
    const snapshot = buildTraySnapshot(baseInput)

    expect(snapshot.approvals).toEqual([
      {
        kind: "permission",
        id: "perm-1",
        sessionId: "root-1",
        sessionTitle: "Fix the queue",
        label: "Bash: rm -rf build",
        directory: "/repo/app",
        canSave: false,
      },
      {
        kind: "question",
        id: "q-1",
        sessionId: "root-3",
        sessionTitle: "Untitled Session",
        label: "Which branch?",
        // Taken from the session when the request carries no directory of its own.
        directory: "/repo/app",
        canSave: false,
      },
    ])

    const withPatterns = buildTraySnapshot({
      ...baseInput,
      approvals: [{ kind: "permission", id: "perm-2", sessionId: "root-1", title: "Bash", canSave: true }],
    })
    expect(withPatterns.approvals[0].canSave).toBe(true)
  })

  test("the dock badge counts every pending decision, child sessions and requests past the menu limit included", () => {
    const decisions = Array.from({ length: 7 }, (_, index) => ({
      kind: (index % 2 ? "question" : "permission") as "question" | "permission",
      id: `req-${index}`,
      sessionId: index === 0 ? "child-1" : "root-1",
      title: "Bash",
    }))
    const snapshot = buildTraySnapshot({ ...baseInput, approvals: [...decisions, decisions[0]], maxApprovals: 2 })
    expect(snapshot.approvals).toHaveLength(2)
    expect(snapshot.dockBadgeCount).toBe(7)
    // A request listed twice (a session lingering in two stores) appears once in the menu, as the badge counts it.
    const twice = buildTraySnapshot({ ...baseInput, approvals: [decisions[1], decisions[1]] })
    expect(twice.approvals).toHaveLength(1)
    expect(twice.dockBadgeCount).toBe(1)
    // Unread activity alone no longer raises the badge; it has its own titlebar count.
    expect(buildTraySnapshot({ ...baseInput, approvals: [] }).dockBadgeCount).toBe(0)
  })

  test("caps the menu rows and defaults the instance label", () => {
    const snapshot = buildTraySnapshot({
      ...baseInput,
      maxSessions: 1,
      maxApprovals: 1,
      instanceName: "   ",
    })

    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.approvals).toHaveLength(1)
    expect(snapshot.instanceName).toBe("AX Code")
    // No usage groups → the tray omits the submenu entirely.
    expect(snapshot.usage.groups).toEqual([])
  })

  test("lists the most consequential approvals first, before the menu limit applies", () => {
    const snapshot = buildTraySnapshot({
      ...baseInput,
      maxApprovals: 2,
      approvals: [
        { kind: "permission" as const, id: "safe", sessionId: "root-1", title: "Read", riskRank: 3 },
        { kind: "question" as const, id: "question", sessionId: "root-3", title: "Which?", riskRank: 2 },
        { kind: "permission" as const, id: "decide", sessionId: "root-1", title: "Bash", riskRank: 0 },
        { kind: "permission" as const, id: "legacy", sessionId: "root-1", title: "Edit" },
      ],
    })
    expect(snapshot.approvals.map((approval) => approval.id)).toEqual(["decide", "question"])
  })
})
