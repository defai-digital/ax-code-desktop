import { create } from "zustand"
import { devtools, persist, createJSONStorage } from "zustand/middleware"
import { readDirectoryPath } from "@/lib/pathValues"
import {
  configPreferencePersistence,
  restoreConfigDirectories,
  type ConfigPreferences,
  type DirectoryScopedConfig,
} from "@/lib/configPreferences"
import { isPlainRecord } from "@/lib/record"
import { axCodeClient } from "@/lib/ax-code/client"
import { scopeMatches, subscribeToConfigChanges } from "@/lib/configSync"
import type { ModelMetadata } from "@/types"
import { getAgentsSource } from "@/lib/agents"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSelectionStore } from "@/sync/selection-store"
import { updateDesktopSettings } from "@/lib/persistence"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { streamDebugEnabled } from "@/stores/utils/streamDebug"
import { parseModelIdentifier } from "@/lib/modelIdentifier"
import { isPrimaryMode } from "@/lib/modelControlUtils"
import {
  hasSelectableProviderModel,
  isExternalCliProvider,
  isProviderModelSelectable,
} from "@/lib/providerModelAvailability"
import type { ProviderModel, ProviderWithModelList } from "@/types/providerModels"
import { withTimeout } from "@/lib/asyncTimeout"
import { loadConfigDefaults } from "@/lib/configDefaults"
import { buildModelMetadataKey, deriveModelMetadata } from "@/lib/modelMetadata"
import { fetchModelsDevMetadata } from "@/lib/modelsDevMetadata"
import { selectIsConnected, useConnectionStore } from "@/lib/event-stream/connection-state"
import { getSafeStorage } from "./utils/safeStorage"
import { createModelMetadataLoader } from "./utils/modelMetadataLoader"

const modelMetadataLoader = createModelMetadataLoader(fetchModelsDevMetadata)

const FALLBACK_PROVIDER_ID = "opencode"
const FALLBACK_MODEL_ID = "big-pickle"
const GIT_UTILITY_PROVIDER_ID = "opencode"
const GIT_UTILITY_PREFERRED_MODEL_ID = "big-pickle"

const parseModelString = (modelString: string): { providerId: string; modelId: string } | null => {
  return parseModelIdentifier(modelString)
}

type GitModelSelection = { providerId: string; modelId: string }

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const hasProviderModel = hasSelectableProviderModel

/**
 * Whether a recomputed default may replace the current selection. A last-resort
 * default (the hardcoded fallback or the first selectable provider) must never move
 * a still-selectable selection — that is what made the composer jump to another
 * provider on every loadAgents/loadProviders run.
 */
export const shouldKeepCurrentSelection = (
  resolvedIsLastResort: boolean,
  providers: ProviderWithModelList[],
  providerId: string,
  modelId: string,
): boolean => resolvedIsLastResort && hasProviderModel(providers, providerId, modelId)

/**
 * Whether the project's selection was picked by hand and must outlive the
 * recomputed defaults. Settings defaults and agent preferences are only fills for
 * projects the user has not chosen for; without this a configured default replaced
 * a still-valid manual pick on every loadAgents run (startup, directory
 * activation, MCP/plugin/agent config refresh) and persisted the replacement. A
 * pick the fresh provider list no longer offers yields to the defaults again.
 */
export const keepsManualSelection = (
  selectionSource: "auto" | "manual" | undefined,
  providers: ProviderWithModelList[],
  providerId: string,
  modelId: string,
): boolean => selectionSource === "manual" && hasProviderModel(providers, providerId, modelId)

const resolveGitGenerationModelSelection = ({
  providers,
  settingsZenModel,
}: {
  providers: ProviderWithModelList[]
  settingsZenModel?: string
}): GitModelSelection | null => {
  const zenModel = normalizeOptionalString(settingsZenModel)

  if (!Array.isArray(providers) || providers.length === 0) {
    if (zenModel) {
      return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel }
    }
    return null
  }

  if (zenModel && hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, zenModel)) {
    return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel }
  }

  if (hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, GIT_UTILITY_PREFERRED_MODEL_ID)) {
    return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: GIT_UTILITY_PREFERRED_MODEL_ID }
  }

  const zenProvider = providers.find((provider) => provider.id === GIT_UTILITY_PROVIDER_ID)
  if (zenProvider?.models.length) {
    const randomIndex = Math.floor(Math.random() * zenProvider.models.length)
    const randomModelId = normalizeOptionalString(zenProvider.models[randomIndex]?.id)
    if (randomModelId) {
      return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: randomModelId }
    }
  }

  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const CONNECTION_PROBE_TIMEOUT_MS = 800

const probeAxCodeHealth = async (timeoutMs = CONNECTION_PROBE_TIMEOUT_MS): Promise<boolean> => {
  return withTimeout(
    axCodeClient.checkHealth().catch(() => false),
    Math.max(1, timeoutMs),
    () => false,
  )
}

const DIRECTORY_KEY_GLOBAL = "__global__"

const toDirectoryKey = (directory: string | null | undefined): string => {
  const trimmed = readDirectoryPath(directory) ?? ""
  return trimmed.length > 0 ? trimmed : DIRECTORY_KEY_GLOBAL
}

const fromDirectoryKey = (key: string): string | null => (key === DIRECTORY_KEY_GLOBAL ? null : key)

const resolveInitialDirectoryKey = (): string => {
  if (typeof window === "undefined") {
    return DIRECTORY_KEY_GLOBAL
  }

  const directory = axCodeClient.getDirectory() ?? useDirectoryStore.getState().currentDirectory
  return toDirectoryKey(directory)
}

interface ConfigStore extends ConfigPreferences {
  activeDirectoryKey: string

  providers: ProviderWithModelList[]
  providersLoading: boolean
  providersError: string | null
  /**
   * Boot status: set when `initializeApp` fails after the server was reached
   * (e.g. initApp/provider/agent load threw). NOT connection state — the
   * canonical transport-owned connection phase lives in
   * `lib/event-stream/connection-state` (S4.7). Read by useAxCodeReadiness.
   */
  initializationError: string | null
  isInitialized: boolean
  modelsMetadata: Map<string, ModelMetadata>

  activateDirectory: (directory: string | null | undefined) => Promise<void>
  /** Drop all per-project provider snapshots (auth is global; caches must not stay stale). */
  invalidateAllProviderCaches: () => void

  loadProviders: (options?: { directory?: string | null }) => Promise<void>
  loadAgents: (options?: { directory?: string | null }) => Promise<boolean>
  invalidateModelMetadataCache: () => void
  /** `source` records whether the user picked this ("manual", the default) or a default was applied ("auto"). */
  setProvider: (providerId: string, source?: "auto" | "manual") => void
  setModel: (modelId: string, source?: "auto" | "manual") => void
  setCurrentVariant: (variant: string | undefined) => void
  cycleCurrentVariant: () => void
  getCurrentModelVariants: () => string[]
  /**
   * `preserveModel` keeps the current provider and model. Restoring the agent
   * named on a submitted prompt must not replace the model the user picked
   * with the agent's pinned model.
   */
  setAgent: (agentName: string | undefined, options?: { preserveModel?: boolean }) => void
  setSelectedProvider: (providerId: string) => void
  setSettingsDefaultModel: (model: string | undefined) => void
  setSettingsDefaultVariant: (variant: string | undefined) => void
  setSettingsDefaultAgent: (agent: string | undefined) => void
  setSettingsAutoCreateWorktree: (enabled: boolean) => void
  setSettingsGitmojiEnabled: (enabled: boolean) => void
  setSettingsDefaultFileViewerPreview: (enabled: boolean) => void
  setSettingsZenModel: (model: string | undefined) => void
  getResolvedGitGenerationModel: () => { providerId: string; modelId: string } | null
  saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void
  getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null
  /**
   * Server-reachability probe (HTTP health endpoint). Distinct from transport
   * connection state (lib/event-stream/connection-state, S4.7): returns a
   * boolean and never writes the connection phase.
   */
  probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>
  /** Boot-time reachability probe with bounded retries; boolean only, no connection-state writes (S4.7). */
  checkConnection: () => Promise<boolean>
  initializeApp: () => Promise<void>
  getCurrentProvider: () => ProviderWithModelList | undefined
  getCurrentModel: () => ProviderModel | undefined
  getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined
}

