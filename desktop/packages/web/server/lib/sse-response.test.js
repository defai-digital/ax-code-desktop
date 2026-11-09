import http from "http"
import { afterEach, describe, expect, it, vi } from "vitest"

import { guardSseResponse, isSseResponseWritable } from "./sse-response.js"

// A real server response: the failure is Node's own `ERR_STREAM_WRITE_AFTER_END` event, which a mock would not emit.
const withResponse = async (handler) => {
  let finish
  const done = new Promise((resolve) => {
    finish = resolve
  })
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" })
    handler(res, finish)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  http.get(`http://127.0.0.1:${server.address().port}/`, (response) => response.resume()).on("error", () => {})
  try {
    return await done
  } finally {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
}

describe("sse response helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports an ended or destroyed response as not writable", async () => {
    expect(isSseResponseWritable(null)).toBe(false)
    const states = await withResponse((res, finish) => {
      const before = isSseResponseWritable(res)
      res.end()
      finish({ before, after: isSseResponseWritable(res) })
    })
    expect(states).toEqual({ before: true, after: false })
  })

  it("hands a write after end to the teardown instead of leaving it unhandled", async () => {
    // Without a listener this `error` is an uncaught exception: the process exits.
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = await withResponse((res, finish) => {
      guardSseResponse(res, finish, { label: "test" })
      res.end()
      res.write(": heartbeat\n\n")
    })
    expect(error).toMatchObject({ code: "ERR_STREAM_WRITE_AFTER_END" })
  })

  it("keeps a throwing teardown from escaping the error listener", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await withResponse((res, finish) => {
      guardSseResponse(
        res,
        () => {
          setImmediate(finish)
          throw new Error("teardown failed")
        },
        { label: "test" },
      )
      res.end()
      res.write("data: x\n\n")
    })
    expect(warn).toHaveBeenCalledWith("[test] Teardown after a stream error failed:", "teardown failed")
  })
})
