/** The editor already presents recovery guidance and must retain the draft. */
export class ScheduledTaskCreateRecoveryRequired extends Error {}

/**
 * The runtime answered a create with a 4xx: it refused the payload before storing anything, so no task
 * exists for it. A transport failure or a 5xx is not one of these; their outcome is unknown.
 */
export class ScheduledTaskRejectedError extends Error {}
