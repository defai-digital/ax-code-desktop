import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"

import { usePierreThemeConfig } from "@/components/chat/message/usePierreThemeConfig"
import { generateTheme } from "@/lib/theme/generateTheme"
import { getAppThemeRegistrationId } from "./appThemeRegistry"

const { themeSystemMock, registerCustomTheme } = vi.hoisted(() => ({
  themeSystemMock: vi.fn(),
  registerCustomTheme: vi.fn(),
}))
vi.mock("@/contexts/useThemeSystem", () => ({ useOptionalThemeSystem: themeSystemMock }))
vi.mock("@pierre/diffs", () => ({ registerCustomTheme }))

test("diff consumers switch renderer keys after the selected persistent theme is replaced", () => {
  const options = { id: "selected-dark", name: "Selected", base: "#24262d", accent: "#6d75e8" }
  const light = generateTheme({ ...options, id: "selected-light", variant: "light" })
  const low = generateTheme({ ...options, variant: "dark", contrast: 0 })
  const high = generateTheme({ ...options, variant: "dark", contrast: 1 })
  const container = document.createElement("div")
  const root = createRoot(container)
  const Probe = () => {
    const { theme, themeType } = usePierreThemeConfig()
    return <div data-light={theme.light} data-dark={theme.dark} data-variant={themeType} />
  }
  try {
    for (const dark of [low, high]) {
      themeSystemMock.mockReturnValue({
        availableThemes: [light, dark], lightThemeId: light.metadata.id,
        darkThemeId: dark.metadata.id, currentTheme: dark,
      })
      act(() => root.render(<Probe />))
      const probe = container.firstElementChild as HTMLElement
      expect(probe.dataset.dark).toBe(getAppThemeRegistrationId(dark))
      expect(probe.dataset.light).toBe(getAppThemeRegistrationId(light))
      expect(probe.dataset.variant).toBe("dark")
      expect(registerCustomTheme.mock.calls.some(([id]) => id === probe.dataset.dark)).toBe(true)
    }
    expect(getAppThemeRegistrationId(high)).not.toBe(getAppThemeRegistrationId(low))
  } finally {
    act(() => root.unmount())
  }
})
