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
  { id: "coding", titleKey: "settings.view.nav.group.coding", pages: ["agents", "commands", "skills.installed", "mcp"] },
  { id: "advanced", titleKey: "settings.view.nav.group.advanced", pages: ["behavior", "hooks"] },
]

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
