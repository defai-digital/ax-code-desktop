import type { ProviderWithModelList } from "@/types/providerModels"

/** What a new person still has to set up before a draft can become a session (C UX-05). */
export interface DraftSetup {
  /** No project is registered yet. A draft can still be sent; it runs in the current directory. */
  needsProject: boolean
  /** "connect": no provider offers a model. "choose": models exist but none is selected. */
  modelStep: "connect" | "choose" | null
}

export interface DraftSetupInput {
  projectCount: number
  /** Providers have loaded at least once; before that nothing is known, so no model step is shown. */
  providersReady: boolean
  providers: readonly Pick<ProviderWithModelList, "models">[]
  currentProviderId: string | null | undefined
  currentModelId: string | null | undefined
}

export function draftSetup(input: DraftSetupInput): DraftSetup {
  const needsProject = input.projectCount === 0
  if (!input.providersReady) return { needsProject, modelStep: null }
  const hasModels = input.providers.some((provider) => (provider.models?.length ?? 0) > 0)
  if (!hasModels) return { needsProject, modelStep: "connect" }
  if (!input.currentProviderId || !input.currentModelId) return { needsProject, modelStep: "choose" }
  return { needsProject, modelStep: null }
}

/**
 * A new-session draft whose model step is open cannot be sent: the send would only fail with "Select a model". A
 * session that already exists keeps its own send path, and a missing project never blocks (C UX-05).
 */
export function draftSendNeedsModel(input: {
  currentSessionId: string | null
  draftOpen: boolean
  modelStep: DraftSetup["modelStep"]
}): boolean {
  return !input.currentSessionId && input.draftOpen && input.modelStep !== null
}
