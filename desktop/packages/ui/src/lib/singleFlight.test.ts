import { describe, expect, test, vi } from "vitest"

import { createSingleFlight } from "./singleFlight"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createSingleFlight", () => {
  test("joins concurrent calls for the same key into one started invocation", async () => {
    const flight = createSingleFlight<boolean>()
    const work = createDeferred<boolean>()
    const start = vi.fn(() => work.promise)

    const first = flight.run("directory:a", start)
    const second = flight.run("directory:a", start)

    expect(start).toHaveBeenCalledTimes(1)

    work.resolve(true)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
  })

  test("does not share work across different keys", async () => {
    const flight = createSingleFlight<boolean>()
    const firstWork = createDeferred<boolean>()
    const secondWork = createDeferred<boolean>()
    const firstStart = vi.fn(() => firstWork.promise)
    const secondStart = vi.fn(() => secondWork.promise)

    const first = flight.run("directory:a", firstStart)
    const second = flight.run("directory:b", secondStart)

    expect(firstStart).toHaveBeenCalledTimes(1)
    expect(secondStart).toHaveBeenCalledTimes(1)

    firstWork.resolve(true)
    secondWork.resolve(false)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
  })

  test("starts a fresh invocation after the previous one settles", async () => {
    const flight = createSingleFlight<boolean>()
    const start = vi.fn(async () => true)

    await expect(flight.run("directory:a", start)).resolves.toBe(true)
    await expect(flight.run("directory:a", start)).resolves.toBe(true)

    expect(start).toHaveBeenCalledTimes(2)
  })

  test("releases the entry when the work rejects and forwards the rejection", async () => {
    const flight = createSingleFlight<boolean>()
    const work = createDeferred<boolean>()
    const start = vi.fn(() => work.promise)

    const first = flight.run("directory:a", start)
    const second = flight.run("directory:a", start)
    expect(start).toHaveBeenCalledTimes(1)

    work.reject(new Error("load failed"))

    await expect(first).rejects.toThrow("load failed")
    await expect(second).rejects.toThrow("load failed")

    const retryStart = vi.fn(async () => true)
    await expect(flight.run("directory:a", retryStart)).resolves.toBe(true)
    expect(retryStart).toHaveBeenCalledTimes(1)
  })

  test("does not evict a newer slot when an older promise settles late", async () => {
    const flight = createSingleFlight<boolean>()
    const olderWork = createDeferred<boolean>()
    const newerWork = createDeferred<boolean>()

    const older = flight.run("directory:a", () => olderWork.promise)
    flight.clear("directory:a")
    const newer = flight.run("directory:a", () => newerWork.promise)

    olderWork.resolve(true)
    await expect(older).resolves.toBe(true)

    const joinedStart = vi.fn(async () => false)
    const joined = flight.run("directory:a", joinedStart)

    expect(joinedStart).not.toHaveBeenCalled()

    newerWork.resolve(true)
    await expect(joined).resolves.toBe(true)
    await expect(newer).resolves.toBe(true)

    const nextStart = vi.fn(async () => true)
    await expect(flight.run("directory:a", nextStart)).resolves.toBe(true)
    expect(nextStart).toHaveBeenCalledTimes(1)
  })

  test("clear makes the next call start fresh", async () => {
    const flight = createSingleFlight<boolean>()
    const work = createDeferred<boolean>()
    const firstStart = vi.fn(() => work.promise)

    const first = flight.run("directory:a", firstStart)
    flight.clear("directory:a")

    const secondStart = vi.fn(async () => false)
    const second = flight.run("directory:a", secondStart)

    expect(firstStart).toHaveBeenCalledTimes(1)
    expect(secondStart).toHaveBeenCalledTimes(1)

    work.resolve(true)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
  })
})
