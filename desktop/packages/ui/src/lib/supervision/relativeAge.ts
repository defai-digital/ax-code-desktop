import type { I18nKey, I18nParams } from "../i18n/store"

export type RelativeAgeTranslator = (key: I18nKey, params?: I18nParams) => string

/**
 * Format an age in milliseconds (for example `Date.now() - updatedAt`) as a
 * short relative label such as "just now", "5m ago", "2h ago" or "3d ago".
 * Pure: the caller supplies the translator so this stays testable and locale
 * handling stays with the i18n layer.
 */
export function formatRelativeAge(ms: number, t: RelativeAgeTranslator): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000)
  if (minutes < 1) return t("notificationCenter.time.justNow")
  if (minutes < 60) return t("notificationCenter.time.minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("notificationCenter.time.hoursAgo", { count: hours })
  return t("notificationCenter.time.daysAgo", { count: Math.floor(hours / 24) })
}
