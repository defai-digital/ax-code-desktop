import { describe, expect, test } from "vitest"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { createNativeLocalizer, localizeMenuTemplate, createLocalizedDialog } = require("./native-localization")
const mapping = require("../../../shared/native-keys.json")
const catalogs = require("../../../shared/native-catalogs.json")
const { locales } = require("../../../shared/localization.mjs")

describe("native localization", () => {
  test("every packaged locale translates every native source without loading a renderer or network", () => {
    expect(Object.keys(catalogs)).toEqual(locales)
    for (const locale of locales) {
      const native = createNativeLocalizer(() => locale)
      for (const [source, key] of Object.entries(mapping)) {
        expect(typeof catalogs[locale][key]).toBe("string")
        expect(native(source)).toBe(catalogs[locale][key])
      }
    }
  })
  test("every native source round-trips through its English catalog entry", () => {
    // A mapping pointed at an unrelated catalog key ("Select All" once resolved
    // through the skills catalog's "Select all") silently mislabels the menu and
    // breaks if that key is ever edited or removed.
    const english = require("../../../shared/native.en.json")
    for (const [source, key] of Object.entries(mapping)) {
      expect(english[key], `${source} -> ${key}`).toBe(source)
    }
  })
  const translate = createNativeLocalizer(() => "zh-TW", {
    "zh-TW": {
      [mapping.Settings]: "\u8a2d\u5b9a",
      [mapping.Reload]: "\u91cd\u65b0\u8f09\u5165",
      [mapping["{count} more\u2026"]]: "\u5176\u4ed6 {count} \u500b",
    },
  })
  test("localizes nested menus while preserving actions, roles, and accelerators", () => {
    const click = () => {}
    const template = [
      { label: "Settings", accelerator: "Cmd+,", click, submenu: [{ label: "Reload", role: "reload" }] },
    ]
    const result = localizeMenuTemplate(template, translate)
    expect(result[0].label).toBe("\u8a2d\u5b9a")
    expect(result[0].click).toBe(click)
    expect(result[0].accelerator).toBe("Cmd+,")
    expect(result[0].submenu[0]).toEqual({ label: "\u91cd\u65b0\u8f09\u5165", role: "reload" })
    expect(template[0].label).toBe("Settings")
  })
  test("formats literal arguments and leaves unknown diagnostics intact", () => {
    expect(translate("{count} more\u2026", { count: "$&{raw}" })).toBe("\u5176\u4ed6 $&{raw} \u500b")
    expect(translate("Error: /private/Settings: Connection refused")).toBe(
      "Error: /private/Settings: Connection refused",
    )
    expect(translate("{ count }", { count: "$&{raw}" })).toBe("$&{raw}")
    expect(translate("{ count }", { count: undefined })).toBe("{ count }")
    expect(translate("{count}", { count: null })).toBe("{count}")
  })
  test("role defaults localize labels without changing native role semantics", () => {
    const result = localizeMenuTemplate([{ role: "undo" }, { role: "constructor" }], (value) => `Localized ${value}`)
    expect(result).toEqual([{ role: "undo", label: "Localized Undo" }, { role: "constructor" }])
  })
  test("dialog localization preserves owner, button order, IDs and raw file paths", async () => {
    const owner = {}
    let observed
    const dialog = createLocalizedDialog(
      {
        showMessageBox: async (...args) => {
          observed = args
          return { response: 1 }
        },
      },
      translate,
    )
    await expect(
      dialog.showMessageBox(owner, {
        title: "Settings",
        detail: "/tmp/Settings",
        buttons: ["Reload", "Quit"],
        cancelId: 1,
      }),
    ).resolves.toEqual({ response: 1 })
    expect(observed[0]).toBe(owner)
    expect(observed[1]).toEqual({
      title: "\u8a2d\u5b9a",
      detail: "/tmp/Settings",
      buttons: ["\u91cd\u65b0\u8f09\u5165", "Quit"],
      cancelId: 1,
    })
  })
})
