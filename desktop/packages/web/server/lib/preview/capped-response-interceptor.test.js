import { describe, expect, it } from "vitest"
import { PassThrough, Readable } from "node:stream"
import zlib from "node:zlib"

import { createCappedResponseInterceptor } from "./capped-response-interceptor.js"

const fakeResponse = () => {
  const headers = new Map()
  let resolveDone
  const done = new Promise((resolve) => {
    resolveDone = resolve
  })
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    getHeader: (name) => headers.get(name.toLowerCase()),
    end(chunk) {
      this.writableEnded = true
      resolveDone(chunk === undefined ? "" : String(chunk))
    },
  }
  return { res, headers, done }
}

const upstream = (chunks, headers = {}, statusCode = 200) => {
  const proxyRes = Readable.from(chunks)
  proxyRes.headers = headers
  proxyRes.statusCode = statusCode
  return proxyRes
}

describe("createCappedResponseInterceptor", () => {
  it("passes the decoded body to the rewrite and sends its result with headers and length", async () => {
    const handle = createCappedResponseInterceptor(async (body) => body.toString("utf8").toUpperCase(), {
      maxBytes: 1024,
    })
    const { res, headers, done } = fakeResponse()
    handle(
      upstream([zlib.gzipSync("hello")], { "content-encoding": "gzip", "content-type": "text/html", "x-up": "1" }, 201),
      {},
      res,
    )
    expect(await done).toBe("HELLO")
    expect(res.statusCode).toBe(201)
    expect(headers.get("x-up")).toBe("1")
    expect(headers.get("content-encoding")).toBeUndefined()
    expect(headers.get("content-length")).toBe(5)
  })

  it("answers 502 once the body passes the cap, without running the rewrite", async () => {
    let rewrites = 0
    const handle = createCappedResponseInterceptor(
      async (body) => {
        rewrites += 1
        return body
      },
      { maxBytes: 8 },
    )
    const { res, done } = fakeResponse()
    const proxyRes = new PassThrough()
    proxyRes.headers = { "content-type": "text/html" }
    proxyRes.statusCode = 200
    handle(proxyRes, {}, res)
    // An endless upstream: it never ends on its own.
    proxyRes.write("0123456789")

    expect(await done).toBe("Preview response is too large to proxy")
    expect(res.statusCode).toBe(502)
    expect(proxyRes.destroyed).toBe(true)
    expect(rewrites).toBe(0)
  })

  it("answers 502 when the upstream body fails mid-stream", async () => {
    const handle = createCappedResponseInterceptor(async (body) => body, { maxBytes: 1024 })
    const { res, done } = fakeResponse()
    const proxyRes = new PassThrough()
    proxyRes.headers = {}
    proxyRes.statusCode = 200
    handle(proxyRes, {}, res)
    proxyRes.destroy(new Error("socket hang up"))
    expect(await done).toBe("Preview upstream response failed")
    expect(res.statusCode).toBe(502)
  })

  it("answers 502 when the rewrite throws", async () => {
    const handle = createCappedResponseInterceptor(
      async () => {
        throw new Error("bad")
      },
      { maxBytes: 1024 },
    )
    const { res, done } = fakeResponse()
    handle(upstream([Buffer.from("x")], { "content-type": "text/html" }), {}, res)
    expect(await done).toBe("Preview response rewrite failed")
    expect(res.statusCode).toBe(502)
  })
})

describe("createCappedResponseInterceptor client disconnect", () => {
  it("releases the upstream when the client leaves before the body ends", () => {
    const handle = createCappedResponseInterceptor(async (body) => body, { maxBytes: 1024 })
    const listeners = {}
    const res = {
      writableEnded: false,
      setHeader() {},
      end() {
        throw new Error("nothing should be written to a closed client")
      },
      on(event, callback) {
        listeners[event] = callback
      },
    }
    const proxyRes = new PassThrough()
    proxyRes.headers = { "content-type": "text/html" }
    proxyRes.statusCode = 200
    handle(proxyRes, {}, res)
    proxyRes.write("partial")
    listeners.close()
    expect(proxyRes.destroyed).toBe(true)
  })
})

describe("createCappedResponseInterceptor upstream failures", () => {
  it("answers 502 when the upstream connection closes before the body ends", async () => {
    const handle = createCappedResponseInterceptor(async (body) => body, { maxBytes: 1024 })
    const { res, done } = fakeResponse()
    const proxyRes = new PassThrough()
    proxyRes.headers = { "content-type": "text/html", "content-encoding": "gzip" }
    proxyRes.statusCode = 200
    proxyRes.complete = false
    handle(proxyRes, {}, res)
    proxyRes.write(zlib.gzipSync("partial").subarray(0, 8))
    proxyRes.destroy()
    expect(await done).toBe("Preview upstream response failed")
    expect(res.statusCode).toBe(502)
  })

  it("drops the copied upstream headers when the rewrite throws", async () => {
    const handle = createCappedResponseInterceptor(
      async () => {
        throw new Error("bad")
      },
      { maxBytes: 1024 },
    )
    const { res, headers, done } = fakeResponse()
    res.getHeaderNames = () => [...headers.keys()]
    res.removeHeader = (name) => headers.delete(name.toLowerCase())
    handle(upstream([Buffer.from("x")], { "content-type": "text/html", location: "http://127.0.0.1:3000/x" }, 302), {}, res)
    expect(await done).toBe("Preview response rewrite failed")
    expect(headers.get("location")).toBeUndefined()
    expect(headers.get("content-type")).toBe("text/plain; charset=utf-8")
  })
})
