"use strict"

function createQuitCoordinator({
  onStarting,
  onCancelled = () => {},
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
    // A cleanup failure never prevents the final exit, except a page that refused to close.
    completion = Promise.resolve()
      .then(stopServices)
      .then(
        () => {
          state = "ready"
          quit()
        },
        (error) => {
          logger.warn("[electron] quit step failed", error)
          if (error?.code === "BROWSER_CLOSURE_REFUSED") {
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
