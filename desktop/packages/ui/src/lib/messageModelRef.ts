export interface MessageModelRef {
  agent?: string
  providerID?: string
  modelID?: string
  variant?: string
  /**
   * Where the runtime got the model recorded on this user message.
   * Absent on older messages. `"request"` is the model the client submitted.
   */
  modelOrigin?: string
}

interface MessageModelRefSource {
  model?: { providerID?: string; modelID?: string; variant?: string } | null
  agent?: string
  mode?: string
  variant?: string
  modelOrigin?: string
}

const SERVER_CHOSEN_MODEL_ORIGINS = new Set(["agent", "complexity", "hybrid", "session-or-config", "fallback"])

/**
 * The runtime can record a model it chose (the agent's pin, a complexity or
 * hybrid route, the session default, or a fallback) on the user message.
 * That record is not the model the user selected in the composer.
 * Messages written before `modelOrigin` existed stay eligible for restore.
 */
export const isServerChosenModelOrigin = (origin: string | undefined): boolean =>
  origin !== undefined && SERVER_CHOSEN_MODEL_ORIGINS.has(origin)

const nonEmptyText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined

/**
 * Read the model selection recorded on a user message. `agent` falls back to the
 * legacy `mode` field, and `variant` prefers the AX Code 1.4.0 location
 * (`model.variant`) over the legacy top-level one. Every field is undefined when
 * absent or blank.
 */
export const extractMessageModelRef = (message: MessageModelRefSource): MessageModelRef => {
  const modelOrigin = nonEmptyText(message.modelOrigin)
  return {
    agent: nonEmptyText(message.agent) ?? nonEmptyText(message.mode),
    providerID: nonEmptyText(message.model?.providerID),
    modelID: nonEmptyText(message.model?.modelID),
    variant: nonEmptyText(message.model?.variant ?? message.variant),
    ...(modelOrigin ? { modelOrigin } : {}),
  }
}