// In-flight dedup: prevent concurrent duplicate loadProviders/loadAgents calls for the same directory
const _inFlightProviders = new Map<string, Promise<void>>()
// Bumped by invalidateAllProviderCaches. A provider load that started before the
// bump must never apply its (pre-auth) result over a post-invalidation load.
let _providerEpoch = 0
// While the engine is still starting, provider reads fail transiently. Instead
// of surfacing a terminal "Unable to load providers" error, keep the loading
// state and re-poll until this per-directory deadline, then give up.
const _providerStartupPollUntil = new Map<string, number>()
// Pending re-poll timers, keyed by directory. The in-flight dedup map only
// covers a load that is actively running; this map reserves the directory
// across the gap between a failed cycle returning and its re-poll firing, so
// other callers don't fan out additional concurrent poll chains.
const _providerPollTimer = new Map<string, ReturnType<typeof setTimeout>>()
const PROVIDER_STARTUP_POLL_MS = 2000
const PROVIDER_STARTUP_POLL_WINDOW_MS = 30000
const PROVIDER_FETCH_TIMEOUT_MS = 10_000

/**
 * Resolves settingsDefaultModel ("provider/model") into current selection IDs
 * if the provider and model exist in the loaded provider list.
 */
const resolveSettingsDefaultSelection = (
  providers: ProviderWithModelList[],
  settingsDefaultModel: string | undefined,
  settingsDefaultVariant: string | undefined,
): {
  currentProviderId: string
  currentModelId: string
  currentVariant?: string
  selectedProviderId: string
} | null => {
  if (!settingsDefaultModel) return null
  const parsed = parseModelString(settingsDefaultModel)
  if (!parsed) return null
  const settingsProvider = providers.find((p) => p.id === parsed.providerId)
  const model = settingsProvider?.models.find((m) => m.id === parsed.modelId)
  if (!model || !isProviderModelSelectable(model, parsed.providerId)) return null
  const currentVariant =
    settingsDefaultVariant &&
    (model as { variants?: Record<string, unknown> } | undefined)?.variants?.[settingsDefaultVariant]
      ? settingsDefaultVariant
      : undefined
  return {
    currentProviderId: parsed.providerId,
    currentModelId: parsed.modelId,
    currentVariant: currentVariant,
    selectedProviderId: parsed.providerId,
  }
}

export const resolveFirstSelectableSelection = (
  providers: ProviderWithModelList[],
  preferredProviderId?: string,
): {
  currentProviderId: string
  currentModelId: string
  currentVariant?: string
  selectedProviderId: string
} | null => {
  // External-CLI providers are skipped even when preferred: an automatic default that lands on a
  // program that may not be installed fails every prompt, while no default asks the user to pick.
  const candidates = providers.filter((provider) => !isExternalCliProvider(provider.id))
  const orderedProviders =
    preferredProviderId && candidates.some((provider) => provider.id === preferredProviderId)
      ? [
          ...candidates.filter((provider) => provider.id === preferredProviderId),
          ...candidates.filter((provider) => provider.id !== preferredProviderId),
        ]
      : candidates

  for (const provider of orderedProviders) {
    const model = provider.models.find((item) => isProviderModelSelectable(item, provider.id))
    if (model?.id) {
      return {
        currentProviderId: provider.id,
        currentModelId: model.id,
        currentVariant: undefined,
        selectedProviderId: provider.id,
      }
    }
  }

  return null
}

/** The fields of a runtime agent the default selection reads. */
export interface ActivationAgent {
  name: string
  mode?: string | null
  model?: { providerID?: string; modelID?: string } | null
}

/**
 * The agent and model activating a project picks when nothing it already holds is kept. Agent: the Settings default
 * agent when this project has it, then `build`, then the first primary agent, then the first agent. Model: the
 * Settings default model (with its variant when the model offers it), then the agent's own model, then the hardcoded
 * fallback, then the first selectable model; the last two are last-resort picks that never replace a still-selectable
 * selection. Also reports Settings values that are malformed rather than merely missing from this project.
 */
export const resolveActivationDefaults = (input: {
  agents: readonly ActivationAgent[]
  providers: ProviderWithModelList[]
  settingsDefaultAgent: string | undefined
  settingsDefaultModel: string | undefined
  settingsDefaultVariant: string | undefined
}): {
  agentName: string | undefined
  providerId?: string
  modelId?: string
  variant?: string
  isLastResort: boolean
  invalidDefaultModel: boolean
  invalidDefaultVariant: boolean
} => {
  const { agents, providers } = input
  const findModel = (providerId: string, modelId: string): ProviderModel | undefined =>
    providers.find((p) => p.id === providerId)?.models.find((m) => m.id === modelId)
  const modelIsSelectable = (providerId: string, modelId: string): boolean => {
    const model = findModel(providerId, modelId)
    return Boolean(model && isProviderModelSelectable(model, providerId))
  }

  const primaryAgents = agents.filter((agent) => isPrimaryMode(agent.mode ?? undefined))
  const fallbackAgent = primaryAgents.find((agent) => agent.name === "build") || primaryAgents[0] || agents[0]
  // A saved default missing from THIS project's agent list is not invalid: the default is a global setting while
  // agents are project-scoped, so it must not be erased from another project's catalogue.
  const resolvedAgent =
    (input.settingsDefaultAgent && agents.find((agent) => agent.name === input.settingsDefaultAgent)) || fallbackAgent

  let providerId: string | undefined
  let modelId: string | undefined
  let variant: string | undefined
  let invalidDefaultModel = false
  let invalidDefaultVariant = false

  if (input.settingsDefaultModel) {
    const parsed = parseModelString(input.settingsDefaultModel)
    const defaultModel = parsed ? findModel(parsed.providerId, parsed.modelId) : undefined
    if (parsed && defaultModel && isProviderModelSelectable(defaultModel, parsed.providerId)) {
      providerId = parsed.providerId
      modelId = parsed.modelId
      if (input.settingsDefaultVariant) {
        const variants = (defaultModel as { variants?: Record<string, unknown> }).variants
        if (variants && Object.prototype.hasOwnProperty.call(variants, input.settingsDefaultVariant)) {
          variant = input.settingsDefaultVariant
        } else {
          invalidDefaultVariant = true
        }
      }
    } else if (!parsed) {
      // Only a malformed value is invalid. A missing model is not proof of removal: providers are project-scoped
      // (and can expose no models while loading), and a memory-blocked local model may be valid on another machine.
      invalidDefaultModel = true
    }
  }

  const agentModel = resolvedAgent?.model
  if (!providerId && agentModel?.providerID && agentModel?.modelID) {
    if (modelIsSelectable(agentModel.providerID, agentModel.modelID)) {
      providerId = agentModel.providerID
      modelId = agentModel.modelID
    }
  }

  let isLastResort = false
  if (!providerId) {
    if (modelIsSelectable(FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID)) {
      providerId = FALLBACK_PROVIDER_ID
      modelId = FALLBACK_MODEL_ID
      isLastResort = true
    } else {
      const fallback = resolveFirstSelectableSelection(providers, FALLBACK_PROVIDER_ID)
      if (fallback) {
        providerId = fallback.currentProviderId
        modelId = fallback.currentModelId
        isLastResort = true
      }
    }
  }

  return {
    agentName: resolvedAgent?.name,
    providerId,
    modelId,
    variant,
    isLastResort,
    invalidDefaultModel,
    invalidDefaultVariant,
  }
}

