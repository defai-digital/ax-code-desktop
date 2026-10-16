export const registerNotificationRoutes = (app, dependencies) => {
  const {
    uiAuthController,
    ensureGlobalWatcherStarted,
    getUiSessionTokenFromRequest,
    getUiNotificationClients,
    writeSseEvent,
    getSessionActivitySnapshot,
    getSessionStateSnapshot,
    getSessionAttentionSnapshot,
    getSessionState,
    getSessionAttentionState,
    markSessionViewed,
    markSessionUnviewed,
    markUserMessageSent,
    setAutoAcceptSession,
  } = dependencies

  /**
   * The session gate the stream route above applies, for the routes that read and write the same state.
   *
   * They answered without one: in password mode any caller that could reach the port could read session
   * titles, statuses and attention flags, and write the auto-accept mirror. `ensureSessionToken` returns null
   * for the password-configured controller when the request carries no valid session cookie (and a token
   * otherwise, so a server without a UI password stays open), which is exactly what the stream route checks.
   */
  const requireUiSession = async (req, res, next) => {
    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req)
    if (!uiToken) {
      return res.status(401).json({ error: "UI authentication required" })
    }
    next()
  }

  app.use(["/api/sessions", "/api/session-activity"], requireUiSession)

  const ensureSessionWatcher = async () => {
    if (typeof ensureGlobalWatcherStarted !== "function") {
      return
    }
    try {
      await ensureGlobalWatcherStarted()
    } catch (error) {
      console.warn("[AxCodeWatcher] lazy start failed:", error?.message ?? error)
    }
  }

  app.get("/api/notifications/stream", async (req, res) => {
    await ensureSessionWatcher()

    const uiToken = uiAuthController?.ensureSessionToken
      ? await uiAuthController.ensureSessionToken(req, res)
      : getUiSessionTokenFromRequest(req)
    if (!uiToken) {
      // The password-configured controller refuses by returning null and writing nothing itself,
      // so returning silently left the socket open with zero bytes until the client timed out.
      // Answer it, like the other loopback auth gates do.
      return res.status(401).json({ error: "UI authentication required" })
    }

    // Both awaits above can take seconds on the first call, and the close listener below is attached after them:
    // a client that disconnected in that window had already fired "close", so its response stayed in the client
    // set with a live heartbeat interval and every later broadcast wrote to a dead socket.
    if (req.destroyed || res.destroyed || res.writableEnded) {
      return
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders?.()

    const clients = getUiNotificationClients()
    clients.add(res)

    try {
      writeSseEvent(res, {
        type: "openchamber:notification-stream-ready",
        properties: { uiToken },
      })
    } catch {}

    // Keep the connection alive through reverse proxies / load balancers, which
    // reap idle SSE sockets. The client ignores any event whose type is not
    // "openchamber:notification".
    const dropClient = () => {
      clearInterval(heartbeat)
      clients.delete(res)
    }
    const heartbeat = setInterval(() => {
      try {
        // `false` is how a stream whose write buffer is over the cap is ended (see `writeSseEvent`): the socket
        // cannot flush, so the close listener below is not guaranteed to fire and the client would stay in the set.
        if (writeSseEvent(res, {
          type: "openchamber:heartbeat",
          properties: {
            timestamp: Date.now(),
          },
        }) === false) {
          dropClient()
        }
      } catch {
        dropClient()
      }
    }, 25_000)
    if (typeof heartbeat.unref === "function") heartbeat.unref()

    req.on("close", () => {
      clearInterval(heartbeat)
      clients.delete(res)
    })
  })

  app.get("/api/session-activity", async (_req, res) => {
    await ensureSessionWatcher()
    res.json(getSessionActivitySnapshot())
  })

  app.get("/api/sessions/snapshot", async (_req, res) => {
    await ensureSessionWatcher()
    res.json({
      statusSessions: getSessionStateSnapshot(),
      attentionSessions: getSessionAttentionSnapshot(),
      serverTime: Date.now(),
    })
  })

  app.get("/api/sessions/status", async (_req, res) => {
    await ensureSessionWatcher()
    const snapshot = getSessionStateSnapshot()
    res.json({
      sessions: snapshot,
      serverTime: Date.now(),
    })
  })

  app.get("/api/sessions/:id/status", async (req, res) => {
    await ensureSessionWatcher()
    const sessionId = req.params.id
    const state = getSessionState(sessionId)

    if (!state) {
      return res.status(404).json({
        error: "Session not found or no state available",
        sessionId,
      })
    }

    return res.json({
      sessionId,
      ...state,
    })
  })

  app.get("/api/sessions/attention", async (_req, res) => {
    await ensureSessionWatcher()
    const snapshot = getSessionAttentionSnapshot()
    res.json({
      sessions: snapshot,
      serverTime: Date.now(),
    })
  })

  app.get("/api/sessions/:id/attention", async (req, res) => {
    await ensureSessionWatcher()
    const sessionId = req.params.id
    const state = getSessionAttentionState(sessionId)

    if (!state) {
      return res.status(404).json({
        error: "Session not found or no attention state available",
        sessionId,
      })
    }

    return res.json({
      sessionId,
      ...state,
    })
  })

  app.post("/api/sessions/:id/view", (req, res) => {
    const sessionId = req.params.id
    const clientId = req.headers["x-client-id"] || req.ip || "anonymous"

    markSessionViewed(sessionId, clientId)

    return res.json({
      success: true,
      sessionId,
      viewed: true,
    })
  })

  app.post("/api/sessions/:id/unview", (req, res) => {
    const sessionId = req.params.id
    const clientId = req.headers["x-client-id"] || req.ip || "anonymous"

    markSessionUnviewed(sessionId, clientId)

    return res.json({
      success: true,
      sessionId,
      viewed: false,
    })
  })

  app.post("/api/sessions/:id/message-sent", (req, res) => {
    const sessionId = req.params.id

    markUserMessageSent(sessionId)

    return res.json({
      success: true,
      sessionId,
      messageSent: true,
    })
  })

  // Mirror client-side Permission Auto-Accept state to the server so it can
  // suppress permission notifications at the source (the 500ms debounce race
  // otherwise leaks notifications for auto-accepted permissions). Gated like the
  // session state routes: it decides whether permission prompts are announced.
  app.post("/api/notifications/auto-accept", requireUiSession, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {}
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    const enabled = body.enabled === true
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId required" })
    }
    if (typeof setAutoAcceptSession === "function") {
      setAutoAcceptSession(sessionId, enabled)
    }
    return res.json({ success: true, sessionId, enabled })
  })
}
