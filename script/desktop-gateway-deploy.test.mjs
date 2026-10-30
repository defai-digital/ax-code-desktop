import * as releasePolicy from "./release-policy.mjs"
import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import { assertRouteOwnership, validateConfig, checkPublic, ROUTE } from "../.internal/deploy/cloudflare.mjs"
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

it("blocks public cutover before credential or network access without release qualification", async () => {
  const { cutover } = await import("../.internal/deploy/cloudflare.mjs")
  const original = releasePolicy.assertPublicReleaseAuthorized
  const guard = vi
    .spyOn(releasePolicy, "assertPublicReleaseAuthorized")
    .mockImplementation(() => original({ stage: "shadow-only", publicRelease: { enabled: false } }))
  try {
    await expect(cutover("/missing", "/missing")).rejects.toThrow("public release is disabled")
  } finally {
    guard.mockRestore()
  }
})

it("requires complete private storage proof before enabling public serving", async () => {
  const { activateVerifiedGateway } = await import("../.internal/deploy/cloudflare.mjs")
  let mutations = 0
  await expect(
    activateVerifiedGateway({
      config: config(),
      worker: Buffer.from("worker"),
      objects: [{ key: "test.zip", content: Buffer.from("signed") }],
      options: { account: "a".repeat(32), token: "test-only", fetcher: async () => new Response("wrong") },
      before: {},
      readState: async () => ({}),
      deploy: () => mutations++,
    }),
  ).rejects.toThrow("Release bytes differ")
  expect(mutations).toBe(0)
})

it("restores the disabled gateway when anonymous proof fails", async () => {
  const { activateVerifiedGateway } = await import("../.internal/deploy/cloudflare.mjs")
  const deployments = []
  const domain = { id: "original", service: "ax-code-downloads" }
  const options = {
    account: "a".repeat(32),
    token: "test-only",
    fetcher: async () => new Response("signed"),
    publicFetcher: async () => new Response("wrong"),
  }
  await expect(
    activateVerifiedGateway({
      config: config(),
      worker: Buffer.from("worker"),
      objects: [{ key: "test.zip", content: Buffer.from("signed") }],
      options,
      before: { domain },
      readState: async () => ({ domain, publicEnabled: true }),
      deploy: (c) => deployments.push(c.vars.PUBLIC_RELEASE_ENABLED),
      check: async () => {},
    }),
  ).rejects.toThrow("Release bytes differ")
  expect(deployments).toEqual(["true", "false"])
})

it("keeps serving enabled only after private and anonymous bytes both match", async () => {
  const { activateVerifiedGateway } = await import("../.internal/deploy/cloudflare.mjs")
  const deployments = []
  const domain = { id: "original", service: "ax-code-downloads" }
  const options = {
    account: "a".repeat(32),
    token: "test-only",
    fetcher: async () => new Response("signed"),
    publicFetcher: async () => new Response("signed"),
  }
  await activateVerifiedGateway({
    config: config(),
    worker: Buffer.from("worker"),
    objects: [{ key: "test.zip", content: Buffer.from("signed") }],
    options,
    before: { domain },
    readState: async () => ({ domain, publicEnabled: true }),
    deploy: (c) => deployments.push(c.vars.PUBLIC_RELEASE_ENABLED),
    check: async () => {},
  })
  expect(deployments).toEqual(["true"])
})

it("checks the current CLI installer even after a historical release disappears", async () => {
  const fetcher = vi.fn(async (url) => {
    if (
      url === "https://download.automatosx.com/ax-code-desktop/install" ||
      url === "https://download.automatosx.com/ax-code/install"
    )
      return new Response("installer".repeat(20))
    return new Response("Not found", { status: 404 })
  })
  await expect(checkPublic(true, fetcher)).resolves.toBeUndefined()
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("rejects an unavailable current CLI installer", async () => {
  const fetcher = vi.fn(async (url) =>
    url.includes("/ax-code-desktop/")
      ? new Response("installer".repeat(20))
      : new Response("Unavailable", { status: 503 }),
  )
  await expect(checkPublic(true, fetcher)).rejects.toThrow("Existing AX Code installer is unavailable")
})
