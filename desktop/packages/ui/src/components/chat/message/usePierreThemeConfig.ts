import React from "react"

import { useOptionalThemeSystem } from "@/contexts/useThemeSystem"
import { ensurePierreThemeRegistered, getAppThemeRegistrationId } from "@/lib/shiki/appThemeRegistry"
import { getDefaultTheme } from "@/lib/theme/themes"

export type PierreThemeConfig = {
  theme: { light: string; dark: string }
  themeType: "light" | "dark"
}

export const usePierreThemeConfig = (): PierreThemeConfig => {
  const themeSystem = useOptionalThemeSystem()
  const fallbackLightTheme = React.useMemo(() => getDefaultTheme(false), [])
  const fallbackDarkTheme = React.useMemo(() => getDefaultTheme(true), [])

  const availableThemes = React.useMemo(
    () => themeSystem?.availableThemes ?? [fallbackLightTheme, fallbackDarkTheme],
    [fallbackDarkTheme, fallbackLightTheme, themeSystem?.availableThemes],
  )
  const lightThemeId = themeSystem?.lightThemeId ?? fallbackLightTheme.metadata.id
  const darkThemeId = themeSystem?.darkThemeId ?? fallbackDarkTheme.metadata.id

  const lightTheme = React.useMemo(
    () => availableThemes.find((theme) => theme.metadata.id === lightThemeId) ?? fallbackLightTheme,
    [availableThemes, fallbackLightTheme, lightThemeId],
  )
  const darkTheme = React.useMemo(
    () => availableThemes.find((theme) => theme.metadata.id === darkThemeId) ?? fallbackDarkTheme,
    [availableThemes, darkThemeId, fallbackDarkTheme],
  )

  // Register during render, like PierreDiffViewer does: consumers resolve the theme
  // name in their layout effect, which runs before this component's passive effects,
  // so registering there left the first diff after a palette change unresolved (the
  // rejection was swallowed and the panel kept the old colours).
  const theme = React.useMemo(() => {
    ensurePierreThemeRegistered(lightTheme)
    ensurePierreThemeRegistered(darkTheme)
    return { light: getAppThemeRegistrationId(lightTheme), dark: getAppThemeRegistrationId(darkTheme) }
  }, [darkTheme, lightTheme])

  const currentVariant = themeSystem?.currentTheme.metadata.variant ?? "light"

  return {
    theme,
    themeType: currentVariant === "dark" ? "dark" : "light",
  }
}
