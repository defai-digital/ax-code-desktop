import { readWithDeadline } from "@/lib/asyncTimeout"
import { axCodeClient } from "@/lib/ax-code/client"
import { updateConfigUpdateMessage } from "@/lib/configUpdate"

const MAX_HEALTH_WAIT_MS = 20000
const HEALTH_PROBE_TIMEOUT_MS = 5000
const FAST_HEALTH_POLL_INTERVAL_MS = 300
const FAST_HEALTH_POLL_ATTEMPTS = 4
const SLOW_HEALTH_POLL_BASE_MS = 800
const SLOW_HEALTH_POLL_INCREMENT_MS = 200
const SLOW_HEALTH_POLL_MAX_MS = 2000

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type WaitForAxCodeConnectionOptions = {
  checkHealth?: (signal: AbortSignal) => Promise<boolean>
  updateMessage?: (message: string) => void
  sleepMs?: (ms: number) => Promise<void>
  now?: () => number
  maxWaitMs?: number
}

export async function waitForAxCodeConnection(delayMs?: number, options: WaitForAxCodeConnectionOptions = {}) {
  const checkHealth = options.checkHealth ?? ((signal: AbortSignal) => axCodeClient.checkHealth(signal))
  const updateMessage = options.updateMessage ?? updateConfigUpdateMessage
  const sleepMs = options.sleepMs ?? sleep
  const now = options.now ?? Date.now
  const maxWaitMs = options.maxWaitMs ?? MAX_HEALTH_WAIT_MS

  const initialPause = typeof delayMs === "number" && delayMs > 0 ? delayMs : 0

  if (initialPause > 0) {
    await sleepMs(initialPause)
  }

  const start = now()
  const deadline = start + maxWaitMs
  let attempt = 0
  let lastError: unknown = null

  while (true) {
    const remainingMs = deadline - now()
    if (!(remainingMs > 0)) break
    attempt += 1
    const elapsedSeconds = Math.floor((now() - start) / 1000)
    updateMessage(
      elapsedSeconds >= 30
        ? `Still waiting for AX Code… ${elapsedSeconds}s elapsed`
        : `Waiting for AX Code… (attempt ${attempt})`,
    )

    try {
      const isHealthy = await readWithDeadline(checkHealth, Math.min(HEALTH_PROBE_TIMEOUT_MS, remainingMs))
      if (isHealthy && now() < deadline) {
        return
      }
      lastError = new Error("AX Code health check reported not ready")
    } catch (error) {
      lastError = error
    }

    const elapsed = now() - start

    const waitMs =
      attempt <= FAST_HEALTH_POLL_ATTEMPTS && elapsed < 1200
        ? FAST_HEALTH_POLL_INTERVAL_MS
        : Math.min(
            SLOW_HEALTH_POLL_BASE_MS + Math.max(0, attempt - FAST_HEALTH_POLL_ATTEMPTS) * SLOW_HEALTH_POLL_INCREMENT_MS,
            SLOW_HEALTH_POLL_MAX_MS,
          )

    const retryDelayMs = Math.min(waitMs, deadline - now())
    if (retryDelayMs > 0) await sleepMs(retryDelayMs)
  }

  throw lastError || new Error("AX Code did not become ready in time")
}
