import React from "react"
import type { EditPermissionMode } from "@/stores/types/sessionTypes"
import type { ModelMetadata } from "@/types"
import { formatDate, formatKnowledge } from "./modelMetadataDate"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ProviderLogo } from "@/components/ui/ProviderLogo"
import { ScrollableOverlay } from "@/components/ui/ScrollableOverlay"
import { UsageIndicator } from "@/components/chat/UsageIndicator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Icon } from "@/components/icon/Icon"
import type { IconName } from "@/components/icon/icons"
import {
  ModelPickerList,
  type ModelPickerEntry,
  type ModelPickerProvider,
} from "@/components/model-picker/ModelPickerList"
import { isDesktopShell } from "@/lib/desktop"
import { effortLabel } from "@/lib/effort-label"
import { getAgentColor } from "@/lib/agentColors"
import { mergeModelMetadataWithLiveModel } from "@/lib/modelMetadata"
import { getEditModeColors } from "@/lib/permissions/editModeColors"
import { isProviderModelSelectable } from "@/lib/providerModelAvailability"
import { extractMessageModelRef, isOlderUserMessage, isServerChosenModelOrigin } from "@/lib/messageModelRef"
import { cn, fuzzyMatch } from "@/lib/utils"
import { useConfigStore } from "@/stores/useConfigStore"
import { useAgentsStore } from "@/stores/useAgentsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSelectionStore } from "@/sync/selection-store"
import { useDirectorySync, useSessionMessages } from "@/sync/sync-context"
import { useSync } from "@/sync/use-sync"
import { getSessionMaterializationStatus } from "@/sync/materialization"
import { useUIStore } from "@/stores/useUIStore"
import { useModelLists } from "@/hooks/useModelLists"
import { useIsTextTruncated } from "@/hooks/useIsTextTruncated"
import { getCycledPrimaryAgentName } from "@/lib/modelControlUtils"
import { useI18n } from "@/lib/i18n"
import { useAxCodeReadiness } from "@/hooks/useAxCodeReadiness"
import { eventMatchesShortcut, getEffectiveShortcutCombo, normalizeCombo } from "@/lib/shortcuts"
import type { PermissionAction, PermissionRule } from "@/stores/utils/permissionUtils"
import { truncateToCodeUnits } from "@/lib/textTruncate"
import { agentLabel } from "@/lib/agents"

type ModelControlIconName = IconName

type ModelControlProviderModel = Record<string, unknown> & { id?: string; name?: string }

const MODEL_COST_DISPLAY_ENABLED = false
const buildModelRefKey = (providerID: string, modelID: string) => `${providerID}:${modelID}`
const asPermissionRuleset = (value: unknown): PermissionRule[] | null => {
  if (!Array.isArray(value)) {
    return null
  }
  const rules: PermissionRule[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const candidate = entry as Partial<PermissionRule>
    if (
      typeof candidate.permission !== "string" ||
      typeof candidate.pattern !== "string" ||
      typeof candidate.action !== "string"
    ) {
      continue
    }
    if (candidate.action !== "allow" && candidate.action !== "ask" && candidate.action !== "deny") {
      continue
    }
    rules.push({ permission: candidate.permission, pattern: candidate.pattern, action: candidate.action })
  }
  return rules
}

const resolveWildcardPermissionAction = (ruleset: unknown, permission: string): PermissionAction | undefined => {
  const rules = asPermissionRuleset(ruleset)
  if (!rules || rules.length === 0) {
    return undefined
  }

  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i]
    if (rule.permission === permission && rule.pattern === "*") {
      return rule.action
    }
  }

  for (let i = rules.length - 1; i >= 0; i -= 1) {
    const rule = rules[i]
    if (rule.permission === "*" && rule.pattern === "*") {
      return rule.action
    }
  }

  return undefined
}

interface CapabilityDefinition {
  key: "tool_call" | "reasoning"
  icon: ModelControlIconName
  label: string
  isActive: (metadata?: ModelMetadata) => boolean
}

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  {
    key: "tool_call",
    icon: "tools",
    label: "Tool calling",
    isActive: (metadata) => metadata?.tool_call === true,
  },
  {
    key: "reasoning",
    icon: "brain-ai-3",
    label: "Reasoning",
    isActive: (metadata) => metadata?.reasoning === true,
  },
]

interface ModalityIconDefinition {
  icon: ModelControlIconName
  label: string
}

type ModalityIcon = {
  key: string
  icon: ModelControlIconName
  label: string
}

type ModelApplyResult = "applied" | "provider-missing" | "model-missing"

const MODALITY_ICON_MAP: Record<string, ModalityIconDefinition> = {
  text: { icon: "text", label: "Text" },
  image: { icon: "file-image", label: "Image" },
  video: { icon: "file-video", label: "Video" },
  audio: { icon: "file-music", label: "Audio" },
  pdf: { icon: "file-pdf", label: "PDF" },
}

const normalizeModality = (value: string) => value.trim().toLowerCase()

const getModalityIcons = (metadata: ModelMetadata | undefined, direction: "input" | "output"): ModalityIcon[] => {
  const modalityList = direction === "input" ? metadata?.modalities?.input : metadata?.modalities?.output
  if (!Array.isArray(modalityList) || modalityList.length === 0) {
    return []
  }

  const uniqueValues = Array.from(new Set(modalityList.map((item) => normalizeModality(item))))

  const result: ModalityIcon[] = []
  for (const modality of uniqueValues) {
    const definition = MODALITY_ICON_MAP[modality]
    if (!definition) {
      continue
    }
    result.push({
      key: modality,
      icon: definition.icon,
      label: definition.label,
    })
  }
  return result
}

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
})

const ADD_PROVIDER_ID = "__add_provider__"

const IconBadge: React.FC<{ iconName: ModelControlIconName; label: string }> = ({ iconName, label }) => (
  <span
    className="flex size-5 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"
    title={label}
    aria-label={label}
    role="img"
  >
    <Icon name={iconName} className="size-3.5" />
  </span>
)

const EditModeIcon: React.FC<{ mode: EditPermissionMode; className?: string }> = ({ mode, className }) => {
  const combinedClassName = cn(className, "flex-shrink-0")
  const modeColors = getEditModeColors(mode)
  const iconColor = modeColors ? modeColors.text : "var(--foreground)"
  const iconStyle = { color: iconColor }

  if (mode === "full") {
    return <Icon name="pencil-ai" className={combinedClassName} style={iconStyle} />
  }
  if (mode === "allow") {
    return <Icon name="checkbox-circle" className={combinedClassName} style={iconStyle} />
  }
  if (mode === "deny") {
    return <Icon name="close-circle" className={combinedClassName} style={iconStyle} />
  }
  return <Icon name="question" className={combinedClassName} style={iconStyle} />
}

const formatTokens = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—"
  }

  if (value === 0) {
    return "0"
  }

  const formatted = COMPACT_NUMBER_FORMATTER.format(value)
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted
}

const formatCost = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—"
  }

  return CURRENCY_FORMATTER.format(value)
}

const getCapabilityIcons = (metadata?: ModelMetadata) => {
  const result: { key: string; icon: ModelControlIconName; label: string }[] = []
  for (const definition of CAPABILITY_DEFINITIONS) {
    if (definition.isActive(metadata)) {
      result.push({ key: definition.key, icon: definition.icon, label: definition.label })
    }
  }
  return result
}

interface ModelControlsProps {
  className?: string
}

