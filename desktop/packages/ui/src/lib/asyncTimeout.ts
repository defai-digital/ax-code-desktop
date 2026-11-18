export const withTimeout = <T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T | Promise<T>,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timeoutHandle = setTimeout(
      () => {
        if (settled) {
          return
        }
        settled = true
        Promise.resolve().then(onTimeout).then(resolve, reject)
      },
      Math.max(0, timeoutMs),
    )

    operation.then(
      (value) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutHandle)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutHandle)
        reject(error)
      },
    )
  })
}

/** Release the caller at the deadline even if a read ignores or resolves on abort. */
export function readWithDeadline<T>(read: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const invoke = async () => read(controller.signal)
  return withTimeout(invoke(), timeoutMs, () => {
    controller.abort()
    throw new Error("Read timed out")
  })
}
