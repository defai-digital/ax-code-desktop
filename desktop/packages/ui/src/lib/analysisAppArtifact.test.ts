import { describe, expect, test } from "vitest"
import { ANALYSIS_APP_RUN_EVENT, claimAnalysisAppRun, parseAnalysisAppArtifact } from "./analysisAppArtifact"

const artifact = { version: 1, kind: "streamlit", entrypoint: "tools/Sales report.py" }
describe("analysis app declaration", () => {
  test("accepts a relative file without execution settings", () => {
    expect(parseAnalysisAppArtifact(JSON.stringify(artifact))).toEqual(artifact)
  })
  test.each([
    "",
    "/tmp/app.py",
    "../app.py",
    "tools/../app.py",
    "./app.py",
    "tools//app.py",
    "C:/app.py",
    "\\app.py",
    "-app.py",
    "tools/-app.py",
    "a\n.py",
    "https://host/app.py",
    "app.js",
  ])("rejects unsafe path %j", (entrypoint) => {
    expect(parseAnalysisAppArtifact(JSON.stringify({ ...artifact, entrypoint }))).toBeNull()
  })
  test.each([
    "{",
    "null",
    "[]",
    " ".repeat(2049),
    JSON.stringify({ ...artifact, command: "evil" }),
    JSON.stringify({ ...artifact, setup: true }),
    JSON.stringify({ ...artifact, version: 2 }),
    JSON.stringify({ ...artifact, kind: "shell" }),
  ])("rejects malformed, partial, oversized or extended declarations", (source) => {
    expect(parseAnalysisAppArtifact(source)).toBeNull()
  })
  test("only one matching session and directory can claim a request", () => {
    const event = new CustomEvent(ANALYSIS_APP_RUN_EVENT, {
      cancelable: true,
      detail: { sessionId: "session-a", directory: "/repo/worktree", artifact },
    })
    expect(claimAnalysisAppRun(event, "session-b", "/repo/worktree")).toBeNull()
    expect(claimAnalysisAppRun(event, "session-a", "/repo")).toBeNull()
    expect(event.defaultPrevented).toBe(false)
    expect(claimAnalysisAppRun(event, "session-a", "/repo/worktree")).toMatchObject({ artifact })
    expect(claimAnalysisAppRun(event, "session-a", "/repo/worktree")).toBeNull()
  })
  test("malformed in-process data remains unclaimed instead of throwing", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const event = new CustomEvent(ANALYSIS_APP_RUN_EVENT, {
      cancelable: true,
      detail: { sessionId: "s", directory: "/repo", artifact: circular },
    })
    expect(claimAnalysisAppRun(event, "s", "/repo")).toBeNull()
    expect(event.defaultPrevented).toBe(false)
  })
})
