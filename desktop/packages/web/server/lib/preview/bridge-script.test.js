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
  delete window.__openchamberPreviewColorSchemePatched
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

describe("preview bridge color-scheme listeners", () => {
  const dispatchScheme = (scheme) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "openchamber-preview-parent", version: 1, type: "set-color-scheme", scheme },
        source: window,
      }),
    )
  }

  it("keeps notifying a listener the page never held a reference to", () => {
    // `matchMedia(...).addEventListener(...)` is the common pattern, and the platform keeps the list alive while
    // it has listeners. A WeakRef here made a collection silently stop the callback: no error, no way for the page
    // to notice. The stub reports every reference as collected, so a weak implementation drops the listener.
    const realWeakRef = globalThis.WeakRef
    const realMatchMedia = window.matchMedia
    globalThis.WeakRef = class {
      deref() {
        return undefined
      }
    }
    // jsdom has no matchMedia; the bridge only patches when the platform provides one.
    window.matchMedia = (query) => {
      const native = new EventTarget()
      native.media = query
      native.matches = false
      return native
    }
    const { restore } = install()
    try {
      const seen = []
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => seen.push(event.matches))

      dispatchScheme("light")
      expect(seen).toEqual([false])
    } finally {
      globalThis.WeakRef = realWeakRef
      window.matchMedia = realMatchMedia
      delete window.__openchamberPreviewColorSchemePatched
      restore()
    }
  })

  it("honours once and an aborted signal", () => {
    // The bridge's addEventListener accepted options and ignored them: `once` kept firing and a signal cleanup did
    // not remove the listener, so a React effect's AbortController cleanup left the callback running.
    const realMatchMedia = window.matchMedia
    window.matchMedia = (query) => {
      const native = new EventTarget()
      native.media = query
      native.matches = false
      return native
    }
    const { restore } = install()
    try {
      const onceSeen = []
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (event) => onceSeen.push(event.matches), { once: true })
      dispatchScheme("light")
      dispatchScheme("dark")
      expect(onceSeen).toEqual([false])

      const controller = new AbortController()
      const signalSeen = []
      window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener("change", (event) => signalSeen.push(event.matches), { signal: controller.signal })
      dispatchScheme("light")
      controller.abort()
      dispatchScheme("dark")
      expect(signalSeen).toEqual([true])
    } finally {
      window.matchMedia = realMatchMedia
      delete window.__openchamberPreviewColorSchemePatched
      restore()
    }
  })
})

describe("preview bridge request patches beyond fetch strings", () => {
  const proxyPath = (suffix) => `/api/preview/proxy/aaaaaaaaaaaaaaaa${suffix}`

  it("proxies XMLHttpRequest.open with a URL object", () => {
    const originalOpen = window.XMLHttpRequest.prototype.open
    const opened = []
    window.XMLHttpRequest.prototype.open = function (method, url) {
      opened.push(String(url))
    }
    const { restore } = install()
    try {
      new window.XMLHttpRequest().open("GET", new URL("/api/x", window.location.href))
      expect(opened[0]).toBe(proxyPath("/api/x"))
    } finally {
      window.XMLHttpRequest.prototype.open = originalOpen
      restore()
    }
  })

  it("proxies relative and http WebSocket URLs", () => {
    const RealWebSocket = window.WebSocket
    const urls = []
    window.WebSocket = class {
      constructor(url) {
        urls.push(String(url))
      }
    }
    const { restore } = install()
    try {
      new window.WebSocket("/ws")
      new window.WebSocket(`${window.location.protocol === "https:" ? "https" : "http"}://${window.location.host}/socket`)

      const expected = new URL(proxyPath("/ws"), window.location.href)
      expected.protocol = expected.protocol === "https:" ? "wss:" : "ws:"
      expect(urls[0]).toBe(expected.toString())
      const expectedSocket = new URL(proxyPath("/socket"), window.location.href)
      expectedSocket.protocol = expectedSocket.protocol === "https:" ? "wss:" : "ws:"
      expect(urls[1]).toBe(expectedSocket.toString())
    } finally {
      window.WebSocket = RealWebSocket
      restore()
    }
  })

  it("proxies a Request without a body", async () => {
    // Building the proxied request from the relative proxy base threw (Request needs an absolute URL), so every
    // Request input fell through to the native fetch and reached the Desktop server instead of the preview origin.
    const { calls, restore } = install()
    try {
      await window.fetch(new Request(new URL("/api/x", window.location.href)))
      expect(calls[0].url).toBe(new URL(proxyPath("/api/x"), window.location.href).toString())
    } finally {
      restore()
    }
  })

  it("proxies a Request with a body and keeps the body", async () => {
    const { calls, restore } = install()
    try {
      await window.fetch(
        new Request(new URL("/api/x", window.location.href), { method: "POST", body: "{}" }),
      )
      expect(calls[0].url).toBe(new URL(proxyPath("/api/x"), window.location.href).toString())
      expect(await calls[0].clone().text()).toBe("{}")
    } finally {
      restore()
    }
  })
})
