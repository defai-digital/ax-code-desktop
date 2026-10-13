import { describe, expect, it } from "vitest"

import { getSettingsNavIcon } from "./navIcons"
import { resolveAvailableSettingsSlug, resolveSettingsSlug, SETTINGS_PAGE_METADATA } from "./metadata"

describe("settings metadata", () => {
  it("exposes every visible settings page with a navigation icon", () => {
    const missingIcons = SETTINGS_PAGE_METADATA.filter((page) => page.slug !== "home").filter(
      (page) => !getSettingsNavIcon(page.slug),
    )

    expect(missingIcons).toEqual([])
  })

  it("resolves the retired remote-instances slug to home without a dead page", () => {
    expect(SETTINGS_PAGE_METADATA.some((page) => (page.slug as string) === "remote-instances")).toBe(false)
    expect(() => resolveSettingsSlug("remote-instances")).not.toThrow()
    expect(() => resolveAvailableSettingsSlug("remote-instances", { isDesktop: true, isWeb: false })).not.toThrow()
    expect(resolveSettingsSlug("remote-instances")).toBe("home")
    expect(resolveAvailableSettingsSlug("remote-instances", { isDesktop: true, isWeb: false })).toBe("home")
  })

  it("retires duplicate prompt and extension pages and keeps the skills catalog inside skills", () => {
    for (const slug of ["plugins", "magic-prompts", "snippets", "skills.catalog"] as const) {
      expect(SETTINGS_PAGE_METADATA.some((page) => (page.slug as string) === slug)).toBe(false)
      expect(() => resolveSettingsSlug(slug)).not.toThrow()
    }
    expect(resolveSettingsSlug("plugins")).toBe("home")
    expect(resolveSettingsSlug("magic-prompts")).toBe("home")
    expect(resolveSettingsSlug("snippets")).toBe("home")
    expect(resolveSettingsSlug("skills.catalog")).toBe("skills.installed")
    expect(resolveAvailableSettingsSlug("skills.catalog", { isDesktop: true, isWeb: false })).toBe("skills.installed")
  })

  it("keeps legacy sidebar section slugs resolvable", () => {
    expect(resolveSettingsSlug("sessions")).toBe("sessions")
    expect(resolveSettingsSlug("agents")).toBe("agents")
    expect(resolveSettingsSlug("commands")).toBe("commands")
    expect(resolveSettingsSlug("mcp")).toBe("mcp")
    expect(resolveSettingsSlug("skills")).toBe("skills.installed")
    expect(resolveSettingsSlug("providers")).toBe("providers")
    expect(resolveSettingsSlug("git-identities")).toBe("git")
    expect(resolveSettingsSlug("settings")).toBe("home")
  })
})
