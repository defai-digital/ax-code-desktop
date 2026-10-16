import { afterEach, describe, expect, test, vi } from "vitest"
import {
  extractLoopbackUrls,
  getExternalFaviconUrl,
  getSafeExternalUrl,
  isLoopbackHttpUrl,
  isSafeExternalUrl,
  normalizeLoopbackPreviewUrl,
  openExternalUrl,
} from "./url"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
})

describe("loopback URL helpers", () => {
  test("treats the full IPv4 127/8 range as loopback", () => {
    expect(isLoopbackHttpUrl("http://127.0.0.2:5173/")).toBe(true)
    expect(isLoopbackHttpUrl("http://127.10.20.30:3000/path")).toBe(true)
    expect(isLoopbackHttpUrl("http://[::]:5173/")).toBe(true)
    expect(isLoopbackHttpUrl("https://example.com")).toBe(false)
  })

  test("extracts IPv4 loopback preview URLs from free text", () => {
    expect(extractLoopbackUrls("Server ready at http://127.0.0.2:5173/app.")).toEqual(["http://127.0.0.2:5173/app"])
  })

  test("normalizes unspecified loopback preview URLs for browser access", () => {
    expect(normalizeLoopbackPreviewUrl("http://0.0.0.0:5173/app?x=1#top")).toBe("http://127.0.0.1:5173/app?x=1#top")
    expect(normalizeLoopbackPreviewUrl("http://[::]:5173/app")).toBe("http://127.0.0.1:5173/app")
    expect(normalizeLoopbackPreviewUrl("http://[::1]:5173/app")).toBe("http://127.0.0.1:5173/app")
    expect(normalizeLoopbackPreviewUrl("https://example.com")).toBeNull()
  })

  test("extracts and normalizes unspecified loopback preview URLs from free text", () => {
    expect(extractLoopbackUrls("Server ready at http://0.0.0.0:5173/app.")).toEqual(["http://127.0.0.1:5173/app"])
    expect(extractLoopbackUrls("Server ready at http://[::]:5173/app.")).toEqual(["http://127.0.0.1:5173/app"])
  })
})

describe("safe external URL helpers", () => {
  test("normalizes safe external URLs and rejects unsafe targets", () => {
    expect(getSafeExternalUrl(" https://example.com/docs?q=1 ")).toBe("https://example.com/docs?q=1")
    expect(getSafeExternalUrl("mailto:support@example.com")).toBe("mailto:support@example.com")
    expect(getSafeExternalUrl("tel:+15551234567")).toBe("tel:+15551234567")
    expect(getSafeExternalUrl("javascript:alert(1)")).toBeNull()
    expect(getSafeExternalUrl("https://user:pass@example.com/docs")).toBeNull()
    expect(getSafeExternalUrl("https://example.com\n.evil.test/docs")).toBeNull()
    expect(getSafeExternalUrl("https://example.com\t.evil.test/docs")).toBeNull()
  })

  test("allows browser and OS-safe external protocols", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true)
    expect(isSafeExternalUrl("mailto:support@example.com")).toBe(true)
    expect(isSafeExternalUrl("tel:+15551234567")).toBe(true)
    expect(isSafeExternalUrl("file:///Users/test/secret.txt")).toBe(false)
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeExternalUrl("https://user:pass@example.com/docs")).toBe(false)
  })

  test("does not build favicons for credential-bearing URLs", () => {
    expect(getExternalFaviconUrl("https://example.com/docs")).toBe("https://icons.duckduckgo.com/ip3/example.com.ico")
    expect(getExternalFaviconUrl("https://user:pass@example.com/docs")).toBeNull()
  })

  test("avoids favicon loads blocked by the packaged renderer CSP", () => {
    vi.stubGlobal("window", { location: { protocol: "app:" } })
    expect(getExternalFaviconUrl("https://example.com/docs")).toBeNull()
    expect(getSafeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs")
  })

  test("opens mailto and tel URLs through the desktop bridge", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    ;(window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          calls.push({ command, args })
          return null
        },
      },
    }
    vi.spyOn(window, "open").mockImplementation(() => null)

    await expect(openExternalUrl("mailto:support@example.com")).resolves.toBe(true)
    await expect(openExternalUrl("tel:+15551234567")).resolves.toBe(true)

    expect(calls).toEqual([
      { command: "desktop_open_external_url", args: { url: "mailto:support@example.com" } },
      { command: "desktop_open_external_url", args: { url: "tel:+15551234567" } },
    ])
  })

  test("falls back to window.open for safe protocols when the desktop bridge fails", async () => {
    ;(window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke: async () => {
          throw new Error("bridge unavailable")
        },
      },
    }
    const open = vi.spyOn(window, "open").mockImplementation(() => null)

    await expect(openExternalUrl("mailto:support@example.com")).resolves.toBe(true)
    expect(open).toHaveBeenCalledWith("mailto:support@example.com", "_blank", "noopener,noreferrer")
  })

  test("rejects unsafe external protocols before opening", async () => {
    const invoke = vi.fn()
    ;(window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: {
        invoke,
      },
    }
    const open = vi.spyOn(window, "open").mockImplementation(() => null)

    await expect(openExternalUrl("file:///Users/test/secret.txt")).resolves.toBe(false)
    await expect(openExternalUrl("https://user:pass@example.com/docs")).resolves.toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})

