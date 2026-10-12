import { describe, it, expect } from "vitest"
import { assertShadowAccess } from "./shadow-access-policy.mjs"
describe("signed shadow access", () => {
  it("allows public candidates only when all signatures are required", () => {
    expect(() => assertShadowAccess({ confirmed: "true", visibility: "public", signingMode: "required" })).not.toThrow()
    expect(() => assertShadowAccess({ confirmed: "true", visibility: "public", signingMode: "unsigned" })).toThrow(
      "must stay private",
    )
  })
  it("preserves explicitly acknowledged private unsigned qualification", () => {
    expect(() => assertShadowAccess({ confirmed: true, visibility: "private", signingMode: "unsigned" })).not.toThrow()
  })
  it("rejects unknown visibility, missing acknowledgement and invalid signing mode", () => {
    for (const change of [{ visibility: "" }, { confirmed: false }, { signingMode: "optional" }])
      expect(() =>
        assertShadowAccess({ confirmed: true, visibility: "public", signingMode: "required", ...change }),
      ).toThrow()
  })
})