/** The model, agent and variant a send in a directory uses, with the catalog they were chosen from. */
export interface DirectorySendSelection {
  providerID: string
  modelID: string
  agent?: string
  variant?: string
  providers: ProviderWithModelList[]
}

/** The provider catalog known for `directory`: the live one when it is active, else its snapshot's (maybe empty). */
/**
 * Whether a provider load for `directory` is running or a startup re-poll is pending. `loadProviders` returns at once in
 * the second case, so an empty catalog right after it means "not known yet", not "no model".
 */
export const isDirectoryProviderLoadPending = (directory: string): boolean => {
  const key = toDirectoryKey(directory)
  return _inFlightProviders.has(key) || _providerPollTimer.has(key)
}

export const directoryProviderCatalog = (
  state: Pick<ConfigStore, "activeDirectoryKey" | "providers" | "directoryScoped">,
  directory: string,
): ProviderWithModelList[] => {
  const key = toDirectoryKey(directory)
  if (state.activeDirectoryKey === key) return state.providers
  return state.directoryScoped[key]?.providers ?? []
}

/** Whether `directory` is the one the composer has activated. */
export const isActiveConfigDirectory = (state: Pick<ConfigStore, "activeDirectoryKey">, directory: string): boolean =>
  state.activeDirectoryKey === toDirectoryKey(directory)

/**
 * The selection a new session in `directory` would get, worked out without activating that directory. The active
 * directory answers with the composer's live selection. Another directory answers the way activating it would: given
 * its agent list, its saved snapshot merged with the activation defaults under the same keep rules as `loadAgents`
 * (a manual pick survives, a last-resort default never replaces a selectable one); without it, its saved selection
 * while still offered, else the Settings default or the first selectable model. Null until its providers are known.
 */
export const resolveDirectorySendSelection = (
  state: Pick<
    ConfigStore,
    | "activeDirectoryKey"
    | "providers"
    | "currentProviderId"
    | "currentModelId"
    | "currentVariant"
    | "currentAgentName"
    | "directoryScoped"
    | "settingsDefaultAgent"
    | "settingsDefaultModel"
    | "settingsDefaultVariant"
  >,
  directory: string,
  agents?: readonly ActivationAgent[] | null,
): DirectorySendSelection | null => {
  const key = toDirectoryKey(directory)
  const trimAgent = (name: string | undefined) => name?.trim() || undefined
  const active = state.activeDirectoryKey === key
  const snapshot = active
    ? {
        providers: state.providers,
        currentProviderId: state.currentProviderId,
        currentModelId: state.currentModelId,
        currentVariant: state.currentVariant,
        currentAgentName: state.currentAgentName,
        selectionSource: "manual" as const,
      }
    : state.directoryScoped[key]
  if (!snapshot || snapshot.providers.length === 0) return null
  const providers = snapshot.providers
  const saved =
    snapshot.currentProviderId &&
    snapshot.currentModelId &&
    hasProviderModel(providers, snapshot.currentProviderId, snapshot.currentModelId)
      ? { providerID: snapshot.currentProviderId, modelID: snapshot.currentModelId, variant: snapshot.currentVariant }
      : null

  // The active directory's selection is the composer's, already resolved by its own activation.
  if (!active && agents && agents.length > 0) {
    const defaults = resolveActivationDefaults({
      agents,
      providers,
      settingsDefaultAgent: state.settingsDefaultAgent,
      settingsDefaultModel: state.settingsDefaultModel,
      settingsDefaultVariant: state.settingsDefaultVariant,
    })
    const keepAgent = snapshot.selectionSource === "manual" && !!snapshot.currentAgentName
    const keepSelection =
      keepAgent ||
      keepsManualSelection(snapshot.selectionSource, providers, snapshot.currentProviderId, snapshot.currentModelId) ||
      shouldKeepCurrentSelection(defaults.isLastResort, providers, snapshot.currentProviderId, snapshot.currentModelId)
    const agent = trimAgent(keepAgent ? snapshot.currentAgentName : defaults.agentName)
    // A kept pick the catalog no longer offers cannot be sent; activation would leave it for the user to replace.
    const model =
      keepSelection && saved
        ? saved
        : defaults.providerId && defaults.modelId
          ? { providerID: defaults.providerId, modelID: defaults.modelId, variant: defaults.variant }
          : saved
    if (!model) return null
    return { ...model, agent, providers }
  }

  if (saved) return { ...saved, agent: trimAgent(snapshot.currentAgentName), providers }
  const fallback =
    resolveSettingsDefaultSelection(providers, state.settingsDefaultModel, state.settingsDefaultVariant) ??
    resolveFirstSelectableSelection(providers, snapshot.currentProviderId)
  if (!fallback) return null
  return {
    providerID: fallback.currentProviderId,
    modelID: fallback.currentModelId,
    variant: fallback.currentVariant,
    agent: trimAgent(snapshot.currentAgentName),
    providers,
  }
}

/**
 * Safely transform provider.models (which may be a record, array, or missing)
 * into a ProviderModel[].
 */
const normalizeProviderModels = (provider: { id?: string; models?: unknown }): ProviderModel[] => {
  const modelRecord = provider.models
  if (Array.isArray(modelRecord)) {
    return modelRecord as ProviderModel[]
  }
  if (modelRecord && typeof modelRecord === "object") {
    return Object.keys(modelRecord as Record<string, ProviderModel>).map(
      (modelId) => (modelRecord as Record<string, ProviderModel>)[modelId],
    )
  }
  console.warn(
    `[loadProviders] Provider "${provider.id ?? "unknown"}" has unexpected models shape:`,
    typeof modelRecord,
  )
  return []
}
const _inFlightAgents = new Map<string, Promise<boolean>>()
let _initializeAppInFlight: Promise<void> | null = null

// A directory activated while the runtime was unreachable never loaded its
// providers or agents. Startup recovery only fills an empty list, and the
// single-home agents store still holds the previous project's list, so the
// switch has to be retried once the connection is back.
let pendingOfflineActivation: { key: string; directory: string | null } | null = null
let pendingOfflineActivationUnsubscribe: (() => void) | null = null

const scheduleOfflineActivationRetry = (directory: string | null | undefined) => {
  pendingOfflineActivation = { key: toDirectoryKey(directory), directory: directory ?? null }
  if (pendingOfflineActivationUnsubscribe) return
  pendingOfflineActivationUnsubscribe = useConnectionStore.subscribe((state) => {
    if (!selectIsConnected(state)) return
    const pending = pendingOfflineActivation
    pendingOfflineActivation = null
    pendingOfflineActivationUnsubscribe?.()
    pendingOfflineActivationUnsubscribe = null
    if (!pending) return
    // A newer switch made since then owns the store.
    if (useConfigStore.getState().activeDirectoryKey !== pending.key) return
    void useConfigStore.getState().activateDirectory(pending.directory)
  })
}

