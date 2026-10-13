import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { initialWorkModeForNewChat } from "@/lib/workMode"
import { resolveAvailableSettingsSlug, resolveSettingsSlug, SETTINGS_PAGE_METADATA } from "@/lib/settings/metadata"
import {
  OVERFLOW_SEND_CONTROLS,
  PRIMARY_EXECUTION_MODES,
  WORK_MODE_CHOICES,
  isPrimaryExecutionMode,
  selectLabeledWorkMode,
  sessionMenuGroup,
  sessionMenuLayout,
} from "./composerControls"

describe("composer and navigation controls", () => {
  test("work mode is an explicit labeled choice and a new chat starts in Agent", () => {
    expect(WORK_MODE_CHOICES.map((choice) => [choice.id, choice.label])).toEqual([
      ["agent", "Agent"],
      ["council", "Council"],
      ["arena", "Arena"],
    ])
    expect(WORK_MODE_CHOICES.every((choice) => choice.label.trim().length > 0)).toBe(true)
    expect(selectLabeledWorkMode("agent")).toBe("agent")
    expect(selectLabeledWorkMode("council")).toBe("council")
    expect(selectLabeledWorkMode("arena")).toBe("arena")
    expect(initialWorkModeForNewChat()).toBe("agent")

    useWorkModeStore.setState({ modeByDirectory: { "/proj": "arena" } })
    useWorkModeStore.getState().resetToAgent("/proj")
    expect(useWorkModeStore.getState().getMode("/proj")).toBe("agent")

    const selector = readFileSync(sourcePath("../components/chat/WorkModeSelector.tsx"), "utf8")
    expect(selector).toContain("selectLabeledWorkMode")
    expect(selector).not.toContain("cycleWorkMode")
  })

  test("long-run and WebMCP stay off the primary send row", () => {
    expect(PRIMARY_EXECUTION_MODES).toEqual(["manual", "autonomous"])
    expect(isPrimaryExecutionMode("long-run")).toBe(false)
    expect(OVERFLOW_SEND_CONTROLS).toEqual(["long-run", "webmcp"])

    const chatInput = readFileSync(sourcePath("../components/chat/ChatInput-impl.tsx"), "utf8")
    const execution = readFileSync(sourcePath("../components/chat/ExecutionModeSelector.tsx"), "utf8")
    expect(chatInput).not.toContain("WebMcpComposerChip")
    expect(chatInput).toContain("ComposerOverflowMenu")
    expect(execution).toContain("isPrimaryExecutionMode")
  })

  test("rare session actions sit under More and rename, pin, and archive stay on top", () => {
    const layout = sessionMenuLayout()
    expect(layout.top).toEqual(["rename", "pin", "archive"])
    expect(sessionMenuGroup("rename")).toBe("top")
    expect(sessionMenuGroup("pin")).toBe("top")
    expect(sessionMenuGroup("archive")).toBe("top")
    for (const action of [
      "share",
      "copy-link",
      "unshare",
      "export-markdown",
      "run-fusion",
      "open-side-panel",
      "open-mini-chat",
    ] as const) {
      expect(sessionMenuGroup(action)).toBe("more")
      expect(layout.top).not.toContain(action)
    }

    const menu = readFileSync(sourcePath("../components/session/sidebar/SessionNodeItem.tsx"), "utf8")
    expect(menu).toContain("sessionMenuLayout")
    expect(menu).toContain('data-session-menu-group="more"')
  })

  test("retired remote-instances slug resolves home and legacy sidebar slugs still open", () => {
    expect(SETTINGS_PAGE_METADATA.some((page) => (page.slug as string) === "remote-instances")).toBe(false)
    expect(() => resolveSettingsSlug("remote-instances")).not.toThrow()
    expect(() => resolveAvailableSettingsSlug("remote-instances", { isDesktop: true, isWeb: false })).not.toThrow()
    expect(resolveSettingsSlug("remote-instances")).toBe("home")
    expect(resolveAvailableSettingsSlug("remote-instances", { isDesktop: true, isWeb: false })).toBe("home")
    expect(resolveSettingsSlug("agents")).toBe("agents")
    expect(resolveSettingsSlug("commands")).toBe("commands")
    expect(resolveSettingsSlug("mcp")).toBe("mcp")
    expect(resolveSettingsSlug("skills")).toBe("skills.installed")
    expect(resolveSettingsSlug("providers")).toBe("providers")
    expect(resolveSettingsSlug("git-identities")).toBe("git")
    expect(resolveSettingsSlug("settings")).toBe("home")
    expect(resolveSettingsSlug("sessions")).toBe("sessions")
    expect(resolveSettingsSlug("plugins")).toBe("home")
    expect(resolveSettingsSlug("magic-prompts")).toBe("home")
    expect(resolveSettingsSlug("snippets")).toBe("home")
    expect(resolveSettingsSlug("skills.catalog")).toBe("skills.installed")
  })
})
