import { describe, expect, test } from "vitest"

import { rewriteAppProtocolNetworkUrl, rewriteAppProtocolWebSocketUrl } from "./app-protocol-network"

const options = { pageOrigin: "app://ax-code", apiOrigin: "http://127.0.0.1:3910" }

describe("app protocol network rewrite", () => {
  test("rewrites relative API paths to the loopback server", () => {
    expect(rewriteAppProtocolNetworkUrl("/api/fs/list?path=/repo", options)).toBe(
      "http://127.0.0.1:3910/api/fs/list?path=/repo",
    )
    expect(rewriteAppProtocolNetworkUrl("/assets/index.js", options)).toBe("/assets/index.js")
    expect(rewriteAppProtocolNetworkUrl("/dre-graph/session/ses_1?directory=%2Frepo", options)).toBe(
      "http://127.0.0.1:3910/dre-graph/session/ses_1?directory=%2Frepo",
    )
    expect(rewriteAppProtocolNetworkUrl("/run-report/session/ses_1?directory=%2Frepo", options)).toBe(
      "http://127.0.0.1:3910/run-report/session/ses_1?directory=%2Frepo",
    )
  })

  test("rewrites app-origin absolute API URLs", () => {
    expect(rewriteAppProtocolNetworkUrl("app://ax-code/api/session", options)).toBe("http://127.0.0.1:3910/api/session")
    expect(rewriteAppProtocolWebSocketUrl("/api/event/ws", options)).toBe("ws://127.0.0.1:3910/api/event/ws")
  })

  test("rewrites a socket URL the page itself derives, which keeps the page's host", () => {
    // `normalizeWebSocketPath` builds socket URLs as `ws://<window.location.host><path>`; on the packaged page
    // that host is the app host, so the protocol is `ws:`, never `app:`. Testing for `app:` alone therefore
    // missed the only shape this function is installed to catch, and the packaged renderer's CSP allows
    // WebSockets to loopback only — so the socket was left pointing at a host that cannot resolve.
    expect(rewriteAppProtocolWebSocketUrl("ws://ax-code/api/terminal/ws", options)).toBe(
      "ws://127.0.0.1:3910/api/terminal/ws",
    )
    // The target decides the socket scheme: the desktop server is plain loopback, so a secure socket URL to the
    // app host also lands on `ws:`.
    expect(rewriteAppProtocolWebSocketUrl("wss://ax-code/api/event/ws?directory=%2Frepo", options)).toBe(
      "ws://127.0.0.1:3910/api/event/ws?directory=%2Frepo",
    )
    // The loopback path check still bounds what may be rewritten.
    expect(rewriteAppProtocolWebSocketUrl("ws://ax-code/assets/thing", options)).toBe("ws://ax-code/assets/thing")
  })
})
