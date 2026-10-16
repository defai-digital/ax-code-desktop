export const createStartupPipelineRuntime = (dependencies) => {
  const { createTerminalRuntime, createMessageStreamWsRuntime, createServerStartupRuntime, createFinalErrorHandler } =
    dependencies

  const run = async (options) => {
    const {
      app,
      server,
      express,
      fs,
      path,
      uiAuthController,
      buildAugmentedPath,
      searchPathFor,
      isExecutable,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      markWebSocketUpgradeClaimed,
      rejectUnclaimedWebSocketUpgrade,
      buildAxCodeUrl,
      getAxCodeAuthHeaders,
      globalEventHub,
      processForwardedEventPayload,
      messageStreamWsClients,
      triggerHealthCheck,
      upstreamStallTimeoutMs,
      terminalHeartbeatIntervalMs,
      terminalRebindWindowMs,
      terminalMaxRebindsPerWindow,
      validateTerminalCwd,
      setupProxy,
      scheduleAxCodeApiDetection,
      bootstrapAxCodeAtStartup,
      stopAxCodeLifecycle,
      staticRoutesRuntime,
      process,
      gracefulShutdown,
      getSignalsAttached,
      setSignalsAttached,
      syncToHmrState,
      host,
      port,
      attachSignals,
    } = options

    const terminalRuntime = createTerminalRuntime({
      app,
      server,
      express,
      fs,
      path,
      uiAuthController,
      buildAugmentedPath,
      searchPathFor,
      isExecutable,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      markWebSocketUpgradeClaimed,
      validateCwd: validateTerminalCwd,
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: terminalHeartbeatIntervalMs,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: terminalRebindWindowMs,
      TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: terminalMaxRebindsPerWindow,
    })

    const messageStreamRuntime = createMessageStreamWsRuntime({
      server,
      uiAuthController,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      markWebSocketUpgradeClaimed,
      buildAxCodeUrl,
      getAxCodeAuthHeaders,
      globalEventHub,
      processForwardedEventPayload,
      wsClients: messageStreamWsClients,
      triggerHealthCheck,
      upstreamStallTimeoutMs,
    })

    setupProxy(app)
    scheduleAxCodeApiDetection()
    void bootstrapAxCodeAtStartup()

    staticRoutesRuntime.registerStaticRoutes(app)

    // Terminal error handler: the static routes are the last ones mounted, so this
    // is the only position where every route above it is covered, and it still
    // precedes the listening socket.
    app.use(createFinalErrorHandler())

    // The WebSocket feature runtimes (preview proxy, terminal, event stream)
    // mark every upgrade request they claim. This listener is registered last,
    // so anything still unclaimed targets a path nobody serves — answer and
    // close it instead of letting the socket hang forever.
    server.on("upgrade", (req, socket) => {
      rejectUnclaimedWebSocketUpgrade(socket)
    })

    const serverStartupRuntime = createServerStartupRuntime({
      process,
      server,
      gracefulShutdown,
      getSignalsAttached,
      setSignalsAttached,
      syncToHmrState,
    })

    let startupResult
    try {
      const bindHost = serverStartupRuntime.resolveBindHost(host)
      startupResult = await serverStartupRuntime.startListening({
        port,
        bindHost,
      })
    } catch (error) {
      // The bootstrap above is already spawning (or has spawned) the managed runtime. A failed bind — a port
      // already in use, or a host the loopback policy refuses — used to leave that child running with its port
      // bound while the process exited, once per failed launch.
      try {
        await stopAxCodeLifecycle?.()
      } catch {
        // The original failure is what the caller needs to see.
      }
      throw error
    }

    serverStartupRuntime.attachProcessHandlers({ attachSignals })

    return {
      terminalRuntime,
      messageStreamRuntime,
      activePort: startupResult.activePort,
    }
  }

  return {
    run,
  }
}
