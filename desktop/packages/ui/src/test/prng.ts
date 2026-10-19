/**
 * Deterministic seeded PRNG and a tiny property runner for model tests.
 *
 * No fast-check dependency: generators are plain functions of an injected
 * Rng, time is injected by callers, and failures shrink with a lite strategy
 * (drop one event at a time, then bisect the prefix) so a failing seed can be
 * replayed exactly via the SYNC_PROP_SEED environment variable.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [0, n). Returns 0 when n <= 0. */
  int(n: number): number
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T
  /** True with probability p. */
  chance(p: number): boolean
  /** Fisher-Yates shuffled copy; the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[]
}

/** mulberry32: small, fast, deterministic 32-bit seeded PRNG. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(n: number): number {
      if (n <= 0) return 0
      return Math.floor(next() * n)
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick() requires a non-empty array")
      return items[Math.floor(next() * items.length)] as T
    },
    chance(p: number): boolean {
      return next() < p
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1))
        const tmp = out[i] as T
        out[i] = out[j] as T
        out[j] = tmp
      }
      return out
    },
  }
}

export interface RunPropertyAsyncOptions<Trace> {
  name: string
  cases?: number
  seed?: number
  generate: (rng: Rng) => Trace
  check: (trace: Trace) => Promise<void>
  shrink?: (trace: Trace) => Trace[]
}

export interface RunPropertyOptions<Trace> {
  name: string
  cases?: number
  seed?: number
  generate: (rng: Rng) => Trace
  check: (trace: Trace) => void
  shrink?: (trace: Trace) => Trace[]
}

const DEFAULT_SEED = 0x5eed
const MAX_SHRINK_STEPS = 500

function envSeed(): number | undefined {
  const raw = typeof process !== "undefined" ? process.env?.SYNC_PROP_SEED : undefined
  if (raw === undefined || raw === "") return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * One-step shrink candidates for arrays and plain-object traces.
 * Arrays shrink by dropping one element or taking a shorter prefix.
 * Records shrink by dropping one entry, or by shrinking a nested
 * array/record value in place (other fields are preserved).
 */
export function shrinkCandidates(trace: unknown): unknown[] {
  return candidatesAt(trace, true)
}

function candidatesAt(trace: unknown, isTop: boolean): unknown[] {
  const out: unknown[] = []
  if (Array.isArray(trace)) {
    for (let i = 0; i < trace.length; i += 1) {
      out.push([...trace.slice(0, i), ...trace.slice(i + 1)])
    }
    for (let len = Math.floor(trace.length / 2); len >= 1; len = Math.floor(len / 2)) {
      out.push(trace.slice(0, len))
    }
    // Nested arrays shrink in place; record elements do not (dropping a
    // field of an event object would fabricate an invalid trace that fails
    // for the wrong reason).
    for (let i = 0; i < trace.length; i += 1) {
      if (!Array.isArray(trace[i])) continue
      for (const inner of candidatesAt(trace[i], false)) {
        const copy = [...trace]
        copy[i] = inner
        out.push(copy)
      }
    }
    return out
  }
  if (isRecord(trace)) {
    for (const key of Object.keys(trace)) {
      // Dropping a top-level field would change the trace's shape and make
      // most checks throw for the wrong reason; nested records may drop an
      // entry (e.g. one session from a status map).
      if (!isTop) {
        const without: Record<string, unknown> = { ...trace }
        delete without[key]
        out.push(without)
      }
      for (const inner of candidatesAt(trace[key], false)) {
        out.push({ ...trace, [key]: inner })
      }
    }
  }
  return out
}

function fails<Trace>(check: (trace: Trace) => void, trace: Trace): boolean {
  try {
    check(trace)
    return false
  } catch {
    return true
  }
}

async function failsAsync<Trace>(check: (trace: Trace) => Promise<void>, trace: Trace): Promise<boolean> {
  try {
    await check(trace)
    return false
  } catch {
    return true
  }
}

/** Greedy shrink: repeatedly take the first candidate that still fails. */
function shrinkSync<Trace>(check: (trace: Trace) => void, trace: Trace, shrink?: (trace: Trace) => Trace[]): Trace {
  let current = trace
  for (let step = 0; step < MAX_SHRINK_STEPS; step += 1) {
    const candidates: Trace[] = shrink ? shrink(current) : (shrinkCandidates(current) as Trace[])
    const next = candidates.find((candidate) => fails(check, candidate))
    if (next === undefined) return current
    current = next
  }
  return current
}

async function shrinkAsync<Trace>(
  check: (trace: Trace) => Promise<void>,
  trace: Trace,
  shrink?: (trace: Trace) => Trace[],
): Promise<Trace> {
  let current = trace
  for (let step = 0; step < MAX_SHRINK_STEPS; step += 1) {
    const candidates: Trace[] = shrink ? shrink(current) : (shrinkCandidates(current) as Trace[])
    let next: Trace | undefined
    for (const candidate of candidates) {
      if (await failsAsync(check, candidate)) {
        next = candidate
        break
      }
    }
    if (next === undefined) return current
    current = next
  }
  return current
}

function failureMessage(name: string, seed: number, detail: string, minimal: unknown): Error {
  return new Error(
    `Property "${name}" failed seed=${seed}: ${detail}\n` +
      `minimal trace: ${JSON.stringify(minimal)}\n` +
      `replay: SYNC_PROP_SEED=${seed} pnpm --dir desktop/packages/ui exec vitest run <this file>`,
  )
}

/** Async twin of runProperty for traces that must await the code under test. */
export async function runPropertyAsync<Trace>(options: RunPropertyAsyncOptions<Trace>): Promise<void> {
  const cases = options.cases ?? 200
  const replay = envSeed()
  const baseSeed = replay ?? options.seed ?? DEFAULT_SEED
  const seeds: number[] =
    replay !== undefined ? [replay] : Array.from({ length: cases }, (_, i) => (baseSeed + i) >>> 0)
  for (const seed of seeds) {
    const trace = options.generate(createRng(seed))
    try {
      await options.check(trace)
    } catch (error) {
      const minimal = await shrinkAsync(options.check, trace, options.shrink)
      const detail = error instanceof Error ? error.message : String(error)
      throw failureMessage(options.name, seed, detail, minimal)
    }
  }
}

/**
 * Run `cases` generated traces. Each case uses seed `base + index` so any
 * failure names one integer seed. Set SYNC_PROP_SEED=<n> to replay exactly
 * that one seed.
 */
export function runProperty<Trace>(options: RunPropertyOptions<Trace>): void {
  const cases = options.cases ?? 200
  const replay = envSeed()
  const baseSeed = replay ?? options.seed ?? DEFAULT_SEED
  const seeds: number[] =
    replay !== undefined ? [replay] : Array.from({ length: cases }, (_, i) => (baseSeed + i) >>> 0)

  for (const seed of seeds) {
    const trace = options.generate(createRng(seed))
    try {
      options.check(trace)
    } catch (error) {
      const minimal = shrinkSync(options.check, trace, options.shrink)
      const detail = error instanceof Error ? error.message : String(error)
      throw failureMessage(options.name, seed, detail, minimal)
    }
  }
}
