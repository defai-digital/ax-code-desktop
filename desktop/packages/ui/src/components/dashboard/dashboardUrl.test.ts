import { describe, expect, test } from "vitest"

import { buildDashboardUrl, dashboardReportRoot } from "./dashboardUrl"

describe("dashboard report path", () => {
  test("opens /run-report for a current runtime and /dre-graph before 7.24.1", () => {
    expect(dashboardReportRoot("7.24.1")).toBe("/run-report")
    expect(dashboardReportRoot("v7.24.4")).toBe("/run-report")
    expect(dashboardReportRoot("7.24.0")).toBe("/dre-graph")
    expect(dashboardReportRoot("7.10.2")).toBe("/dre-graph")
    expect(dashboardReportRoot("v7.10.2")).toBe("/dre-graph")
    expect(dashboardReportRoot("7.24.1-rc.1")).toBe("/dre-graph")
    expect(dashboardReportRoot(null)).toBe("/dre-graph")
    expect(dashboardReportRoot("")).toBe("/dre-graph")
  })

  test("builds the session report with the directory query", () => {
    expect(buildDashboardUrl("ses_1", "/workspace/project", "http://127.0.0.1:4310", "7.24.1")).toBe(
      "http://127.0.0.1:4310/run-report/session/ses_1?directory=%2Fworkspace%2Fproject",
    )
    expect(buildDashboardUrl("ses/1", "/workspace/project", "http://127.0.0.1:4310/", "7.10.2")).toBe(
      "http://127.0.0.1:4310/dre-graph/session/ses%2F1?directory=%2Fworkspace%2Fproject",
    )
  })

  test("keeps a project index when no session is selected", () => {
    expect(buildDashboardUrl(null, "/workspace/project", "", "7.25.0")).toBe(
      "/run-report?directory=%2Fworkspace%2Fproject",
    )
    expect(buildDashboardUrl(null, "", "http://127.0.0.1:4310", "6.8.0")).toBe("http://127.0.0.1:4310/dre-graph")
  })
})