const ensureModelMetadata = (): void => {
  void modelMetadataLoader.ensure(useConfigStore.getState().modelsMetadata, (modelsMetadata) => {
    useConfigStore.setState({ modelsMetadata })
  })
}

export const useConfigStore = create<ConfigStore>()(
  devtools(
    persist(
      (set, get) => ({
        activeDirectoryKey: resolveInitialDirectoryKey(),
        directoryScoped: {},

        providers: [],
        providersLoading: false,
        providersError: null,
        currentProviderId: "",
        currentModelId: "",
        currentVariant: undefined,
        currentAgentName: undefined,
        selectedProviderId: "",
        agentModelSelections: {},
        defaultProviders: {},
        initializationError: null,
        isInitialized: false,
        modelsMetadata: new Map<string, ModelMetadata>(),
        settingsDefaultModel: undefined,
        settingsDefaultVariant: undefined,
        settingsDefaultAgent: undefined,
        settingsAutoCreateWorktree: false,
        settingsGitmojiEnabled: false,
        settingsDefaultFileViewerPreview: false,
        settingsZenModel: undefined,
        invalidateAllProviderCaches: () => {
          // Provider credentials are global. After connect/disconnect, every
          // project snapshot would otherwise keep a pre-auth empty list until
          // the user "reconnects" in that project.
          _providerEpoch++
          for (const timer of _providerPollTimer.values()) clearTimeout(timer)
          _providerPollTimer.clear()
          _providerStartupPollUntil.clear()
          _inFlightProviders.clear()
          set((state) => {
            const cleared: Record<string, DirectoryScopedConfig> = {}
            for (const [key, snapshot] of Object.entries(state.directoryScoped)) {
              cleared[key] = {
                ...snapshot,
                providers: [],
                selectedProviderId: "",
                defaultProviders: {},
              }
            }
            return {
              directoryScoped: cleared,
              providers: [],
              selectedProviderId: "",
              defaultProviders: {},
              providersError: null,
            }
          })
        },

        activateDirectory: async (directory) => {
          const directoryKey = toDirectoryKey(directory)

          // Cancel pending provider poll timers for the previous directory
          // to prevent zombie re-polls after switching.
          {
            const prevKey = get().activeDirectoryKey
            if (prevKey && prevKey !== directoryKey) {
              const pending = _providerPollTimer.get(prevKey)
              if (pending) {
                clearTimeout(pending)
                _providerPollTimer.delete(prevKey)
              }
              _providerStartupPollUntil.delete(prevKey)
            }
          }

          set((state) => {
            const snapshot = state.directoryScoped[directoryKey]
            if (snapshot) {
              return {
                activeDirectoryKey: directoryKey,
                providers: snapshot.providers,
                currentProviderId: snapshot.currentProviderId,
                currentModelId: snapshot.currentModelId,
                currentVariant: snapshot.currentVariant,
                currentAgentName: snapshot.currentAgentName,
                selectedProviderId: snapshot.selectedProviderId,
                agentModelSelections: snapshot.agentModelSelections,
                defaultProviders: snapshot.defaultProviders,
                providersLoading: false,
                providersError: null,
              }
            }

            return {
              activeDirectoryKey: directoryKey,
              providers: [],
              currentProviderId: "",
              currentModelId: "",
              currentVariant: undefined,
              currentAgentName: undefined,
              selectedProviderId: "",
              agentModelSelections: {},
              defaultProviders: {},
              providersLoading: false,
              providersError: null,
            }
          })

          if (!selectIsConnected(useConnectionStore.getState())) {
            scheduleOfflineActivationRetry(directory)
            return
          }

          await get().loadProviders({ directory: fromDirectoryKey(directoryKey) })
          // A switch that finished while the provider load was in flight must win: this
          // continuation belongs to the previous project, and the agents store is single-home,
          // so loading them now would overwrite the active project's list.
          if (get().activeDirectoryKey !== directoryKey) return
          await get().loadAgents({ directory: fromDirectoryKey(directoryKey) })
        },

        loadProviders: async (options) => {
          // Metadata has its own lifetime: joining a provider request must still refresh an invalidated catalog.
          ensureModelMetadata()
          const directoryKey = toDirectoryKey(options?.directory ?? fromDirectoryKey(get().activeDirectoryKey))

          // Dedup: if a load is already in-flight for this directory, reuse it
          const existing = _inFlightProviders.get(directoryKey)
          if (existing) return existing
          // A startup re-poll is already pending for this directory — don't
          // fan out a second chain; the pending poll will perform the load.
          if (_providerPollTimer.has(directoryKey)) return

          const epoch = _providerEpoch
          const request = (async () => {
            set((state) =>
              state.activeDirectoryKey === directoryKey ? { providersLoading: true, providersError: null } : {},
            )
            let lastError: unknown = null

            // Retry budget MUST exceed the ax-code proxy provider-readiness
            // grace window (OPEN_CODE_READY_GRACE_MS = 12s on the server).
            // A newly installed user has zero providers configured, so their
            // `providersReady` stays false for the full grace window and the
            // proxy gates GET /config/providers with 503 until uptime > 12s.
            // With 12 attempts and 250*(attempt+1) backoff, the last useful
            // attempt lands at ~16.5s — safely past the gate — so the
            // (possibly empty) list loads instead of surfacing a load error.
            for (let attempt = 0; attempt < 12; attempt++) {
              try {
                ensureModelMetadata()
                const apiResult = await withTimeout(
                  // Scoped by argument, not by moving the shared current directory: a background load for another
                  // project (Quick Dispatch's preview) must not retarget unscoped calls made meanwhile.
                  axCodeClient.getProviders(fromDirectoryKey(directoryKey)),
                  PROVIDER_FETCH_TIMEOUT_MS,
                  (): never => {
                    throw new Error(`Provider request timed out after ${PROVIDER_FETCH_TIMEOUT_MS / 1000}s`)
                  },
                )
                const providers = Array.isArray(apiResult?.providers) ? apiResult.providers : []
                const defaults = apiResult?.default || {}

                // A cache invalidation (provider connect/disconnect) superseded
                // this load while it was in flight; never apply its stale list.
                if (epoch !== _providerEpoch) return

                const processedProviders: ProviderWithModelList[] = providers.map((provider) => ({
                  ...provider,
                  models: normalizeProviderModels(provider),
                }))

                set((state) => {
                  const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                    providers: [],
                    currentProviderId: "",
                    currentModelId: "",
                    currentAgentName: undefined,
                    selectedProviderId: "",
                    agentModelSelections: {},
                    defaultProviders: {},
                  }

                  const nextSnapshot: DirectoryScopedConfig = {
                    ...baseSnapshot,
                    providers: processedProviders,
                    defaultProviders: defaults,
                  }

                  const nextState: Partial<ConfigStore> = {
                    directoryScoped: {
                      ...state.directoryScoped,
                      [directoryKey]: nextSnapshot,
                    },
                  }

                  if (state.activeDirectoryKey === directoryKey) {
                    nextState.providers = processedProviders
                    nextState.defaultProviders = defaults
                    nextState.providersLoading = false
                    nextState.providersError = null

                    const currentSelectionIsSelectable =
                      state.currentProviderId && state.currentModelId
                        ? hasProviderModel(processedProviders, state.currentProviderId, state.currentModelId)
                        : false
                    const resolved = resolveSettingsDefaultSelection(
                      processedProviders,
                      state.settingsDefaultModel,
                      state.settingsDefaultVariant,
                    )
                    // An empty list is the discovery window, not an authoritative
                    // "your provider is gone": resolving against it would clear the
                    // model or jump to the first selectable provider.
                    if (!currentSelectionIsSelectable && processedProviders.length > 0) {
                      const fallback =
                        resolved ?? resolveFirstSelectableSelection(processedProviders, state.currentProviderId)
                      const nextSelection =
                        fallback ??
                        (state.currentProviderId || state.currentModelId
                          ? {
                              currentProviderId: state.currentProviderId,
                              currentModelId: "",
                              currentVariant: undefined,
                              selectedProviderId: state.selectedProviderId || state.currentProviderId,
                            }
                          : null)
                      if (nextSelection) {
                        Object.assign(nextState, nextSelection)
                        Object.assign(nextSnapshot, nextSelection)
                      }
                    }
                  }

                  return nextState
                })

                _providerStartupPollUntil.delete(directoryKey)
                {
                  const pending = _providerPollTimer.get(directoryKey)
                  if (pending) {
                    clearTimeout(pending)
                    _providerPollTimer.delete(directoryKey)
                  }
                }
                _inFlightProviders.delete(directoryKey)
                return
              } catch (error) {
                lastError = error
                const waitMs = 250 * (attempt + 1)
                await new Promise((resolve) => setTimeout(resolve, waitMs))
              }
            }

            // The engine is likely still starting (provider reads answer
            // 503 {restarting:true} until it is up). Keep the loading
            // state and re-poll until the deadline instead of showing a
            // terminal error that usually clears itself within seconds.
            if (epoch !== _providerEpoch) return
            {
              const now = Date.now()
              let pollUntil = _providerStartupPollUntil.get(directoryKey)
              if (pollUntil === undefined) {
                pollUntil = now + PROVIDER_STARTUP_POLL_WINDOW_MS
                _providerStartupPollUntil.set(directoryKey, pollUntil)
              }
              if (now < pollUntil) {
                set((state) =>
                  state.activeDirectoryKey === directoryKey ? { providersLoading: true, providersError: null } : {},
                )
                const timer = setTimeout(() => {
                  _providerPollTimer.delete(directoryKey)
                  void get().loadProviders({ directory: fromDirectoryKey(directoryKey) })
                }, PROVIDER_STARTUP_POLL_MS)
                _providerPollTimer.set(directoryKey, timer)
                return
              }
              _providerStartupPollUntil.delete(directoryKey)
            }

            console.error("Failed to load providers:", lastError)

            // Re-read from current state instead of using stale pre-loop snapshot.
            // SSE events may have updated providers during the retry period.
            set((state) => {
              const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                providers: [],
                currentProviderId: "",
                currentModelId: "",
                currentAgentName: undefined,
                selectedProviderId: "",
                agentModelSelections: {},
                defaultProviders: {},
              }

              const fallbackProviders =
                baseSnapshot.providers.length > 0
                  ? baseSnapshot.providers
                  : state.activeDirectoryKey === directoryKey
                    ? state.providers
                    : []
              const fallbackDefaults = baseSnapshot.defaultProviders
                ? baseSnapshot.defaultProviders
                : state.activeDirectoryKey === directoryKey
                  ? state.defaultProviders
                  : {}

              const nextSnapshot: DirectoryScopedConfig = {
                ...baseSnapshot,
                providers: fallbackProviders,
                defaultProviders: fallbackDefaults,
              }

              const nextState: Partial<ConfigStore> = {
                directoryScoped: {
                  ...state.directoryScoped,
                  [directoryKey]: nextSnapshot,
                },
              }

              if (state.activeDirectoryKey === directoryKey) {
                nextState.providers = fallbackProviders
                nextState.defaultProviders = fallbackDefaults
                nextState.providersLoading = false
                nextState.providersError = "Unable to load providers"

                const currentSelectionIsSelectable =
                  state.currentProviderId && state.currentModelId
                    ? hasProviderModel(fallbackProviders, state.currentProviderId, state.currentModelId)
                    : false
                const resolved = resolveSettingsDefaultSelection(
                  fallbackProviders,
                  state.settingsDefaultModel,
                  state.settingsDefaultVariant,
                )
                // Same discovery-window guard as the success path: an empty fallback
                // list cannot prove the current selection is gone.
                if (!currentSelectionIsSelectable && fallbackProviders.length > 0) {
                  const fallback =
                    resolved ?? resolveFirstSelectableSelection(fallbackProviders, state.currentProviderId)
                  const nextSelection =
                    fallback ??
                    (state.currentProviderId || state.currentModelId
                      ? {
                          currentProviderId: state.currentProviderId,
                          currentModelId: "",
                          currentVariant: undefined,
                          selectedProviderId: state.selectedProviderId || state.currentProviderId,
                        }
                      : null)
                  if (nextSelection) {
                    Object.assign(nextState, nextSelection)
                    Object.assign(nextSnapshot, nextSelection)
                  }
                }
              }

              return nextState
            })
          })()

          // Only the latest registration may clear itself: an invalidated load
          // must not delete the replacement load's in-flight entry.
          const promise = request.finally(() => {
            if (_inFlightProviders.get(directoryKey) === promise) _inFlightProviders.delete(directoryKey)
          })

          _inFlightProviders.set(directoryKey, promise)
          return promise
        },

        setProvider: (providerId: string, source: "auto" | "manual" = "manual") => {
          const { providers } = get()
          const provider = providers.find((p) => p.id === providerId)

          if (!provider) {
            return
          }

          const firstModel = provider.models.find((model) => isProviderModelSelectable(model, providerId))
          const newModelId = firstModel?.id || ""
          const newModelVariants = (firstModel as { variants?: Record<string, unknown> } | undefined)?.variants

          set((state) => {
            // Drop a variant the new model doesn't expose so the effort
            // control never shows a stale level for the switched model.
            const nextVariant =
              state.currentVariant && newModelVariants && Object.hasOwn(newModelVariants, state.currentVariant)
                ? state.currentVariant
                : undefined

            const directoryKey = state.activeDirectoryKey
            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentVariant: state.currentVariant,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              currentProviderId: providerId,
              currentModelId: newModelId,
              currentVariant: nextVariant,
              selectedProviderId: providerId,
              selectionSource: source,
            }

            return {
              currentProviderId: providerId,
              currentModelId: newModelId,
              currentVariant: nextVariant,
              selectedProviderId: providerId,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })
        },

        setModel: (modelId: string, source: "auto" | "manual" = "manual") => {
          set((state) => {
            const provider = state.currentProviderId
              ? state.providers.find((item) => item.id === state.currentProviderId)
              : undefined
            const model = modelId && provider ? provider.models.find((item) => item.id === modelId) : undefined
            if (
              modelId &&
              state.currentProviderId &&
              (!model || !isProviderModelSelectable(model, state.currentProviderId))
            ) {
              return state
            }

            // Drop a variant the new model doesn't expose (or any variant
            // when the model is cleared) so stale effort never lingers.
            const variants = (model as { variants?: Record<string, unknown> } | undefined)?.variants
            const nextVariant =
              state.currentVariant && variants && Object.hasOwn(variants, state.currentVariant)
                ? state.currentVariant
                : undefined

            const directoryKey = state.activeDirectoryKey
            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentVariant: state.currentVariant,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              currentModelId: modelId,
              currentVariant: nextVariant,
              selectionSource: source,
            }

            return {
              currentModelId: modelId,
              currentVariant: nextVariant,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })
        },

        setCurrentVariant: (variant: string | undefined) => {
          set((state) => {
            if (state.currentVariant === variant) {
              return state
            }

            const directoryKey = state.activeDirectoryKey
            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentVariant: state.currentVariant,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              currentVariant: variant,
            }

            return {
              currentVariant: variant,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })
        },

        getCurrentModelVariants: () => {
          const model = get().getCurrentModel()
          const variants = (model as { variants?: Record<string, unknown> } | undefined)?.variants
          if (!variants) {
            return []
          }
          return Object.keys(variants)
        },

        cycleCurrentVariant: () => {
          const variantKeys = get().getCurrentModelVariants()
          if (variantKeys.length === 0) {
            return
          }

          const current = get().currentVariant
          if (!current) {
            get().setCurrentVariant(variantKeys[0])
            return
          }

          const index = variantKeys.indexOf(current)
          if (index === -1 || index === variantKeys.length - 1) {
            get().setCurrentVariant(undefined)
            return
          }

          get().setCurrentVariant(variantKeys[index + 1])
        },

        setSelectedProvider: (providerId: string) => {
          set((state) => {
            const directoryKey = state.activeDirectoryKey
            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              selectedProviderId: providerId,
            }

            return {
              selectedProviderId: providerId,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })
        },

        saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
          set((state) => {
            const directoryKey = state.activeDirectoryKey
            const nextSelections = {
              ...state.agentModelSelections,
              [agentName]: { providerId, modelId },
            }

            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              agentModelSelections: nextSelections,
            }

            return {
              agentModelSelections: nextSelections,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })
        },

        getAgentModelSelection: (agentName: string) => {
          const { agentModelSelections } = get()
          return agentModelSelections[agentName] || null
        },

        loadAgents: async (options) => {
          const directoryKey = toDirectoryKey(options?.directory ?? fromDirectoryKey(get().activeDirectoryKey))

          // Dedup: if a load is already in-flight for this directory, reuse it
          const existing = _inFlightAgents.get(directoryKey)
          if (existing) return existing

          const promise = (async (): Promise<boolean> => {
            let lastError: unknown = null

            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                // The agents list itself lives in useAgentsStore (single home,
                // SPEC-2026-08-30 S4.6); the lib/agents source bridge loads it
                // without a store→store import edge (R1 ratchet). This method
                // keeps owning the OpenChamber settings fetch + default
                // agent/model selection resolution.
                const source = getAgentsSource()
                if (!source) {
                  throw new Error("agents source not registered")
                }

                // Load agents and fetch OpenChamber settings in parallel
                const [loaded, openChamberDefaults] = await Promise.all([
                  source.loadAgents({ directory: fromDirectoryKey(directoryKey) }),
                  loadConfigDefaults(),
                ])
                if (!loaded) {
                  throw new Error("agents list load failed")
                }

                const safeAgents = source.getAgents()

                const providers =
                  get().activeDirectoryKey === directoryKey
                    ? get().providers
                    : (get().directoryScoped[directoryKey]?.providers ?? [])

                const existingZenModel = normalizeOptionalString(get().settingsZenModel)

                const defaultZenModel = normalizeOptionalString(openChamberDefaults.zenModel)

                const resolvedExistingGitSelection = resolveGitGenerationModelSelection({
                  providers,
                  settingsZenModel: existingZenModel,
                })

                const resolvedDefaultGitSelection = resolveGitGenerationModelSelection({
                  providers,
                  settingsZenModel: defaultZenModel,
                })

                const resolvedGitSelection = resolvedExistingGitSelection || resolvedDefaultGitSelection
                const resolvedGitModelId = resolvedGitSelection?.modelId
                const resolvedZenModel = resolvedGitModelId || defaultZenModel || existingZenModel

                set((state) => {
                  const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                    providers,
                    currentProviderId: "",
                    currentModelId: "",
                    currentAgentName: undefined,
                    selectedProviderId: "",
                    agentModelSelections: {},
                    defaultProviders: {},
                  }

                  const nextSnapshot: DirectoryScopedConfig = {
                    ...baseSnapshot,
                    providers,
                  }

                  return {
                    settingsDefaultModel: openChamberDefaults.defaultModel,
                    settingsDefaultVariant: openChamberDefaults.defaultVariant,
                    settingsDefaultAgent: openChamberDefaults.defaultAgent,
                    settingsAutoCreateWorktree: openChamberDefaults.autoCreateWorktree ?? false,
                    settingsGitmojiEnabled: openChamberDefaults.gitmojiEnabled ?? false,
                    settingsDefaultFileViewerPreview: openChamberDefaults.defaultFileViewerPreview ?? false,
                    settingsZenModel: resolvedZenModel,
                    directoryScoped: {
                      ...state.directoryScoped,
                      [directoryKey]: nextSnapshot,
                    },
                  }
                })

                const shouldPersistResolvedZenModel = !!resolvedZenModel && resolvedZenModel !== defaultZenModel

                if (shouldPersistResolvedZenModel && resolvedZenModel) {
                  updateDesktopSettings({
                    zenModel: resolvedZenModel,
                    gitProviderId: "",
                    gitModelId: "",
                  }).catch(() => {
                    // Ignore errors - best effort cleanup
                  })
                }

                if (safeAgents.length === 0) {
                  set((state) => {
                    const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                      providers,
                      currentProviderId: "",
                      currentModelId: "",
                      currentVariant: undefined,
                      currentAgentName: undefined,
                      selectedProviderId: "",
                      agentModelSelections: {},
                      defaultProviders: {},
                    }

                    const nextSnapshot: DirectoryScopedConfig = {
                      ...baseSnapshot,
                      providers,
                      currentAgentName: undefined,
                    }

                    const nextState: Partial<ConfigStore> = {
                      directoryScoped: {
                        ...state.directoryScoped,
                        [directoryKey]: nextSnapshot,
                      },
                    }

                    if (state.activeDirectoryKey === directoryKey) {
                      nextState.currentAgentName = undefined
                    }

                    return nextState
                  })

                  return true
                }

                const defaults = resolveActivationDefaults({
                  agents: safeAgents,
                  providers,
                  settingsDefaultAgent: openChamberDefaults.defaultAgent,
                  settingsDefaultModel: openChamberDefaults.defaultModel,
                  settingsDefaultVariant: openChamberDefaults.defaultVariant,
                })
                const resolvedAgent = { name: defaults.agentName }
                const resolvedProviderId = defaults.providerId
                const resolvedModelId = defaults.modelId
                const resolvedVariant = defaults.variant
                const resolvedIsLastResort = defaults.isLastResort
                // Track invalid settings to clear
                const invalidSettings: { defaultModel?: string; defaultVariant?: string; defaultAgent?: string } = {}
                if (defaults.invalidDefaultModel) invalidSettings.defaultModel = ""
                if (defaults.invalidDefaultVariant) invalidSettings.defaultVariant = ""

                set((state) => {
                  const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                    providers,
                    currentProviderId: "",
                    currentModelId: "",
                    currentAgentName: undefined,
                    selectedProviderId: "",
                    agentModelSelections: {},
                    defaultProviders: {},
                  }

                  // A selection the user picked by hand wins over every recomputed
                  // default, settings and agent preference included; a selection this
                  // project only inherited may be replaced. A still-selectable
                  // selection also wins over a LAST-RESORT default: loadAgents runs on
                  // startup, directory activation and every config refresh, and
                  // without these guards each run moved the composer to the first
                  // selectable provider (alphabetically first, usually claude-code),
                  // which is what made the selection jump on its own.
                  const manualSource = baseSnapshot.selectionSource === "manual"
                  const keepSnapshotAgent = manualSource && !!baseSnapshot.currentAgentName
                  // An empty provider list is the discovery window, not proof that the pick is gone:
                  // nothing resolves against it, so the snapshot keeps its values and must keep the
                  // source it was marked with. Calling it "auto" let the next refresh — the one that
                  // runs once the list is back — apply the settings default over a manual pick.
                  const selectionIsUnjudgeable = providers.length === 0
                  const keepSnapshotSelection =
                    keepSnapshotAgent ||
                    keepsManualSelection(
                      baseSnapshot.selectionSource,
                      providers,
                      baseSnapshot.currentProviderId,
                      baseSnapshot.currentModelId,
                    ) ||
                    shouldKeepCurrentSelection(
                      resolvedIsLastResort,
                      providers,
                      baseSnapshot.currentProviderId,
                      baseSnapshot.currentModelId,
                    )

                  const nextSnapshot: DirectoryScopedConfig = {
                    ...baseSnapshot,
                    providers,
                    currentAgentName: keepSnapshotAgent ? baseSnapshot.currentAgentName : resolvedAgent.name,
                    currentProviderId: keepSnapshotSelection
                      ? baseSnapshot.currentProviderId
                      : (resolvedProviderId ?? baseSnapshot.currentProviderId),
                    currentModelId: keepSnapshotSelection
                      ? baseSnapshot.currentModelId
                      : (resolvedModelId ?? baseSnapshot.currentModelId),
                    currentVariant: keepSnapshotSelection ? baseSnapshot.currentVariant : resolvedVariant,
                    selectionSource:
                      keepSnapshotSelection || selectionIsUnjudgeable ? baseSnapshot.selectionSource : "auto",
                  }

                  const nextState: Partial<ConfigStore> = {
                    directoryScoped: {
                      ...state.directoryScoped,
                      [directoryKey]: nextSnapshot,
                    },
                  }

                  if (state.activeDirectoryKey === directoryKey) {
                    nextState.currentAgentName = nextSnapshot.currentAgentName
                    const keepActiveSelection =
                      keepSnapshotAgent ||
                      keepsManualSelection(
                        baseSnapshot.selectionSource,
                        providers,
                        state.currentProviderId,
                        state.currentModelId,
                      ) ||
                      shouldKeepCurrentSelection(
                        resolvedIsLastResort,
                        providers,
                        state.currentProviderId,
                        state.currentModelId,
                      )
                    if (!keepActiveSelection && resolvedProviderId && resolvedModelId) {
                      nextState.currentProviderId = resolvedProviderId
                      nextState.currentModelId = resolvedModelId
                      nextState.currentVariant = resolvedVariant
                    }
                  }

                  return nextState
                })

                // Clear invalid settings from storage (best-effort cleanup)
                if (Object.keys(invalidSettings).length > 0) {
                  // Also clear from store state
                  set({
                    settingsDefaultModel:
                      invalidSettings.defaultModel !== undefined ? undefined : get().settingsDefaultModel,
                    settingsDefaultVariant:
                      invalidSettings.defaultVariant !== undefined ? undefined : get().settingsDefaultVariant,
                    settingsDefaultAgent:
                      invalidSettings.defaultAgent !== undefined ? undefined : get().settingsDefaultAgent,
                  })
                  updateDesktopSettings(invalidSettings).catch(() => {
                    // Ignore errors - best effort cleanup
                  })
                }

                return true
              } catch (error) {
                lastError = error
                const waitMs = 200 * (attempt + 1)
                await new Promise((resolve) => setTimeout(resolve, waitMs))
              }
            }

            console.error("Failed to load agents:", lastError)
            return false
          })().finally(() => _inFlightAgents.delete(directoryKey))

          _inFlightAgents.set(directoryKey, promise)
          return promise
        },

        invalidateModelMetadataCache: () => {
          modelMetadataLoader.invalidate()
          set({ modelsMetadata: new Map<string, ModelMetadata>() })
        },

        setAgent: (agentName: string | undefined, options?: { preserveModel?: boolean }) => {
          const { providers, settingsDefaultModel, settingsDefaultVariant, currentProviderId, currentModelId } = get()

          set((state) => {
            const directoryKey = state.activeDirectoryKey
            const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
              providers: state.providers,
              currentProviderId: state.currentProviderId,
              currentModelId: state.currentModelId,
              currentAgentName: state.currentAgentName,
              selectedProviderId: state.selectedProviderId,
              agentModelSelections: state.agentModelSelections,
              defaultProviders: state.defaultProviders,
            }

            const nextSnapshot: DirectoryScopedConfig = {
              ...baseSnapshot,
              currentAgentName: agentName,
              // Picking an agent also fixes the model resolved for it, so the
              // whole pick must survive the defaults cascade.
              selectionSource: agentName ? "manual" : baseSnapshot.selectionSource,
            }

            return {
              currentAgentName: agentName,
              directoryScoped: {
                ...state.directoryScoped,
                [directoryKey]: nextSnapshot,
              },
            }
          })

          if (agentName) {
            const { currentSessionId } = useSessionUIStore.getState()
            const selState = useSelectionStore.getState()

            if (currentSessionId) {
              selState.saveSessionAgentSelection(currentSessionId, agentName)
            }
          }

          if (agentName && !options?.preserveModel) {
            const { currentSessionId } = useSessionUIStore.getState()

            const applyResolvedModelSelection = (providerId: string, modelId: string, variant?: string) => {
              set((state) => {
                const directoryKey = state.activeDirectoryKey
                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                  providers: state.providers,
                  currentProviderId: state.currentProviderId,
                  currentModelId: state.currentModelId,
                  currentVariant: state.currentVariant,
                  currentAgentName: state.currentAgentName,
                  selectedProviderId: state.selectedProviderId,
                  agentModelSelections: state.agentModelSelections,
                  defaultProviders: state.defaultProviders,
                }

                const nextSnapshot: DirectoryScopedConfig = {
                  ...baseSnapshot,
                  currentProviderId: providerId,
                  currentModelId: modelId,
                  currentVariant: variant,
                  selectedProviderId: providerId,
                }

                return {
                  currentProviderId: providerId,
                  currentModelId: modelId,
                  currentVariant: variant,
                  selectedProviderId: providerId,
                  directoryScoped: {
                    ...state.directoryScoped,
                    [directoryKey]: nextSnapshot,
                  },
                }
              })
            }

            // Prefer the selected agent's configured model when switching agents.
            // The agents list lives in useAgentsStore (single home, S4.6) —
            // read it through the lib/agents source bridge.
            const agent = getAgentsSource()
              ?.getAgents()
              .find((candidate) => candidate.name === agentName)
            const agentModelSelection = agent?.model
            if (agentModelSelection?.providerID && agentModelSelection?.modelID) {
              const { providerID, modelID } = agentModelSelection
              const agentProvider = providers.find((provider) => provider.id === providerID)
              const agentModel = agentProvider?.models.find((model) => model.id === modelID)

              if (agentModel && isProviderModelSelectable(agentModel, providerID)) {
                applyResolvedModelSelection(providerID, modelID, undefined)
                return
              }
            }

            if (currentSessionId) {
              const existingAgentModel = useSelectionStore
                .getState()
                .getAgentModelForSession(currentSessionId, agentName)
              if (
                existingAgentModel &&
                hasProviderModel(providers, existingAgentModel.providerId, existingAgentModel.modelId)
              ) {
                const savedVariant = useSelectionStore
                  .getState()
                  .getAgentModelVariantForSession(
                    currentSessionId,
                    agentName,
                    existingAgentModel.providerId,
                    existingAgentModel.modelId,
                  )
                if (
                  currentProviderId !== existingAgentModel.providerId ||
                  currentModelId !== existingAgentModel.modelId ||
                  get().currentVariant !== savedVariant
                ) {
                  applyResolvedModelSelection(existingAgentModel.providerId, existingAgentModel.modelId, savedVariant)
                }
                return
              }
            }

            // If the agent has no preferred model, use settings default.
            if (settingsDefaultModel) {
              const parsed = parseModelString(settingsDefaultModel)
              if (parsed) {
                const settingsProvider = providers.find((p) => p.id === parsed.providerId)
                const settingsModel = settingsProvider?.models.find((m) => m.id === parsed.modelId)
                if (settingsModel && isProviderModelSelectable(settingsModel, parsed.providerId)) {
                  let nextVariant: string | undefined
                  if (settingsDefaultVariant) {
                    const variants = (settingsModel as { variants?: Record<string, unknown> } | undefined)?.variants
                    if (variants && Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) {
                      nextVariant = settingsDefaultVariant
                    }
                  }

                  applyResolvedModelSelection(parsed.providerId, parsed.modelId, nextVariant)
                  return
                }
              }
            }

            // Otherwise keep the current valid model selection unchanged.
          }
        },

        setSettingsDefaultModel: (model: string | undefined) => {
          set({ settingsDefaultModel: model })
        },

        setSettingsDefaultVariant: (variant: string | undefined) => {
          set({ settingsDefaultVariant: variant })
        },

        setSettingsDefaultAgent: (agent: string | undefined) => {
          set({ settingsDefaultAgent: agent })
        },

        setSettingsAutoCreateWorktree: (enabled: boolean) => {
          set({ settingsAutoCreateWorktree: enabled })
        },

        setSettingsGitmojiEnabled: (enabled: boolean) => {
          set({ settingsGitmojiEnabled: enabled })
        },

        setSettingsDefaultFileViewerPreview: (enabled: boolean) => {
          set({ settingsDefaultFileViewerPreview: enabled })
        },

        setSettingsZenModel: (model: string | undefined) => {
          set({ settingsZenModel: model })
        },

        getResolvedGitGenerationModel: () => {
          const state = get()
          return resolveGitGenerationModelSelection({
            providers: state.providers,
            settingsZenModel: state.settingsZenModel,
          })
        },

        probeConnection: async (options?: { timeoutMs?: number }) => {
          // Server-reachability probe only (S4.7): answers "is the HTTP health
          // endpoint reachable right now" so a failing send can retry within
          // its grace window. It must NOT write connection state — the
          // transport-owned phase lives in lib/event-stream/connection-state
          // and a healthy probe does not imply a live stream.
          return probeAxCodeHealth(options?.timeoutMs)
        },

        checkConnection: async () => {
          // Boot-time server-reachability probe with bounded retries. Like
          // probeConnection this returns a boolean only; it does not write
          // transport connection state (S4.7).
          const maxAttempts = 5
          let attempt = 0
          let lastError: unknown = null

          while (attempt < maxAttempts) {
            try {
              return await axCodeClient.checkHealth()
            } catch (error) {
              lastError = error
              attempt += 1
              const delay = 400 * attempt
              await sleep(delay)
            }
          }

          if (lastError) {
            console.warn("[ConfigStore] Failed to reach ax-code after retrying:", lastError)
          }
          return false
        },

        initializeApp: async () => {
          if (_initializeAppInFlight) {
            return _initializeAppInFlight
          }

          const run = (async () => {
            try {
              const debug = streamDebugEnabled()
              if (debug) console.log("Starting app initialization...")

              const isReachable = await get().checkConnection()
              if (debug) console.log("Connection check result:", isReachable)

              if (!isReachable) {
                if (debug) console.log("Server not reachable")
                // Leave initializationError untouched: an unreachable server
                // is a probe outcome, not a boot failure — the transport
                // layer surfaces the outage through the connection store.
                return
              }

              if (debug) console.log("Initializing app...")
              await axCodeClient.initApp()

              if (debug) console.log("Loading providers...")
              await get().loadProviders()

              if (debug) console.log("Loading agents...")
              await get().loadAgents()

              set({ isInitialized: true, initializationError: null })
              if (debug) console.log("App initialized successfully")
            } catch (error) {
              console.error("Failed to initialize app:", error)
              set({
                isInitialized: false,
                initializationError: "init_error",
              })
            }
          })().finally(() => {
            _initializeAppInFlight = null
          })

          _initializeAppInFlight = run
          return run
        },

        getCurrentProvider: () => {
          const { providers, currentProviderId } = get()
          return providers.find((p) => p.id === currentProviderId)
        },

        getCurrentModel: () => {
          const provider = get().getCurrentProvider()
          const { currentModelId } = get()
          if (!provider) {
            return undefined
          }
          return provider.models.find((model) => model.id === currentModelId)
        },

        getModelMetadata: (providerId: string, modelId: string) => {
          const key = buildModelMetadataKey(providerId, modelId)
          if (!key) {
            return undefined
          }
          const { modelsMetadata, providers } = get()
          const cached = modelsMetadata.get(key)
          if (cached) {
            return cached
          }

          // Fallback: derive metadata from provider model data (covers custom providers not in models.dev)
          const provider = providers.find((p) => p.id === providerId)
          if (!provider) {
            return undefined
          }
          const model = provider.models.find((m) => m.id === modelId)
          if (!model) {
            return undefined
          }

          return deriveModelMetadata(providerId, model)
        },
      }),
      {
        name: "config-store",
        storage: createJSONStorage(() => getSafeStorage()),
        // v1: the per-directory `agents` copies were removed (S4.6 — agents
        // are single-home in useAgentsStore); strip them from rehydrated
        // snapshots so stale lists do not linger in persisted state.
        version: 1,
        migrate: (persisted) => {
          if (!isPlainRecord(persisted)) return {}
          return { ...persisted, directoryScoped: restoreConfigDirectories(persisted.directoryScoped, {}) }
        },
        partialize: (state: ConfigStore) => configPreferencePersistence.partialize(state),
        merge: (persisted, current: ConfigStore) => {
          const restored = configPreferencePersistence.merge(persisted, current)
          return restored === current ? current : { ...current, ...restored }
        },
      },
    ),
  ),
)

if (typeof window !== "undefined") {
  window.__zustand_config_store__ = useConfigStore
}

subscribeToConfigChanges(async (event) => {
  const tasks: Promise<void>[] = []

  if (scopeMatches(event, "agents")) {
    const { loadAgents } = useConfigStore.getState()
    tasks.push(loadAgents().then(() => {}))
  }

  if (scopeMatches(event, "providers")) {
    const { loadProviders } = useConfigStore.getState()
    tasks.push(loadProviders())
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
})

if (typeof window !== "undefined") {
  useDirectoryStore.subscribe((state, prevState) => {
    const nextKey = toDirectoryKey(state.currentDirectory)
    const prevKey = toDirectoryKey(prevState.currentDirectory)
    if (nextKey === prevKey) {
      return
    }

    void useConfigStore.getState().activateDirectory(state.currentDirectory)
  })
}
