import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMainRuntimeRestartClient } from "./runtime-restart-client.js"

const createChannel = () => {
  const channel = new EventEmitter()
  channel.postMessage = vi.fn()
  channel.reply = (result) => channel.emit("message", { data: { type: "runtime-restart-result", ...result } })
  return channel
}

afterEach(() => vi.useRealTimers())

describe("main runtime restart client", () => {
  it("waits for the result assigned to its request", async () => {
    const channel = createChannel()
    const request = createMainRuntimeRestartClient(channel)
    const first = request("settings saved")
    const second = request("agents updated")
    const [firstPost, secondPost] = channel.postMessage.mock.calls.map(([message]) => message)
    expect(firstPost).toMatchObject({ type: "runtime-restart-request", reason: "settings saved" })
    expect(firstPost.id).not.toBe(secondPost.id)
    const firstSettled = vi.fn()
    const firstObserved = first.then(firstSettled)
    const secondFailure = expect(second).rejects.toThrow("Runtime did not start")
    channel.reply({ id: secondPost.id, ok: false, error: "Runtime did not start" })
    await secondFailure
    expect(firstSettled).not.toHaveBeenCalled()
    channel.reply({ id: firstPost.id, ok: true })
    await firstObserved
    expect(firstSettled).toHaveBeenCalledTimes(1)
  })

  it("rejects on timeout and ignores the late result", async () => {
    vi.useFakeTimers()
    const channel = createChannel()
    const request = createMainRuntimeRestartClient(channel)
    const timedOut = expect(request("first", 20)).rejects.toThrow("Timed out")
    await vi.advanceTimersByTimeAsync(20)
    await timedOut
    const next = request("next", 20)
    const [expiredId, nextId] = channel.postMessage.mock.calls.map(([message]) => message.id)
    channel.reply({ id: expiredId, ok: false, error: "Late result" })
    channel.reply({ id: nextId, ok: true })
    await expect(next).resolves.toBeUndefined()
  })

  it("rejects pending and future requests when the utility channel closes", async () => {
    const channel = createChannel()
    const request = createMainRuntimeRestartClient(channel)
    const pending = expect(request("settings saved")).rejects.toThrow("restart channel closed")
    channel.emit("close")
    await pending
    await expect(request("another save")).rejects.toThrow("restart channel closed")
    expect(channel.postMessage).toHaveBeenCalledTimes(1)
  })

  it("stays inactive outside the desktop utility process", () => {
    expect(createMainRuntimeRestartClient(undefined)).toBeNull()
  })
})
