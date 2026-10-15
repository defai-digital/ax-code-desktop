import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { DESKTOP_INVOKE_COMMANDS, isAllowedDesktopInvokeCommand } = require("./preload-ipc-policy.js")
const contract = require("./desktop-ipc-contract.json")

describe("preload IPC policy", () => {
  test("allows the desktop command namespace used by the renderer bridge", () => {
    expect(isAllowedDesktopInvokeCommand("desktop_get_app_version")).toBe(true)
    expect(isAllowedDesktopInvokeCommand("desktop_open_session_mini_chat_window")).toBe(true)
  })

  test("allows every command declared in the desktop IPC contract", () => {
    for (const entry of contract.commands) {
      expect(DESKTOP_INVOKE_COMMANDS.has(entry.command), entry.command).toBe(true)
    }
  })

  test("blocks non-desktop IPC channels from the Tauri-compatible invoke bridge", () => {
    expect(isAllowedDesktopInvokeCommand("ax-code:dom-event")).toBe(false)
    expect(isAllowedDesktopInvokeCommand("openchamber:menu-action")).toBe(false)
    expect(isAllowedDesktopInvokeCommand("desktop")).toBe(false)
    expect(isAllowedDesktopInvokeCommand("__proto__")).toBe(false)
    expect(isAllowedDesktopInvokeCommand(null)).toBe(false)
  })

  test("does not grant newly named desktop commands implicitly", () => {
    expect(isAllowedDesktopInvokeCommand("desktop_read_arbitrary_secret")).toBe(false)
    expect(isAllowedDesktopInvokeCommand("desktop_spawn_process")).toBe(false)
  })
})
