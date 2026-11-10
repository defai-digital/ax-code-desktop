import { normalizeLoopbackHttpOrigin } from "./local-only.js"
import { resolveUiSessionCookieName } from "../ui-auth/ui-session-cookie.js"

const effectivePort = (url) => {
  if (url.port) return Number(url.port)
  return url.protocol === "https:" ? 443 : 80
}

const parsePort = (value) => {
  const port = Number(typeof value === "string" ? value.trim() : value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null
}

export const createRequestSecurityRuntime = ({ env = process.env } = {}) => {
  const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "")

  // The development renderer is a Vite server on its own loopback port that proxies API and WebSocket requests here
  // with the browser's Origin. The launchers name it (scripts/dev.mjs sets both); nothing else on loopback is the UI.
  const trustedDevRendererPorts = new Set(
    [
      parsePort(env?.AX_CODE_DESKTOP_RENDERER_PORT),
      (() => {
        const origin = normalizeLoopbackHttpOrigin(env?.AX_CODE_DESKTOP_ELECTRON_RENDERER_URL)
        return origin ? effectivePort(new URL(origin)) : null
      })(),
    ].filter((port) => port !== null),
  )

  // The port this request reached, which is this server's own origin: the socket's local port, or the Host header's
  // port for a request object without one. Host cannot widen the check: the Origin must still be loopback.
  const readServedPort = (req) => {
    const localPort = parsePort(req?.socket?.localPort)
    if (localPort !== null) return localPort
    const host = asTrimmedString(req?.headers?.host)
    if (!host) return null
    try {
      return effectivePort(new URL(`http://${host}`))
    } catch {
      return null
    }
  }

  const getUiSessionTokenFromRequest = (req) => {
    const cookieHeader = req?.headers?.cookie
    if (!cookieHeader || typeof cookieHeader !== "string") {
      return null
    }
    const segments = cookieHeader.split(";")
    for (const segment of segments) {
      const [rawName, ...rest] = segment.split("=")
      const name = rawName?.trim()
      if (!name) continue
      if (name !== resolveUiSessionCookieName(req)) continue
      const value = rest.join("=").trim()
      try {
        return decodeURIComponent(value || "")
      } catch {
        return value || null
      }
    }
    return null
  }

  const rejectWebSocketUpgrade = (socket, statusCode, reason) => {
    if (!socket || socket.destroyed) {
      return
    }

    const message = asTrimmedString(reason) || "Bad Request"
    const body = Buffer.from(message, "utf8")
    const statusText =
      {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        500: "Internal Server Error",
      }[statusCode] || "Bad Request"

    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
          "Connection: close\r\n" +
          "Content-Type: text/plain; charset=utf-8\r\n" +
          `Content-Length: ${body.length}\r\n\r\n`,
      )
      socket.write(body)
    } catch {}

    try {
      socket.destroy()
    } catch {}
  }

  const isRequestOriginAllowed = async (req) => {
    const originHeader = asTrimmedString(req.headers.origin)
    // Non-browser clients (curl, Electron main, the node SDK) send no Origin
    // header. Browsers always send one on cross-site requests and WebSocket
    // upgrades, so an absent Origin cannot be a cross-site browser attack.
    if (!originHeader) {
      return true
    }

    // The UI is served same-origin from this loopback server, or from app://ax-code when packaged, or through the
    // registered Vite dev renderer. Any other loopback origin is some other local server - a dev server of an
    // untrusted project on localhost:5173 - and accepting it let that page open the session event stream and the
    // terminal sockets. Loopback hostnames are interchangeable (localhost, 127.0.0.1, [::1]); the port is not.
    if (originHeader === "app://ax-code") {
      return true
    }
    const loopbackOrigin = normalizeLoopbackHttpOrigin(originHeader)
    if (!loopbackOrigin) {
      return false
    }
    const originPort = effectivePort(new URL(loopbackOrigin))
    return originPort === readServedPort(req) || trustedDevRendererPorts.has(originPort)
  }

  // Several feature runtimes multiplex their WebSocket paths over one HTTP
  // server: every "upgrade" listener sees every request and ignores the paths
  // it does not own. A listener that does claim the path marks the socket so a
  // final catch-all can answer anything left over instead of leaving the
  // socket open forever.
  const WS_UPGRADE_CLAIMED_KEY = Symbol.for("ax-code-desktop.wsUpgradeClaimed")

  const markWebSocketUpgradeClaimed = (socket) => {
    if (socket) {
      socket[WS_UPGRADE_CLAIMED_KEY] = true
    }
  }

  const rejectUnclaimedWebSocketUpgrade = (socket) => {
    if (!socket || socket.destroyed || socket[WS_UPGRADE_CLAIMED_KEY]) {
      return
    }
    rejectWebSocketUpgrade(socket, 404, "Not Found")
  }

  return {
    getUiSessionTokenFromRequest,
    rejectWebSocketUpgrade,
    markWebSocketUpgradeClaimed,
    rejectUnclaimedWebSocketUpgrade,
    isRequestOriginAllowed,
  }
}
