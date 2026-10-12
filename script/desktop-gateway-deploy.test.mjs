import { describe, it, expect } from "vitest"
import fs from "node:fs"
import { assertRouteOwnership, validateConfig, ROUTE } from "../.internal/deploy/cloudflare.mjs"
const config = () =>
  JSON.parse(fs.readFileSync(new URL("../.internal/deploy/download-worker/wrangler.jsonc", import.meta.url), "utf8"))
describe("Desktop gateway operator boundaries", () => {
  it("pins the account and accepts the isolated disabled gateway", () => {
    expect(validateConfig(config()).account_id).toBe("89657c08227b638ab67905e1c5899406")
  })
  it("rejects public enablement, account changes, broader routes and alternate buckets", () => {
    for (const change of [
      (c) => (c.vars.PUBLIC_RELEASE_ENABLED = "true"),
      (c) => (c.account_id = "other"),
      (c) => (c.routes[0].pattern = "download.automatosx.com/*"),
      (c) => (c.r2_buckets[0].bucket_name = "ax-code-releases"),
      (c) => (c.workers_dev = true),
      (c) => (c.assets = { directory: "public" }),
    ]) {
      const candidate = config()
      change(candidate)
      expect(() => validateConfig(candidate)).toThrow()
    }
  })
  it("allows an absent or owned route and refuses takeover", () => {
    expect(assertRouteOwnership([])).toBeUndefined()
    const owned = { pattern: ROUTE, script: "ax-code-desktop-downloads" }
    expect(assertRouteOwnership([owned])).toEqual(owned)
    expect(() => assertRouteOwnership([{ pattern: ROUTE, script: "ax-code-downloads" }])).toThrow("refusing takeover")
  })
})
