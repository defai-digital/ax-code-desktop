import { afterEach, expect, test, vi } from "vitest"
import { API_ENDPOINTS, HTTP_DEFAULTS } from "@/lib/http"
import { checkCliAvailability } from "./cliHealth"

afterEach(() => vi.unstubAllGlobals())

test.each([
  [{ axCodeRunning: true }, true],
  [{ isAxCodeReady: true }, true],
  [{ axCodeRunning: false, isAxCodeReady: false }, false],
  [{ axCodeRunning: "true" }, false],
  [null, false],
  [[], false],
])("CLI health treats only explicit ready booleans as ready: %j", async (body, ready) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal("fetch", fetch)
  expect(await checkCliAvailability()).toBe(ready)
  expect(fetch).toHaveBeenCalledWith(API_ENDPOINTS.debug.rootHealth, { method: HTTP_DEFAULTS.method.get })
})

test("CLI health refuses failed HTTP, invalid JSON and network failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response("invalid JSON", { status: 200 }))
    .mockRejectedValueOnce(new Error("offline"))
  vi.stubGlobal("fetch", fetch)
  for (let index = 0; index < 3; index++) expect(await checkCliAvailability()).toBe(false)
})
