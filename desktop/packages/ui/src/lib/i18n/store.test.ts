import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { dict as enDict } from "./messages/en"
import {
  resetI18nDictionaryCacheForTests,
  useI18nStore,
  initializeLocale,
  formatMessage,
  formatPluralMessage,
} from "./store"
import { LOCALES } from "./runtime"

beforeEach(() => {
  resetI18nDictionaryCacheForTests()
  useI18nStore.setState({
    schema: 1,
    interface: "en",
    conversation: "auto",
    revision: 0,
    locale: "en",
    formatLocale: "en",
    dictionary: enDict,
    loadingLocale: null,
    loadingError: false,
  })
  window.localStorage.clear()
})
afterEach(() => {
  resetI18nDictionaryCacheForTests()
  vi.doUnmock("./messages/de.json")
  vi.doUnmock("./messages/fr.json")
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete window.__AX_CODE_DESKTOP__
})

describe("i18n store", () => {
  test("switches every packaged locale and preserves the independently selected conversation language", async () => {
    await useI18nStore.getState().setConversation("ja")
    for (const locale of LOCALES) {
      await useI18nStore.getState().setLocale(locale)
      expect(useI18nStore.getState()).toMatchObject({
        locale,
        conversation: "ja",
        loadingLocale: null,
        loadingError: false,
      })
      expect(Object.keys(useI18nStore.getState().dictionary).sort()).toEqual(Object.keys(enDict).sort())
      for (const count of [0, 1, 2, 5, 1000000]) {
        const message = formatPluralMessage(useI18nStore.getState().dictionary, locale, "common.itemCount", count)
        expect(message).toContain(String(count))
        expect(message).not.toContain("common.itemCount.")
      }
    }
  })
  test("serializes the standalone save so two rapid changes both survive", async () => {
    // Regression: both saves computed the same next revision from the same starting
    // state, and the `revision <` guard let the first write's revision stand for the
    // second change as well.
    await Promise.all([
      useI18nStore.getState().setLocale("de"),
      useI18nStore.getState().setConversation("ja"),
    ])

    expect(useI18nStore.getState()).toMatchObject({ interface: "de", conversation: "ja" })
    expect(useI18nStore.getState().revision).toBe(2)
  })

  test("keeps another tab's field when this tab saves a stale preference", async () => {
    // Standalone path: local storage holds a newer revision from another tab that this tab has not
    // applied yet. Merging only the revision number wrote this tab's stale field back over the other
    // tab's, and the bumped revision then made the other tab's value lose as well.
    window.localStorage.setItem(
      "ax-coder.language.v1",
      JSON.stringify({ schema: 1, interface: "en", conversation: "ja", revision: 2 }),
    )
    useI18nStore.setState({ interface: "en", conversation: "auto", revision: 1 })

    await useI18nStore.getState().setInterface("de")

    expect(JSON.parse(window.localStorage.getItem("ax-coder.language.v1") || "null")).toMatchObject({
      interface: "de",
      conversation: "ja",
      revision: 3,
    })
  })

  test("restores persisted preferences on initialization", async () => {
    await useI18nStore.getState().setLocale("zh-TW")
    await useI18nStore.getState().setConversation("vi")
    useI18nStore.setState({ interface: "en", locale: "en", conversation: "auto", dictionary: enDict, revision: 0 })
    await initializeLocale()
    expect(useI18nStore.getState()).toMatchObject({ interface: "zh-TW", locale: "zh-TW", conversation: "vi" })
  })
  test("a malformed formatting tag retains main's validated interface locale", async () => {
    window.__AX_CODE_DESKTOP__ = {
      invoke: vi.fn().mockResolvedValue({
        schema: 1,
        interface: "ja",
        conversation: "auto",
        revision: 1,
        locale: "ja",
        formatLocale: "not a locale",
      }),
    }
    await initializeLocale()
    expect(useI18nStore.getState()).toMatchObject({ locale: "ja", formatLocale: "ja", loadingError: false })
  })
  test("does not lose literal parameters or consume inherited parameter properties", () => {
    expect(formatMessage(enDict, "notificationCenter.permission.requestTitle", { tool: "$&{path}" })).toBe(
      "Approval needed: $&{path}",
    )
    expect(formatMessage(enDict, "notificationCenter.permission.requestTitle", Object.create({ tool: "hidden" }))).toBe(
      "Approval needed: {tool}",
    )
  })
  test("uses plural rules explicitly without reinterpreting ordinary strings", async () => {
    await useI18nStore.getState().setLocale("ru")
    const { dictionary } = useI18nStore.getState()
    expect(formatPluralMessage(dictionary, "ru", "common.itemCount", 2)).toContain("2")
    expect(new Intl.PluralRules("ru").select(2)).toBe("few")
    expect(formatPluralMessage(enDict, "en", "common.itemCount", 1)).toBe("1 item")
  })
  test("failed persistence keeps the previous selection", async () => {
    window.__AX_CODE_DESKTOP__ = { invoke: vi.fn().mockRejectedValue(new Error("disk full")) }
    await expect(useI18nStore.getState().setLocale("de")).rejects.toThrow("disk full")
    expect(useI18nStore.getState().locale).toBe("en")
  })
  test("invalid lazy catalogs fall back to English and retain the saved preference", async () => {
    vi.doMock("./messages/de.json", () => ({ default: {} }))
    await useI18nStore.getState().setLocale("de")
    expect(useI18nStore.getState()).toMatchObject({
      interface: "de",
      locale: "en",
      loadingError: true,
      loadingLocale: null,
    })
  })
  test("a late lazy import cannot overwrite a newer selected locale", async () => {
    let finish: (value: { default: typeof enDict }) => void = () => {}
    let started = false
    vi.doMock(
      "./messages/fr.json",
      () =>
        new Promise((resolve) => {
          finish = resolve
          started = true
        }),
    )
    const first = useI18nStore.getState().setLocale("fr")
    await vi.waitFor(() => expect(started).toBe(true))
    await useI18nStore.getState().setLocale("ja")
    finish({ default: enDict })
    await first
    expect(useI18nStore.getState()).toMatchObject({ interface: "ja", locale: "ja", loadingLocale: null })
  })
  test("ignores stale replies and broadcasts from an older window revision", async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    let listener: (event: { payload?: unknown }) => void = () => {}
    const first = new Promise((resolve) => {
      resolveFirst = resolve
    })
    window.__AX_CODE_DESKTOP__ = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({ interface: "en", conversation: "auto", revision: 0, locale: "en", formatLocale: "en" })
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce({
          interface: "ja",
          conversation: "auto",
          revision: 2,
          locale: "ja",
          formatLocale: "ja",
        }),
      listen: async (_name, callback) => {
        listener = callback
        return () => {}
      },
    }
    await initializeLocale()
    const pending = useI18nStore.getState().setLocale("fr")
    await useI18nStore.getState().setLocale("ja")
    resolveFirst({ interface: "fr", conversation: "auto", revision: 1, locale: "fr", formatLocale: "fr" })
    await pending
    listener({ payload: { interface: "de", revision: 1, locale: "de", formatLocale: "de" } })
    expect(useI18nStore.getState()).toMatchObject({ locale: "ja", revision: 2 })
  })
  test("a late startup failure cannot overwrite a committed language selection", async () => {
    let fail: (error: Error) => void = () => {}
    const read = new Promise((_resolve, reject) => {
      fail = reject
    })
    window.__AX_CODE_DESKTOP__ = {
      invoke: vi
        .fn()
        .mockImplementationOnce(() => read)
        .mockResolvedValueOnce({
          schema: 1,
          interface: "ja",
          conversation: "auto",
          revision: 1,
          locale: "ja",
          formatLocale: "ja",
        }),
    }
    const startup = initializeLocale()
    await useI18nStore.getState().setLocale("ja")
    fail(new Error("stale startup error"))
    await startup
    expect(useI18nStore.getState()).toMatchObject({ locale: "ja", loadingError: false })
  })
})

