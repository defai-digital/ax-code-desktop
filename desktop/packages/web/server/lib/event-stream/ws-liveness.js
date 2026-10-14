"use strict"

// WebSocket liveness supervision shared by the message-stream bridges.
//
// A socket whose peer disappears without a close frame (network change, laptop
// sleep, killed NAT entry) only surfaces as a TCP timeout minutes or hours
// later. Until then its interval, its upstream subscription and its place in the
// client set all linger. Pinging alone does not help: `ws` has no default pong
// watchdog, so this tracker marks a socket dead as soon as one ping interval
// passes without a pong and lets the caller terminate it.

export function createWsLivenessTracker(socket, { intervalMs, onDead, ping = true } = {}) {
  if (!socket || typeof socket.on !== "function" || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return { stop() {} }
  }

  let alive = true
  const handlePong = () => {
    alive = true
  }
  socket.on("pong", handlePong)

  const interval = setInterval(() => {
    if (socket.readyState !== 1) {
      return
    }

    if (!alive) {
      onDead?.()
      return
    }

    alive = false
    if (ping) {
      try {
        socket.ping()
      } catch {
        // A failed ping is caught by the next tick's liveness check.
      }
    }
  }, intervalMs)
  interval.unref?.()

  return {
    stop() {
      clearInterval(interval)
      socket.off?.("pong", handlePong)
    },
  }
}
