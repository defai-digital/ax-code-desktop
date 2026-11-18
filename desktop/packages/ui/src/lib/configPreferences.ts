import type { ProviderWithModelList } from "@/types/providerModels"
import { isPlainRecord } from "./record"
import {
  createPersistedFields,
  persistedBoolean,
  persistedString,
  persistedOptionalString,
  persistedStringRecord,
  persistedRecord,
} from "./persistedFields"

export interface AgentModelPreference {
  providerId: string
  modelId: string
}
interface ComposerSelectionPreferences {
  currentProviderId: string
  currentModelId: string
  currentVariant?: string
  currentAgentName: string | undefined
  selectedProviderId: string
  agentModelSelections: Record<string, AgentModelPreference>
  defaultProviders: Record<string, string>
}
export interface DirectoryScopedConfig extends ComposerSelectionPreferences {
  providers: ProviderWithModelList[]
  /** A valid manually chosen selection outlives recomputed defaults. */
  selectionSource?: "auto" | "manual"
}
export interface ConfigPreferences extends ComposerSelectionPreferences {
  directoryScoped: Record<string, DirectoryScopedConfig>
  settingsDefaultModel: string | undefined
  settingsDefaultVariant: string | undefined
  settingsDefaultAgent: string | undefined
  settingsAutoCreateWorktree: boolean
  settingsGitmojiEnabled: boolean
  settingsDefaultFileViewerPreview: boolean
  settingsZenModel: string | undefined
}
const agentModelSelections = persistedRecord<AgentModelPreference>((value) => {
  if (!isPlainRecord(value) || typeof value.providerId !== "string" || typeof value.modelId !== "string")
    return undefined
  return { providerId: value.providerId, modelId: value.modelId }
})
const selectionFields = {
  currentProviderId: persistedString,
  currentModelId: persistedString,
  currentVariant: persistedOptionalString,
  currentAgentName: persistedOptionalString,
  selectedProviderId: persistedString,
  agentModelSelections,
  defaultProviders: persistedStringRecord,
}
const directoryFields = createPersistedFields<DirectoryScopedConfig>({
  ...selectionFields,
  providers: () => [],
  selectionSource: (value, current) => (value === "auto" || value === "manual" ? value : current),
})
export const restoreConfigDirectories = persistedRecord<DirectoryScopedConfig>((value) => {
  if (!isPlainRecord(value)) return undefined
  const restored = directoryFields.merge(value, {
    providers: [],
    currentProviderId: "",
    currentModelId: "",
    currentVariant: undefined,
    currentAgentName: undefined,
    selectedProviderId: "",
    agentModelSelections: {},
    defaultProviders: {},
    selectionSource: undefined,
  })
  return restored
})

export const configPreferencePersistence = createPersistedFields<ConfigPreferences>({
  ...selectionFields,
  directoryScoped: restoreConfigDirectories,
  settingsDefaultModel: persistedOptionalString,
  settingsDefaultVariant: persistedOptionalString,
  settingsDefaultAgent: persistedOptionalString,
  settingsAutoCreateWorktree: persistedBoolean,
  settingsGitmojiEnabled: persistedBoolean,
  settingsDefaultFileViewerPreview: persistedBoolean,
  settingsZenModel: persistedOptionalString,
})
