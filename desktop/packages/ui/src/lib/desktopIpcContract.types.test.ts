import { describe, expect, test, vi } from "vitest"

vi.mock("./desktopBridge", () => ({
  getDesktopBridge: () => ({ invoke: vi.fn(async () => "ok") }),
  hasDesktopBridge: () => true,
}))

import { invokeDesktop } from "./desktop"

// The type assertions below are checked by `tsc --noEmit` (ADR-019): a literal command with
// arguments that contradict the generated contract must not compile.
const typeOnly = () => {
  void invokeDesktop("desktop_open_path", { path: "/tmp", app: null })
  void invokeDesktop("desktop_set_badge_count", { count: 3 })
  // @ts-expect-error path must be a string
  void invokeDesktop("desktop_open_path", { path: 1 })
  // @ts-expect-error path is required
  void invokeDesktop("desktop_open_path", {})
  // @ts-expect-error count must be a number
  void invokeDesktop("desktop_set_badge_count", { count: "3" })
  // A non-literal command keeps the loose argument shape.
  const dynamic: string = "desktop_open_path"
  void invokeDesktop(dynamic, { anything: true })
}

describe("typed desktop invoke", () => {
  test("forwards the command and arguments to the bridge", async () => {
    expect(typeof typeOnly).toBe("function")
    await expect(invokeDesktop("desktop_reveal_path", { path: "/tmp" })).resolves.toBe("ok")
  })
})
