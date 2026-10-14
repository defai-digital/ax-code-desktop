import { describe, expect, test, vi } from "vitest"
import { listGlobalSessionPages } from "./globalSessions"

const failingClient = (status: number, message = "the server is unavailable") => ({
  experimental: {
    session: {
      list: vi.fn(async () => ({
        data: undefined,
        error: { message },
        response: { status },
      })),
    },
  },
}) as unknown as Parameters<typeof listGlobalSessionPages>[0]

describe("listGlobalSessionPages", () => {
  test("rejects (and retries) a server error instead of returning an empty page", async () => {
    // Regression: the SDK resolves non-2xx results rather than throwing, so the page
    // loop ended with an empty list and the caller replaced the session index with
    // nothing while the runtime was only restarting.
    const client = failingClient(503)

    await expect(listGlobalSessionPages(client, { archived: false, pageSize: 50 })).rejects.toThrow(
      "session.list failed (503): the server is unavailable",
    )

    // The transient path retries before giving up.
    expect(client.experimental.session.list).toHaveBeenCalledTimes(3)
  })

  test("stops the page loop cleanly on a genuinely empty list", async () => {
    const client = {
      experimental: {
        session: { list: vi.fn(async () => ({ data: [], error: undefined, response: { status: 200 } })) },
      },
    } as unknown as Parameters<typeof listGlobalSessionPages>[0]

    await expect(listGlobalSessionPages(client, { archived: true, pageSize: 50 })).resolves.toEqual([])
  })
})
