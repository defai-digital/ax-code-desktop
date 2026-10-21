"use strict"

function createQuitCoordinator({
  onStarting,
  onCancelled = () => {},
  playEnding,
  stopServices,
  quit,
  logger = console,
}) {
  let state = "idle"
  let completion
  function handle(event) {
    if (state === "ready") return completion
    event.preventDefault()
    if (state === "waiting") return completion
    state = "waiting"
    onStarting()
    // Both operations start immediately. Media never delays runtime cleanup,
    // and a media failure never prevents cleanup or final exit.
    completion = Promise.allSettled([Promise.resolve().then(playEnding), Promise.resolve().then(stopServices)]).then(
      (results) => {
        for (const result of results)
          if (result.status === "rejected") logger.warn("[electron] quit step failed", result.reason)
        if (results[1].status === "rejected" && results[1].reason?.code === "BROWSER_CLOSURE_REFUSED") {
          state = "idle"
          onCancelled()
          return
        }
        state = "ready"
        quit()
      },
    )
    return completion
  }
  return {
    handle,
    get state() {
      return state
    },
  }
}
module.exports = { createQuitCoordinator }
