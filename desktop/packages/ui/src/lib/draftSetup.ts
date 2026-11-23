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

/**
 * Where a new-session draft's chosen target stands (C UX-03). The composer used to re-point a worktree target that
 * dropped out of the option list at the project root, so a prompt meant for an isolated worktree could go to the
 * root. Now the choice is kept: "checking" while branches or the worktree listing are not known (Send stays open,
 * since some surfaces never list worktrees), and "missing" once a successful listing confirms it is gone, which
 * blocks Send until another target is picked.
 */
export function draftTargetState(input: {
  draftOpen: boolean
  currentSessionId: string | null
  selectedDirectory: string | null
  projectRoot: string | null
  /** The target is one of the options (the project root or a listed worktree). */
  listed: boolean
  /** A target that is being created or set up, or an explicit directory outside the list. */
  keepUnlisted: boolean
  discoveringBranches: boolean
  /** The project's worktree listing succeeded at least once, an empty result included. */
  worktreeListingReady: boolean
  /** The draft recorded this target as gone; it stays so until the person chooses a target. */
  lost?: boolean
}): "ok" | "checking" | "missing" {
  if (!input.draftOpen || input.currentSessionId || !input.selectedDirectory) return "ok"
  if (input.lost) return "missing"
  if (input.listed || input.keepUnlisted || input.selectedDirectory === input.projectRoot) return "ok"
  if (input.discoveringBranches || !input.worktreeListingReady) return "checking"
  return "missing"
}
