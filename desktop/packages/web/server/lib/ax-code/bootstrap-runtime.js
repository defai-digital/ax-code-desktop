import { rateLimit } from "express-rate-limit"

const createDesktopRouteRateLimiter = () =>
  rateLimit({
    windowMs: 60_000,
    limit: 1_200,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { error: "Too many requests" },
  })

export const createBootstrapRuntime = (dependencies) => {
  const {
    createUiAuth,
    registerServerStatusRoutes,
    registerApiSessionGate,
    registerCommonRequestMiddleware,
    registerAuthAndAccessRoutes,
    registerNotificationRoutes,
    registerOpenChamberRoutes,
    express,
  } = dependencies

  const setupBaseRoutes = (app, options) => {
    const {
      process,
      openchamberVersion,
      runtimeName,
      serverStartedAt,
      gracefulShutdown,
      getHealthSnapshot,
      getStartupDiagnosticsSnapshot,
      verboseRequestLogs,
      uiPassword,
      ensureGlobalWatcherStarted,
      getUiSessionTokenFromRequest,
      getUiNotificationClients,
      writeSseEvent,
      sessionRuntime,
      modelsDevApiUrl,
      modelsMetadataCacheTtl,
      fetchFreeZenModels,
      getCachedZenModels,
      setAutoAcceptSession,
    } = options

    const uiAuthController = createUiAuth({ password: uiPassword })
    if (uiAuthController.enabled) {
      console.log("UI password protection enabled for browser sessions")
    }

    // Order matters: middleware only wraps the handlers registered after it. The limiters and the session
    // gate therefore come before everything that reads a request — the body parsers below accept 50 MB, and
    // an unauthenticated caller must be answered (401/429) without its body being buffered — and the status
    // and system routes sit behind the limiter too, which they did not while they were registered above it.
    app.use("/api", createDesktopRouteRateLimiter())
    app.use("/auth", createDesktopRouteRateLimiter())

    registerApiSessionGate(app, { uiAuthController })

    registerServerStatusRoutes(app, {
      express,
      process,
      openchamberVersion,
      runtimeName,
      serverStartedAt,
      gracefulShutdown,
      getHealthSnapshot,
      getStartupDiagnosticsSnapshot,
      uiAuthController,
    })

    registerCommonRequestMiddleware(app, { express, verboseRequestLogs })

    registerAuthAndAccessRoutes(app, {
      express,
      uiAuthController,
    })

    registerNotificationRoutes(app, {
      uiAuthController,
      ensureGlobalWatcherStarted,
      getUiSessionTokenFromRequest,
      getUiNotificationClients,
      writeSseEvent,
      getSessionActivitySnapshot: sessionRuntime.getSessionActivitySnapshot,
      getSessionStateSnapshot: sessionRuntime.getSessionStateSnapshot,
      getSessionAttentionSnapshot: sessionRuntime.getSessionAttentionSnapshot,
      getSessionState: sessionRuntime.getSessionState,
      getSessionAttentionState: sessionRuntime.getSessionAttentionState,
      markSessionViewed: sessionRuntime.markSessionViewed,
      markSessionUnviewed: sessionRuntime.markSessionUnviewed,
      markUserMessageSent: sessionRuntime.markUserMessageSent,
      setAutoAcceptSession,
    })

    registerOpenChamberRoutes(app, {
      modelsDevApiUrl,
      modelsMetadataCacheTtl,
      fetchFreeZenModels,
      getCachedZenModels,
    })

    return {
      uiAuthController,
    }
  }

  return {
    setupBaseRoutes,
  }
}
