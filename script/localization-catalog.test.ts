import { describe, expect, test } from "vitest"
import { validateCatalog } from "./localization-catalog"

describe("localization catalog gate", () => {
  const source = { greeting: "Hello {name}", brand: "AX Code" }
  test("accepts translated messages and explicitly reviewed shared spelling", () => {
    expect(
      validateCatalog(JSON.stringify({ greeting: "Bonjour {name}", brand: "AX Code" }), source, ["brand"]).errors,
    ).toEqual([])
  })
  test("detects duplicate decoded keys before JSON overwrites them", () => {
    const result = validateCatalog(
      '{"greeting":"Bonjour {name}","\\u0067reeting":"Salut {name}","brand":"AX Code"}',
      source,
      ["brand"],
    )
    expect(result.errors).toContain("duplicate key greeting")
  })
  test("rejects missing, unknown, empty and invalid entries", () => {
    expect(validateCatalog('{"brand": "", "extra": "value"}', source).errors).toEqual(
      expect.arrayContaining(["unknown key extra", "missing or empty greeting", "missing or empty brand"]),
    )
    expect(validateCatalog("[]", source).errors).toContain("invalid catalog object")
    expect(validateCatalog("{", source).errors).toContain("invalid JSON")
  })
  test("rejects changed parameters, decomposed text, and unreviewed English", () => {
    expect(
      validateCatalog(JSON.stringify({ greeting: "Cafe\u0301 {person}", brand: "AX Code" }), source).errors,
    ).toEqual(
      expect.arrayContaining([
        "non-NFC greeting",
        "placeholder mismatch greeting",
        "unreviewed identical string brand",
      ]),
    )
  })
  test("allows reordered repeated parameters and preserves literal brace syntax", () => {
    expect(validateCatalog('{"message":"{b} avec {a} et {b}"}', { message: "{a} with {b}" }).errors).toEqual([])
  })
  test("normalizing a copied source cannot bypass the identical-string review", () => {
    expect(validateCatalog('{"message":"Caf\u00e9"}', { message: "Cafe\u0301" }).errors).toContain(
      "unreviewed identical string message",
    )
  })
})
