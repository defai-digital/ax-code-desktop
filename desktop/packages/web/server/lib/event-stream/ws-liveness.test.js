import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"

import { createWsLivenessTracker } from "./ws-liveness.js"

const createSocket = ({ readyState = 1 } = {}) => {
  const socket = new EventEmitter()
  socket.readyState = readyState
  socket.ping = vi.fn()
  socket.off = socket.removeListener.bind(socket)
  return socket
}

describe("createWsLivenessTracker", () => {
  it("pings a live socket and keeps it while pongs arrive", () => {
    vi.useFakeTimers()
    try {
      const socket = createSocket()
      const onDead = vi.fn()
      const tracker = createWsLivenessTracker(socket, { intervalMs: 1000, onDead })

      vi.advanceTimersByTime(1000)
      expect(socket.ping).toHaveBeenCalledTimes(1)

      socket.emit("pong")
      vi.advanceTimersByTime(1000)
      expect(socket.ping).toHaveBeenCalledTimes(2)
      expect(onDead).not.toHaveBeenCalled()

      tracker.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports a peer that stopped answering pings", () => {
    // Without this the interval, the upstream subscription and the client-set
    // entry survived until the OS TCP timeout expired.
    vi.useFakeTimers()
    try {
      const socket = createSocket()
      const onDead = vi.fn()
      const tracker = createWsLivenessTracker(socket, { intervalMs: 1000, onDead })

      vi.advanceTimersByTime(1000)
      vi.advanceTimersByTime(1000)

      expect(onDead).toHaveBeenCalledTimes(1)

      tracker.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores a socket that is no longer open", () => {
    vi.useFakeTimers()
    try {
      const socket = createSocket({ readyState: 3 })
      const onDead = vi.fn()
      const tracker = createWsLivenessTracker(socket, { intervalMs: 1000, onDead })

      vi.advanceTimersByTime(3000)

      expect(socket.ping).not.toHaveBeenCalled()
      expect(onDead).not.toHaveBeenCalled()

      tracker.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops supervising after stop()", () => {
    vi.useFakeTimers()
    try {
      const socket = createSocket()
      const onDead = vi.fn()
      const tracker = createWsLivenessTracker(socket, { intervalMs: 1000, onDead })

      tracker.stop()
      vi.advanceTimersByTime(5000)

      expect(socket.ping).not.toHaveBeenCalled()
      expect(onDead).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns a no-op tracker for unusable input", () => {
    expect(() => createWsLivenessTracker(null, { intervalMs: 1000 })).not.toThrow()
    expect(() => createWsLivenessTracker({}, { intervalMs: 1000 }).stop()).not.toThrow()
  })
})
