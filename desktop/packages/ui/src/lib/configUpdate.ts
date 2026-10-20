const DEFAULT_MESSAGE = "Updating AX Code configuration..."

type ConfigUpdateListener = (state: { isUpdating: boolean; message: string; batchId: number }) => void

let pendingCount = 0
// Presentation identity only: a dismissed notice must not consume an operation's completion.
let batchId = 0
let currentMessage = DEFAULT_MESSAGE
const listeners = new Set<ConfigUpdateListener>()

function notify() {
  const snapshot = {
    isUpdating: pendingCount > 0,
    message: currentMessage,
    batchId,
  }
  listeners.forEach((listener) => listener(snapshot))
}

export function startConfigUpdate(message?: string) {
  if (pendingCount === 0) batchId += 1
  pendingCount += 1
  if (pendingCount === 1) {
    currentMessage = message || DEFAULT_MESSAGE
    notify()
  } else if (message) {
    currentMessage = message
    notify()
  }
}

export function finishConfigUpdate() {
  if (pendingCount === 0) {
    return
  }

  pendingCount -= 1
  if (pendingCount === 0) {
    currentMessage = DEFAULT_MESSAGE
    notify()
  }
}

export function updateConfigUpdateMessage(message: string) {
  if (currentMessage === message && pendingCount > 0) {
    return
  }
  currentMessage = message
  if (pendingCount > 0) {
    notify()
  }
}

export function subscribeConfigUpdate(listener: ConfigUpdateListener) {
  listeners.add(listener)
  listener({
    isUpdating: pendingCount > 0,
    message: currentMessage,
    batchId,
  })
  return () => {
    listeners.delete(listener)
  }
}

export function getConfigUpdateSnapshot() {
  return {
    isUpdating: pendingCount > 0,
    message: currentMessage,
    batchId,
  }
}
