import { describe, expect, test, vi } from "vitest"

import { generateTheme } from "@/lib/theme/generateTheme"

const { registerCustomTheme } = vi.hoisted(() => ({ registerCustomTheme: vi.fn() }))
vi.mock("@pierre/diffs", () => ({ registerCustomTheme }))

import { ensurePierreThemeRegistered, getAppThemeRegistrationId, getResolvedShikiTheme } from "./appThemeRegistry"

describe("app theme renderer registration", () => {
  const themeAtContrast = (contrast: number) => generateTheme({
    id: "generated-resaved-dark", name: "Resaved", variant: "dark",
    base: "#24262d", accent: "#6d75e8", contrast,
  })

  test("re-saving the same persistent id registers fresh editor and diff colors", async () => {
    const low = themeAtContrast(0)
    const high = themeAtContrast(1)
    expect(high.metadata.id).toBe(low.metadata.id)
    const lowResolved = getResolvedShikiTheme(low)
    ensurePierreThemeRegistered(low)
    const lowRegistration = registerCustomTheme.mock.calls.at(-1)!
    const highResolved = getResolvedShikiTheme(high)
    ensurePierreThemeRegistered(high)
    const highRegistration = registerCustomTheme.mock.calls.at(-1)!

    expect(lowResolved.bg).toBe("#151618")
    expect(highResolved.bg).toBe("#09090b")
    expect(highResolved.name).not.toBe(lowResolved.name)
    expect(String(highResolved)).toBe(getAppThemeRegistrationId(high))
    expect(highRegistration[0]).not.toBe(lowRegistration[0])
    expect(await lowRegistration[1]()).toBe(lowResolved)
    expect(await highRegistration[1]()).toBe(highResolved)
    expect(highResolved.colors?.["editor.background"]).toBe("#09090b")

    const count = registerCustomTheme.mock.calls.length
    ensurePierreThemeRegistered(structuredClone(high))
    expect(registerCustomTheme.mock.calls).toHaveLength(count)
    expect(getResolvedShikiTheme(structuredClone(high))).toBe(highResolved)
  })

  test("token-only changes get a new renderer key while metadata changes reuse the palette", () => {
    const original = themeAtContrast(0.5)
    const edited = structuredClone(original)
    edited.colors.syntax.tokens!.constant = "#abcdef"
    expect(getAppThemeRegistrationId(edited)).not.toBe(getAppThemeRegistrationId(original))
    const resolved = getResolvedShikiTheme(edited)
    expect(resolved.settings.find((rule) => rule.name === "constants")?.settings.foreground).toBe("#abcdef")
    edited.metadata.name = "Renamed"
    edited.metadata.description = "Updated description"
    expect(getResolvedShikiTheme(edited)).toBe(resolved)
  })
})
