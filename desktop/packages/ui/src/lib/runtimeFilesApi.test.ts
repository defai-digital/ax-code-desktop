import { afterEach, expect, test, vi } from "vitest"
import type { RuntimeAPIs } from "./api/types"
import { getRuntimeFilesAPI } from "./runtimeFilesApi"

afterEach(() => vi.unstubAllGlobals())
test("reads the current injected Files API and does not cache it", () => {
  const first = {} as RuntimeAPIs["files"]
  const second = {} as RuntimeAPIs["files"]
  vi.stubGlobal("window", { __AX_CODE_DESKTOP_RUNTIME_APIS__: { files: first } })
  expect(getRuntimeFilesAPI()).toBe(first)
  vi.stubGlobal("window", { __AX_CODE_DESKTOP_RUNTIME_APIS__: { files: second } })
  expect(getRuntimeFilesAPI()).toBe(second)
})
test("leaves browserless or missing APIs available for HTTP fallback", () => {
  vi.stubGlobal("window", undefined)
  expect(getRuntimeFilesAPI()).toBeNull()
  vi.stubGlobal("window", {})
  expect(getRuntimeFilesAPI()).toBeNull()
})