test("a stalled language bridge cannot leave the app permanently unmounted", async () => {
  vi.useFakeTimers()
  window.__AX_CODE_DESKTOP__ = { invoke: () => new Promise(() => {}) }
  const startup = initializeLocale()
  await vi.advanceTimersByTimeAsync(3000)
  await startup
  expect(useI18nStore.getState()).toMatchObject({ locale: "en", loadingLocale: null, loadingError: true })
})

test("startup timeout preserves a language saved while the initial read is stalled", async () => {
  vi.useFakeTimers()
  window.__AX_CODE_DESKTOP__ = {
    invoke: vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({
        schema: 1,
        interface: "ja",
        conversation: "auto",
        revision: 1,
        locale: "ja",
        formatLocale: "ja",
      }),
  }
  const startup = initializeLocale()
  await useI18nStore.getState().setLocale("ja")
  await vi.advanceTimersByTimeAsync(3000)
  await startup
  expect(useI18nStore.getState()).toMatchObject({ locale: "ja", loadingError: false })
})

test("a catalog that finishes after the startup timeout recovers from the English fallback", async () => {
  vi.useFakeTimers()
  let finish: (value: { default: typeof enDict }) => void = () => {}
  let started = false
  vi.doMock(
    "./messages/fr.json",
    () =>
      new Promise((resolve) => {
        finish = resolve
        started = true
      }),
  )
  window.__AX_CODE_DESKTOP__ = {
    invoke: vi.fn().mockResolvedValue({
      schema: 1,
      interface: "fr",
      conversation: "auto",
      revision: 1,
      locale: "fr",
      formatLocale: "fr",
    }),
  }
  const startup = initializeLocale()
  await vi.waitFor(() => expect(started).toBe(true))
  await vi.advanceTimersByTimeAsync(3000)
  await startup
  expect(useI18nStore.getState()).toMatchObject({ interface: "fr", locale: "en", loadingError: true })
  finish({ default: enDict })
  await vi.waitFor(() => expect(useI18nStore.getState()).toMatchObject({ locale: "fr", loadingError: false }))
})
