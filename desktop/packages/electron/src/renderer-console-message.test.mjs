import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { readRendererConsoleWarning } = require("./renderer-console-message.js")

describe("readRendererConsoleWarning", () => {
  test("reads the event object Electron passes today", () => {
    // Regression: the reader looked for `level` on the second argument, which is the deprecated
    // numeric level, so every renderer warning and error was dropped from main.log.
    const event = {
      level: "warning",
      message: "Failed to auto-save settings: Error: 502 Bad Gateway",
      lineNumber: 12,
      sourceId: "app://ax-code/assets/app.js",
    }
    expect(readRendererConsoleWarning(event, 2, event.message, 12, event.sourceId)).toEqual({
      level: 2,
      message: "Failed to auto-save settings: Error: 502 Bad Gateway",
      line: 12,
      source: "app://ax-code/assets/app.js",
    })
    expect(readRendererConsoleWarning({ ...event, level: "error" })?.level).toBe(3)
  })

  test("skips messages below warning", () => {
    expect(readRendererConsoleWarning({ level: "info", message: "ready" })).toBeNull()
    expect(readRendererConsoleWarning({ level: "debug", message: "trace" })).toBeNull()
  })

  test("falls back to the positional arguments of older Electron releases", () => {
    expect(readRendererConsoleWarning({}, 3, "boom", 4, "app://ax-code/x.js")).toEqual({
      level: 3,
      message: "boom",
      line: 4,
      source: "app://ax-code/x.js",
    })
    expect(readRendererConsoleWarning({}, 1, "fine", 1, "x")).toBeNull()
  })
})
