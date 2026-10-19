import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { dict as enDict } from "./messages/en"
import { I18nProvider } from "./context"
import {
  applyDocumentLocale,
  documentDirection,
  readDevDirectionOverride,
  resetDevDirectionOverrideForTests,
} from "./direction"
import { LOCALES, localeDirection, type Locale } from "./runtime"
import { resetI18nDictionaryCacheForTests, useI18nStore } from "./store"

const setSearch = (search: string) => window.history.replaceState(null, "", `${window.location.pathname}${search}`)

beforeEach(() => {
  resetI18nDictionaryCacheForTests()
  resetDevDirectionOverrideForTests()
  useI18nStore.setState({ locale: "en", formatLocale: "en", dictionary: enDict })
  document.documentElement.lang = ""
  document.documentElement.dir = ""
})
afterEach(() => {
  setSearch("")
  resetDevDirectionOverrideForTests()
  vi.unstubAllEnvs()
})

describe("localeDirection", () => {
  test("every packaged locale is left to right", () => {
    for (const locale of LOCALES) expect(localeDirection(locale)).toBe("ltr")
  })

  test("right-to-left base languages resolve before a locale entry exists", () => {
    for (const code of ["ar", "he", "fa", "ur", "ar-EG", "he-IL", "fa-IR", "ur_PK", "AR"]) {
      expect(localeDirection(code)).toBe("rtl")
    }
  })

  test("unknown, malformed and non-string codes fall back to left to right", () => {
    for (const code of ["", "xx", "not a locale", "arc", "hi", undefined, null, 42]) {
      expect(localeDirection(code)).toBe("ltr")
    }
  })
})

describe("dev direction override", () => {
  test("reads ?dir=rtl and ?dir=ltr only in development", () => {
    expect(readDevDirectionOverride("?dir=rtl", true)).toBe("rtl")
    expect(readDevDirectionOverride("?session=1&dir=ltr", true)).toBe("ltr")
    expect(readDevDirectionOverride("?dir=auto", true)).toBeUndefined()
    expect(readDevDirectionOverride("", true)).toBeUndefined()
    expect(readDevDirectionOverride("?dir=rtl", false)).toBeUndefined()
  })

  test("forces the document direction in a development build", () => {
    vi.stubEnv("DEV", true)
    setSearch("?dir=rtl")
    expect(documentDirection("en")).toBe("rtl")
  })

  test("is ignored in a production build", () => {
    vi.stubEnv("DEV", false)
    setSearch("?dir=rtl")
    expect(documentDirection("en")).toBe("ltr")
    applyDocumentLocale("en")
    expect(document.documentElement.dir).toBe("ltr")
  })

  test("survives the router rewriting the query string after start-up", () => {
    vi.stubEnv("DEV", true)
    setSearch("?dir=rtl")
    expect(documentDirection("en")).toBe("rtl")
    setSearch("?session=abc")
    expect(documentDirection("en")).toBe("rtl")
  })
})

describe("I18nProvider document attributes", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.render(null))
    host.remove()
  })

  test("applies lang and dir from the active locale and follows locale changes", async () => {
    await act(async () => root.render(<I18nProvider>child</I18nProvider>))
    expect(document.documentElement.lang).toBe("en")
    expect(document.documentElement.dir).toBe("ltr")

    await act(async () => useI18nStore.setState({ locale: "de" }))
    expect(document.documentElement.lang).toBe("de")
    expect(document.documentElement.dir).toBe("ltr")

    // No right-to-left catalog ships yet; the provider follows the helper for any active code.
    await act(async () => useI18nStore.setState({ locale: "ar" as Locale }))
    expect(document.documentElement.lang).toBe("ar")
    expect(document.documentElement.dir).toBe("rtl")

    await act(async () => useI18nStore.setState({ locale: "ja" }))
    expect(document.documentElement.lang).toBe("ja")
    expect(document.documentElement.dir).toBe("ltr")
  })

  test("the dev flag forces right to left for an English catalog", async () => {
    vi.stubEnv("DEV", true)
    setSearch("?dir=rtl")
    await act(async () => root.render(<I18nProvider>child</I18nProvider>))
    expect(document.documentElement.lang).toBe("en")
    expect(document.documentElement.dir).toBe("rtl")
  })
})