export const ModelControls: React.FC<ModelControlsProps> = ({ className }) => {
  const { t } = useI18n()
  const { isReady, isUnavailable } = useAxCodeReadiness()
  const readinessLabel = isUnavailable ? t("common.unavailable") : t("common.loading")
  const providers = useConfigStore((state) => state.providers)
  const currentProviderId = useConfigStore((state) => state.currentProviderId)
  const currentModelId = useConfigStore((state) => state.currentModelId)
  const currentVariant = useConfigStore((state) => state.currentVariant)
  const currentAgentName = useConfigStore((state) => state.currentAgentName)
  const settingsDefaultVariant = useConfigStore((state) => state.settingsDefaultVariant)
  const settingsDefaultAgent = useConfigStore((state) => state.settingsDefaultAgent)
  const setProvider = useConfigStore((state) => state.setProvider)
  const setSelectedProvider = useConfigStore((state) => state.setSelectedProvider)
  const setModel = useConfigStore((state) => state.setModel)
  const setCurrentVariant = useConfigStore((state) => state.setCurrentVariant)
  const getCurrentModelVariants = useConfigStore((state) => state.getCurrentModelVariants)
  const setAgent = useConfigStore((state) => state.setAgent)
  const getCurrentProvider = useConfigStore((state) => state.getCurrentProvider)
  const getModelMetadata = useConfigStore((state) => state.getModelMetadata)
  const getAgentByName = useAgentsStore((state) => state.getAgentByName)
  const getVisibleAgents = useAgentsStore((state) => state.getVisibleAgents)

  // Use visible agents (excludes hidden internal agents)
  const agents = getVisibleAgents()
  const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === "primary"), [agents])

  const currentSessionId = useSessionUIStore((s) => s.currentSessionId)
  const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession)
  const sync = useSync()

  const getSessionModelSelection = useSelectionStore((state) => state.getSessionModelSelection)
  const saveSessionModelSelection = useSelectionStore((state) => state.saveSessionModelSelection)
  const saveSessionAgentSelection = useSelectionStore((state) => state.saveSessionAgentSelection)
  const saveAgentModelForSession = useSelectionStore((state) => state.saveAgentModelForSession)
  const getAgentModelForSession = useSelectionStore((state) => state.getAgentModelForSession)
  const saveAgentModelVariantForSession = useSelectionStore((state) => state.saveAgentModelVariantForSession)
  const getAgentModelVariantForSession = useSelectionStore((state) => state.getAgentModelVariantForSession)

  const selectionHydrated = useSelectionStore((state) => state.hasHydrated)

  const sessionSavedAgentName = useSelectionStore((state) =>
    currentSessionId ? (state.sessionAgentSelections.get(currentSessionId) ?? null) : null,
  )

  const stickySessionAgentRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!currentSessionId) {
      stickySessionAgentRef.current = null
      return
    }
    if (sessionSavedAgentName) {
      stickySessionAgentRef.current = sessionSavedAgentName
    }
  }, [currentSessionId, sessionSavedAgentName])

  const stickySessionAgentName = currentSessionId ? stickySessionAgentRef.current : null

  // Prefer per-session selection over global config to avoid flicker during server-driven mode switches.
  const uiAgentName = currentSessionId
    ? sessionSavedAgentName || stickySessionAgentName || currentAgentName
    : currentAgentName

  const toggleFavoriteModel = useUIStore((state) => state.toggleFavoriteModel)
  const reorderFavoriteModel = useUIStore((state) => state.reorderFavoriteModel)
  const isFavoriteModel = useUIStore((state) => state.isFavoriteModel)
  const addRecentModel = useUIStore((state) => state.addRecentModel)
  const addRecentAgent = useUIStore((state) => state.addRecentAgent)
  const addRecentEffort = useUIStore((state) => state.addRecentEffort)
  const isModelSelectorOpen = useUIStore((state) => state.isModelSelectorOpen)
  const setModelSelectorOpen = useUIStore((state) => state.setModelSelectorOpen)
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen)
  const setSettingsPage = useUIStore((state) => state.setSettingsPage)
  const hiddenModels = useUIStore((state) => state.hiddenModels)
  const cycleAgentShortcutOverride = useUIStore((state) => state.shortcutOverrides.cycle_agent)
  const cycleAgentShortcut = React.useMemo(
    () =>
      getEffectiveShortcutCombo(
        "cycle_agent",
        cycleAgentShortcutOverride ? { cycle_agent: cycleAgentShortcutOverride } : undefined,
      ),
    [cycleAgentShortcutOverride],
  )

  // Separate state for agent selector to avoid conflict with model selector
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = React.useState(false)
  const { favoriteModelsList, recentModelsList } = useModelLists()

  const isDesktop = React.useMemo(() => isDesktopShell(), [])
  const manualVariantSelectionRef = React.useRef(false)
  // Use global state for model selector (allows Ctrl+M shortcut)
  const agentMenuOpen = isModelSelectorOpen
  const setAgentMenuOpen = setModelSelectorOpen
  const openAddProviderSettings = React.useCallback(() => {
    setSelectedProvider(ADD_PROVIDER_ID)
    setSettingsPage("providers")
    setSettingsDialogOpen(true)
    setAgentMenuOpen(false)
  }, [setSelectedProvider, setSettingsPage, setSettingsDialogOpen, setAgentMenuOpen])
  const [desktopModelQuery, setDesktopModelQuery] = React.useState("")
  const keyboardOwnsModelSelectionRef = React.useRef(false)
  const lastModelPointerPositionRef = React.useRef<{ x: number; y: number } | null>(null)
  const activeModelPickerEntryRef = React.useRef<ModelPickerEntry | undefined>(undefined)
  const [pendingThinkingVariants, setPendingThinkingVariants] = React.useState<Map<string, string | undefined>>(
    new Map(),
  )
  const [adjustedThinkingModels, setAdjustedThinkingModels] = React.useState<Set<string>>(new Set())
  const [modelPickerRenderVersion, setModelPickerRenderVersion] = React.useState(0)

  // Handle model selector close behavior (separate from agent selector)
  const prevModelSelectorOpenRef = React.useRef(isModelSelectorOpen)
  React.useEffect(() => {
    const wasOpen = prevModelSelectorOpenRef.current
    prevModelSelectorOpenRef.current = isModelSelectorOpen

    if (!isModelSelectorOpen) {
      setDesktopModelQuery("")
      keyboardOwnsModelSelectionRef.current = false
      lastModelPointerPositionRef.current = null
      setPendingThinkingVariants(new Map())
      setAdjustedThinkingModels(new Set())

      // Restore focus to chat input when model selector closes
      if (wasOpen) {
        requestAnimationFrame(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]')
          textarea?.focus()
        })
      }
    }
  }, [isModelSelectorOpen])

  // Handle agent selector close behavior
  const [agentSearchQuery, setAgentSearchQuery] = React.useState("")
  React.useEffect(() => {
    if (!isAgentSelectorOpen) {
      setAgentSearchQuery("")
      requestAnimationFrame(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]')
        textarea?.focus()
      })
    }
  }, [isAgentSelectorOpen])

  const selectableDesktopAgents = React.useMemo(() => {
    return agents.filter((agent) => agent.mode !== "subagent")
  }, [agents])

  const sortedAndFilteredAgents = React.useMemo(() => {
    const sorted = [...selectableDesktopAgents].sort((a, b) => a.name.localeCompare(b.name))
    if (!agentSearchQuery.trim()) {
      return sorted
    }
    return sorted.filter(
      (agent) =>
        fuzzyMatch(agent.name, agentSearchQuery) ||
        (agent.description && fuzzyMatch(agent.description, agentSearchQuery)),
    )
  }, [selectableDesktopAgents, agentSearchQuery])

  const defaultAgentName = React.useMemo(() => {
    if (settingsDefaultAgent) {
      const found = selectableDesktopAgents.find((a) => a.name === settingsDefaultAgent)
      if (found) return found.name
    }
    const buildAgent = selectableDesktopAgents.find((a) => a.name === "build")
    if (buildAgent) return buildAgent.name
    return selectableDesktopAgents[0]?.name
  }, [settingsDefaultAgent, selectableDesktopAgents])

  const currentAgent = React.useMemo(() => {
    if (uiAgentName) {
      return agents.find((agent) => agent.name === uiAgentName)
    }
    return currentAgentName ? getAgentByName(currentAgentName) : undefined
  }, [agents, currentAgentName, getAgentByName, uiAgentName])

  const buttonHeight = "h-7"
  const controlIconSize = "size-4"
  const controlTextSize = "typography-meta"
  const inlineGapClass = "gap-x-3"

  const currentProvider = getCurrentProvider()
  const models = Array.isArray(currentProvider?.models) ? currentProvider.models : []

  const currentModelForMetadata = currentModelId
    ? models.find((model: ModelControlProviderModel) => model.id === currentModelId)
    : undefined
  const currentMetadata =
    currentProviderId && currentModelId && currentModelForMetadata
      ? mergeModelMetadataWithLiveModel(
          currentProviderId,
          currentModelForMetadata,
          getModelMetadata(currentProviderId, currentModelId),
        )
      : currentProviderId && currentModelId
        ? getModelMetadata(currentProviderId, currentModelId)
        : undefined
  const localizeMetaLabel = React.useCallback(
    (label: string) => {
      if (label === "Tool calling") return t("chat.modelControls.capability.toolCalling")
      if (label === "Reasoning") return t("chat.modelControls.capability.reasoning")
      if (label === "Text") return t("chat.modelControls.modality.text")
      if (label === "Image") return t("chat.modelControls.modality.image")
      if (label === "Video") return t("chat.modelControls.modality.video")
      if (label === "Audio") return t("chat.modelControls.modality.audio")
      if (label === "PDF") return t("chat.modelControls.modality.pdf")
      return label
    },
    [t],
  )

  const currentCapabilityIcons = React.useMemo(
    () => getCapabilityIcons(currentMetadata).map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
    [currentMetadata, localizeMetaLabel],
  )
  const inputModalityIcons = React.useMemo(
    () => getModalityIcons(currentMetadata, "input").map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
    [currentMetadata, localizeMetaLabel],
  )
  const outputModalityIcons = React.useMemo(
    () =>
      getModalityIcons(currentMetadata, "output").map((icon) => ({ ...icon, label: localizeMetaLabel(icon.label) })),
    [currentMetadata, localizeMetaLabel],
  )

  // Compute from current model each render to avoid stale variants
  // in draft/session transitions.
  const availableVariants = getCurrentModelVariants()
  const hasVariants = availableVariants.length > 0

  const costRows: Array<{ label: string; value: string }> = MODEL_COST_DISPLAY_ENABLED
    ? [
        { label: "Input", value: formatCost(currentMetadata?.cost?.input) },
        { label: "Output", value: formatCost(currentMetadata?.cost?.output) },
        { label: "Cache read", value: formatCost(currentMetadata?.cost?.cache_read) },
        { label: "Cache write", value: formatCost(currentMetadata?.cost?.cache_write) },
      ]
    : []

  const limitRows = [
    { label: "Context", value: formatTokens(currentMetadata?.limit?.context) },
    { label: "Output", value: formatTokens(currentMetadata?.limit?.output) },
  ]

  const prevAgentNameRef = React.useRef<string | undefined>(undefined)
  const explicitAgentSwitchRef = React.useRef<string | null>(null)
  // Agent adopted from a submitted prompt or a saved session. The agent-switch
  // effect must not replace the model for this name: that effect runs once
  // with the render's old agent, then again after the store update.
  const keptModelAgentRef = React.useRef<string | null>(null)
  const latestLoadedUserChoiceRestoreRef = React.useRef<string | null>(null)
  const routedSessionModelRestoreRef = React.useRef<string | null>(null)
  // Newest user message seen in this session view. A rollback must not restore
  // an older message's model over the one the user just picked.
  const latestObservedUserRef = React.useRef<{ sessionId: string | null; messageId: string }>({
    sessionId: null,
    messageId: "",
  })
  const adoptAgentKeepingModel = React.useCallback((agentName: string) => {
    prevAgentNameRef.current = agentName
    if (useConfigStore.getState().currentAgentName === agentName) {
      // Nothing will re-render to clear a kept flag, so do not leave one set.
      keptModelAgentRef.current = null
      return
    }
    keptModelAgentRef.current = agentName
    setAgent(agentName, { preserveModel: true })
  }, [setAgent])

  const currentSessionDirectory = currentSessionId ? getDirectoryForSession(currentSessionId) : undefined
  const hasRenderableCurrentSessionSnapshot = useDirectorySync(
    React.useCallback(
      (state) => (currentSessionId ? getSessionMaterializationStatus(state, currentSessionId).renderable : false),
      [currentSessionId],
    ),
    currentSessionDirectory ?? undefined,
  )
  const currentSessionMessagesFromSync = useSessionMessages(
    currentSessionId ?? "",
    currentSessionDirectory ?? undefined,
  )
  const latestLoadedUserChoice = React.useMemo(() => {
    for (let i = currentSessionMessagesFromSync.length - 1; i >= 0; i -= 1) {
      const message = currentSessionMessagesFromSync[i] as (typeof currentSessionMessagesFromSync)[number] & {
        model?: { providerID?: string; modelID?: string; variant?: string }
        variant?: string
        mode?: string
      }
      if (message.role !== "user") {
        continue
      }

      return { id: message.id, ...extractMessageModelRef(message) }
    }
    return null
  }, [currentSessionMessagesFromSync])

  const tryApplyModelSelection = React.useCallback(
    (providerId: string, modelId: string, agentName?: string): ModelApplyResult => {
      if (!providerId || !modelId) {
        return "model-missing"
      }

      const provider = providers.find((p) => p.id === providerId)
      if (!provider) {
        return "provider-missing"
      }

      const providerModels = Array.isArray(provider.models) ? provider.models : []
      const modelExists = providerModels.find((m: ModelControlProviderModel) => m.id === modelId)
      if (!modelExists) {
        return "model-missing"
      }
      if (!isProviderModelSelectable(modelExists, providerId)) {
        return "model-missing"
      }

      // Read the live store. setAgent can replace the model synchronously
      // before this runs, and the render closure would still show the model
      // from the last commit. Treating that stale match as "already applied"
      // left the agent's pin on screen after the user had selected another model.
      const live = useConfigStore.getState()
      // setProvider always selects that provider's first model and drops a
      // variant the first model does not expose. Skip it when the provider is
      // already current, then set the model only if it still differs.
      if (live.currentProviderId !== providerId) {
        setProvider(providerId)
      }
      if (useConfigStore.getState().currentModelId !== modelId) {
        setModel(modelId)
      }

      if (currentSessionId) {
        saveSessionModelSelection(currentSessionId, providerId, modelId)
        if (agentName) {
          saveAgentModelForSession(currentSessionId, agentName, providerId, modelId)
        }
      }

      return "applied"
    },
    [
      providers,
      setProvider,
      setModel,
      currentSessionId,
      saveAgentModelForSession,
      saveSessionModelSelection,
    ],
  )

  const getModelVariantOptions = React.useCallback(
    (providerId: string, modelId: string) => {
      const provider = providers.find((entry) => entry.id === providerId)
      const model = provider?.models.find((entry) => entry.id === modelId) as
        | { variants?: Record<string, unknown> }
        | undefined
      const variants = model?.variants
      return variants ? Object.keys(variants) : []
    },
    [providers],
  )

  const resolveLiveAgentName = React.useCallback(() => {
    const liveConfigAgentName = useConfigStore.getState().currentAgentName
    if (currentSessionId) {
      return (
        useSelectionStore.getState().getSessionAgentSelection(currentSessionId) ||
        stickySessionAgentRef.current ||
        liveConfigAgentName ||
        currentAgentName
      )
    }
    return liveConfigAgentName || currentAgentName
  }, [currentAgentName, currentSessionId])

  const commitVariantSelectionForModel = React.useCallback(
    (providerId: string, modelId: string, variant: string | undefined, agentNameOverride?: string | null) => {
      const variantOptions = getModelVariantOptions(providerId, modelId)
      if (variantOptions.length === 0) {
        manualVariantSelectionRef.current = false
        setCurrentVariant(undefined)
        return
      }

      manualVariantSelectionRef.current = true
      setCurrentVariant(variant)
      addRecentEffort(providerId, modelId, variant)

      const effectiveAgentName = agentNameOverride ?? resolveLiveAgentName()
      if (currentSessionId && effectiveAgentName) {
        saveAgentModelVariantForSession(currentSessionId, effectiveAgentName, providerId, modelId, variant)
      }
    },
    [
      addRecentEffort,
      currentSessionId,
      getModelVariantOptions,
      resolveLiveAgentName,
      saveAgentModelVariantForSession,
      setCurrentVariant,
    ],
  )

  const applyModelSelectionWithVariant = React.useCallback(
    (providerId: string, modelId: string, variant: string | undefined, agentNameOverride?: string | null) => {
      const effectiveAgentName = agentNameOverride ?? resolveLiveAgentName() ?? undefined
      const result = tryApplyModelSelection(providerId, modelId, effectiveAgentName)
      if (result !== "applied") {
        return result
      }

      addRecentModel(providerId, modelId)
      commitVariantSelectionForModel(providerId, modelId, variant, effectiveAgentName)
      return "applied"
    },
    [addRecentModel, commitVariantSelectionForModel, resolveLiveAgentName, tryApplyModelSelection],
  )

  React.useEffect(() => {
    if (!currentSessionId) {
      latestLoadedUserChoiceRestoreRef.current = null
      latestObservedUserRef.current = { sessionId: null, messageId: "" }
      return
    }

    if (latestObservedUserRef.current.sessionId !== currentSessionId) {
      routedSessionModelRestoreRef.current = null
      latestObservedUserRef.current = { sessionId: currentSessionId, messageId: "" }
      latestLoadedUserChoiceRestoreRef.current = null
    }

    if (
      !selectionHydrated ||
      providers.length === 0 ||
      !hasRenderableCurrentSessionSnapshot ||
      !latestLoadedUserChoice?.providerID ||
      !latestLoadedUserChoice.modelID
    ) {
      return
    }

    if (isOlderUserMessage(latestObservedUserRef.current.messageId, latestLoadedUserChoice.id)) {
      return
    }
    latestObservedUserRef.current = { sessionId: currentSessionId, messageId: latestLoadedUserChoice.id }

    const restoreKey = [
      currentSessionId,
      latestLoadedUserChoice.id,
      latestLoadedUserChoice.agent ?? "",
      latestLoadedUserChoice.providerID,
      latestLoadedUserChoice.modelID,
      latestLoadedUserChoice.variant ?? "",
      latestLoadedUserChoice.modelOrigin ?? "",
    ].join("|")

    if (latestLoadedUserChoiceRestoreRef.current === restoreKey) {
      return
    }

    if (latestLoadedUserChoice.agent && currentAgentName !== latestLoadedUserChoice.agent) {
      adoptAgentKeepingModel(latestLoadedUserChoice.agent)
    }

    // A complexity route, agent pin, hybrid placement, session default, or
    // fallback recorded on the user message is not the model the user picked.
    // Adopting it is what swapped the composer after the prompt was sent.
    if (isServerChosenModelOrigin(latestLoadedUserChoice.modelOrigin)) {
      // The runtime still owns the agent identity even when it routed the model.
      if (latestLoadedUserChoice.agent) saveSessionAgentSelection(currentSessionId, latestLoadedUserChoice.agent)
      latestLoadedUserChoiceRestoreRef.current = restoreKey
      return
    }

    const applyResult = tryApplyModelSelection(
      latestLoadedUserChoice.providerID,
      latestLoadedUserChoice.modelID,
      latestLoadedUserChoice.agent || currentAgentName || undefined,
    )
    if (applyResult !== "applied") {
      return
    }

    if (latestLoadedUserChoice.agent) {
      saveSessionAgentSelection(currentSessionId, latestLoadedUserChoice.agent)
      saveAgentModelVariantForSession(
        currentSessionId,
        latestLoadedUserChoice.agent,
        latestLoadedUserChoice.providerID,
        latestLoadedUserChoice.modelID,
        latestLoadedUserChoice.variant,
      )
    }
    saveSessionModelSelection(currentSessionId, latestLoadedUserChoice.providerID, latestLoadedUserChoice.modelID)
    latestLoadedUserChoiceRestoreRef.current = restoreKey
  }, [
    currentSessionId,
    currentAgentName,
    selectionHydrated,
    providers,
    hasRenderableCurrentSessionSnapshot,
    latestLoadedUserChoice,
    adoptAgentKeepingModel,
    tryApplyModelSelection,
    saveSessionAgentSelection,
    saveAgentModelVariantForSession,
    saveSessionModelSelection,
  ])

  React.useEffect(() => {
    if (!currentSessionId) {
      latestLoadedUserChoiceRestoreRef.current = null
      routedSessionModelRestoreRef.current = null
      return
    }

    if (!selectionHydrated || providers.length === 0 || agents.length === 0) {
      return
    }

    // The latest turn can name a model the runtime chose (agent pin, route,
    // fallback). Per-agent memory may still hold that pin from before the
    // user picked a model. Replaying it is the swap after send. Keep the
    // session-level pick, which is what the composer selection writes.
    if (isServerChosenModelOrigin(latestLoadedUserChoice?.modelOrigin)) {
      const savedSessionModel = getSessionModelSelection(currentSessionId)
      if (savedSessionModel) {
        const restoreKey = JSON.stringify([
          currentSessionId, latestLoadedUserChoice?.id, savedSessionModel.providerId, savedSessionModel.modelId,
        ])
        // Restore a session pick once, without assigning it to an agent. Replaying it during a manual
        // agent switch would overwrite that agent's own memory before the switch effect can read it.
        if (routedSessionModelRestoreRef.current !== restoreKey) {
          const result = tryApplyModelSelection(savedSessionModel.providerId, savedSessionModel.modelId)
          if (result === "applied") routedSessionModelRestoreRef.current = restoreKey
        }
      }
      // A routed turn must not replay a different agent's old pin when no session pick exists.
      return
    }

    const applySavedSelections = (): "resolved" | "waiting" | "continue" => {
      const savedSessionModel = getSessionModelSelection(currentSessionId)
      const savedAgentName = currentSessionId
        ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
        : null
      if (savedAgentName) {
        if (currentAgentName !== savedAgentName) {
          adoptAgentKeepingModel(savedAgentName)
        }

        const savedModel = getAgentModelForSession(currentSessionId, savedAgentName)
        if (savedModel) {
          const result = tryApplyModelSelection(savedModel.providerId, savedModel.modelId, savedAgentName)
          if (result === "applied") {
            return "resolved"
          }
          if (result === "provider-missing") {
            return "waiting"
          }
        }
      }

      if (savedSessionModel) {
        const result = tryApplyModelSelection(
          savedSessionModel.providerId,
          savedSessionModel.modelId,
          savedAgentName || currentAgentName || undefined,
        )
        if (result === "applied") {
          return "resolved"
        }
        if (result === "provider-missing") {
          return "waiting"
        }
      }

      for (const agent of agents) {
        const selection = getAgentModelForSession(currentSessionId, agent.name)
        if (!selection) {
          continue
        }

        if (currentAgentName !== agent.name) {
          adoptAgentKeepingModel(agent.name)
        }

        const existingSelection =
          useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current
        if (!existingSelection) {
          saveSessionAgentSelection(currentSessionId, agent.name)
        }
        const result = tryApplyModelSelection(selection.providerId, selection.modelId, agent.name)
        if (result === "applied") {
          return "resolved"
        }
        if (result === "provider-missing") {
          return "waiting"
        }
      }

      return "continue"
    }

    const applyFallbackAgent = () => {
      if (agents.length === 0) {
        return
      }

      const existingSelection = currentSessionId
        ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current
        : null

      // If we already have a valid agent selected (often from server-injected mode switch),
      // don't override it with a fallback.
      const preferred =
        (currentSessionId
          ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current
          : null) || currentAgentName
      if (preferred && agents.some((agent) => agent.name === preferred)) {
        if (currentAgentName !== preferred) {
          setAgent(preferred)
        }
        return
      }

      const fallbackAgent = agents.find((agent) => agent.name === "build") || primaryAgents[0] || agents[0]
      if (!fallbackAgent) {
        return
      }

      if (!existingSelection) {
        saveSessionAgentSelection(currentSessionId, fallbackAgent.name)
      }

      if (currentAgentName !== fallbackAgent.name) {
        setAgent(fallbackAgent.name)
      }

      if (fallbackAgent.model?.providerID && fallbackAgent.model?.modelID) {
        tryApplyModelSelection(fallbackAgent.model.providerID, fallbackAgent.model.modelID, fallbackAgent.name)
      }
    }

    const savedOutcome = applySavedSelections()
    if (savedOutcome === "resolved" || savedOutcome === "waiting") {
      return
    }

    if (!hasRenderableCurrentSessionSnapshot) {
      if (!sync.isLoading(currentSessionId)) {
        void sync.ensureSessionRenderable(currentSessionId)
      }
      return
    }

    if (latestLoadedUserChoice) {
      return
    }

    applyFallbackAgent()
  }, [
    currentSessionId,
    hasRenderableCurrentSessionSnapshot,
    latestLoadedUserChoice,
    agents,
    primaryAgents,
    currentAgentName,
    getSessionModelSelection,
    getAgentModelForSession,
    adoptAgentKeepingModel,
    setAgent,
    tryApplyModelSelection,
    saveSessionAgentSelection,
    selectionHydrated,
    providers,
    sync,
  ])

  React.useEffect(() => {
    if (!selectionHydrated) {
      return
    }
    const abortController = new AbortController()

    const handleAgentSwitch = async () => {
      try {
        if (keptModelAgentRef.current) {
          const liveAgent = useConfigStore.getState().currentAgentName
          if (liveAgent && liveAgent === keptModelAgentRef.current) {
            prevAgentNameRef.current = liveAgent
            if (currentAgentName === liveAgent) keptModelAgentRef.current = null
            return
          }
          keptModelAgentRef.current = null
        }

        if (currentAgentName !== prevAgentNameRef.current) {
          prevAgentNameRef.current = currentAgentName

          if (currentAgentName && currentSessionId) {
            const shouldPreferAgentModel = explicitAgentSwitchRef.current === currentAgentName
            explicitAgentSwitchRef.current = null

            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 50)
              abortController.signal.addEventListener("abort", () => {
                clearTimeout(timer)
                resolve()
              })
            })

            if (abortController.signal.aborted) {
              return
            }

            const selectedAgent = shouldPreferAgentModel
              ? agents.find((agent) => agent.name === currentAgentName)
              : undefined
            if (selectedAgent?.model?.providerID && selectedAgent.model.modelID) {
              const result = tryApplyModelSelection(
                selectedAgent.model.providerID,
                selectedAgent.model.modelID,
                currentAgentName,
              )
              if (result === "applied" || result === "provider-missing") {
                if (result === "applied") {
                  saveSessionModelSelection(
                    currentSessionId,
                    selectedAgent.model.providerID,
                    selectedAgent.model.modelID,
                  )
                  saveAgentModelForSession(
                    currentSessionId,
                    currentAgentName,
                    selectedAgent.model.providerID,
                    selectedAgent.model.modelID,
                  )
                }
                return
              }
            }

            const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName)

            if (persistedChoice) {
              const result = tryApplyModelSelection(
                persistedChoice.providerId,
                persistedChoice.modelId,
                currentAgentName,
              )
              if (result === "applied" || result === "provider-missing") {
                return
              }
            }
          }
        }
      } catch (error) {
        console.error("[ModelControls] Agent change error:", error)
      }
    }

    handleAgentSwitch()

    return () => {
      abortController.abort()
    }
  }, [
    agents,
    currentAgentName,
    currentSessionId,
    getAgentModelForSession,
    saveAgentModelForSession,
    saveSessionModelSelection,
    tryApplyModelSelection,
    selectionHydrated,
  ])

  React.useEffect(() => {
    if (!selectionHydrated || !currentAgentName) {
      manualVariantSelectionRef.current = false
      setCurrentVariant(undefined)
      return
    }

    if (!currentProviderId || !currentModelId) {
      manualVariantSelectionRef.current = false
      setCurrentVariant(undefined)
      return
    }

    if (availableVariants.length === 0) {
      manualVariantSelectionRef.current = false
      setCurrentVariant(undefined)
      return
    }

    if (currentVariant && !availableVariants.includes(currentVariant)) {
      setCurrentVariant(undefined)
      return
    }

    // Draft state (no session yet): seed from settings default, but don't override
    // user selection while drafting.
    if (!currentSessionId) {
      if (!currentVariant && !manualVariantSelectionRef.current) {
        const desired =
          settingsDefaultVariant && availableVariants.includes(settingsDefaultVariant)
            ? settingsDefaultVariant
            : undefined
        setCurrentVariant(desired)
      }
      return
    }

    const savedVariant = getAgentModelVariantForSession(
      currentSessionId,
      currentAgentName,
      currentProviderId,
      currentModelId,
    )

    if (savedVariant && availableVariants.includes(savedVariant)) {
      setCurrentVariant(savedVariant)
      manualVariantSelectionRef.current = false
      return
    }

    // No per-session memory (e.g. fresh or empty session after an app
    // restart): keep a still-valid restored selection instead of resetting
    // to Default; otherwise seed from the settings default.
    if (currentVariant && availableVariants.includes(currentVariant)) {
      return
    }
    // An explicit in-session choice — including picking "Default" — wins
    // over the settings fallback until the model changes.
    if (manualVariantSelectionRef.current) {
      return
    }
    const fallback =
      settingsDefaultVariant && availableVariants.includes(settingsDefaultVariant) ? settingsDefaultVariant : undefined
    setCurrentVariant(fallback)
    manualVariantSelectionRef.current = false
  }, [
    availableVariants,
    selectionHydrated,
    currentSessionId,
    currentAgentName,
    currentProviderId,
    currentModelId,
    currentVariant,
    getAgentModelVariantForSession,
    setCurrentVariant,
    settingsDefaultVariant,
  ])

  React.useEffect(() => {
    manualVariantSelectionRef.current = false
  }, [currentProviderId, currentModelId])

  const handleVariantSelect = React.useCallback(
    (variant: string | undefined) => {
      if (currentProviderId && currentModelId) {
        commitVariantSelectionForModel(currentProviderId, currentModelId, variant)
      }
    },
    [commitVariantSelectionForModel, currentModelId, currentProviderId],
  )

  const handleAgentChange = React.useCallback(
    (agentName: string, options?: { closeModelSelector?: boolean }) => {
      try {
        explicitAgentSwitchRef.current = agentName
        keptModelAgentRef.current = null
        setAgent(agentName)
        addRecentAgent(agentName)
        if (options?.closeModelSelector ?? true) {
          setAgentMenuOpen(false)
        }

        if (currentSessionId) {
          saveSessionAgentSelection(currentSessionId, agentName)
        }
      } catch (error) {
        console.error("[ModelControls] Handle agent change error:", error)
      }
    },
    [addRecentAgent, currentSessionId, saveSessionAgentSelection, setAgent, setAgentMenuOpen],
  )

  const handleCycleAgentFromModelPicker = React.useCallback(
    (direction: 1 | -1) => {
      const nextAgentName = getCycledPrimaryAgentName(agents, currentAgentName, direction)
      if (!nextAgentName) {
        return
      }
      handleAgentChange(nextAgentName, { closeModelSelector: false })
    },
    [agents, currentAgentName, handleAgentChange],
  )

  const getCycleAgentDirectionFromEvent = React.useCallback(
    (event: KeyboardEvent | React.KeyboardEvent): 1 | -1 | null => {
      const cycleAgentBackwardShortcut =
        cycleAgentShortcut && !cycleAgentShortcut.includes("shift") ? normalizeCombo(`shift+${cycleAgentShortcut}`) : ""

      if (cycleAgentBackwardShortcut && eventMatchesShortcut(event, cycleAgentBackwardShortcut)) {
        return -1
      }

      if (eventMatchesShortcut(event, cycleAgentShortcut)) {
        return 1
      }

      return null
    },
    [cycleAgentShortcut],
  )

  const handleProviderAndModelChange = (
    providerId: string,
    modelId: string,
    options?: { applyVariant?: boolean; variant?: string | undefined; agentName?: string | null },
  ) => {
    try {
      const effectiveAgentName = options?.agentName ?? resolveLiveAgentName() ?? undefined
      const result = options?.applyVariant
        ? applyModelSelectionWithVariant(providerId, modelId, options.variant, effectiveAgentName)
        : tryApplyModelSelection(providerId, modelId, effectiveAgentName)
      if (result !== "applied") {
        if (result === "provider-missing") {
          console.error("[ModelControls] Provider not available for selection:", providerId)
        } else if (result === "model-missing") {
          console.error("[ModelControls] Model not available for selection:", { providerId, modelId })
        }
        return
      }
      if (!options?.applyVariant) {
        // Add to recent models on successful selection.
        addRecentModel(providerId, modelId)
      }
      setAgentMenuOpen(false)
      // Restore focus to chat input after model selection.
      requestAnimationFrame(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]')
        textarea?.focus()
      })
    } catch (error) {
      console.error("[ModelControls] Handle model change error:", error)
    }
  }

  const getModelDisplayName = (model: ModelControlProviderModel | undefined) => {
    const name = typeof model?.name === "string" ? model.name : typeof model?.id === "string" ? model.id : ""
    return truncateToCodeUnits(name, 40, "...")
  }

  const getProviderDisplayName = () => {
    const provider = providers.find((p) => p.id === currentProviderId)
    return provider?.name || currentProviderId
  }

  const getCurrentModelDisplayName = () => {
    if (!currentProviderId || !currentModelId) return "Not selected"
    if (models.length === 0) return "Not selected"
    const currentModel = models.find((m: ModelControlProviderModel) => m.id === currentModelId)
    return getModelDisplayName(currentModel)
  }

  const currentModelDisplayName = getCurrentModelDisplayName()
  const modelLabelRef = React.useRef<HTMLSpanElement>(null)
  const isModelLabelTruncated = useIsTextTruncated(modelLabelRef, [currentModelDisplayName])

  const getAgentDisplayName = () => {
    if (!uiAgentName) {
      const buildAgent = primaryAgents.find((agent) => agent.name === "build")
      const defaultAgent = buildAgent || primaryAgents[0]
      return defaultAgent ? agentLabel(defaultAgent) : "Select Agent"
    }
    const agent = agents.find((a) => a.name === uiAgentName)
    return agent ? agentLabel(agent) : capitalizeAgentName(uiAgentName)
  }

  const capitalizeAgentName = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  const renderModelTooltipContent = () => (
    <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
      {currentMetadata ? (
        <div className="flex min-w-[240px] flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="typography-micro font-semibold text-foreground">
              {currentMetadata.name || getCurrentModelDisplayName()}
            </span>
            <span className="typography-meta text-muted-foreground">{getProviderDisplayName()}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.capabilities")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {currentCapabilityIcons.length > 0 ? (
                currentCapabilityIcons.map(({ key, icon, label }) => (
                  <IconBadge key={`cap-${key}`} iconName={icon} label={label} />
                ))
              ) : (
                <span className="typography-meta text-muted-foreground">{t("chat.modelControls.modeValue.none")}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.modalities")}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="typography-meta font-medium text-muted-foreground">
                  {t("chat.modelControls.input")}
                </span>
                <div className="flex items-center gap-1.5">
                  {inputModalityIcons.length > 0 ? (
                    inputModalityIcons.map(({ key, icon, label }) => (
                      <IconBadge key={`input-${key}`} iconName={icon} label={`${label} input`} />
                    ))
                  ) : (
                    <span className="typography-meta text-muted-foreground">-</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="typography-meta font-medium text-muted-foreground">
                  {t("chat.modelControls.output")}
                </span>
                <div className="flex items-center gap-1.5">
                  {outputModalityIcons.length > 0 ? (
                    outputModalityIcons.map(({ key, icon, label }) => (
                      <IconBadge key={`output-${key}`} iconName={icon} label={`${label} output`} />
                    ))
                  ) : (
                    <span className="typography-meta text-muted-foreground">-</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          {MODEL_COST_DISPLAY_ENABLED && costRows.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                {t("chat.modelControls.costPerMillion")}
              </span>
              {costRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="typography-meta font-medium text-muted-foreground">{row.label}</span>
                  <span className="typography-meta font-medium text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.limits")}
            </span>
            {limitRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="typography-meta font-medium text-muted-foreground">{row.label}</span>
                <span className="typography-meta font-medium text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.metadata")}
            </span>
            <div className="flex items-center justify-between gap-3">
              <span className="typography-meta font-medium text-muted-foreground">
                {t("chat.modelControls.knowledge")}
              </span>
              <span className="typography-meta font-medium text-foreground">
                {formatKnowledge(currentMetadata.knowledge)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="typography-meta font-medium text-muted-foreground">
                {t("chat.modelControls.release")}
              </span>
              <span className="typography-meta font-medium text-foreground">
                {formatDate(currentMetadata.release_date)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-w-[200px] typography-meta text-muted-foreground">
          {t("chat.modelControls.metadataUnavailable")}
        </div>
      )}
    </TooltipContent>
  )

  const renderModelSelector = () => {
    const handleThinkingVariantKey = (e: React.KeyboardEvent, selectedItem: ModelPickerEntry) => {
      keyboardOwnsModelSelectionRef.current = true
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return false

      const { providerID, modelID } = selectedItem
      const canonicalProvider = useConfigStore.getState().providers.find((provider) => provider.id === providerID)
      const canonicalModel = canonicalProvider?.models.find((model) => model.id === modelID) as
        | { variants?: Record<string, unknown> }
        | undefined
      const variantKeys = canonicalModel?.variants
        ? Object.keys(canonicalModel.variants)
        : getModelVariantOptions(providerID, modelID)
      if (variantKeys.length === 0) return false

      e.preventDefault()
      e.stopPropagation()

      const mapKey = buildModelRefKey(providerID, modelID)
      const hasPendingVariant = pendingThinkingVariants.has(mapKey)
      const currentPending = pendingThinkingVariants.get(mapKey)
      const activeModelVariant = hasPendingVariant
        ? currentPending
        : currentProviderId === providerID && currentModelId === modelID
          ? currentVariant
          : undefined

      const variantsWithDefault: Array<string | undefined> = [undefined, ...variantKeys]
      const currentVariantIndex = variantsWithDefault.indexOf(activeModelVariant)
      const safeCurrentIndex = currentVariantIndex >= 0 ? currentVariantIndex : 0
      const direction = e.key === "ArrowRight" ? 1 : -1
      const nextVariantIndex = (safeCurrentIndex + direction + variantsWithDefault.length) % variantsWithDefault.length
      const nextVariant = variantsWithDefault[nextVariantIndex]

      setPendingThinkingVariants((prev) => {
        const next = new Map(prev)
        next.set(mapKey, nextVariant)
        return next
      })
      setAdjustedThinkingModels((prev) => {
        const next = new Set(prev)
        next.add(mapKey)
        return next
      })
      setModelPickerRenderVersion((version) => version + 1)
      return true
    }

    const handleModelPickerKeyDown = (e: React.KeyboardEvent, selectedItem: ModelPickerEntry | undefined) => {
      const cycleAgentDirection = getCycleAgentDirectionFromEvent(e)
      if (cycleAgentDirection) {
        e.preventDefault()
        handleCycleAgentFromModelPicker(cycleAgentDirection)
        return
      }

      if (selectedItem) handleThinkingVariantKey(e, selectedItem)
    }

    const handleSharedModelSelect = (entry: ModelPickerEntry) => {
      const mapKey = buildModelRefKey(entry.providerID, entry.modelID)
      const pendingVariant = pendingThinkingVariants.get(mapKey)
      const wasAdjusted = adjustedThinkingModels.has(mapKey)
      const effectiveAgentName = resolveLiveAgentName()

      handleProviderAndModelChange(
        entry.providerID,
        entry.modelID,
        wasAdjusted
          ? { applyVariant: true, variant: pendingVariant, agentName: effectiveAgentName }
          : { agentName: effectiveAgentName },
      )
    }

    const handleModelShortcutKeyDownCapture = (e: React.KeyboardEvent) => {
      const cycleAgentDirection = getCycleAgentDirectionFromEvent(e)
      if (!cycleAgentDirection) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      keyboardOwnsModelSelectionRef.current = true
      handleCycleAgentFromModelPicker(cycleAgentDirection)
    }

    const handleModelMenuOpenChange = (nextOpen: boolean) => {
      setAgentMenuOpen(nextOpen)
    }

    const modelPickerLabels = {
      searchPlaceholder: t("chat.modelControls.searchModels"),
      noResults: t("chat.modelControls.noModelsFound"),
      favorites: t("chat.modelControls.favorites"),
      recent: t("chat.modelControls.recent"),
      keyboardHint: t("chat.modelControls.keyboardHintNavigate"),
      favorite: t("chat.modelControls.favoriteAria"),
      unfavorite: t("chat.modelControls.unfavoriteAria"),
      capabilities: t("chat.modelControls.capabilities"),
      capabilityToolCalling: t("chat.modelControls.capability.toolCalling"),
      capabilityReasoning: t("chat.modelControls.capability.reasoning"),
      input: t("chat.modelControls.input"),
      output: t("chat.modelControls.output"),
      costPerMillion: t("chat.modelControls.costPerMillion"),
      local: t("chat.modelControls.local"),
      localTooltip: t("chat.modelControls.localTooltip"),
    }

    const renderThinkingSlot = (
      entry: ModelPickerEntry,
      { isHighlighted, isSelected }: { isHighlighted: boolean; isSelected: boolean },
    ) => {
      const hasThinkingVariants = getModelVariantOptions(entry.providerID, entry.modelID).length > 0
      const mapKey = buildModelRefKey(entry.providerID, entry.modelID)
      const wasAdjusted = adjustedThinkingModels.has(mapKey)
      if (!hasThinkingVariants || (!isHighlighted && !isSelected)) return null

      const hasPendingVariant = pendingThinkingVariants.has(mapKey)
      const pendingVariant = pendingThinkingVariants.get(mapKey)
      const effectiveVariant = hasPendingVariant ? pendingVariant : isSelected ? currentVariant : undefined
      const displayLabel = effortLabel(effectiveVariant ?? undefined, "Default")

      return (
        <span
          className={cn(
            "typography-micro whitespace-nowrap",
            wasAdjusted ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Thinking: {displayLabel}
        </span>
      )
    }

    return (
      <Tooltip delayDuration={600}>
        <DropdownMenu open={isReady && agentMenuOpen} onOpenChange={isReady ? handleModelMenuOpenChange : undefined}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-disabled={!isReady}
                className={cn(
                  "model-controls__model-trigger flex items-center gap-1.5 cursor-pointer border-0 bg-transparent p-0 text-left hover:bg-transparent hover:opacity-70 min-w-0",
                  buttonHeight,
                )}
              >
                {!isReady ? (
                  <>
                    <Icon
                      name="loader-4"
                      className={cn(controlIconSize, "animate-spin text-muted-foreground flex-shrink-0")}
                    />
                    <span
                      className={cn(
                        "model-controls__model-label",
                        controlTextSize,
                        "font-medium whitespace-nowrap text-muted-foreground min-w-0",
                      )}
                    >
                      {readinessLabel}
                    </span>
                  </>
                ) : currentProviderId ? (
                  <>
                    <ProviderLogo providerId={currentProviderId} className={cn(controlIconSize, "flex-shrink-0")} />
                    <Icon name="pencil-ai" className={cn(controlIconSize, "text-primary/60 hidden")} />
                  </>
                ) : (
                  <Icon name="pencil-ai" className={cn(controlIconSize, "text-muted-foreground")} />
                )}
                {isReady && (
                  <span
                    ref={modelLabelRef}
                    key={`${currentProviderId}-${currentModelId}`}
                    className={cn(
                      "model-controls__model-label overflow-hidden",
                      controlTextSize,
                      "font-medium whitespace-nowrap text-foreground min-w-0",
                      "max-w-[260px]",
                    )}
                  >
                    <span className={cn("marquee-text", isModelLabelTruncated && "marquee-text--active")}>
                      {currentModelDisplayName}
                    </span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent
            className="w-[min(380px,calc(100vw-2rem))] p-0 flex flex-col"
            align="end"
            alignOffset={-40}
            onKeyDownCapture={handleModelShortcutKeyDownCapture}
          >
            <div className="p-1 border-b border-border/40">
              <button
                type="button"
                onClick={openAddProviderSettings}
                className="typography-meta group flex w-full items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-interactive-hover/50"
              >
                <span className="flex size-4 items-center justify-center text-primary">
                  <Icon name="add" className="size-4 -mr-0.5" />
                </span>
                <span className="font-medium text-primary">{t("chat.modelControls.addNewProvider")}</span>
              </button>
            </div>
            <ModelPickerList
              providers={providers as ModelPickerProvider[]}
              favoriteModels={favoriteModelsList}
              recentModels={recentModelsList}
              modelsMetadata={useConfigStore.getState().modelsMetadata}
              searchQuery={desktopModelQuery}
              onSearchQueryChange={setDesktopModelQuery}
              onSelect={handleSharedModelSelect}
              labels={modelPickerLabels}
              selectedModel={
                currentProviderId && currentModelId ? { providerID: currentProviderId, modelID: currentModelId } : null
              }
              hiddenModels={hiddenModels}
              onActiveKeyDown={handleModelPickerKeyDown}
              onActiveEntryChange={(entry) => {
                activeModelPickerEntryRef.current = entry
              }}
              onVariantKey={handleThinkingVariantKey}
              isFavorite={(entry) => isFavoriteModel(entry.providerID, entry.modelID)}
              onToggleFavorite={(entry) => toggleFavoriteModel(entry.providerID, entry.modelID)}
              renderRowEnd={renderThinkingSlot}
              renderVersion={modelPickerRenderVersion}
              onReorderFavorite={(active, over) =>
                reorderFavoriteModel(active.providerID, active.modelID, over.providerID, over.modelID)
              }
              reorderFavoriteAriaLabel={t("chat.modelControls.reorderFavoriteAria")}
              reorderFavoriteTitle={t("chat.modelControls.reorderFavoriteTitle")}
              footerContent={(activeEntry) => {
                const activeHasThinkingVariants = activeEntry
                  ? getModelVariantOptions(activeEntry.providerID, activeEntry.modelID).length > 0
                  : false

                return (
                  <div className="flex items-center gap-x-2 whitespace-nowrap overflow-hidden">
                    <span>{t("chat.modelControls.keyboardHintNavigate")}</span>
                    <span>{t("chat.modelControls.keyboardHintSwitchAgent", { shortcut: "Tab" })}</span>
                    {activeHasThinkingVariants ? <span>{t("chat.modelControls.keyboardHintThinking")}</span> : null}
                  </div>
                )
              }}
              tooltipsEnabled={agentMenuOpen}
              onEscape={() => setAgentMenuOpen(false)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {renderModelTooltipContent()}
      </Tooltip>
    )
  }

  const renderAgentTooltipContent = () => {
    if (!currentAgent) {
      return (
        <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
          <div className="min-w-[200px] typography-meta text-muted-foreground">
            {t("chat.modelControls.noAgentSelected")}
          </div>
        </TooltipContent>
      )
    }

    const hasCustomPrompt = Boolean(currentAgent.prompt && currentAgent.prompt.trim().length > 0)
    const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.modelID
    const hasTemperatureOrTopP = currentAgent.temperature !== undefined || currentAgent.topP !== undefined

    const summarizePermission = (permissionName: string): { mode: EditPermissionMode; label: string } => {
      const rules = asPermissionRuleset(currentAgent.permission) ?? []
      const hasCustom = rules.some((rule) => rule.permission === permissionName && rule.pattern !== "*")
      const action = resolveWildcardPermissionAction(rules, permissionName) ?? "ask"

      if (hasCustom) {
        return { mode: "ask", label: t("chat.modelControls.permissionLabel.custom") }
      }

      if (action === "allow") return { mode: "allow", label: t("chat.modelControls.permissionLabel.allow") }
      if (action === "deny") return { mode: "deny", label: t("chat.modelControls.permissionLabel.deny") }
      return { mode: "ask", label: t("chat.modelControls.permissionLabel.ask") }
    }

    const editPermissionSummary = summarizePermission("edit")
    const bashPermissionSummary = summarizePermission("bash")
    const webfetchPermissionSummary = summarizePermission("webfetch")

    return (
      <TooltipContent align="start" sideOffset={8} className="max-w-[280px]">
        <div className="flex min-w-[200px] flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="typography-micro font-semibold text-foreground">
              {agentLabel(currentAgent)}
            </span>
            {currentAgent.description && (
              <span className="typography-meta text-muted-foreground">{currentAgent.description}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.mode")}
            </span>
            <span className="typography-meta text-foreground">
              {currentAgent.mode === "primary"
                ? t("chat.modelControls.modeValue.primary")
                : currentAgent.mode === "subagent"
                  ? t("chat.modelControls.modeValue.subagent")
                  : currentAgent.mode === "all"
                    ? t("chat.modelControls.modeValue.all")
                    : t("chat.modelControls.modeValue.none")}
            </span>
          </div>

          {(hasModelConfig || hasTemperatureOrTopP) && (
            <div className="flex flex-col gap-1">
              <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                {t("chat.modelControls.model")}
              </span>
              {hasModelConfig ? (
                <span className="typography-meta text-foreground">
                  {currentAgent.model!.providerID} / {currentAgent.model!.modelID}
                </span>
              ) : (
                <span className="typography-meta text-muted-foreground">{t("chat.modelControls.modeValue.none")}</span>
              )}
              {hasTemperatureOrTopP && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {currentAgent.temperature !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="typography-meta text-muted-foreground">
                        {t("chat.modelControls.temperature")}
                      </span>
                      <span className="typography-meta font-medium text-foreground">{currentAgent.temperature}</span>
                    </div>
                  )}
                  {currentAgent.topP !== undefined && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="typography-meta text-muted-foreground">{t("chat.modelControls.topP")}</span>
                      <span className="typography-meta font-medium text-foreground">{currentAgent.topP}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
              {t("chat.modelControls.permissions")}
            </span>
            <div className="flex items-center gap-3">
              <span className="typography-meta text-muted-foreground w-16">{t("chat.modelControls.edit")}</span>
              <div className="flex items-center gap-1.5">
                <EditModeIcon mode={editPermissionSummary.mode} className="size-3.5" />
                <span className="typography-meta font-medium text-foreground w-12">{editPermissionSummary.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="typography-meta text-muted-foreground w-16">{t("chat.modelControls.bash")}</span>
              <div className="flex items-center gap-1.5">
                <EditModeIcon mode={bashPermissionSummary.mode} className="size-3.5" />
                <span className="typography-meta font-medium text-foreground w-12">{bashPermissionSummary.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="typography-meta text-muted-foreground w-16">{t("chat.modelControls.webFetch")}</span>
              <div className="flex items-center gap-1.5">
                <EditModeIcon mode={webfetchPermissionSummary.mode} className="size-3.5" />
                <span className="typography-meta font-medium text-foreground w-12">
                  {webfetchPermissionSummary.label}
                </span>
              </div>
            </div>
          </div>

          {hasCustomPrompt && (
            <div className="flex items-center justify-between gap-3">
              <span className="typography-meta text-muted-foreground">{t("chat.modelControls.customPrompt")}</span>
              <Icon name="checkbox-circle" className="size-4 text-foreground" />
            </div>
          )}
        </div>
      </TooltipContent>
    )
  }

  const renderVariantSelector = () => {
    if (!isReady || !hasVariants) {
      return null
    }

    const defaultLabel = t("chat.modelControls.default")
    const displayVariant = effortLabel(currentVariant, defaultLabel)
    const isDefault = !currentVariant
    const colorClass = isDefault ? "text-muted-foreground" : "text-[color:var(--status-info)]"
    const tooltipDetail =
      currentVariant && effortLabel(currentVariant) !== currentVariant
        ? `${displayVariant} (${currentVariant})`
        : displayVariant

    return (
      <Tooltip delayDuration={600}>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "model-controls__variant-trigger flex items-center gap-1.5 transition-colors cursor-pointer border-0 bg-transparent p-0 text-left hover:bg-transparent hover:opacity-70 min-w-0",
                  buttonHeight,
                )}
              >
                <Icon name="brain-ai-3" className={cn(controlIconSize, "flex-shrink-0", colorClass)} />
                <span
                  className={cn(
                    "model-controls__variant-label",
                    controlTextSize,
                    "font-medium min-w-0 truncate",
                    isDesktop ? "max-w-[180px]" : undefined,
                    colorClass,
                  )}
                >
                  {displayVariant}
                </span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent align="end" alignOffset={-40} className="w-[min(180px,calc(100vw-2rem))]">
            <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">
              {t("chat.modelControls.thinking")}
            </DropdownMenuLabel>
            <DropdownMenuItem className="typography-meta" onSelect={() => handleVariantSelect(undefined)}>
              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                <span className="typography-meta font-medium text-foreground truncate min-w-0">{defaultLabel}</span>
                {isDefault && <Icon name="check" className="size-4 text-primary flex-shrink-0" />}
              </div>
            </DropdownMenuItem>
            {availableVariants.length > 0 && <DropdownMenuSeparator />}
            {availableVariants.map((variant) => {
              const selected = currentVariant === variant
              const label = effortLabel(variant)
              return (
                <DropdownMenuItem
                  key={variant}
                  className="typography-meta"
                  onSelect={() => handleVariantSelect(variant)}
                >
                  <div className="flex items-center justify-between gap-2 w-full min-w-0">
                    <span className="typography-meta font-medium text-foreground truncate min-w-0">{label}</span>
                    {selected && <Icon name="check" className="size-4 text-primary flex-shrink-0" />}
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent side="top">
          <p className="typography-meta">Thinking: {tooltipDetail}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  const renderAgentSelector = () => {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip delayDuration={600}>
          <DropdownMenu
            open={isReady && isAgentSelectorOpen}
            onOpenChange={isReady ? setIsAgentSelectorOpen : undefined}
          >
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-disabled={!isReady}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors cursor-pointer border-0 bg-transparent p-0 text-left hover:bg-transparent hover:opacity-70 min-w-0",
                    buttonHeight,
                  )}
                >
                  {!isReady ? (
                    <>
                      <Icon
                        name="loader-4"
                        className={cn(controlIconSize, "flex-shrink-0 animate-spin text-muted-foreground")}
                      />
                      <span
                        className={cn(
                          "model-controls__agent-label",
                          controlTextSize,
                          "font-medium min-w-0 truncate text-muted-foreground",
                        )}
                      >
                        {readinessLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icon
                        name="ai-agent"
                        className={cn(controlIconSize, "flex-shrink-0", uiAgentName ? "" : "text-muted-foreground")}
                        style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                      />
                      <span
                        className={cn(
                          "model-controls__agent-label",
                          controlTextSize,
                          "font-medium min-w-0 truncate",
                          isDesktop ? "max-w-[220px]" : undefined,
                        )}
                        style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                      >
                        {getAgentDisplayName()}
                      </span>
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <DropdownMenuContent
              align="end"
              alignOffset={-40}
              className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col"
            >
              <div className="p-2 border-b border-border/40">
                <div className="relative">
                  <Icon
                    name="search"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
                  />
                  <Input
                    type="text"
                    placeholder={t("chat.modelControls.searchAgents")}
                    value={agentSearchQuery}
                    onChange={(e) => setAgentSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                    }}
                    className="pl-8 h-8 typography-meta"
                  />
                </div>
              </div>
              <ScrollableOverlay outerClassName="max-h-[min(400px,calc(100dvh-12rem))] flex-1">
                <div className="p-1">
                  {!agentSearchQuery.trim() && defaultAgentName && (
                    <>
                      <DropdownMenuItem
                        className="typography-meta"
                        onSelect={() => handleAgentChange(defaultAgentName)}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name="arrow-go-back" className="size-3.5 text-muted-foreground" />
                          <span className="font-medium">{t("chat.modelControls.resetToDefault")}</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {sortedAndFilteredAgents.length === 0 ? (
                    <div className="px-2 py-4 text-center typography-meta text-muted-foreground">No agents found</div>
                  ) : (
                    sortedAndFilteredAgents.map((agent) => (
                      <DropdownMenuItem
                        key={agent.name}
                        className="typography-meta"
                        onSelect={() => handleAgentChange(agent.name)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("h-1 w-1 rounded-full agent-dot", getAgentColor(agent.name).class)} />
                            <span className="font-medium">{agentLabel(agent)}</span>
                          </div>
                          {agent.description && (
                            <span className="typography-meta text-muted-foreground max-w-[200px] ml-2.5 break-words">
                              {agent.description}
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </ScrollableOverlay>
            </DropdownMenuContent>
          </DropdownMenu>
          {renderAgentTooltipContent()}
        </Tooltip>
      </div>
    )
  }
  const inlineClassName = cn("@container/model-controls flex items-center min-w-0", className)

  return (
    <>
      <div className={inlineClassName}>
        <div className={cn("flex items-center min-w-0 flex-1 justify-end", inlineGapClass)}>
          {renderVariantSelector()}
          <UsageIndicator />
          {renderModelSelector()}
          {renderAgentSelector()}
        </div>
      </div>
    </>
  )
}
