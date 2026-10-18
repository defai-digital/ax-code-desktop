/**
 * Post-turn Review and Commit go to different surfaces.
 * Review opens the diff beside chat via openBesideChat("diff"). Commit still opens the git sidebar.
 */

export type TurnNextStepAction = "review" | "commit"

export type TurnNextStepDestination = "diff-review" | "git"

export function resolveTurnNextStepDestination(action: TurnNextStepAction): TurnNextStepDestination {
  if (action === "review") return "diff-review"
  return "git"
}

export function applyTurnNextStep(
  action: TurnNextStepAction,
  sinks: {
    openDiffReview: () => void
    openGit: () => void
  },
): TurnNextStepDestination {
  const destination = resolveTurnNextStepDestination(action)
  if (destination === "diff-review") {
    sinks.openDiffReview()
  } else {
    sinks.openGit()
  }
  return destination
}
