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
  HEADER_OWNED_SESSION_STATUS,
  PRIMARY_EXECUTION_MODES,
  WORK_MODE_CHOICES,
  isPrimaryExecutionMode,
  isUnattendedExecutionMode,
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

  test("long-run is the third execution mode in the same menu, after a separator", () => {
    expect(PRIMARY_EXECUTION_MODES).toEqual(["manual", "autonomous"])
    expect(isPrimaryExecutionMode("long-run")).toBe(false)

    const chatInput = readFileSync(sourcePath("../components/chat/ChatInput-impl.tsx"), "utf8")
    const execution = readFileSync(sourcePath("../components/chat/ExecutionModeSelector.tsx"), "utf8")
    // No one-item overflow menu on the send row.
    expect(chatInput).not.toContain("ComposerOverflowMenu")
    expect(execution).toMatch(
      /<DropdownMenuRadioGroup[\s\S]*?isPrimaryExecutionMode\(option\.value\)\)\.map\(renderModeItem\)[\s\S]*?<DropdownMenuSeparator \/>[\s\S]*?!isPrimaryExecutionMode\(option\.value\)\)\.map\(renderModeItem\)[\s\S]*?<\/DropdownMenuRadioGroup>/,
    )
    // Manual no longer shares the pending-permission glyph.
    expect(execution).toContain('icon: "hand"')
  })

  test("permission auto-accept is a run control with a warning on-state", () => {
    const chatInput = readFileSync(sourcePath("../components/chat/ChatInput-impl.tsx"), "utf8")
    expect(chatInput).toMatch(/data-composer-run-group[\s\S]*?<SandboxToggle[\s\S]*?<PermissionAutoAcceptButton/)
    expect(chatInput).toContain('name={permissionAutoAcceptEnabled ? "shield-check" : "shield"}')
    expect(chatInput).toContain('"bg-[var(--status-warning-background)] text-[var(--status-warning)]')
    // Off must not look disabled.
    expect(chatInput).not.toContain('!permissionScopeSessionId && "opacity-30"')
    expect(chatInput).toContain('t("chat.chatInput.permissionAutoAccept.scopeHint")')
  })

  test("the work mode chip always shows the active mode in its color", () => {
    const selector = readFileSync(sourcePath("../components/chat/WorkModeSelector.tsx"), "utf8")
    expect(selector).toContain("WORK_MODE_TONES[active.id]")
    expect(selector).toMatch(/agent:\s*"bg-emerald-500\/15 text-emerald-700/)
    expect(selector).toMatch(/council:\s*"bg-blue-500\/15 text-blue-700/)
    expect(selector).toMatch(/arena:\s*"bg-purple-500\/15 text-purple-700/)
    expect(selector).not.toContain("text-muted-foreground transition-colors")
  })

  test("Auto and long-run show an on state in the composer", () => {
    expect(isUnattendedExecutionMode("autonomous")).toBe(true)
    expect(isUnattendedExecutionMode("long-run")).toBe(true)
    expect(isUnattendedExecutionMode("manual")).toBe(false)
    expect(isUnattendedExecutionMode(undefined)).toBe(false)

    const execution = readFileSync(sourcePath("../components/chat/ExecutionModeSelector.tsx"), "utf8")
    expect(execution).toContain("isUnattendedExecutionMode(mode)")
    expect(execution).toMatch(/unattended &&\s*"bg-interactive-selection text-\[var\(--status-info\)\]/)
  })

  test("the composer does not repeat status the main window header shows", () => {
    expect(HEADER_OWNED_SESSION_STATUS).toEqual(["context-usage", "webmcp"])

    const chatInput = readFileSync(sourcePath("../components/chat/ChatInput-impl.tsx"), "utf8")
    expect(chatInput).not.toMatch(/WebMcp/)

    const header = readFileSync(sourcePath("../components/layout/Header.tsx"), "utf8")
    expect(header).toContain("<WebMcpHeaderButton")
    expect(header).toContain("<ContextUsageDisplay")

    // The composer's context usage only renders where no header shows it.
    const usage = readFileSync(sourcePath("../components/chat/UsageIndicator.tsx"), "utf8")
    expect(usage).toContain('surfaceMode !== "default"')
    const app = readFileSync(sourcePath("../App.tsx"), "utf8")
    expect(app).toMatch(/<ChatSurfaceProvider mode="main-window">\s*<MainLayout \/>/)
    const miniChat = readFileSync(sourcePath("../components/mini-chat/MiniChatLayout.tsx"), "utf8")
    expect(miniChat).toContain('<ChatSurfaceProvider mode="mini-chat">')
    expect(miniChat).toContain("<ContextUsageDisplay")
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
