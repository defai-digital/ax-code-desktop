type Deferred = {
  promise: Promise<string>
  resolve: (directory: string) => void
  reject: (error: Error) => void
}

const requests = new Map<string, Deferred>()

const createDeferred = (): Deferred => {
  let resolve!: (directory: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

const createId = (): string => `worktree_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const createPendingDraftWorktreeRequest = (): string => {
  const id = createId()
  const deferred = createDeferred()
  // The request is only awaited when the user actually sends in the draft; a
  // rejection that arrives before then (e.g. worktree creation failed) must
  // not surface as an unhandled promise rejection.
  void deferred.promise.catch(() => {})
  requests.set(id, deferred)
  return id
}

export const resolvePendingDraftWorktreeRequest = (id: string, directory: string): void => {
  const entry = requests.get(id)
  if (!entry) {
    return
  }
  requests.delete(id)
  entry.resolve(directory)
}

export const rejectPendingDraftWorktreeRequest = (id: string, error: Error): void => {
  const entry = requests.get(id)
  if (!entry) {
    return
  }
  requests.delete(id)
  entry.reject(error)
}

export const waitForPendingDraftWorktreeRequest = (id: string): Promise<string> => {
  const entry = requests.get(id)
  if (!entry) {
    return Promise.reject(new Error("Pending worktree request not found"))
  }
  return entry.promise
}
