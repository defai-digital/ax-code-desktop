import type { I18nKey } from "@/lib/i18n"
import type { SettingsPageGroup, SettingsPageMeta, SettingsPageSlug } from "./metadata"

/** Product order is shared by all Settings layouts and retained while filtering. */
export const SETTINGS_NAVIGATION: readonly {
  id: SettingsPageGroup
  titleKey: I18nKey
  pages: readonly SettingsPageSlug[]
}[] = [
  { id: "general", titleKey: "settings.view.nav.group.preferences", pages: ["appearance", "chat", "sessions", "notifications", "shortcuts"] },
  { id: "projects", titleKey: "settings.view.nav.group.projects", pages: ["projects", "git"] },
  { id: "models", titleKey: "settings.view.nav.group.models", pages: ["providers", "models"] },
  { id: "coding", titleKey: "settings.view.nav.group.coding", pages: ["agents", "behavior", "hooks", "commands", "skills.installed", "mcp"] },
]

/**
 * Pages that share one navigation entry. The entry opens the first page and the others are tabs on it, so the
 * navigation lists nine destinations while every page keeps its own slug and deep link.
 */
export const SETTINGS_PAGE_FAMILIES: readonly (readonly SettingsPageSlug[])[] = [
  ["appearance", "chat"],
  ["sessions", "notifications"],
  ["shortcuts"],
  ["projects", "git"],
  ["providers"],
  // Local models stay their own entry: the page exists only on a host that can run them, and a tab would hide that.
  ["models"],
  ["agents", "behavior", "hooks"],
  ["commands", "skills.installed"],
  ["mcp"],
]

/** The pages that share a navigation entry with `slug`, itself included. A page outside every family stands alone. */
export function settingsFamilyOf(slug: SettingsPageSlug): readonly SettingsPageSlug[] {
  return SETTINGS_PAGE_FAMILIES.find(family => family.includes(slug)) ?? [slug]
}

export function groupSettingsPages(pages: readonly SettingsPageMeta[]) {
  const bySlug = new Map(pages.map(page => [page.slug, page]))
  return SETTINGS_NAVIGATION.map(group => ({
    ...group,
    pages: group.pages.flatMap(slug => {
      const page = bySlug.get(slug)
      return page ? [page] : []
    }),
  })).filter(group => group.pages.length > 0)
}

/**
 * One navigation entry per family: the first of its pages that is present. A family whose first page is hidden
 * (an unavailable page, a filtered one) is still reachable through the next.
 */
export function groupSettingsDestinations(pages: readonly SettingsPageMeta[]) {
  const present = new Set(pages.map(page => page.slug))
  const leads = new Set(
    SETTINGS_PAGE_FAMILIES.flatMap(family => {
      const lead = family.find(slug => present.has(slug))
      return lead ? [lead] : []
    }),
  )
  return groupSettingsPages(pages.filter(page => leads.has(page.slug) || settingsFamilyOf(page.slug).length === 1))
}
