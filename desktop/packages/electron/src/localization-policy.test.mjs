import { describe, expect, test, vi } from "vitest"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const {
  locales,
  resolveLocale,
  normalizePreferences,
  resolvePreferences,
  createLanguageController,
  conversationInstruction,
} = require("../../../shared/localization.mjs")

const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("desktop language preferences", () => {
  test("uses the fourteen canonical IDs and resolves script and region aliases", () => {
    expect(locales).toEqual([
      "en",
      "zh-TW",
      "zh-CN",
      "ja",
      "ko",
      "fr",
      "de",
      "id",
      "it",
      "pt-BR",
      "ru",
      "es",
      "tr",
      "vi",
    ])
    for (const [input, output] of [
      ["zh-Hant-HK", "zh-TW"],
      ["zh_HK", "zh-TW"],
      ["zh-Hans-SG", "zh-CN"],
      ["pt", "pt-BR"],
      ["en-GB", "en"],
    ]) {
      expect(resolveLocale(input)?.locale).toBe(output)
    }
    expect(resolveLocale("en-GB")?.formatLocale).toBe("en-GB")
    expect(resolveLocale("not a locale")).toBeUndefined()
    expect(resolvePreferences(normalizePreferences(null), ["ar", "ja-JP"]).locale).toBe("ja")
    expect(resolvePreferences(normalizePreferences({ interface: "de" }), ["ja-JP"]).locale).toBe("de")
  })

  test("corrupt persisted preferences use safe defaults", () => {
    expect(normalizePreferences({ interface: "../file", conversation: "javascript", revision: -10 })).toEqual({
      schema: 1,
      interface: "system",
      conversation: "auto",
      revision: 0,
    })
    expect(normalizePreferences({ schema: 2, interface: "ja", conversation: "fr", revision: 10 })).toEqual({
      schema: 1,
      interface: "system",
      conversation: "auto",
      revision: 0,
    })
  })

  test("serializes writes, preserves independent changes, and reconstructs state on restart", async () => {
    let disk = null
    const changes = []
    const gate = deferred()
    let calls = 0
    const controller = createLanguageController({
      read: () => disk,
      write: async (next) => {
        if (++calls === 1) await gate.promise
        disk = next
      },
      systemLanguages: () => ["en-CA"],
      onChange: (next) => changes.push(next),
    })
    const first = controller.update({ interface: "zh-TW" })
    const second = controller.update({ conversation: "ja" })
    await Promise.resolve()
    expect(changes).toHaveLength(0)
    gate.resolve()
    await Promise.all([first, second])
    expect(changes.map((value) => value.revision)).toEqual([1, 2])
    const restarted = createLanguageController({
      read: () => disk,
      write: async () => {},
      systemLanguages: () => ["en"],
    })
    expect(restarted.get()).toMatchObject({ interface: "zh-TW", locale: "zh-TW", conversation: "ja", revision: 2 })
  })

  test("a failed write changes no state and does not poison subsequent saves", async () => {
    let fail = true
    const controller = createLanguageController({
      read: () => null,
      write: async () => {
        if (fail) throw new Error("disk full")
      },
      systemLanguages: () => ["en"],
    })
    await expect(controller.update({ interface: "fr" })).rejects.toThrow("disk full")
    expect(controller.get().interface).toBe("system")
    fail = false
    await controller.update({ conversation: "vi" })
    expect(controller.get()).toMatchObject({ interface: "system", conversation: "vi", revision: 1 })
    expect(() => controller.update({ messages: {} })).toThrow("Unknown")
    expect(() => controller.update({ interface: "__proto__" })).toThrow("Unsupported")
  })

  test("conversation auto is independent and explicit preferences preserve artifact and evidence rules", () => {
    expect(conversationInstruction("auto")).toBeUndefined()
    expect(conversationInstruction("zh-TW")).toContain("Traditional Chinese")
    expect(conversationInstruction("zh-TW")).toContain("take precedence")
    expect(conversationInstruction("ru")).toContain("raw tool output exactly")
    expect(conversationInstruction("ja")).toContain("keep these artifacts in English")
    for (const locale of locales) {
      expect(conversationInstruction(locale)).not.toContain("undefined")
    }
  })

  test("notification failure cannot report an already committed save as failed", async () => {
    const warning = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const controller = createLanguageController({
        read: () => null,
        write: async () => {},
        systemLanguages: () => ["en"],
        onChange: () => {
          throw new Error("window destroyed")
        },
      })
      await expect(controller.update({ interface: "fr" })).resolves.toMatchObject({ interface: "fr", revision: 1 })
      expect(controller.get().locale).toBe("fr")
      expect(warning).toHaveBeenCalledOnce()
    } finally {
      warning.mockRestore()
    }
  })
})
