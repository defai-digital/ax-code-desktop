import { expect, test } from "vitest"
import { SETTINGS_PAGE_METADATA } from "./metadata"
import { groupSettingsPages, SETTINGS_NAVIGATION } from "./navigation"

test("all visible Settings destinations occur once and agree with their navigation group", () => {
  const pages = SETTINGS_PAGE_METADATA.filter(page => page.slug !== "home" && !page.hideFromNavigation)
  const destinations = SETTINGS_NAVIGATION.flatMap(group => group.pages)
  expect(new Set(destinations).size).toBe(destinations.length)
  expect([...destinations].sort()).toEqual(pages.map(page => page.slug).sort())
  for (const group of groupSettingsPages(pages)) {
    expect(group.pages.every(page => page.group === group.id)).toBe(true)
  }
})

test("filtering and input inventory order preserve product navigation order", () => {
  const all = groupSettingsPages(SETTINGS_PAGE_METADATA)
  expect(groupSettingsPages([...SETTINGS_PAGE_METADATA].reverse())).toEqual(all)
  const filtered = groupSettingsPages(SETTINGS_PAGE_METADATA.filter(page => ["models", "hooks", "providers", "behavior"].includes(page.slug)))
  expect(filtered.map(group => [group.id, group.pages.map(page => page.slug)])).toEqual([
    ["models", ["providers", "models"]], ["advanced", ["behavior", "hooks"]],
  ])
  expect(groupSettingsPages([])).toEqual([])
})