describe("extractLoopbackUrls boundaries", () => {
  test("does not match a host that merely starts with a loopback name", () => {
    // The pattern had no boundary after the host, so the prefix matched and the offer pointed at
    // `http://localhost/` instead of the address in the text.
    expect(extractLoopbackUrls("see http://localhost.evil.example/x")).toEqual([])
    expect(extractLoopbackUrls("see http://127.0.0.1.evil.example/x")).toEqual([])
  })

  test("does not match a port that is out of range", () => {
    expect(extractLoopbackUrls("see http://localhost:123456/")).toEqual([])
  })

  test("matches a URL that is followed by sentence punctuation", () => {
    // The boundary allowed only whitespace, quotes, control characters, `/`, `?`, `#` and end of input, so the
    // trailing `.`, `,` or `)` of ordinary prose — or CJK punctuation — made the whole match fail and the
    // address offered no preview.
    expect(extractLoopbackUrls("Server ready at http://localhost:3000.")).toEqual(["http://localhost:3000/"])
    expect(extractLoopbackUrls("(http://localhost:3000)")).toEqual(["http://localhost:3000/"])
    expect(extractLoopbackUrls("http://localhost:3000, then open it")).toEqual(["http://localhost:3000/"])
    expect(extractLoopbackUrls("已啟動 http://localhost:3000，請開啟")).toEqual(["http://localhost:3000/"])
    expect(extractLoopbackUrls("http://127.0.0.1:5173!")).toEqual(["http://127.0.0.1:5173/"])
  })

  test("does not match an authority that continues past the matched host", () => {
    // A negative lookahead for what *can* continue the authority has to reject every way the two fixed
    // regressions spelled the longer name, including the userinfo form (`localhost@evil.example` names
    // `evil.example`), percent-encoded and non-ASCII labels, an IDN dot equivalent, and an unknown port —
    // the prefix matched and the message offered a preview of a host it never named.
    expect(extractLoopbackUrls("http://localhost@evil.example/x")).toEqual([])
    expect(extractLoopbackUrls("http://localhost:3000@evil.example/x")).toEqual([])
    expect(extractLoopbackUrls("http://localhost%2eevil.example")).toEqual([])
    expect(extractLoopbackUrls("http://localhost\\evil")).toEqual([])
    expect(extractLoopbackUrls("http://localhosté.example")).toEqual([])
    expect(extractLoopbackUrls("http://localhost。evil.example")).toEqual([])
    expect(extractLoopbackUrls("http://localhost:")).toEqual([])
    expect(extractLoopbackUrls("http://localhost:abc")).toEqual([])
    expect(extractLoopbackUrls("http://localhost-x")).toEqual([])
  })

  test("still matches a loopback address with a path, a query and a fragment", () => {
    expect(extractLoopbackUrls("ready at http://127.0.0.2:5173/app?x=1#top")).toEqual([
      "http://127.0.0.2:5173/app?x=1#top",
    ])
    expect(extractLoopbackUrls("ready at http://localhost:5173 and more")).toEqual(["http://localhost:5173/"])
  })
})
