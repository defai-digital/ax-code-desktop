"use strict"

// Startup is one long coroutine that returns early whenever a quit is in progress. A quit can be
// cancelled afterwards (a project browser page refuses to close), and nothing resumes a coroutine
// that has already returned. The app would then stay alive with no server and no window while
// holding the single-instance lock, so every later launch is forwarded to it and exits (#53).
// This guard remembers that startup was abandoned so the cancellation path can finish the exit.

const DEFAULT_SLOW_STARTUP_MS = 60_000

function createStartupAbortGuard({
  isQuitting,
  onAbandoned,
  record = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  slowStartupMs = DEFAULT_SLOW_STARTUP_MS,
}) {
  let stage = "starting"
  let abandoned = false
  let completed = false
  let exiting = false
  let slowTimer = null

  function clearSlowTimer() {
    if (slowTimer === null) return
    clearTimer(slowTimer)
    slowTimer = null
  }

  return {
    /** Starts the breadcrumb timer. It only logs: a slow disk or an open dialog is not a failure. */
    begin() {
      if (slowTimer !== null || completed) return
      slowTimer = setTimer(() => {
        slowTimer = null
        if (!completed) record("startup.slow", { stage, elapsedMs: slowStartupMs })
      }, slowStartupMs)
      slowTimer?.unref?.()
    },
    /** Names the step startup is about to wait on, so a stall or abort says where it happened. */
    advance(next) {
      stage = next
    },
    /** True when startup must return here. Returning while quitting marks startup abandoned. */
    shouldStop() {
      if (completed || !isQuitting()) return false
      if (!abandoned) {
        abandoned = true
        clearSlowTimer()
        record("startup.aborted", { stage })
      }
      return true
    },
    complete() {
      completed = true
      // Later breadcrumbs (a quit after launch) must not name the last startup step as current.
      stage = "complete"
      clearSlowTimer()
    },
    /**
     * Call when a quit is cancelled. Startup that already returned cannot resume, so the process
     * must exit and release the lock instead of idling with no window. Returns true when it exits.
     */
    quitCancelled(reason) {
      if (!abandoned || completed) return false
      if (!exiting) {
        exiting = true
        record("startup.abandoned-exit", { stage, reason })
        onAbandoned({ stage, reason })
      }
      return true
    },
    get stage() {
      return stage
    },
    get abandoned() {
      return abandoned && !completed
    },
  }
}

module.exports = { createStartupAbortGuard, DEFAULT_SLOW_STARTUP_MS }
