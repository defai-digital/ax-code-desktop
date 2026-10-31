import { describe, expect, it } from "vitest"
import { directoriesForScheduledTaskEvent } from "./useScheduledTasksSync"

const groups = {
  "/work/alpha": { tasks: [{ id: "st_1", directory: "/work/alpha" }] },
  // Registered through a symlink; the runtime reports the resolved real path.
  "/work/link": { tasks: [{ id: "st_2", directory: "/Volumes/data/real" }] },
  "/work/beta": { tasks: [{ id: "st_1", directory: "/work/beta" }] },
}
const known = Object.keys(groups)

describe("directoriesForScheduledTaskEvent", () => {
  it("reloads the registered project the event names", () => {
    expect(directoriesForScheduledTaskEvent({ directory: "/work/alpha", taskId: "st_9" }, known, groups)).toEqual([
      "/work/alpha",
    ])
    expect(directoriesForScheduledTaskEvent({ directory: "/work/alpha/" }, known, groups)).toEqual(["/work/alpha"])
  })

  it("matches a directory spelled with another separator or drive-letter case", () => {
    const windows = { "C:/Repo": { tasks: [{ id: "st_1", directory: "C:/Repo" }] } }
    expect(directoriesForScheduledTaskEvent({ directory: "c:\\Repo\\" }, ["C:/Repo"], windows)).toEqual(["C:/Repo"])
  })

  it("resolves a real-path directory to the project whose tasks carry it", () => {
    // Regression: the event was dropped because its directory was not a
    // registered path, so a project added through a symlink never refreshed.
    expect(directoriesForScheduledTaskEvent({ directory: "/Volumes/data/real", taskId: "st_2" }, known, groups)).toEqual([
      "/work/link",
    ])
  })

  it("falls back to every project that lists the task id", () => {
    expect(directoriesForScheduledTaskEvent({ taskId: "st_1" }, known, groups)).toEqual(["/work/alpha", "/work/beta"])
    expect(directoriesForScheduledTaskEvent({ directory: "/elsewhere", taskId: "st_2" }, known, groups)).toEqual([
      "/work/link",
    ])
  })

  it("reloads everything for an event with neither directory nor task id, and nothing for an unknown one", () => {
    expect(directoriesForScheduledTaskEvent({}, known, groups)).toBe("all")
    expect(directoriesForScheduledTaskEvent({ directory: "   " }, known, groups)).toBe("all")
    expect(directoriesForScheduledTaskEvent({ taskId: "gone" }, known, groups)).toEqual([])
    expect(directoriesForScheduledTaskEvent({ directory: "/elsewhere" }, known, groups)).toEqual([])
  })
})
