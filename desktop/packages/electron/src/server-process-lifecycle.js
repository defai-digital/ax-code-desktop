"use strict"

const DEFAULT_FATAL_SHUTDOWN_TIMEOUT_MS = 5_000

function createServerProcessLifecycle({
  processTarget,
  getServerHandle,
  logger = console,
  exit = (code) => processTarget.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  fatalShutdownTimeoutMs = DEFAULT_FATAL_SHUTDOWN_TIMEOUT_MS,
}) {
  let stopping = false
  let exited = false
  let requestedExitCode = 0
  let forceExitTimer = null

  const finish = (exitCode) => {
    if (exited) return
    exited = true
    exit(exitCode)
  }

  // One force-exit bound covers the whole process. A fatal stop that arrives
  // while a graceful stop is already awaiting the server still needs it: the
  // graceful stop was started with exitCode 0 and therefore armed no timer, so
  // a child that refuses to die would keep this process and its port alive.
  const armForceExit = (exitCode) => {
    if (exited || forceExitTimer) return
    forceExitTimer = setTimer(() => {
      finish(exitCode)
    }, fatalShutdownTimeoutMs)
    forceExitTimer?.unref?.()
  }

  async function stop(exitCode = 0) {
    if (stopping) {
      if (exitCode !== 0) {
        requestedExitCode = exitCode
        armForceExit(exitCode)
      }
      return
    }
    stopping = true
    requestedExitCode = exitCode
    if (exitCode !== 0) armForceExit(exitCode)

    try {
      // Graceful shutdown also terminates the ax-code child the server spawned.
      await getServerHandle()?.stop({ exitProcess: false })
    } catch (error) {
      logger.error("[server-process] graceful shutdown failed:", error)
    } finally {
      if (forceExitTimer) clearTimer(forceExitTimer)
      finish(requestedExitCode)
    }
  }

  function installFatalHandlers() {
    processTarget.on("unhandledRejection", (reason) => {
      logger.error("[server-process] unhandled rejection:", reason)
      void stop(1)
    })
    processTarget.on("uncaughtException", (error) => {
      logger.error("[server-process] uncaught exception:", error)
      void stop(1)
    })
  }

  return { installFatalHandlers, stop }
}

module.exports = { createServerProcessLifecycle, DEFAULT_FATAL_SHUTDOWN_TIMEOUT_MS }
