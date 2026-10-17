// @vitest-environment jsdom
/* global window -- the jsdom environment below provides it; this package's lint config assumes Node. */
import { describe, expect, it } from "vitest"

import { PREVIEW_BRIDGE_SCRIPT_SOURCE } from "./proxy-runtime.js"

// The bridge is injected into every previewed page and its patches are otherwise only observable through a real
// browser: this drives the script in jsdom, from the proxy path it derives its base from.
const install = () => {
  window.history.replaceState({}, "", "/api/preview/proxy/aaaaaaaaaaaaaaaa/")
  const calls = []
  const originalFetch = window.fetch
  window.fetch = (...args) => {
    calls.push(args[0])
    return Promise.resolve({ ok: true })
  }
  delete window.__openchamberPreviewBridgeInstalled
  delete window.__openchamberAppRequestProxyPatched
  new Function(PREVIEW_BRIDGE_SCRIPT_SOURCE())()
  return {
    calls,
    restore: () => {
      window.fetch = originalFetch
    },
  }
}

describe("preview bridge request patches", () => {
  it("proxies a fetch whose input is a URL object", async () => {
    // The patch handled a string and a Request, and fetch takes a URL object as well: one built from
    // location.href went to the native fetch unproxied, straight at the Desktop server's own routes.
    const { calls, restore } = install()
    try {
      await window.fetch(new URL("/api/fs/list", window.location.href))

      expect(calls).toHaveLength(1)
      expect(String(calls[0])).toBe("/api/preview/proxy/aaaaaaaaaaaaaaaa/api/fs/list")
    } finally {
      restore()
    }
  })

  it("still proxies a fetch whose input is a relative string", async () => {
    const { calls, restore } = install()
    try {
      await window.fetch("/api/fs/list")

      expect(String(calls[0])).toBe("/api/preview/proxy/aaaaaaaaaaaaaaaa/api/fs/list")
    } finally {
      restore()
    }
  })
})
