import { describe, expect, test } from "vitest"
import {
  CODE_FONT_OPTION_MAP,
  DEFAULT_MONO_FONT,
  DEFAULT_UI_FONT,
  FONT_DEFAULTS_REVISION,
  UI_FONT_OPTION_MAP,
  resolveStoredMonoFont,
  resolveStoredUiFont,
} from "./fontOptions"

describe("font defaults", () => {
  test("the defaults are bundled, not fetched at runtime", () => {
    expect(DEFAULT_UI_FONT).toBe("inter")
    expect(DEFAULT_MONO_FONT).toBe("jetbrains-mono")
    expect(UI_FONT_OPTION_MAP[DEFAULT_UI_FONT].source).toBeUndefined()
    expect(CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT].source).toBeUndefined()
  })

  test("every stack falls back to Traditional Chinese faces before the generic family", () => {
    for (const option of [...Object.values(UI_FONT_OPTION_MAP), ...Object.values(CODE_FONT_OPTION_MAP)]) {
      expect(option.stack, option.id).toMatch(/"PingFang TC", "Microsoft JhengHei"/)
    }
  })

  test("a Plex value saved before the revision moves to the new default once", () => {
    expect(resolveStoredUiFont("ibm-plex-sans", undefined)).toBe("inter")
    expect(resolveStoredMonoFont("ibm-plex-mono", undefined)).toBe("jetbrains-mono")
    expect(resolveStoredUiFont("ibm-plex-sans", 1)).toBe("inter")
  })

  test("a Plex choice saved under the current revision is kept", () => {
    expect(resolveStoredUiFont("ibm-plex-sans", FONT_DEFAULTS_REVISION)).toBe("ibm-plex-sans")
    expect(resolveStoredMonoFont("ibm-plex-mono", FONT_DEFAULTS_REVISION)).toBe("ibm-plex-mono")
  })

  test("other explicit choices are never rewritten", () => {
    expect(resolveStoredUiFont("geist-sans", undefined)).toBe("geist-sans")
    expect(resolveStoredMonoFont("fira-code", undefined)).toBe("fira-code")
  })
})
