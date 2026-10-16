import type {
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssuesListResult,
  GitHubPullRequestContextResult,
} from "@/lib/api/types"
import { axCodeClient } from "@/lib/ax-code/client"
import { generateBranchSlug } from "@/lib/git/branchNameGenerator"
import { renderMagicPrompt, type MagicPromptId } from "@/lib/magicPrompts"
import { parseModelIdentifier } from "@/lib/modelIdentifier"
import { createWorktreeSessionForNewBranch } from "@/lib/worktreeSessionCreator"
import { useAgentsStore } from "@/stores/useAgentsStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { useSelectionStore } from "@/sync/selection-store"
import * as sessionActions from "@/sync/session-actions"

export function buildIssueWorkContext(args: {
  repo: GitHubIssuesListResult["repo"] | undefined
  issue: GitHubIssue
  comments: GitHubIssueComment[]
}) {
  const payload = {
    repo: args.repo ?? null,
    issue: args.issue,
    comments: args.comments,
  }
  return `GitHub issue context (JSON)\n${JSON.stringify(payload, null, 2)}`
}

export function buildPullRequestWorkContext(payload: GitHubPullRequestContextResult) {
  return `GitHub pull request context (JSON)\n${JSON.stringify(payload, null, 2)}`
}

type WorkPrompt =
  | {
      visible: "github.issue.review.visible"
      instructions: "github.issue.review.instructions"
      vars: { issue_number: string }
    }
  | { visible: "github.pr.review.visible"; instructions: "github.pr.review.instructions"; vars: { pr_number: string } }

const resolveDefaultAgentName = (): string | undefined => {
  const configState = useConfigStore.getState()
  const visibleAgents = useAgentsStore.getState().getVisibleAgents()
  if (configState.settingsDefaultAgent) {
    const settingsAgent = visibleAgents.find((agent) => agent.name === configState.settingsDefaultAgent)
    if (settingsAgent) return settingsAgent.name
  }
  return visibleAgents.find((agent) => agent.name === "build")?.name || visibleAgents[0]?.name
}

const resolveDefaultModelSelection = (): { providerID: string; modelID: string } | null => {
  const configState = useConfigStore.getState()
  const settingsDefaultModel = configState.settingsDefaultModel
  if (!settingsDefaultModel) return null
  const parsed = parseModelIdentifier(settingsDefaultModel)
  if (!parsed) return null
  const modelMetadata = configState.getModelMetadata(parsed.providerId, parsed.modelId)
  if (!modelMetadata) return null
  return { providerID: parsed.providerId, modelID: parsed.modelId }
}

const resolveDefaultVariant = (providerID: string, modelID: string): string | undefined => {
  const configState = useConfigStore.getState()
  const settingsDefaultVariant = configState.settingsDefaultVariant
  if (!settingsDefaultVariant) return undefined
  const provider = configState.providers.find((item) => item.id === providerID)
  const model = provider?.models.find((item: Record<string, unknown>) => (item as { id?: string }).id === modelID) as
    | { variants?: Record<string, unknown> }
    | undefined
  const variants = model?.variants
  if (!variants || !Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) return undefined
  return settingsDefaultVariant
}

const applyModelSelection = (args: {
  sessionId: string
  providerID: string
  modelID: string
  agentName?: string
  variant?: string
}) => {
  const configState = useConfigStore.getState()
  try {
    useSelectionStore.getState().saveSessionModelSelection(args.sessionId, args.providerID, args.modelID)
  } catch {
    // ignore
  }
  if (!args.agentName) return
  try {
    configState.setAgent(args.agentName)
  } catch {
    // ignore
  }
  try {
    useSelectionStore.getState().saveSessionAgentSelection(args.sessionId, args.agentName)
  } catch {
    // ignore
  }
  try {
    useSelectionStore.getState().saveAgentModelForSession(args.sessionId, args.agentName, args.providerID, args.modelID)
  } catch {
    // ignore
  }
  if (args.variant === undefined) return
  try {
    configState.setCurrentVariant(args.variant)
  } catch {
    // ignore
  }
  try {
    useSelectionStore
      .getState()
      .saveAgentModelVariantForSession(args.sessionId, args.agentName, args.providerID, args.modelID, args.variant)
  } catch {
    // ignore
  }
}

/**
 * Creates a session the same way the GitHub issue picker does: title from the
 * item, then the review magic prompt plus the JSON context as synthetic parts.
 * `delivered` is false when no model is selected; the session still exists.
 */
export async function startGitHubWorkSession(args: {
  directory: string
  title: string
  prompt: WorkPrompt
  contextText: string
  createInWorktree?: boolean
  worktreeBranchPrefix?: string
  /** Runs as soon as the session exists, before the model is resolved or the prompt is sent. */
  onSessionCreated?: (sessionId: string) => void
  onDeliveryError?: (error: unknown) => void
}): Promise<{ sessionId: string; delivered: boolean }> {
  const sessionId = await (async () => {
    if (args.createInWorktree) {
      const prefix = args.worktreeBranchPrefix?.trim() || "issue"
      const created = await createWorktreeSessionForNewBranch(args.directory, `${prefix}-${generateBranchSlug()}`)
      if (!created?.id) throw new Error("Failed to create worktree session")
      return created.id
    }
    const session = await sessionActions.createSession(args.title, args.directory, null)
    if (!session?.id) throw new Error("Failed to create session")
    return session.id
  })()

  // Worktree sessions are created untitled; give them the item's title too.
  void sessionActions.updateSessionTitle(sessionId, args.title).catch(() => undefined)
  args.onSessionCreated?.(sessionId)

  const configState = useConfigStore.getState()
  const lastUsedProvider = useSelectionStore.getState().lastUsedProvider
  const defaultModel = resolveDefaultModelSelection()
  const providerID = defaultModel?.providerID || configState.currentProviderId || lastUsedProvider?.providerID
  const modelID = defaultModel?.modelID || configState.currentModelId || lastUsedProvider?.modelID
  const agentName = resolveDefaultAgentName() || configState.currentAgentName || undefined
  if (!providerID || !modelID) {
    return { sessionId, delivered: false }
  }

  const variant = resolveDefaultVariant(providerID, modelID)
  applyModelSelection({ sessionId, providerID, modelID, agentName, variant })

  const visiblePromptText = await renderMagicPrompt(args.prompt.visible, args.prompt.vars)
  const instructionsText = await renderMagicPrompt(args.prompt.instructions as MagicPromptId)
  void axCodeClient
    .sendMessage({
      id: sessionId,
      providerID,
      modelID,
      agent: agentName,
      variant,
      text: visiblePromptText,
      additionalParts: [
        { text: instructionsText, synthetic: true },
        { text: args.contextText, synthetic: true },
      ],
    })
    .catch((error) => {
      args.onDeliveryError?.(error)
    })

  return { sessionId, delivered: true }
}
