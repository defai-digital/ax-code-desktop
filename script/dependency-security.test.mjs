import http from "node:http"
import { createRequire } from "node:module"
import { once } from "node:events"
import vm from "node:vm"
import { describe, expect, it } from "vitest"

const webRequire = createRequire(new URL("../desktop/packages/web/package.json", import.meta.url))
const proxyRequire = createRequire(webRequire.resolve("http-proxy-middleware"))
const httpProxyRequire = createRequire(proxyRequire.resolve("http-proxy"))
const redirects = httpProxyRequire("follow-redirects")
const electronRequire = createRequire(new URL("../desktop/packages/electron/package.json", import.meta.url))
const builderRequire = createRequire(electronRequire.resolve("electron-builder"))
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"))
const { Minimatch } = appBuilderRequire("minimatch")

const listen = async (server) => {
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  return `http://127.0.0.1:${server.address().port}`
}

const close = (server) => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))

describe("release dependency security", () => {
  it("removes cross-realm custom credential headers on cross-origin redirects", async () => {
    let received
    const target = http.createServer((request, response) => {
      received = request.headers
      response.end("ok")
    })
    const destination = await listen(target)
    const source = http.createServer((_request, response) => {
      response.writeHead(302, { location: destination })
      response.end()
    })
    try {
      const origin = await listen(source)
      await new Promise((resolve, reject) => {
        const request = redirects.http.get(origin, {
          headers: { "X-API-Key": "synthetic-regression-value", "X-Harmless": "preserved" },
          sensitiveHeaders: vm.runInNewContext('["X-API-Key"]'),
        }, (response) => {
          response.resume()
          response.on("end", resolve)
          response.on("error", reject)
        })
        request.on("error", reject)
      })
      expect(received["x-api-key"]).toBeUndefined()
      expect(received["x-harmless"]).toBe("preserved")
    } finally {
      await close(source)
      await close(target)
    }
  })

  it("bounds glob preprocessing amplification with the configured expansion limit", () => {
    const matcher = new Minimatch("**/../a/b/".repeat(6) + "file", {
      optimizationLevel: 2,
      braceExpandMax: 8,
    })
    expect(matcher.globParts.length).toBeLessThanOrEqual(8)
    expect(new Minimatch("**/*.ts").match("src/main.ts")).toBe(true)
    expect(new Minimatch("**/*.ts").match("src/main.js")).toBe(false)
  })

  it("preserves callable legacy minimatch consumers used by ASAR packaging", () => {
    const asarRequire = createRequire(electronRequire.resolve("@electron/asar"))
    const minimatch = asarRequire("minimatch")
    expect(minimatch("dist/main.js", "**/*.js")).toBe(true)
    expect(minimatch("dist/main.ts", "**/*.js")).toBe(false)
  })
})
