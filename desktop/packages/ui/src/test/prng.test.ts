import { describe, expect, test } from "vitest"
import { createRng, runProperty, runPropertyAsync } from "./prng"

describe("createRng (mulberry32)", () => {
  test("same seed replays the same stream", () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a.next(), a.next(), a.int(100), a.pick([1, 2, 3])]).toEqual([
      b.next(),
      b.next(),
      b.int(100),
      b.pick([1, 2, 3]),
    ])
  })

  test("different seeds diverge and outputs stay in range", () => {
    const a = createRng(1)
    const b = createRng(2)
    const xs = Array.from({ length: 50 }, () => a.next())
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(xs).not.toEqual(Array.from({ length: 50 }, () => b.next()))
  })

  test("int, chance and shuffle honour their contracts", () => {
    const rng = createRng(7)
    for (let i = 0; i < 100; i += 1) {
      const v = rng.int(5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
    }
    expect(rng.int(0)).toBe(0)
    expect(createRng(3).chance(0)).toBe(false)
    expect(createRng(3).chance(1)).toBe(true)
    const input = [1, 2, 3, 4, 5]
    const shuffled = createRng(9).shuffle(input)
    expect([...shuffled].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe("runProperty", () => {
  test("passes when the invariant holds for every case", () => {
    runProperty({
      name: "sum stays non-negative",
      cases: 25,
      seed: 11,
      generate: (rng) => Array.from({ length: 4 }, () => rng.int(10)),
      check: (trace) => {
        if (trace.some((n) => n < 0)) throw new Error("negative")
      },
    })
  })

  test("failure message carries seed, minimal trace and replay hint", () => {
    let caught: Error | null = null
    try {
      runProperty({
        name: "always fails",
        cases: 5,
        seed: 100,
        generate: () => ["a", "boom", "c", "d"],
        check: (trace) => {
          if (trace.includes("boom")) throw new Error("found boom")
        },
      })
    } catch (error) {
      caught = error as Error
    }
    expect(caught).not.toBeNull()
    expect(caught?.message).toContain("seed=100")
    expect(caught?.message).toContain("SYNC_PROP_SEED=100")
    // Shrink-lite must drop the irrelevant events around the culprit.
    expect(caught?.message).toContain('["boom"]')
  })

  test("shrinks object traces by shrinking nested arrays in place", () => {
    let caught: Error | null = null
    try {
      runProperty({
        name: "object trace fails",
        cases: 3,
        seed: 200,
        generate: () => ({ label: "keep-me", events: ["a", "boom", "c"] }),
        check: (trace) => {
          if (trace.events.includes("boom")) throw new Error("found boom")
        },
      })
    } catch (error) {
      caught = error as Error
    }
    expect(caught?.message).toContain("seed=200")
    expect(caught?.message).toContain('"events":["boom"]')
    expect(caught?.message).toContain('"label":"keep-me"')
  })

  test("shrinks traces of event objects, not only primitives", () => {
    let caught: Error | null = null
    try {
      runProperty({
        name: "event object trace fails",
        cases: 3,
        seed: 300,
        generate: () => [
          { kind: "noop", n: 1 },
          { kind: "boom", n: 2 },
          { kind: "noop", n: 3 },
        ],
        check: (trace) => {
          if (trace.some((e) => e.kind === "boom")) throw new Error("found boom")
        },
      })
    } catch (error) {
      caught = error as Error
    }
    expect(caught?.message).toContain('[{"kind":"boom","n":2}]')
  })
})

describe("runPropertyAsync", () => {
  test("passes async checks and shrinks failures with the same message format", async () => {
    await runPropertyAsync({
      name: "async passes",
      cases: 5,
      seed: 1,
      generate: (rng) => [rng.int(3)],
      check: async () => {},
    })
    let caught: Error | null = null
    try {
      await runPropertyAsync({
        name: "async fails",
        cases: 3,
        seed: 400,
        generate: () => ({ events: ["x", "boom", "y"] }),
        check: async (trace) => {
          await Promise.resolve()
          if (trace.events.includes("boom")) throw new Error("found boom")
        },
      })
    } catch (error) {
      caught = error as Error
    }
    expect(caught?.message).toContain('Property "async fails" failed seed=400')
    expect(caught?.message).toContain('"events":["boom"]')
    expect(caught?.message).toContain("SYNC_PROP_SEED=400")
  })
})
