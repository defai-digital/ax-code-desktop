import { describe, expect, test } from "vitest"

import {
  LIVE_SECTION_VISIBLE_LIMIT,
  chooseSidebarActivityMode,
  planLiveSidebarItems,
  selectLiveSidebarRows,
  type LiveSidebarRow,
} from "./activitySections"

const row = (
  sessionId: string,
  state: LiveSidebarRow["state"],
  projectLabel: string | null = null,
): LiveSidebarRow => ({
  sessionId,
  state,
  projectId: projectLabel ? `project-${projectLabel}` : null,
  projectLabel,
  directory: `/repo/${sessionId}`,
})

describe("selectLiveSidebarRows", () => {
  test("keeps decisions and working sessions in urgency order, and drops follow-ups and idle", () => {
    const rows = [
      row("perm", "permission"),
      row("question", "question"),
      row("err", "error"),
      row("review", "review"),
      row("run", "running"),
      row("idle", "idle"),
    ]
    expect(selectLiveSidebarRows(rows).map((item) => item.sessionId)).toEqual([
      "perm",
      "question",
      "run",
    ])
  })
})

describe("planLiveSidebarItems", () => {
  test("names the project from the supervision row and skips sessions we cannot render", () => {
    const sessions = new Map([
      ["perm", { id: "perm" }],
      ["run", { id: "run" }],
    ])
    const items = planLiveSidebarItems(
      [
        row("perm", "permission", "Ledger"),
        row("missing", "error", "Other"),
        row("run", "running", "Notes"),
        row("idle", "idle", "Quiet"),
      ],
      (entry) => {
        const session = sessions.get(entry.sessionId)
        if (!session) return null
        return {
          session,
          node: entry.sessionId === "perm" ? { session, children: [] } : null,
          groupDirectory: entry.sessionId === "perm" ? "/ledger" : null,
          branchLabel: entry.sessionId === "perm" ? "main" : null,
        }
      },
    )

    expect(items.map((item) => item.session.id)).toEqual(["perm", "run"])
    expect(items[0]).toMatchObject({
      node: { session: { id: "perm" } },
      projectId: "project-Ledger",
      groupDirectory: "/ledger",
      secondaryMeta: { projectLabel: "Ledger", branchLabel: "main" },
    })
    expect(items[1]).toMatchObject({
      node: null,
      groupDirectory: "/repo/run",
      secondaryMeta: { projectLabel: "Notes", branchLabel: null },
    })
  })

  test("caps the visible live section at 12 before show-more", () => {
    expect(LIVE_SECTION_VISIBLE_LIMIT).toBe(12)
  })
})

describe("chooseSidebarActivityMode", () => {
  test("shows live rows ahead of the active-now fallback", () => {
    expect(
      chooseSidebarActivityMode({ showRecent: true, renderedLiveCount: 2, liveRowCount: 2, activeNowCount: 4 }),
    ).toBe("live")
  })

  test("falls back to active now only when live rows cannot be rendered", () => {
    expect(
      chooseSidebarActivityMode({ showRecent: true, renderedLiveCount: 0, liveRowCount: 3, activeNowCount: 1 }),
    ).toBe("active-now")
  })

  test("hides the section when nothing is live", () => {
    expect(
      chooseSidebarActivityMode({ showRecent: true, renderedLiveCount: 0, liveRowCount: 0, activeNowCount: 5 }),
    ).toBe("none")
  })

  test("respects the recent-section preference", () => {
    expect(
      chooseSidebarActivityMode({ showRecent: false, renderedLiveCount: 2, liveRowCount: 2, activeNowCount: 1 }),
    ).toBe("none")
  })
})
