import { expect, test } from "vitest"
import { SETTINGS_PAGE_METADATA } from "./metadata"
import {
  groupSettingsDestinations,
  groupSettingsPages,
  SETTINGS_NAVIGATION,
  SETTINGS_PAGE_FAMILIES,
  settingsFamilyOf,
} from "./navigation"

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
    ["models", ["providers", "models"]], ["coding", ["behavior", "hooks"]],
  ])
  expect(groupSettingsPages([])).toEqual([])
})

test("fifteen pages are reached through nine navigation entries, and every page keeps its own slug", () => {
  const pages = SETTINGS_PAGE_METADATA.filter(page => page.slug !== "home" && !page.hideFromNavigation)
  const inFamilies = SETTINGS_PAGE_FAMILIES.flat()
  expect(new Set(inFamilies).size).toBe(inFamilies.length)
  expect([...inFamilies].sort()).toEqual(pages.map(page => page.slug).sort())
  const entries = groupSettingsDestinations(pages).flatMap(group => group.pages.map(page => page.slug))
  expect(entries).toEqual([
    "appearance", "sessions", "shortcuts", "projects", "providers", "models", "agents", "commands", "mcp",
  ])
  expect(settingsFamilyOf("hooks")).toEqual(["agents", "behavior", "hooks"])
  expect(settingsFamilyOf("mcp")).toEqual(["mcp"])
})

test("a family whose first page is hidden is entered through the next one", () => {
  const pages = SETTINGS_PAGE_METADATA.filter(page => page.slug !== "home" && page.slug !== "agents")
  const coding = groupSettingsDestinations(pages).find(group => group.id === "coding")
  expect(coding?.pages.map(page => page.slug)).toEqual(["behavior", "commands", "mcp"])
})
