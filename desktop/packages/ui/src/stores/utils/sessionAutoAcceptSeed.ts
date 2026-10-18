/**
 * Decouples session creation from the permission store.
 *
 * `permissionStore` consumes `session-actions`, so having `session-actions`
 * import the store back would add a cycle to the session-creation path. The
 * store registers the handler here instead, and every session-creation site
 * only depends on this tiny module.
 */

export type SessionAutoAcceptSeedHandler = (sessionId: string, parentID: string | null) => void

let handler: SessionAutoAcceptSeedHandler | null = null
// A session can be created before the permission store module has evaluated
// (for example from a startup path that does not render the composer). Hold
// those seeds until the store registers, then replay them.
const pendingSeeds: Array<[string, string | null]> = []

export const registerSessionAutoAcceptSeedHandler = (next: SessionAutoAcceptSeedHandler | null): void => {
  handler = next
  if (!next || pendingSeeds.length === 0) {
    return
  }
  const seeds = pendingSeeds.splice(0)
  for (const [sessionId, parentID] of seeds) {
    next(sessionId, parentID)
  }
}

/**
 * Record the auto-accept default for a newly created root session. Child
 * sessions pass a parent and inherit its setting instead.
 */
export const seedSessionAutoAccept = (sessionId: string, parentID: string | null): void => {
  if (handler) {
    handler(sessionId, parentID)
    return
  }
  pendingSeeds.push([sessionId, parentID])
}

export type SessionAutoAcceptInheritHandler = (sessionId: string, sourceSessionId: string) => void

let inheritHandler: SessionAutoAcceptInheritHandler | null = null
const pendingInheritSeeds: Array<[string, string]> = []

export const registerSessionAutoAcceptInheritHandler = (next: SessionAutoAcceptInheritHandler | null): void => {
  inheritHandler = next
  if (!next || pendingInheritSeeds.length === 0) {
    return
  }
  const seeds = pendingInheritSeeds.splice(0)
  for (const [sessionId, sourceSessionId] of seeds) {
    next(sessionId, sourceSessionId)
  }
}

/**
 * Record the source session's effective auto-accept value for a forked session.
 * A fork is a new root session with no parentID, so lineage inheritance cannot
 * cover a source that never had an explicit setting.
 */
export const inheritSessionAutoAccept = (sessionId: string, sourceSessionId: string): void => {
  if (inheritHandler) {
    inheritHandler(sessionId, sourceSessionId)
    return
  }
  pendingInheritSeeds.push([sessionId, sourceSessionId])
}
